from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Annotated, Any

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app.config import Settings, get_settings
from app.models.restaurant import Restaurant
from app.services.data_sync import DataSyncService, SyncStats
from app.services.embedding_service import batch_index_restaurants, IndexStats
from app.services.gaode_service import GaodeService
from app.agents.explanation_agent import ExplanationGenerator, ExplanationInput, ExplanationResult
from app.agents.filter_agent import ConstraintFilterAgent, FilterInput, FilterResult
from app.agents.optimization_agent import MultiObjectiveOptimizer, OptimizationInput, OptimizationResult
from app.services.recommendation_service import generate_recommendations
from app.services.search_service import search_with_filters

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    gaode = GaodeService(settings)
    app.state.settings = settings
    app.state.gaode = gaode
    yield
    await gaode.aclose()


settings = get_settings()

app = FastAPI(
    title="随便聚推荐 API",
    description="AI 智能餐厅推荐系统",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, Any]:
    ollama_ok = False
    try:
        from app.agents.base import is_llm_available
        ollama_ok = is_llm_available()
    except Exception:
        pass
    return {
        "status": "ok",
        "supabase": bool(settings.supabase_url and settings.supabase_key),
        "ollama": ollama_ok,
        "gaode": bool(settings.gaode_api_key),
    }


@app.get("/api/v2/status")
def api_status() -> dict:
    return {
        "service": "随便聚推荐 API",
        "version": "2.0.0",
        "status": "running",
        "config": {
            "gaode_configured": bool(settings.gaode_api_key),
            "meituan_configured": bool(settings.meituan_appkey and settings.meituan_secret),
            "supabase_configured": bool(settings.supabase_url and settings.supabase_key),
            "ollama_host": settings.ollama_host,
            "cors_origins": settings.cors_origins_list,
        },
    }


class SyncAreaRequest(BaseModel):
    area_name: str = Field(..., description="商圈名称（用于日志与统计）")
    lat: float
    lng: float
    radius: int = Field(default=5000, ge=100, le=50_000)


class SyncAreaResponse(BaseModel):
    area_name: str
    inserted: int
    updated: int
    total: int


class SyncPopularResponse(BaseModel):
    areas: list[SyncAreaResponse]
    summary_inserted: int
    summary_updated: int
    summary_total: int


def _stats_to_response(s: SyncStats) -> SyncAreaResponse:
    return SyncAreaResponse(
        area_name=s.area_name,
        inserted=s.inserted,
        updated=s.updated,
        total=s.total,
    )


@app.post("/api/v2/sync/area", response_model=SyncAreaResponse)
async def v2_sync_area(body: SyncAreaRequest, request: Request) -> SyncAreaResponse:
    """临时调试：按中心点同步高德餐饮 POI 至 Supabase。"""
    cfg: Settings = request.app.state.settings
    if not cfg.gaode_api_key:
        raise HTTPException(status_code=400, detail="GAODE_API_KEY 未配置")
    gaode: GaodeService = request.app.state.gaode
    sync = DataSyncService(cfg, gaode)
    try:
        stats = await sync.sync_area(
            area_name=body.area_name,
            center_lat=body.lat,
            center_lng=body.lng,
            radius=body.radius,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except Exception as e:
        logger.exception("sync_area 失败")
        raise HTTPException(status_code=500, detail=str(e)) from e
    return _stats_to_response(stats)


@app.post("/api/v2/sync/popular", response_model=SyncPopularResponse)
async def v2_sync_popular(request: Request) -> SyncPopularResponse:
    """临时调试：同步预定义的 10 个北京热门商圈。"""
    cfg: Settings = request.app.state.settings
    if not cfg.gaode_api_key:
        raise HTTPException(status_code=400, detail="GAODE_API_KEY 未配置")
    gaode: GaodeService = request.app.state.gaode
    sync = DataSyncService(cfg, gaode)
    try:
        all_stats = await sync.sync_popular_areas()
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except Exception as e:
        logger.exception("sync_popular 失败")
        raise HTTPException(status_code=500, detail=str(e)) from e

    areas = [_stats_to_response(s) for s in all_stats]
    return SyncPopularResponse(
        areas=areas,
        summary_inserted=sum(s.inserted for s in all_stats),
        summary_updated=sum(s.updated for s in all_stats),
        summary_total=sum(s.total for s in all_stats),
    )


def _list_restaurants_sync(
    settings: Settings,
    *,
    page: int,
    page_size: int,
    cuisine: str | None,
) -> tuple[list[dict[str, Any]], int]:
    from supabase import create_client

    client = create_client(settings.supabase_url, settings.supabase_key)
    offset = (page - 1) * page_size
    end = offset + page_size - 1
    q = client.table("restaurants").select("*", count="exact")
    if cuisine:
        q = q.eq("cuisine", cuisine)
    result = q.order("created_at", desc=True).range(offset, end).execute()
    rows = result.data or []
    total = result.count if result.count is not None else len(rows)
    return rows, int(total)


@app.get("/api/v2/restaurants")
async def v2_list_restaurants(
    request: Request,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    cuisine: Annotated[str | None, Query(description="菜系精确匹配")] = None,
) -> dict[str, Any]:
    """临时调试：分页查询已入库餐厅，可选菜系筛选。"""
    cfg: Settings = request.app.state.settings
    if not cfg.supabase_url or not cfg.supabase_key:
        raise HTTPException(status_code=503, detail="SUPABASE_URL / SUPABASE_KEY 未配置")
    try:
        rows, total = await asyncio.to_thread(
            _list_restaurants_sync,
            cfg,
            page=page,
            page_size=page_size,
            cuisine=cuisine,
        )
    except Exception as e:
        logger.exception("list restaurants 失败")
        raise HTTPException(status_code=500, detail=str(e)) from e

    items = [Restaurant.model_validate(r).model_dump(mode="json") for r in rows]
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


def _restaurant_stats_sync(settings: Settings) -> dict[str, Any]:
    from supabase import create_client

    client = create_client(settings.supabase_url, settings.supabase_key)

    total_res = client.table("restaurants").select("id", count="exact").execute()
    total = total_res.count if total_res.count is not None else 0

    cuisine_res = client.table("restaurants") \
        .select("cuisine") \
        .not_.is_("cuisine", "null") \
        .execute()
    cuisine_counts: dict[str, int] = {}
    for r in (cuisine_res.data or []):
        c = r.get("cuisine", "")
        if c:
            cuisine_counts[c] = cuisine_counts.get(c, 0) + 1
    sorted_cuisines = sorted(cuisine_counts.items(), key=lambda x: -x[1])[:15]

    price_res = client.table("restaurants") \
        .select("price_level") \
        .not_.is_("price_level", "null") \
        .execute()
    price_counts: dict[str, int] = {"low": 0, "mid": 0, "high": 0}
    for r in (price_res.data or []):
        p = r.get("price_level", "")
        if p in price_counts:
            price_counts[p] += 1

    indexed_res = client.table("restaurant_embeddings").select("id", count="exact").execute()
    indexed = indexed_res.count if indexed_res.count is not None else 0

    return {
        "total_restaurants": total,
        "indexed": indexed,
        "not_indexed": total - indexed,
        "cuisines": dict(sorted_cuisines),
        "price_levels": price_counts,
    }


@app.get("/api/v2/restaurants/stats")
async def v2_restaurant_stats(request: Request) -> dict[str, Any]:
    """返回餐厅数据统计（总数、菜系分布、价位分布、索引率）。"""
    cfg: Settings = request.app.state.settings
    if not cfg.supabase_url or not cfg.supabase_key:
        raise HTTPException(status_code=503, detail="SUPABASE_URL / SUPABASE_KEY 未配置")
    try:
        return await asyncio.to_thread(_restaurant_stats_sync, cfg)
    except Exception as e:
        logger.exception("restaurant stats 失败")
        raise HTTPException(status_code=500, detail=str(e)) from e


class RecommendRequest(BaseModel):
    room_id: str = Field(..., description="房间 ID")
    preferences: dict[str, Any] = Field(default_factory=dict, description="用户偏好")
    location: dict[str, Any] = Field(..., description="中心位置 {lat, lng}")
    weather: dict[str, Any] | None = Field(default=None, description="天气数据")


@app.post("/api/v2/recommend")
async def v2_recommend(body: RecommendRequest, request: Request) -> dict[str, Any]:
    """
    核心推荐接口：搜索 → 过滤 → 优化 → 解释 → 组装。
    返回 Top 3 推荐结果，含分数明细和推荐理由。
    """
    cfg: Settings = request.app.state.settings
    if not cfg.supabase_url or not cfg.supabase_key:
        raise HTTPException(status_code=503, detail="SUPABASE_URL / SUPABASE_KEY 未配置")
    try:
        result = await generate_recommendations(
            room_id=body.room_id,
            preferences=body.preferences,
            location=body.location,
            weather=body.weather,
        )
    except Exception as e:
        logger.exception("recommend 失败")
        raise HTTPException(status_code=500, detail=str(e)) from e
    return result


class SearchRequest(BaseModel):
    query: str | None = Field(default=None, description="关键词（可选）")
    preferences: dict[str, Any] | None = Field(default=None, description="用户偏好")
    location: dict[str, Any] = Field(..., description="位置 {lat, lng}")
    filters: dict[str, Any] | None = Field(default=None, description="额外过滤条件")
    limit: int = Field(default=50, ge=1, le=200)


@app.post("/api/v2/search")
async def v2_search(body: SearchRequest, request: Request) -> dict[str, Any]:
    """混合搜索：向量 + 关键词 RRF 融合检索餐厅。"""
    cfg: Settings = request.app.state.settings
    if not cfg.supabase_url or not cfg.supabase_key:
        raise HTTPException(status_code=503, detail="SUPABASE_URL / SUPABASE_KEY 未配置")
    try:
        result = await asyncio.to_thread(
            search_with_filters,
            user_preferences=body.preferences,
            location=body.location,
            filters=body.filters,
            limit=body.limit,
        )
    except Exception as e:
        logger.exception("search 失败")
        raise HTTPException(status_code=500, detail=str(e)) from e
    return result


class FilterTestRequest(BaseModel):
    candidates: list[dict[str, Any]]
    location: dict[str, Any]
    max_distance: float = 5.0
    budget: str = "500"
    dietary_restrictions: list[str] = Field(default_factory=list)
    transport_mode: str = "walk"


@app.post("/api/v2/agents/filter/test", response_model=FilterResult)
async def v2_filter_test(body: FilterTestRequest) -> FilterResult:
    """调试：测试约束过滤 Agent。"""
    agent = ConstraintFilterAgent()
    return agent.invoke(FilterInput(
        candidates=body.candidates,
        location=body.location,
        max_distance=body.max_distance,
        budget=body.budget,
        dietary_restrictions=body.dietary_restrictions,
        transport_mode=body.transport_mode,
    ))


class OptimizeTestRequest(BaseModel):
    candidates: list[dict[str, Any]]
    user_preferences: dict[str, Any] = Field(default_factory=dict)
    weather_info: dict[str, Any] | None = None


@app.post("/api/v2/agents/optimize/test", response_model=OptimizationResult)
async def v2_optimize_test(body: OptimizeTestRequest) -> OptimizationResult:
    """调试：测试多目标优化 Agent。"""
    agent = MultiObjectiveOptimizer()
    return agent.invoke(OptimizationInput(
        candidates=body.candidates,
        user_preferences=body.user_preferences,
        weather_info=body.weather_info,
    ))


class ExplainTestRequest(BaseModel):
    restaurant: dict[str, Any]
    user_preferences: dict[str, Any] = Field(default_factory=dict)
    social_notes: list[dict[str, Any]] | None = None


@app.post("/api/v2/agents/explain/test", response_model=ExplanationResult)
async def v2_explain_test(body: ExplainTestRequest) -> ExplanationResult:
    """调试：测试可解释性 Agent。"""
    agent = ExplanationGenerator()
    return agent.invoke(ExplanationInput(
        restaurant=body.restaurant,
        user_preferences=body.user_preferences,
        social_notes=body.social_notes,
    ))


def _embedding_index_sync() -> IndexStats:
    return batch_index_restaurants()


@app.post("/api/v2/embeddings/index")
async def v2_embeddings_index(request: Request) -> dict[str, Any]:
    """手动触发批量 Embedding 生成与索引。"""
    cfg: Settings = request.app.state.settings
    if not cfg.supabase_url or not cfg.supabase_key:
        raise HTTPException(status_code=503, detail="SUPABASE_URL / SUPABASE_KEY 未配置")
    try:
        stats = await asyncio.to_thread(_embedding_index_sync)
    except Exception as e:
        logger.exception("embeddings index 失败")
        raise HTTPException(status_code=500, detail=str(e)) from e
    return {
        "total_restaurants": stats.total_restaurants,
        "already_indexed": stats.already_indexed,
        "newly_indexed": stats.newly_indexed,
        "errors": stats.errors,
        "elapsed_seconds": round(stats.elapsed_seconds, 2),
        "fallback": stats.fallback,
    }


@app.get("/api/v2/embeddings/stats")
async def v2_embeddings_stats(request: Request) -> dict[str, Any]:
    """Embedding 索引统计（已索引数/未索引数/总数）。"""
    cfg: Settings = request.app.state.settings
    if not cfg.supabase_url or not cfg.supabase_key:
        raise HTTPException(status_code=503, detail="SUPABASE_URL / SUPABASE_KEY 未配置")
    try:
        from supabase import create_client
        client = create_client(cfg.supabase_url, cfg.supabase_key)
        total = client.table("restaurants").select("id", count="exact").eq("is_active", True).execute()
        indexed = client.table("restaurant_embeddings").select("id", count="exact").execute()
        t = total.count if total.count is not None else 0
        i = indexed.count if indexed.count is not None else 0
        return {"total_restaurants": t, "indexed": i, "not_indexed": t - i}
    except Exception as e:
        logger.exception("embeddings stats 失败")
        raise HTTPException(status_code=500, detail=str(e)) from e
