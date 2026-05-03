"""高德餐厅数据同步至 Supabase。"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Any

from supabase import Client, create_client

from app.config import Settings
from app.models.restaurant import GaodeRestaurant, RestaurantCreate
from app.services.data_merge import classify_price_level as _dp_classify, generate_tags
from app.services.embedding_service import batch_index_restaurants
from app.services.gaode_service import GaodeService
from app.services.meituan_service import MockMeituanService

logger = logging.getLogger(__name__)

BEIJING_HOT_AREAS: list[dict[str, Any]] = [
    {"name": "望京SOHO", "center_lat": 39.9982, "center_lng": 116.4810},
    {"name": "三里屯", "center_lat": 39.9361, "center_lng": 116.4547},
    {"name": "国贸CBD", "center_lat": 39.9088, "center_lng": 116.4605},
    {"name": "中关村", "center_lat": 39.9834, "center_lng": 116.3160},
    {"name": "五道口", "center_lat": 39.9925, "center_lng": 116.3392},
    {"name": "西单", "center_lat": 39.9103, "center_lng": 116.3735},
    {"name": "王府井", "center_lat": 39.9140, "center_lng": 116.4110},
    {"name": "朝阳大悦城", "center_lat": 39.9238, "center_lng": 116.5183},
    {"name": "奥林匹克公园", "center_lat": 40.0024, "center_lng": 116.3934},
    {"name": "工体北门", "center_lat": 39.9295, "center_lng": 116.4470},
]


def gaode_poi_to_create(raw: dict[str, Any]) -> RestaurantCreate | None:
    g = GaodeRestaurant.model_validate(raw)
    if not g.id or not g.name:
        return None

    lat = g.location.lat
    lng = g.location.lng

    try:
        rating_f = float(g.rating or 0)
    except ValueError:
        rating_f = 0.0

    try:
        avg_price = int(float(g.avg_price or 0))
    except ValueError:
        avg_price = 0

    type_parts = [p.strip() for p in (g.type or "").split(";") if p.strip()]
    cuisine = type_parts[0] if type_parts else (g.type or None)

    photos = [p for p in g.photos if p]
    cover = photos[0] if photos else None

    price_level = _dp_classify(avg_price)
    tags = generate_tags({
        "cuisine": cuisine,
        "rating": rating_f,
        "avg_price": avg_price,
        "opening_hours": g.shop_hours or "",
    })

    return RestaurantCreate(
        gaode_id=g.id,
        name=g.name.strip(),
        address=g.address or None,
        latitude=lat,
        longitude=lng,
        cuisine=cuisine,
        categories=type_parts,
        tags=tags,
        rating=round(min(max(rating_f, 0.0), 5.0), 2),
        review_count=0,
        avg_price=avg_price,
        price_level=price_level,
        phone=g.tel or None,
        opening_hours=g.shop_hours or None,
        cover_image=cover,
        images=photos,
        source="gaode",
        is_active=True,
    )


@dataclass
class SyncStats:
    area_name: str
    inserted: int
    updated: int
    total: int


class DataSyncService:
    def __init__(self, settings: Settings, gaode: GaodeService) -> None:
        self._settings = settings
        self._gaode = gaode
        self._client: Client | None = None

    def _db(self) -> Client:
        if self._client is None:
            if not self._settings.supabase_url or not self._settings.supabase_key:
                raise RuntimeError("SUPABASE_URL / SUPABASE_KEY 未配置")
            self._client = create_client(
                self._settings.supabase_url,
                self._settings.supabase_key,
            )
        return self._client

    async def sync_area(
        self,
        area_name: str,
        center_lat: float,
        center_lng: float,
        radius: int = 5000,
    ) -> SyncStats:
        logger.info("开始同步商圈 %s (%.5f, %.5f) r=%s", area_name, center_lat, center_lng, radius)
        pois = await self._gaode.search_restaurants(
            {"lat": center_lat, "lng": center_lng},
            radius=radius,
            keywords="美食",
        )

        creates: list[RestaurantCreate] = []
        for p in pois:
            c = gaode_poi_to_create(p)
            if c is not None:
                creates.append(c)

        gaode_ids = [c.gaode_id for c in creates if c.gaode_id]
        unique_ids = list(dict.fromkeys(gaode_ids))
        existing: set[str] = set()
        db = self._db()

        chunk_size = 200
        for i in range(0, len(unique_ids), chunk_size):
            chunk = unique_ids[i : i + chunk_size]
            res = db.table("restaurants").select("gaode_id").in_("gaode_id", chunk).execute()
            for row in res.data or []:
                gid = row.get("gaode_id")
                if gid:
                    existing.add(gid)

        inserted = 0
        updated = 0
        for row in creates:
            gid = row.gaode_id
            if not gid:
                continue
            payload = row.model_dump(mode="json", exclude_none=True)
            if "categories" in payload:
                payload["categories"] = payload["categories"] or []
            if "tags" in payload:
                payload["tags"] = payload["tags"] or []
            if "images" in payload:
                payload["images"] = payload["images"] or []

            was_existing = gid in existing
            db.table("restaurants").upsert(payload, on_conflict="gaode_id").execute()
            if was_existing:
                updated += 1
            else:
                inserted += 1
                existing.add(gid)

        total = len(creates)

        # ---- 美团 Mock + 数据融合（自动评分/评论数/标签补全） ----
        if inserted > 0 or updated > 0:
            try:
                merged_count = await self._apply_meituan_mock(area_name)
                logger.info("商圈 %s 美团融合: 更新 %s 家", area_name, merged_count)
            except Exception:
                logger.exception("美团融合失败（不影响主流程）")

        # ---- Embedding 批量生成（新餐厅自动索引） ----
        if total > 0:
            try:
                stats = await asyncio.to_thread(batch_index_restaurants)
                logger.info("商圈 %s Embedding: 新增索引 %s", area_name, stats.newly_indexed)
            except Exception:
                logger.exception("Embedding 生成失败（不影响主流程）")

        logger.info(
            "商圈 %s 同步完成: 新增=%s 更新=%s 解析总数=%s",
            area_name,
            inserted,
            updated,
            total,
        )
        return SyncStats(
            area_name=area_name,
            inserted=inserted,
            updated=updated,
            total=total,
        )

    async def _apply_meituan_mock(self, area_name: str) -> int:
        """为指定商圈的餐厅补充美团评分/评论/标签。"""
        db = self._db()
        # 查该商圈最近更新的餐厅（评分仍为 0 或评论数为 0 的优先）
        res = db.table("restaurants") \
            .select("id,gaode_id,name,cuisine,rating,review_count") \
            .filter("name", "neq", "") \
            .order("updated_at", desc=True) \
            .limit(300) \
            .execute()

        rows = res.data or []
        if not rows:
            return 0

        updated = 0
        for row in rows:
            mock_data = MockMeituanService.mock_for_restaurant(
                gaode_name=str(row.get("name", "")),
                cuisine=row.get("cuisine"),
            )
            if mock_data is None:
                continue

            tags = generate_tags(row)
            patch: dict[str, Any] = {"tags": tags}

            if mock_data.get("score") and (not row.get("rating") or float(str(row.get("rating", 0))) == 0):
                patch["rating"] = float(mock_data["score"])
            if mock_data.get("commentCount"):
                patch["review_count"] = int(mock_data["commentCount"])
            if mock_data.get("avgPrice") and int(mock_data["avgPrice"]) > 0:
                patch["avg_price"] = int(mock_data["avgPrice"])
                patch["price_level"] = _dp_classify(int(mock_data["avgPrice"]))

            db.table("restaurants").update(patch).eq("id", row["id"]).execute()
            updated += 1

        return updated

    async def sync_popular_areas(self) -> list[SyncStats]:
        results: list[SyncStats] = []
        for area in BEIJING_HOT_AREAS:
            stats = await self.sync_area(
                area_name=area["name"],
                center_lat=float(area["center_lat"]),
                center_lng=float(area["center_lng"]),
                radius=5000,
            )
            results.append(stats)
        return results
