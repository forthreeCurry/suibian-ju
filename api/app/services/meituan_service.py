"""美团联盟 API + Mock 降级方案。"""

from __future__ import annotations

import hashlib
import logging
import random
from typing import Any

import httpx

from app.config import Settings

logger = logging.getLogger(__name__)

MEITUAN_SEARCH_URL = "https://api.open.meituan.com/poi/search"


def _generate_sign(params: dict[str, Any], secret: str) -> str:
    raw = "&".join(f"{k}={params[k]}" for k in sorted(params) if params[k])
    return hashlib.md5(f"{raw}{secret}".encode()).hexdigest()


class MeituanApiError(RuntimeError):
    """美团接口异常。"""


# ----------------------------------------------------------------
# Mock 数据（基于高德已入库餐厅生成模拟评分/评论/优惠券）
# ----------------------------------------------------------------
_SAMPLE_COUPONS = [
    {"id": "mc_001", "title": "满200减50", "price": 0, "couponPrice": 50, "discount": "7.5折", "validUntil": "2026-06-30"},
    {"id": "mc_002", "title": "双人套餐8折", "price": 0, "couponPrice": 40, "discount": "8折", "validUntil": "2026-07-15"},
    {"id": "mc_003", "title": "新客立减 30", "price": 0, "couponPrice": 30, "discount": "立减", "validUntil": "2026-05-31"},
    {"id": "mc_004", "title": "午市特惠", "price": 0, "couponPrice": 25, "discount": "6折", "validUntil": "2026-08-01"},
    {"id": "mc_005", "title": "1元换购饮品", "price": 1, "couponPrice": 15, "discount": "换购", "validUntil": "2026-05-15"},
]

_CUISINE_SCORE_RANGES: dict[str, tuple[float, float]] = {
    "火锅": (3.8, 4.9),
    "川菜": (3.5, 4.8),
    "粤菜": (3.8, 4.9),
    "日料": (4.0, 4.9),
    "韩餐": (3.5, 4.7),
    "西餐": (3.8, 4.9),
    "烧烤": (3.8, 4.8),
    "小吃": (3.5, 4.6),
    "面馆": (3.2, 4.5),
    "茶馆": (3.5, 4.5),
    "咖啡馆": (3.5, 4.7),
    "湘菜": (3.8, 4.8),
    "东北菜": (3.5, 4.6),
    "江浙菜": (3.8, 4.8),
    "新疆菜": (3.5, 4.7),
}


class MeituanService:
    """美团联盟 API 客户端（需企业资质审核通过后方可用）。"""

    def __init__(self, settings: Settings, client: httpx.AsyncClient | None = None) -> None:
        self._settings = settings
        self._owns_client = client is None
        self._client = client or httpx.AsyncClient(timeout=30.0)

    async def aclose(self) -> None:
        if self._owns_client:
            await self._client.aclose()

    async def search_shops(
        self, city_id: int = 1, cate_id: int = 0, sort: int = 0, limit: int = 20
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {
            "appkey": self._settings.meituan_appkey,
            "cityId": str(city_id),
            "cateId": str(cate_id),
            "sort": str(sort),
            "limit": str(limit),
            "timestamp": str(int(httpx.URL("")._time if hasattr(httpx, "_time") else 0)),
        }
        sign = _generate_sign(params, self._settings.meituan_secret)
        params["sign"] = sign

        try:
            resp = await self._client.get(MEITUAN_SEARCH_URL, params=params)
            resp.raise_for_status()
            data = resp.json()
        except httpx.HTTPError as e:
            raise MeituanApiError(f"美团 HTTP 错误: {e}") from e
        except ValueError as e:
            raise MeituanApiError("美团响应解析失败") from e

        if data.get("code") != 200:
            raise MeituanApiError(f"美团业务错误: {data.get('msg', 'unknown')}")
        return data.get("data", {}).get("shops", [])

    async def get_coupons(self, shop_id: str) -> list[dict[str, Any]]:
        raise NotImplementedError("美团优惠券接口需额外申请权限")


class MockMeituanService:
    """美团 Mock 降级——基于高德已入库餐厅生成模拟数据。"""

    @staticmethod
    def mock_for_restaurant(gaode_name: str, cuisine: str | None) -> dict[str, Any] | None:
        """为一家高德餐厅生成模拟美团数据。"""
        low, high = _CUISINE_SCORE_RANGES.get(cuisine or "", (3.0, 4.5))
        rating = round(random.uniform(low, high), 2)
        review_count = random.randint(20, 3000)
        coupons = random.sample(_SAMPLE_COUPONS, k=random.randint(0, 2)) if random.random() > 0.5 else []

        return {
            "shopName": gaode_name,
            "score": rating,
            "commentCount": review_count,
            "avgPrice": 0,  # 不覆盖高德价格
            "categories": [cuisine] if cuisine else [],
            "coupons": coupons,
        }

    @staticmethod
    def mock_batch(gaode_restaurants: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """批量生成 mock 数据。"""
        results: list[dict[str, Any]] = []
        for r in gaode_restaurants:
            m = MockMeituanService.mock_for_restaurant(
                gaode_name=str(r.get("name", "")),
                cuisine=r.get("cuisine"),
            )
            if m:
                m["_mock"] = True
                m["_gaode_id"] = r.get("gaode_id")
                results.append(m)
        return results
