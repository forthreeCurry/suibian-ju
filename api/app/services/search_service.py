"""向量检索 + 关键词检索 + RRF 混合搜索。"""

from __future__ import annotations

import logging
import time
from typing import Any

from app.services.embedding_service import generate_query_embedding, generate_restaurant_embedding
from app.services.supabase_client import get_supabase_client, supabase_rpc

logger = logging.getLogger(__name__)

# RRF 融合常数
RRF_K = 60

# 简单内存缓存
_cache: dict[str, tuple[float, list[dict[str, Any]]]] = {}
_CACHE_TTL_SEC = 300  # 5 分钟


def _cache_key(prefix: str, **kwargs: Any) -> str:
    parts = [prefix] + [f"{k}={v}" for k, v in sorted(kwargs.items()) if v is not None]
    return "|".join(parts)


def _cache_get(key: str) -> list[dict[str, Any]] | None:
    if key in _cache:
        ts, val = _cache[key]
        if time.monotonic() - ts < _CACHE_TTL_SEC:
            return val
        del _cache[key]
    return None


def _cache_set(key: str, value: list[dict[str, Any]]) -> None:
    _cache[key] = (time.monotonic(), value)
    # 简单清理：超过 500 条时清空
    if len(_cache) > 500:
        _cache.clear()


def vector_search(
    user_embedding: list[float],
    lat: float,
    lng: float,
    max_distance_km: float = 5.0,
    budget: str | None = None,
    threshold: float = 0.6,
    limit: int = 50,
) -> list[dict[str, Any]]:
    """调用 Supabase RPC search_restaurants_v2 做向量+距离检索。"""
    try:
        rows = supabase_rpc("search_restaurants_v2", {
            "query_embedding": user_embedding,
            "user_lat": lat,
            "user_lng": lng,
            "max_distance_km": max_distance_km,
            "match_budget": budget or "",
            "match_threshold": threshold,
            "max_results": limit,
        })
        return rows or []
    except Exception:
        logger.exception("向量搜索失败")
        return []


def keyword_search(
    query: str,
    lat: float,
    lng: float,
    limit: int = 50,
) -> list[dict[str, Any]]:
    """关键词搜索：名称+菜系 ILIKE 匹配，附距离计算。"""
    if not query.strip():
        return []

    client = get_supabase_client()
    pattern = f"%{query.strip()}%"

    try:
        res = client.table("restaurants") \
            .select("id,name,address,cuisine,rating,avg_price,latitude,longitude,tags") \
            .or_(f"name.ilike.{pattern},cuisine.ilike.{pattern}") \
            .eq("is_active", True) \
            .limit(limit) \
            .execute()

        rows = res.data or []
        for r in rows:
            rlat = float(r.get("latitude", 0) or 0)
            rlng = float(r.get("longitude", 0) or 0)
            r["distance_km"] = _haversine_km(lat, lng, rlat, rlng)
            r["similarity"] = 0.0  # 关键词没有相似度

        rows.sort(key=lambda x: x.get("distance_km", 999))
        return rows[:limit]
    except Exception:
        logger.exception("关键词搜索失败")
        return []


def hybrid_search(
    query: str | None,
    user_embedding: list[float] | None,
    lat: float,
    lng: float,
    filters: dict[str, Any] | None = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    """RRF 混合搜索：融合向量检索与关键词检索结果。"""
    result_lists: list[list[dict[str, Any]]] = []

    # 向量检索
    if user_embedding:
        bgt = filters.get("budget") if filters else None
        max_dist = float(filters.get("max_distance_km", 5.0)) if filters else 5.0
        threshold = float(filters.get("match_threshold", 0.6)) if filters else 0.6
        vec_results = vector_search(user_embedding, lat, lng, max_dist, bgt, threshold, limit)
        result_lists.append(vec_results)

    # 关键词检索
    if query:
        kw_results = keyword_search(query, lat, lng, limit)
        result_lists.append(kw_results)

    if len(result_lists) == 0:
        return []
    if len(result_lists) == 1:
        return result_lists[0][:limit]

    return reciprocal_rank_fusion(result_lists, limit=limit)


def reciprocal_rank_fusion(
    result_lists: list[list[dict[str, Any]]],
    k: int = RRF_K,
    limit: int = 50,
) -> list[dict[str, Any]]:
    """Reciprocal Rank Fusion: score = Σ 1/(k + rank_i)。"""
    scores: dict[str, tuple[float, dict[str, Any]]] = {}

    for lst in result_lists:
        for rank, item in enumerate(lst, start=1):
            rid = item.get("id")
            if not rid:
                continue
            rrf_score = 1.0 / (k + rank)
            if rid in scores:
                prev_score, prev_item = scores[rid]
                scores[rid] = (prev_score + rrf_score, prev_item)
            else:
                scores[rid] = (rrf_score, dict(item))

    merged = sorted(scores.values(), key=lambda x: -x[0])
    result = []
    for score, item in merged:
        item["rrf_score"] = round(score, 6)
        result.append(item)

    return result[:limit]


def search_with_filters(
    user_preferences: dict[str, Any] | None,
    location: dict[str, Any],
    filters: dict[str, Any] | None = None,
    limit: int = 50,
) -> dict[str, Any]:
    """
    高层搜索接口，供推荐 API 调用。

    输入:
      user_preferences: { likes, neutrals, dislikes, budget, dietary_restrictions, ... }
      location:         { lat, lng }
      filters:          { cuisine, max_distance_km, match_threshold, ... }
      limit:            返回数量上限

    返回:
      { candidates: [...], meta: { total, method, elapsed_ms } }
    """
    t0 = time.monotonic()
    lat = float(location.get("lat", 0))
    lng = float(location.get("lng", 0))

    # 构建查询文本（从偏好中提取）
    query_parts: list[str] = []
    if user_preferences:
        likes = user_preferences.get("likes", [])
        if isinstance(likes, list):
            query_parts.extend(str(x) for x in likes[:5])
        neutrals = user_preferences.get("neutrals", [])
        if isinstance(neutrals, list):
            query_parts.extend(str(x) for x in neutrals[:3])
    query_str = " ".join(query_parts) or None

    # 生成偏好 embedding
    user_embedding = None
    if user_preferences:
        pref_text = _preferences_to_text(user_preferences)
        if pref_text.strip():
            user_embedding = generate_query_embedding(pref_text)

    cache_kwargs: dict[str, Any] = {
        "lat": round(lat, 4),
        "lng": round(lng, 4),
        "query": query_str or "",
        "budget": user_preferences.get("budget") if user_preferences else None,
    }
    cache_k = _cache_key("search", **cache_kwargs)

    # 检查缓存
    cached = _cache_get(cache_k)
    if cached is not None:
        elapsed_ms = (time.monotonic() - t0) * 1000
        return {
            "candidates": cached[:limit],
            "meta": {"total": len(cached), "method": "hybrid+cache", "elapsed_ms": round(elapsed_ms, 1)},
        }

    candidates = hybrid_search(
        query=query_str,
        user_embedding=user_embedding,
        lat=lat,
        lng=lng,
        filters=filters,
        limit=limit,
    )

    _cache_set(cache_k, candidates)

    elapsed_ms = (time.monotonic() - t0) * 1000
    method = "hybrid" if (user_embedding and query_str) else ("vector" if user_embedding else "keyword")
    logger.info("搜索完成: candidates=%s method=%s elapsed=%.0fms", len(candidates), method, elapsed_ms)

    return {
        "candidates": candidates,
        "meta": {"total": len(candidates), "method": method, "elapsed_ms": round(elapsed_ms, 1)},
    }


# ---------- helpers ----------

def _preferences_to_text(prefs: dict[str, Any]) -> str:
    """将用户偏好转为一段文本，用于生成 embedding。"""
    parts: list[str] = []

    likes = prefs.get("likes", []) or []
    if isinstance(likes, list):
        for x in likes:
            parts.append(str(x))

    dislikes = prefs.get("dislikes", []) or []
    if isinstance(dislikes, list):
        for x in dislikes:
            parts.append(f"不要{str(x)}")

    budget = prefs.get("budget")
    if budget:
        parts.append(f"预算{budget}元")

    restrictions = prefs.get("dietary_restrictions", []) or []
    if isinstance(restrictions, list):
        for r in restrictions:
            parts.append(f"忌{str(r)}")

    return " ".join(parts)


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    import math
    r = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + \
        math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
