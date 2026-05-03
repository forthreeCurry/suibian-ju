"""餐厅 Embedding 生成与批量索引（sentence-transformers + pgvector）。"""

from __future__ import annotations

import hashlib
import logging
import time
from dataclasses import dataclass
from typing import Any

from app.services.supabase_client import (
    get_supabase_client,
    supabase_query,
    supabase_upsert,
)

logger = logging.getLogger(__name__)

MODEL_NAME = "all-MiniLM-L6-v2"
EMBEDDING_DIM = 384
BATCH_SIZE = 50

# ---------- 降级方案：当模型不可用时，使用确定性伪向量 ----------
_USE_FALLBACK = False
_model: Any = None


def _load_model() -> Any:
    """加载 sentence-transformers 模型（全局单例）。"""
    global _model, _USE_FALLBACK
    if _model is not None:
        return _model
    try:
        from sentence_transformers import SentenceTransformer
        logger.info("正在加载 %s ...", MODEL_NAME)
        _model = SentenceTransformer(MODEL_NAME)
        dim = _model.get_sentence_embedding_dimension()
        logger.info("模型加载完成，维度=%s", dim)
        _USE_FALLBACK = False
        return _model
    except Exception as e:
        logger.warning("sentence-transformers 加载失败: %s，将使用降级伪向量", e)
        _USE_FALLBACK = True
        return None


def _fallback_embedding(text: str, dim: int = EMBEDDING_DIM) -> list[float]:
    """确定性伪向量：基于文本 hash 生成单位向量。仅用于降级，不破坏向量检索流程。"""
    h = hashlib.sha256(text.encode("utf-8")).digest()
    vec: list[float] = []
    offset = 0
    while len(vec) < dim:
        seed = int.from_bytes(h[offset : offset + 4], "big", signed=True)
        # 简单的伪随机：xorshift
        x = seed & 0x7FFFFFFF or 1
        x ^= (x << 13) & 0xFFFFFFFF
        x ^= (x >> 17) & 0xFFFFFFFF
        x ^= (x << 5) & 0xFFFFFFFF
        vec.append((x % 1000) / 1000.0 * 2 - 1)  # [-1, 1]
        offset = (offset + 4) % len(h)
    # 归一化为单位向量
    norm = max(1e-12, sum(v * v for v in vec) ** 0.5)
    return [v / norm for v in vec]


def _build_restaurant_text(r: dict[str, Any]) -> str:
    """拼接餐厅文本用于生成 embedding。"""
    parts: list[str] = []
    name = str(r.get("name", "")).strip()
    if name:
        parts.append(name)

    cuisine = str(r.get("cuisine", "")).strip()
    if cuisine:
        parts.append(cuisine)

    tags = r.get("tags", [])
    if isinstance(tags, list):
        for t in tags:
            parts.append(str(t))

    avg_price = r.get("avg_price")
    if avg_price and int(avg_price) > 0:
        parts.append(f"人均{int(avg_price)}元")

    rating = r.get("rating")
    if rating and float(rating) > 0:
        parts.append(f"评分{float(rating):.1f}")

    return " ".join(parts)


def generate_restaurant_embedding(restaurant: dict[str, Any]) -> list[float]:
    """为一家餐厅生成 embedding 向量。"""
    text = _build_restaurant_text(restaurant)
    if not text.strip():
        text = "unknown restaurant"
    if _USE_FALLBACK:
        return _fallback_embedding(text)
    model = _load_model()
    if model is None:
        return _fallback_embedding(text)
    vec = model.encode([text], normalize_embeddings=True)
    return vec[0].tolist()


def generate_query_embedding(query: str) -> list[float]:
    """将搜索查询文本转为向量。"""
    if not query.strip():
        return [0.0] * EMBEDDING_DIM
    if _USE_FALLBACK:
        return _fallback_embedding(query)
    model = _load_model()
    if model is None:
        return _fallback_embedding(query)
    vec = model.encode([query], normalize_embeddings=True)
    return vec[0].tolist()


@dataclass
class IndexStats:
    total_restaurants: int
    already_indexed: int
    newly_indexed: int
    errors: int
    elapsed_seconds: float
    fallback: bool


def batch_index_restaurants(restaurant_ids: list[str] | None = None) -> IndexStats:
    """
    为未生成 embedding 的餐厅批量生成向量并写入 restaurant_embeddings。
    如果指定 restaurant_ids 则只处理这批 ID。
    """
    client = get_supabase_client()
    t0 = time.monotonic()

    # 强制触发模型加载（或在尝试时自动降级）
    _load_model()

    # 查询未索引的餐厅
    if restaurant_ids and len(restaurant_ids) > 0:
        all_rows: list[dict[str, Any]] = []
        chunk = 200
        for i in range(0, len(restaurant_ids), chunk):
            ids_chunk = restaurant_ids[i : i + chunk]
            res = client.table("restaurants") \
                .select("id,name,cuisine,tags,avg_price,rating,opening_hours") \
                .in_("id", ids_chunk) \
                .execute()
            all_rows.extend(res.data or [])
    else:
        # 查所有未索引的（LEFT JOIN 反查）
        all_query = client.table("restaurants") \
            .select("id,name,cuisine,tags,avg_price,rating,opening_hours") \
            .eq("is_active", True) \
            .order("created_at", desc=True) \
            .limit(2000) \
            .execute()
        all_rows = list(all_query.data or [])

    if not all_rows:
        return IndexStats(
            total_restaurants=0, already_indexed=0, newly_indexed=0,
            errors=0, elapsed_seconds=0, fallback=_USE_FALLBACK,
        )

    # 过滤出未索引的
    all_ids = [r["id"] for r in all_rows if r.get("id")]
    indexed_ids: set[str] = set()
    for i in range(0, len(all_ids), 500):
        chunk_ids = all_ids[i : i + 500]
        emb_res = client.table("restaurant_embeddings") \
            .select("restaurant_id") \
            .in_("restaurant_id", chunk_ids) \
            .execute()
        for row in (emb_res.data or []):
            rid = row.get("restaurant_id")
            if rid:
                indexed_ids.add(rid)

    to_index = [r for r in all_rows if r.get("id") and r["id"] not in indexed_ids]
    total = len(all_rows)
    already = len(indexed_ids)

    if not to_index:
        return IndexStats(
            total_restaurants=total, already_indexed=already, newly_indexed=0,
            errors=0, elapsed_seconds=time.monotonic() - t0, fallback=_USE_FALLBACK,
        )

    errors = 0
    newly = 0
    batch: list[dict[str, Any]] = []

    for r in to_index:
        try:
            vec = generate_restaurant_embedding(r)
            batch.append({
                "restaurant_id": r["id"],
                "embedding": vec,
                "text_content": _build_restaurant_text(r),
            })
        except Exception:
            logger.exception("生成 embedding 失败: %s", r.get("id"))
            errors += 1
            continue

        if len(batch) >= BATCH_SIZE:
            try:
                supabase_upsert("restaurant_embeddings", batch, on_conflict="restaurant_id")
                newly += len(batch)
                logger.info("已写入 %s 条 embedding", newly)
            except Exception:
                logger.exception("写入 embedding 失败")
                errors += len(batch)
            batch = []

    # 最后一批
    if batch:
        try:
            supabase_upsert("restaurant_embeddings", batch, on_conflict="restaurant_id")
            newly += len(batch)
        except Exception:
            logger.exception("写入 embedding 最后批次失败")
            errors += len(batch)

    elapsed = time.monotonic() - t0
    logger.info(
        "索引完成: 总数=%s 已索引=%s 新增=%s 错误=%s 耗时=%.1fs 降级=%s",
        total, already, newly, errors, elapsed, _USE_FALLBACK,
    )
    return IndexStats(
        total_restaurants=total,
        already_indexed=already,
        newly_indexed=newly,
        errors=errors,
        elapsed_seconds=elapsed,
        fallback=_USE_FALLBACK,
    )
