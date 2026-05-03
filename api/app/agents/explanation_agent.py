"""可解释性 Agent：为推荐餐厅生成个性化推荐理由。"""

from __future__ import annotations

import json
import logging
from typing import Any

from pydantic import BaseModel, Field

from app.agents.base import BaseAgent, is_llm_available

logger = logging.getLogger(__name__)

EXPLAIN_PROMPT = """你是一个热情的美食推荐达人。请为以下餐厅生成个性化的推荐理由。

## 用户信息
偏好口味: {likes}
忌口/过敏: {dietary_restrictions}
人均预算: ¥{budget}

## 餐厅信息
名称: {name}
菜系: {cuisine}
人均: ¥{avg_price}
评分: {rating}/5
标签: {tags}
距离: {distance_km}km

## 社交笔记（来自小红书/抖音的真实评价）
{social_text}

## 要求
1. main_reason: 100-200 字的中文推荐理由，语气热情亲切，引用真实评价
2. personalized_tags: 2-4 个标签，如"适合聚餐"、"约会圣地"
3. warning: 如果有需要注意的点（如排队久、口味偏辣），给出温馨提醒，否则为 null

## 输出格式
返回 JSON:
{{"restaurant_id": "{restaurant_id}", "main_reason": "推荐理由", "personalized_tags": ["标签1","标签2"], "warning": null}}
只输出 JSON。"""


class ExplanationInput(BaseModel):
    restaurant: dict[str, Any]
    user_preferences: dict[str, Any] = Field(default_factory=dict)
    social_notes: list[dict[str, Any]] | None = None


class Citation(BaseModel):
    excerpt: str
    likes: int = 0
    source: str = ""


class ExplanationResult(BaseModel):
    restaurant_id: str
    main_reason: str = ""
    personalized_tags: list[str] = Field(default_factory=list)
    citations: list[Citation] = Field(default_factory=list)
    warning: str | None = None


class ExplanationGenerator(BaseAgent):
    """可解释性 Agent。"""

    prompt_template: str = EXPLAIN_PROMPT

    def invoke(self, input: ExplanationInput) -> ExplanationResult:
        r = input.restaurant
        rid = str(r.get("id", ""))

        if self._use_fallback or not is_llm_available():
            return self._template_based_explanation(input)

        # LLM 路径
        prefs = input.user_preferences
        likes = ", ".join(prefs.get("likes", []) or []) or "无特殊偏好"
        restrictions = ", ".join(prefs.get("dietary_restrictions", []) or []) or "无"

        # 合并社交笔记文本
        social_parts: list[str] = []
        for sn in (input.social_notes or [])[:2]:
            text = sn.get("highlights", []) or sn.get("raw_content", "")
            if isinstance(text, list):
                social_parts.extend(str(t) for t in text[:3])
            elif text:
                social_parts.append(str(text)[:200])
        social_text = "\n".join(social_parts) if social_parts else "暂无"

        prompt = EXPLAIN_PROMPT.format(
            likes=likes,
            dietary_restrictions=restrictions,
            budget=prefs.get("budget", "未设置"),
            name=r.get("name", ""),
            cuisine=r.get("cuisine", "未知"),
            avg_price=r.get("avg_price", 0),
            rating=r.get("rating", 0),
            tags=", ".join(r.get("tags", []) or []) if isinstance(r.get("tags"), list) else "",
            distance_km=round(float(r.get("distance_km", 0) or 0), 1),
            social_text=social_text,
            restaurant_id=rid,
        )

        raw = self._try_llm(prompt)
        parsed = self._parse_json_output(raw or "", ExplanationResult)

        if parsed is not None and parsed.main_reason:
            return parsed

        logger.info("Explanation LLM 路径失败，降级到模板引擎")
        return self._template_based_explanation(input)

    def _template_based_explanation(self, input: ExplanationInput) -> ExplanationResult:
        """模板引擎降级方案。"""
        r = input.restaurant
        prefs = input.user_preferences
        rid = str(r.get("id", ""))

        name = r.get("name", "这家店")
        cuisine = r.get("cuisine", "")
        price = r.get("avg_price", 0) or 0
        rating = float(r.get("rating", 0) or 0)
        dist = round(float(r.get("distance_km", 0) or 0), 1)
        tags = r.get("tags", []) or []

        # 构建理由
        parts = []
        if rating >= 4.5:
            parts.append(f"评分 {rating} 分的口碑好店")
        elif rating >= 3.5:
            parts.append(f"评分 {rating} 分")
        if cuisine:
            parts.append(f"{cuisine}餐厅")
        if price > 0:
            parts.append(f"人均 ¥{price}")
            budget = prefs.get("budget")
            if budget and price <= float(budget):
                parts.append("在预算范围内")
        if dist > 0:
            parts.append(f"距你仅 {dist}km")

        reason = f"{name}，" + "，".join(parts) + "。"

        # 个性化补充
        likes = set(str(x).lower() for x in (prefs.get("likes", []) or []))
        matched_likes = [t for t in tags if str(t).lower() in likes]
        if matched_likes:
            reason += f" 这里有你喜欢的{'、'.join(matched_likes[:2])}。"

        # 添加社交引用
        citations: list[Citation] = []
        for sn in (input.social_notes or [])[:1]:
            highlights = sn.get("highlights", []) or []
            if isinstance(highlights, list):
                for h in highlights[:1]:
                    citations.append(Citation(excerpt=str(h)[:100], likes=0, source=sn.get("platform", "")))

        # 个性化标签
        pers_tags: list[str] = []
        if price <= 50:
            pers_tags.append("经济实惠")
        if rating >= 4.3:
            pers_tags.append("口碑推荐")
        if dist <= 1:
            pers_tags.append("步行可达")
        # 从餐厅标签中选 2 个
        for t in tags[:2]:
            if t not in pers_tags:
                pers_tags.append(str(t))

        # 避雷提醒
        warning = None
        if price > 200:
            warning = "该餐厅人均较高，建议确认预算"
        dislikes = set(str(x).lower() for x in (prefs.get("dislikes", []) or []))
        for d in dislikes:
            if d in " ".join(str(t).lower() for t in tags):
                warning = f"该餐厅含{prefs.get('dislikes', [])}相关标签，请留意"

        return ExplanationResult(
            restaurant_id=rid,
            main_reason=reason,
            personalized_tags=pers_tags[:4],
            citations=citations,
            warning=warning,
        )
