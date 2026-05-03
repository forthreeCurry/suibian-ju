"""多源数据融合：高德 + 美团 → 统一餐厅数据。"""

from __future__ import annotations

import logging
import math
import re
from datetime import datetime, time, timedelta, timezone
from difflib import SequenceMatcher
from typing import Any

logger = logging.getLogger(__name__)

# 北京时间 UTC+8
_CN_TZ = timezone(timedelta(hours=8))


# ----------------------------------------------------------------
# 工具函数
# ----------------------------------------------------------------
def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """计算两点间球面距离（km）。"""
    r = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2
    )
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def name_similarity(a: str, b: str) -> float:
    """两个餐厅名称的相似度（0-1），去除常见后缀后比较。"""
    _suffixes = [
        "（.*）", r"\(.*\)", "旗舰店", "总店", "分店", "望京店", "三里屯店", "中关村店",
        "国贸店", "五道口店", "西单店", "王府井店", "朝阳店", "海淀店", "北京",
    ]
    pa, pb = a.strip(), b.strip()
    for s in _suffixes:
        pa = re.sub(s, "", pa).strip()
        pb = re.sub(s, "", pb).strip()
    return SequenceMatcher(None, pa, pb).ratio()


def classify_price_level(avg_price: int) -> str | None:
    if avg_price <= 0:
        return None
    if avg_price < 50:
        return "low"
    if avg_price <= 150:
        return "mid"
    return "high"


def generate_tags(restaurant: dict[str, Any]) -> list[str]:
    """根据菜系/价位/评分自动生成标签。"""
    tags: list[str] = []
    cuisine = restaurant.get("cuisine", "")
    rating = restaurant.get("rating", 0)
    avg_price = restaurant.get("avg_price", 0)
    opening = restaurant.get("opening_hours", "")

    try:
        rating_f = float(rating)
    except (ValueError, TypeError):
        rating_f = 0.0

    # 评分标签
    if rating_f >= 4.5:
        tags.append("高评分")
    elif rating_f >= 4.0:
        tags.append("口碑好")

    # 价位标签
    if avg_price > 0:
        if avg_price <= 30:
            tags.append("经济实惠")
        elif avg_price <= 80:
            tags.append("性价比高")
        elif avg_price >= 200:
            tags.append("高端餐厅")

    # 菜系标签
    if cuisine and cuisine not in tags:
        tags.append(cuisine)

    # 营业时间标签
    if opening:
        if _is_late_night(opening):
            tags.append("深夜食堂")
        if _has_breakfast(opening):
            tags.append("早餐供应")

    return list(dict.fromkeys(tags))  # 去重保序


def check_is_open_now(opening_hours: str) -> bool:
    """解析营业时间字符串，判断当前北京时间是否在营业范围内。"""
    if not opening_hours:
        return True  # 无信息时默认营业

    now = datetime.now(_CN_TZ)
    weekday = now.weekday()  # 0=Mon
    current_minutes = now.hour * 60 + now.minute

    # 提取数字时间的正则
    time_pattern = re.compile(r"(\d{1,2}):(\d{2})")

    # 尝试匹配 "HH:MM-HH:MM" 格式
    periods = time_pattern.findall(opening_hours)
    if len(periods) >= 2:
        open_min = int(periods[0][0]) * 60 + int(periods[0][1])
        close_min = int(periods[1][0]) * 60 + int(periods[1][1])
        if close_min < open_min:  # 跨天
            close_min += 24 * 60
        return open_min <= current_minutes <= close_min

    return True  # 无法解析时默认营业


def _is_late_night(opening: str) -> bool:
    """判断是否营业到深夜（>=23:00）。"""
    m = re.findall(r"(\d{1,2}):(\d{2})", opening)
    if len(m) >= 2:
        try:
            close_h = int(m[1][0])
            return close_h >= 23 or close_h <= 2
        except ValueError:
            return False
    return False


def _has_breakfast(opening: str) -> bool:
    """判断是否提供早餐（<=7:00 开始营业）。"""
    m = re.findall(r"(\d{1,2}):(\d{2})", opening)
    if m:
        try:
            open_h = int(m[0][0])
            return open_h <= 7
        except ValueError:
            return False
    return False


# ----------------------------------------------------------------
# 数据融合
# ----------------------------------------------------------------
def merge_restaurant_data(
    gaode_list: list[dict[str, Any]],
    meituan_list: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], int, int]:
    """以高德为基础融合美团数据。返回 (merged_list, matched_count, unmatched_count)。

    匹配规则：名称相似度 > 0.8 AND 地理距离 < 100m（如位置均可用）。
    """
    merged: list[dict[str, Any]] = []
    matched = 0
    unmatched = 0
    used_meituan: set[int] = set()

    for g in gaode_list:
        g_name = str(g.get("name", ""))
        g_lat = _safe_float(g.get("latitude") or g.get("location", {}).get("lat"))
        g_lng = _safe_float(g.get("longitude") or g.get("location", {}).get("lng"))

        best_mt: dict[str, Any] | None = None
        best_score = 0.0
        best_idx = -1

        for i, m in enumerate(meituan_list):
            if i in used_meituan:
                continue
            m_name = str(m.get("shopName", ""))
            name_s = name_similarity(g_name, m_name)
            if name_s < 0.6:
                continue
            geo_s = 1.0
            m_lat = _safe_float(m.get("latitude"))
            m_lng = _safe_float(m.get("longitude"))
            if g_lat is not None and g_lng is not None and m_lat is not None and m_lng is not None:
                dist = haversine_km(g_lat, g_lng, m_lat, m_lng)
                if dist > 1.0:
                    continue
                geo_s = max(0.0, 1.0 - dist / 0.5)  # 500m 以内给分

            score = name_s * 0.6 + geo_s * 0.4
            if score > best_score and name_s > 0.8:
                best_score = score
                best_mt = m
                best_idx = i

        record = dict(g)
        if best_mt is not None and best_idx >= 0:
            used_meituan.add(best_idx)
            matched += 1
            # 美团补充：评分优先、评论数、优惠券
            if best_mt.get("score") and (not record.get("rating") or float(record.get("rating", 0)) == 0):
                record["rating"] = float(best_mt["score"])
            record["review_count"] = int(best_mt.get("commentCount", 0)) or record.get("review_count", 0)
            record["meituan_id"] = best_mt.get("shopId")
            if best_mt.get("coupons"):
                record["_coupons"] = best_mt["coupons"]
        else:
            unmatched += 1

        # 自动标签（如果尚未设置或为空）
        if not record.get("tags"):
            record["tags"] = generate_tags(record)

        # price_level 补全
        if not record.get("price_level"):
            record["price_level"] = classify_price_level(int(record.get("avg_price", 0) or 0))

        merged.append(record)

    logger.info("数据融合完成: 高德=%s 美团=%s 匹配=%s 未匹配=%s",
                 len(gaode_list), len(meituan_list), matched, unmatched)
    return merged, matched, unmatched


def _safe_float(v: Any) -> float | None:
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None
