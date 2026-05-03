"""约束过滤 Agent：硬条件筛选（距离/预算/忌口/营业状态）。"""

from __future__ import annotations

import json
import logging
import math
from typing import Any

from pydantic import BaseModel, Field

from app.agents.base import BaseAgent, is_llm_available

logger = logging.getLogger(__name__)

FILTER_PROMPT = """你是一个严格的餐厅过滤助手。根据以下硬性条件，从候选餐厅列表中筛选出所有满足条件的餐厅。

## 过滤条件
- 最大距离: {max_distance}km
- 人均预算上限: ¥{budget}
- 忌口/过敏（一票否决）: {dietary_restrictions}
- 交通方式: {transport_mode}

## 候选餐厅
{candidates_json}

## 规则
1. 距离 > {max_distance}km 的直接淘汰
2. 人均价格 > ¥{budget} 的直接淘汰
3. 标签或菜系中包含忌口/过敏项的餐厅直接淘汰（一票否决）
4. 以上条件全部满足的保留

## 输出格式
返回 JSON:
{{"passed_ids": ["id1","id2",...], "filtered_count": 被淘汰数量, "filter_reasons": {{"距离超限": N, "预算超标": N, "忌口过滤": N}}}}
只输出 JSON，不要任何其他文字。"""


class FilterInput(BaseModel):
    candidates: list[dict[str, Any]] = Field(..., description="候选餐厅列表")
    location: dict[str, Any] = Field(..., description="用户位置 {lat, lng}")
    max_distance: float = Field(default=5.0, description="最大距离(km)")
    budget: str = Field(default="500", description="人均预算上限")
    dietary_restrictions: list[str] = Field(default_factory=list, description="忌口/过敏列表")
    transport_mode: str = Field(default="walk", description="交通方式")


class FilterResult(BaseModel):
    passed_ids: list[str] = Field(default_factory=list)
    passed: list[dict[str, Any]] = Field(default_factory=list)
    filtered_count: int = 0
    filter_reasons: dict[str, int] = Field(default_factory=dict)


class ConstraintFilterAgent(BaseAgent):
    """硬条件过滤 Agent。"""

    prompt_template: str = FILTER_PROMPT

    def invoke(self, input: FilterInput) -> FilterResult:
        if self._use_fallback or not is_llm_available():
            return self._rule_based_filter(input)

        # 构建 prompt
        candidates_slim = []
        for c in input.candidates:
            candidates_slim.append({
                "id": c.get("id", ""),
                "name": c.get("name", ""),
                "cuisine": c.get("cuisine", ""),
                "avg_price": c.get("avg_price", 0),
                "tags": c.get("tags", []) if isinstance(c.get("tags"), list) else [],
                "distance_km": round(c.get("distance_km", 0) or 0, 2),
            })

        prompt = FILTER_PROMPT.format(
            max_distance=input.max_distance,
            budget=input.budget,
            dietary_restrictions=", ".join(input.dietary_restrictions) if input.dietary_restrictions else "无",
            transport_mode=input.transport_mode,
            candidates_json=json.dumps(candidates_slim, ensure_ascii=False, indent=2),
        )

        raw = self._try_llm(prompt)
        parsed = self._parse_json_output(raw or "", FilterResult)

        if parsed is not None and parsed.passed_ids:
            # 补全通过的餐厅完整数据
            id_map = {str(c.get("id")): c for c in input.candidates}
            parsed.passed = [id_map[pid] for pid in parsed.passed_ids if pid in id_map]
            return parsed

        # LLM 失败，降级
        logger.info("FilterAgent LLM 路径失败，降级到规则引擎")
        return self._rule_based_filter(input)

    def _rule_based_filter(self, input: FilterInput) -> FilterResult:
        """纯规则引擎过滤（降级方案）。"""
        lat = float(input.location.get("lat", 0))
        lng = float(input.location.get("lng", 0))
        budget_limit = float(input.budget or "500") * 1.2  # 超出预算 20% 内也算通过
        restrictions = [r.lower() for r in input.dietary_restrictions]

        reasons: dict[str, int] = {"距离超限": 0, "预算超标": 0, "忌口过滤": 0}
        passed: list[dict[str, Any]] = []
        passed_ids: list[str] = []

        for c in input.candidates:
            rid = str(c.get("id", ""))

            # 距离过滤
            dist_km = float(c.get("distance_km", 0) or 0)
            if dist_km <= 0 and c.get("latitude") and c.get("longitude"):
                dist_km = _haversine(lat, lng, float(c["latitude"]), float(c["longitude"]))
            if dist_km > input.max_distance:
                reasons["距离超限"] += 1
                continue

            # 预算过滤
            avg_price = int(c.get("avg_price", 0) or 0)
            if avg_price > 0 and avg_price > budget_limit:
                reasons["预算超标"] += 1
                continue

            # 忌口过滤（一票否决）
            vetoed = False
            cuisine = str(c.get("cuisine", "")).lower()
            tags = [str(t).lower() for t in (c.get("tags", []) or []) if isinstance(t, str)]
            categories = [str(cat).lower() for cat in (c.get("categories", []) or []) if isinstance(cat, str)]
            search_text = f"{cuisine} {' '.join(tags)} {' '.join(categories)}"

            for restriction in restrictions:
                # 匹配忌口关键词在菜系/标签/分类中
                kw = restriction.replace("不吃", "").replace("过敏", "").replace("禁忌", "")
                if kw and kw in search_text:
                    vetoed = True
                    break

            if vetoed:
                reasons["忌口过滤"] += 1
                continue

            passed.append(c)
            passed_ids.append(rid)

        filtered_count = len(input.candidates) - len(passed)
        logger.info(
            "规则引擎过滤: %s/%s 通过 (距离=%s 预算=%s 忌口=%s)",
            len(passed), len(input.candidates),
            reasons["距离超限"], reasons["预算超标"], reasons["忌口过滤"],
        )

        return FilterResult(
            passed_ids=passed_ids,
            passed=passed,
            filtered_count=filtered_count,
            filter_reasons=reasons,
        )


def _haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
