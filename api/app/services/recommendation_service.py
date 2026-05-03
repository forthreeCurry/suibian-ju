"""推荐服务编排：搜索 → 过滤 → 优化 → 解释 → 组装。"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

from app.agents.explanation_agent import ExplanationGenerator, ExplanationInput, ExplanationResult
from app.agents.filter_agent import ConstraintFilterAgent, FilterInput, FilterResult
from app.agents.optimization_agent import (
    MultiObjectiveOptimizer,
    OptimizationInput,
    OptimizationResult,
)
from app.services.search_service import search_with_filters

logger = logging.getLogger(__name__)

# 各阶段超时
SEARCH_TIMEOUT_S = 15.0
FILTER_TIMEOUT_S = 15.0
OPTIMIZE_TIMEOUT_S = 15.0
EXPLAIN_TIMEOUT_S = 15.0


async def _run_with_timeout(fn, timeout: float, *args: Any, **kwargs: Any) -> Any:
    """在线程池中运行同步函数，带超时。"""
    try:
        return await asyncio.wait_for(
            asyncio.to_thread(fn, *args, **kwargs),
            timeout=timeout,
        )
    except asyncio.TimeoutError:
        logger.warning("%s 执行超时 (%.1fs)", getattr(fn, "__name__", "unknown"), timeout)
        raise
    except Exception:
        raise


def _stage_timing(stage_name: str, start_ms: float, result: Any) -> dict[str, Any]:
    elapsed = round(time.monotonic() * 1000 - start_ms, 1)
    return {"stage": stage_name, "elapsed_ms": elapsed, "ok": True}


async def generate_recommendations(
    room_id: str,
    preferences: dict[str, Any],
    location: dict[str, Any],
    weather: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    完整推荐管线。

    参数:
      room_id:     房间 ID
      preferences: 聚合的用户偏好（所有成员偏好融合后）
      location:    计算出的中心位置 {lat, lng}
      weather:     天气数据（可选）

    返回:
      { recommendations: [...], metadata: {...} }
    """
    t0 = time.monotonic()
    stages: list[dict[str, Any]] = []
    errors: list[str] = []

    # ---- Step 1: 候选检索 ----
    t_stage = time.monotonic() * 1000
    try:
        search_result = await _run_with_timeout(
            search_with_filters,
            SEARCH_TIMEOUT_S,
            user_preferences=preferences,
            location=location,
            filters={"max_distance_km": 5.0, "match_threshold": 0.3},
            limit=50,
        )
        candidates: list[dict[str, Any]] = search_result.get("candidates", [])
        stages.append(_stage_timing("search", t_stage, candidates))
    except Exception as e:
        logger.exception("搜索阶段失败")
        errors.append(f"搜索失败: {e}")
        candidates = []

    # 候选不足时放宽条件重试一次
    if len(candidates) < 5:
        t_stage = time.monotonic() * 1000
        try:
            search_result = await _run_with_timeout(
                search_with_filters,
                SEARCH_TIMEOUT_S,
                user_preferences=preferences,
                location=location,
                filters={"max_distance_km": 10.0, "match_threshold": 0.2},
                limit=50,
            )
            candidates = search_result.get("candidates", [])
            stages.append(_stage_timing("search_retry", t_stage, candidates))
        except Exception as e:
            errors.append(f"搜索重试失败: {e}")

    if not candidates:
        return {
            "recommendations": [],
            "metadata": {
                "total_candidates": 0,
                "after_filter": 0,
                "processing_time_ms": round((time.monotonic() - t0) * 1000),
                "stages": stages,
                "errors": errors,
                "fallback_note": "未找到符合条件的餐厅，请调整偏好后重试",
            },
        }

    total_candidates = len(candidates)

    # ---- Step 2: 约束过滤 ----
    t_stage = time.monotonic() * 1000
    try:
        filter_agent = ConstraintFilterAgent()
        filter_result: FilterResult = await _run_with_timeout(
            filter_agent.invoke,
            FILTER_TIMEOUT_S,
            FilterInput(
                candidates=candidates,
                location=location,
                max_distance=5.0,
                budget=str(preferences.get("budget", 500)),
                dietary_restrictions=preferences.get("dietary_restrictions", []),
                transport_mode=preferences.get("transport_mode", "walk"),
            ),
        )
        filtered = filter_result.passed
        stages.append(_stage_timing("filter", t_stage, filtered))
    except Exception as e:
        logger.exception("过滤阶段失败，使用全量候选")
        errors.append(f"过滤失败: {e}")
        filtered = candidates
        stages.append({"stage": "filter", "elapsed_ms": 0, "ok": False, "error": str(e)})

    if len(filtered) < 3:
        filtered = candidates[:10]  # 至少保留部分候选

    after_filter = len(filtered)

    # ---- Step 3: 多目标优化 ----
    t_stage = time.monotonic() * 1000
    try:
        optimizer = MultiObjectiveOptimizer()
        opt_result: OptimizationResult = await _run_with_timeout(
            optimizer.invoke,
            OPTIMIZE_TIMEOUT_S,
            OptimizationInput(
                candidates=filtered,
                user_preferences=preferences,
                weather_info=weather,
            ),
        )
        top_recs = opt_result.recommendations
        stages.append(_stage_timing("optimize", t_stage, top_recs))
    except Exception as e:
        logger.exception("优化阶段失败")
        errors.append(f"优化失败: {e}")
        # 降级：用简单评分从候选里直接选 Top 3
        from app.agents.optimization_agent import RecommendationItem, ScoreBreakdown
        top_recs = []
        for c in filtered[:3]:
            rid = str(c.get("id", ""))
            score = float(c.get("rating", 3.0)) * 15
            top_recs.append(RecommendationItem(
                restaurant_id=rid,
                name=str(c.get("name", "")),
                score=min(score, 75.0),
                breakdown=ScoreBreakdown(
                    taste_match=15.0, budget_fit=15.0, distance=10.0,
                    weather_adapt=5.0, overall_rating=float(c.get("rating", 3.0)) * 2,
                ),
                brief_reason=f"评分 {c.get('rating', '?')} 分，人均 ¥{c.get('avg_price', '?')}",
            ))
        stages.append({"stage": "optimize", "elapsed_ms": 0, "ok": False, "error": str(e)})

    # ---- Step 4: 解释生成（并行） ----
    t_stage = time.monotonic() * 1000

    async def _explain_one(rec) -> dict[str, Any]:
        try:
            # 从 filtered 中找到完整餐厅数据
            rest = next((c for c in filtered if str(c.get("id")) == rec.restaurant_id), {})
            explainer = ExplanationGenerator()
            exp: ExplanationResult = await _run_with_timeout(
                explainer.invoke,
                EXPLAIN_TIMEOUT_S,
                ExplanationInput(
                    restaurant=rest,
                    user_preferences=preferences,
                    social_notes=preferences.get("social_notes", []) if preferences else [],
                ),
            )
            return {
                "restaurant_id": rec.restaurant_id,
                "name": rec.name,
                "score": rec.score,
                "breakdown": rec.breakdown.model_dump() if rec.breakdown else {},
                "brief_reason": rec.brief_reason,
                "main_reason": exp.main_reason,
                "personalized_tags": exp.personalized_tags,
                "citations": [c.model_dump() for c in exp.citations] if exp.citations else [],
                "warning": exp.warning,
            }
        except Exception as e:
            logger.warning("解释生成失败 %s: %s", rec.restaurant_id, e)
            return {
                "restaurant_id": rec.restaurant_id,
                "name": rec.name,
                "score": rec.score,
                "breakdown": rec.breakdown.model_dump() if rec.breakdown else {},
                "brief_reason": rec.brief_reason,
                "main_reason": "",
                "personalized_tags": [],
                "citations": [],
                "warning": None,
            }

    explanations = await asyncio.gather(*(_explain_one(r) for r in top_recs))
    stages.append(_stage_timing("explain", t_stage, explanations))

    # ---- Step 5: 组装结果 ----
    total_ms = round((time.monotonic() - t0) * 1000, 1)

    result = {
        "recommendations": explanations,
        "metadata": {
            "room_id": room_id,
            "total_candidates": total_candidates,
            "after_filter": after_filter,
            "processing_time_ms": total_ms,
            "stages": stages,
            "errors": errors or None,
        },
    }

    logger.info(
        "推荐完成: room=%s candidates=%s filtered=%s top=%s total=%.0fms",
        room_id, total_candidates, after_filter, len(explanations), total_ms,
    )
    return result
