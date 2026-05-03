"""高德地图 Web 服务 API（异步 httpx + QPS 限制）。"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

import httpx

from app.config import Settings

logger = logging.getLogger(__name__)

GAODE_TEXT_URL = "https://restapi.amap.com/v3/place/text"
GAODE_AROUND_URL = "https://restapi.amap.com/v3/place/around"
GAODE_REGEO_URL = "https://restapi.amap.com/v3/geocode/regeo"
GAODE_IP_URL = "https://restapi.amap.com/v3/ip"


class GaodeApiError(RuntimeError):
    """高德接口返回非成功状态或响应异常。"""


def _parse_biz_ext(raw: Any) -> dict[str, Any]:
    if raw is None:
        return {}
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            logger.debug("biz_ext JSON 解析失败: %s", raw[:200] if raw else "")
            return {}
    return {}


def _parse_poi(poi: dict[str, Any]) -> dict[str, Any]:
    """从 POI 原始字典提取统一字段（与 GaodeRestaurant 对齐）。"""
    biz = _parse_biz_ext(poi.get("biz_ext"))
    loc = poi.get("location") or ""
    lng: float | None = None
    lat: float | None = None
    if isinstance(loc, str) and "," in loc:
        parts = loc.split(",")
        try:
            lng = float(parts[0].strip())
            lat = float(parts[1].strip())
        except (ValueError, IndexError):
            logger.warning("无法解析 POI location: %s", loc)

    photos_raw = poi.get("photos") or []
    photos: list[str] = []
    if isinstance(photos_raw, list):
        for p in photos_raw:
            if isinstance(p, dict):
                u = p.get("url")
                if u:
                    photos.append(str(u))
            elif isinstance(p, str):
                photos.append(p)

    rating = biz.get("rating")
    if rating is None:
        rating = poi.get("rating")
    avg_price = biz.get("avg_price")
    if avg_price is None:
        avg_price = biz.get("cost")

    shop_hours = biz.get("shop_hours") or biz.get("opentime") or biz.get("opentime_week") or ""

    out: dict[str, Any] = {
        "id": poi.get("id"),
        "name": poi.get("name"),
        "address": poi.get("address") or "",
        "location": {"lat": lat, "lng": lng},
        "type": poi.get("type") or "",
        "tel": poi.get("tel") or "",
        "rating": str(rating) if rating is not None else "0",
        "shop_hours": str(shop_hours) if shop_hours else "",
        "photos": photos,
        "avg_price": str(avg_price) if avg_price is not None else "0",
    }
    dist = poi.get("distance")
    if dist is not None and dist != "":
        out["distance"] = dist
    return out


class _AsyncQpsLimiter:
    """简单异步 QPS 限制（令牌间隔）。"""

    def __init__(self, qps: float) -> None:
        qps = max(0.1, float(qps))
        self._interval = 1.0 / qps
        self._lock = asyncio.Lock()
        self._next_ts = 0.0

    async def acquire(self) -> None:
        async with self._lock:
            loop = asyncio.get_running_loop()
            now = loop.time()
            if now < self._next_ts:
                await asyncio.sleep(self._next_ts - now)
                now = loop.time()
            self._next_ts = now + self._interval


class GaodeService:
    def __init__(
        self,
        settings: Settings,
        *,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self._settings = settings
        self._owns_client = client is None
        self._client = client or httpx.AsyncClient(timeout=30.0)
        self._limiter = _AsyncQpsLimiter(settings.gaode_qps_max)
        if not settings.gaode_api_key:
            logger.warning("GAODE_API_KEY 未配置，高德请求将失败")

    async def aclose(self) -> None:
        if self._owns_client:
            await self._client.aclose()

    async def _get(self, url: str, params: dict[str, Any]) -> dict[str, Any]:
        await self._limiter.acquire()
        q = {**params, "key": self._settings.gaode_api_key}
        try:
            resp = await self._client.get(url, params=q)
            resp.raise_for_status()
            data = resp.json()
        except httpx.HTTPError as e:
            logger.exception("高德 HTTP 请求失败: %s", url)
            raise GaodeApiError(f"高德 HTTP 错误: {e}") from e
        except ValueError as e:
            logger.exception("高德响应非 JSON: %s", url)
            raise GaodeApiError("高德响应解析失败") from e

        status = str(data.get("status", ""))
        if status != "1":
            info = data.get("info", "unknown")
            logger.error("高德业务错误 status=%s info=%s url=%s", status, info, url)
            raise GaodeApiError(f"高德 API 错误: {info}")
        return data

    async def search_restaurants(
        self,
        location: dict[str, Any],
        radius: int = 3000,
        keywords: str = "美食",
    ) -> list[dict[str, Any]]:
        """
        POI 关键词搜索（餐饮服务），自动翻页直至取完。
        location: {"lat": float, "lng": float}
        """
        lat = location.get("lat")
        lng = location.get("lng")
        if lat is None or lng is None:
            raise ValueError("location 需包含 lat、lng")

        offset = 25
        page = 1
        all_pois: list[dict[str, Any]] = []
        total = None

        while True:
            params: dict[str, Any] = {
                "location": f"{lng},{lat}",
                "keywords": keywords,
                "types": "050000",
                "offset": str(offset),
                "radius": str(radius),
                "extensions": "all",
                "page": str(page),
            }
            logger.info(
                "高德 place/text page=%s keywords=%s radius=%s",
                page,
                keywords,
                radius,
            )
            data = await self._get(GAODE_TEXT_URL, params)
            pois = data.get("pois") or []
            if total is None:
                try:
                    total = int(data.get("count", 0))
                except (TypeError, ValueError):
                    total = len(pois)

            for poi in pois:
                if isinstance(poi, dict):
                    all_pois.append(_parse_poi(poi))

            if not pois:
                break
            if total is not None and page * offset >= total:
                break
            if len(pois) < offset:
                break
            page += 1

        logger.info("place/text 共解析 %s 条 POI（声明总数 %s）", len(all_pois), total)
        return all_pois

    async def search_nearby(
        self,
        lat: float,
        lng: float,
        radius: int = 3000,
    ) -> list[dict[str, Any]]:
        """周边搜索，按距离升序。"""
        offset = 25
        page = 1
        all_pois: list[dict[str, Any]] = []
        total = None

        while True:
            params: dict[str, Any] = {
                "location": f"{lng},{lat}",
                "types": "050000",
                "offset": str(offset),
                "radius": str(radius),
                "extensions": "all",
                "page": str(page),
                "sortrule": "1",
            }
            logger.info("高德 place/around page=%s lat=%s lng=%s", page, lat, lng)
            data = await self._get(GAODE_AROUND_URL, params)
            pois = data.get("pois") or []
            if total is None:
                try:
                    total = int(data.get("count", 0))
                except (TypeError, ValueError):
                    total = len(pois)

            for poi in pois:
                if isinstance(poi, dict):
                    all_pois.append(_parse_poi(poi))

            if not pois:
                break
            if total is not None and page * offset >= total:
                break
            if len(pois) < offset:
                break
            page += 1

        def _dist_key(item: dict[str, Any]) -> float:
            d = item.get("distance")
            if d is None or d == "":
                return float("inf")
            try:
                return float(d)
            except (TypeError, ValueError):
                return float("inf")

        all_pois.sort(key=_dist_key)
        logger.info("place/around 共 %s 条", len(all_pois))
        return all_pois

    async def reverse_geocode(self, lat: float, lng: float) -> str:
        """逆地理编码，返回 formatted_address。"""
        params = {
            "location": f"{lng},{lat}",
            "extensions": "base",
        }
        logger.info("高德 regeo lat=%s lng=%s", lat, lng)
        data = await self._get(GAODE_REGEO_URL, params)
        regeocode = data.get("regeocode") or {}
        addr = regeocode.get("formatted_address") or ""
        if not addr:
            raise GaodeApiError("逆地理编码结果无 formatted_address")
        return str(addr)

    async def ip_locate(self) -> dict[str, Any]:
        """
        IP 定位，返回近似中心点与城市信息。
        返回: { latitude, longitude, city, accuracy }
        """
        logger.info("高德 IP 定位请求")
        data = await self._get(GAODE_IP_URL, {})
        rect = data.get("rectangle") or ""
        lat: float
        lng: float
        if isinstance(rect, str) and ";" in rect:
            try:
                lo_left, hi_right = rect.split(";", 1)
                lng1, lat1 = map(float, lo_left.split(","))
                lng2, lat2 = map(float, hi_right.split(","))
                lng = (lng1 + lng2) / 2.0
                lat = (lat1 + lat2) / 2.0
            except (ValueError, TypeError) as e:
                logger.warning("解析 rectangle 失败: %s", rect)
                raise GaodeApiError("IP 定位 rectangle 解析失败") from e
        else:
            raise GaodeApiError("IP 定位未返回有效 rectangle")

        city = str(data.get("city") or data.get("province") or "")
        return {
            "latitude": lat,
            "longitude": lng,
            "city": city,
            "accuracy": 5000.0,
        }
