"""多目标优化 Agent：5 维度加权评分，取 Top 3。"""

from __future__ import annotations

import json
import logging
from typing import Any

from pydantic import BaseModel, Field

from app.agents.base import BaseAgent, is_llm_available

logger = logging.getLogger(__name__)

OPTIMIZE_PROMPT = """你是一个专业的餐厅推荐排序专家。请根据以下维度为每家候选餐厅打分，选出 Top 3。

## 评分维度（满分 100）
1. 口味匹配 (40分)：根据用户喜欢的口味标签匹配
2. 预算符合 (20分)：餐厅人均是否在预算范围内
3. 距离便利 (20分)：距离越近分越高
4. 天气适应 (10分)：天气因素，如下雨优先室内
5. 综合评分 (10分)：餐厅本身评分

## 用户偏好
{preferences_json}

## 天气信息
{weather_json}

## 候选餐厅
{candidates_json}

## 输出格式
返回 JSON:
{{"recommendations": [
  {{"restaurant_id": "id", "name": "店名", "score": 85.5,
    "breakdown": {{"taste_match": 35, "budget_fit": 18, "distance": 16, "weather_adapt": 8, "overall_rating": 8.5}},
    "brief_reason": "简短推荐理由(20字内)"}}
]}}
只输出 Top 3，按 score 降序。只输出 JSON。"""


class ScoreBreakdown(BaseModel):
    taste_match: float = 0
    budget_fit: float = 0
    distance: float = 0
    weather_adapt: float = 0
    overall_rating: float = 0


class RecommendationItem(BaseModel):
    restaurant_id: str
    name: str
    score: float
    breakdown: ScoreBreakdown
    brief_reason: str = ""


class OptimizationInput(BaseModel):
    candidates: list[dict[str, Any]]
    user_preferences: dict[str, Any] = Field(default_factory=dict)
    weather_info: dict[str, Any] | None = None


class OptimizationResult(BaseModel):
    recommendations: list[RecommendationItem] = Field(default_factory=list)


class MultiObjectiveOptimizer(BaseAgent):
    """多目标优化 Agent。"""

    prompt_template: str = OPTIMIZE_PROMPT

    def invoke(self, input: OptimizationInput) -> OptimizationResult:
        if len(input.candidates) == 0:
            return OptimizationResult(recommendations=[])

        if self._use_fallback or not is_llm_available():
            return self._calculate_scores(input)

        # LLM 路径
        prefs_str = json.dumps(input.user_preferences, ensure_ascii=False, indent=2)
        weather_str = json.dumps(input.weather_info or {}, ensure_ascii=False, indent=2)

        cand_slim = []
        for c in input.candidates:
            cand_slim.append({
                "id": c.get("id", ""),
                "name": c.get("name", ""),
                "cuisine": c.get("cuisine", ""),
                "avg_price": c.get("avg_price", 0),
                "rating": c.get("rating", 0),
                "distance_km": round(c.get("distance_km", 0) or 0, 2),
                "tags": c.get("tags", []) if isinstance(c.get("tags"), list) else [],
            })

        prompt = OPTIMIZE_PROMPT.format(
            preferences_json=prefs_str,
            weather_json=weather_str,
            candidates_json=json.dumps(cand_slim, ensure_ascii=False, indent=2),
        )

        raw = self._try_llm(prompt)
        parsed = self._parse_json_output(raw or "", OptimizationResult)

        if parsed is not None and parsed.recommendations:
            return parsed

        logger.info("Optimizer LLM 路径失败，降级到数学计算")
        return self._calculate_scores(input)

    def _calculate_scores(self, input: OptimizationInput) -> OptimizationResult:
        """纯数学加权计算（降级方案）。"""
        prefs = input.user_preferences
        likes = set(str(x).lower() for x in (prefs.get("likes", []) or []) if x)
        dislikes = set(str(x).lower() for x in (prefs.get("dislikes", []) or []) if x)
        budget = float(prefs.get("budget", 500) or 500)
        transport = prefs.get("transport_mode", "walk")
        weather = input.weather_info or {}

        scored: list[tuple[float, dict[str, Any], ScoreBreakdown, str]] = []

        for c in input.candidates:
            # --- 口味匹配 (40) ---
            cuisine = str(c.get("cuisine", "")).lower()
            tags = [str(t).lower() for t in (c.get("tags", []) or []) if t]
            search_text = f"{cuisine} {' '.join(tags)}"

            taste_score = 20.0  # 基准
            for like_kw in likes:
                if like_kw in search_text:
                    taste_score += 5
            for dislike_kw in dislikes:
                if dislike_kw in search_text:
                    taste_score -= 15
            taste_score = max(0, min(40, taste_score))

            # --- 预算符合 (20) ---
            price = int(c.get("avg_price", 0) or 0)
            if price <= 0:
                budget_score = 15.0
            elif price <= budget:
                budget_score = 20.0
            elif price <= budget * 1.3:
                budget_score = 12.0
            elif price <= budget * 1.5:
                budget_score = 6.0
            else:
                budget_score = 0.0

            # --- 距离 (20) ---
            dist = float(c.get("distance_km", 0) or 0)
            transport_weights = {"walk": 3.0, "bike": 2.0, "subway": 1.5, "drive": 1.0}
            weight = transport_weights.get(transport, 3.0)
            if dist <= 0.5:
                distance_score = 20.0
            elif dist <= weight:
                distance_score = 16.0
            elif dist <= weight * 2:
                distance_score = 12.0
            elif dist <= weight * 3:
                distance_score = 6.0
            else:
                distance_score = 2.0

            # --- 天气适应 (10) ---
            weather_score = 5.0
            weather_desc = str(weather.get("description", "")).lower()
            is_rain = any(w in weather_desc for w in ["雨", "rain", "雪", "snow", "雷", "thunder"])
            is_hot = any(w in weather_desc for w in ["高温", "hot", "heat"])
            if is_rain:
                weather_score += 3
            if is_hot:
                weather_score += 2
            weather_score = min(10, weather_score)

            # --- 综合评分 (10) ---
            rating = float(c.get("rating", 0) or 0)
            rating_score = min(10, rating * 2)

            total = taste_score + budget_score + distance_score + weather_score + rating_score
            breakdown = ScoreBreakdown(
                taste_match=round(taste_score, 1),
                budget_fit=round(budget_score, 1),
                distance=round(distance_score, 1),
                weather_adapt=round(weather_score, 1),
                overall_rating=round(rating_score, 1),
            )

            # brief reason
            reasons = []
            if taste_score >= 30:
                reasons.append("口味高度匹配")
            if budget_score >= 18:
                reasons.append("预算友好")
            if distance_score >= 16:
                reasons.append("距离很近")
            brief = "，".join(reasons[:2]) if reasons else "综合推荐"

            scored.append((total, c, breakdown, brief))

        # 排序取 Top 3
        scored.sort(key=lambda x: -x[0])
        top3 = scored[:3]

        recommendations = []
        for total, c, breakdown, brief in top3:
            recommendations.append(RecommendationItem(
                restaurant_id=str(c.get("id", "")),
                name=str(c.get("name", "")),
                score=round(total, 1),
                breakdown=breakdown,
                brief_reason=brief,
            ))

        logger.info("数学评分完成: %s 候选 → Top %s", len(input.candidates), len(recommendations))
        return OptimizationResult(recommendations=recommendations)
