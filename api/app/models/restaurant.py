"""餐厅相关 Pydantic 模型（高德原始数据、库表对齐、创建用输入）。"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class GaodeLocation(BaseModel):
    model_config = ConfigDict(extra="ignore")

    lat: float | None = None
    lng: float | None = None


class GaodeRestaurant(BaseModel):
    """高德 POI 解析后的统一结构（与 GaodeService 返回的 dict 一致）。"""

    model_config = ConfigDict(extra="ignore")

    id: str | None = None
    name: str | None = None
    address: str = ""
    location: GaodeLocation = Field(default_factory=GaodeLocation)
    type: str = ""
    tel: str = ""
    rating: str = "0"
    shop_hours: str = ""
    photos: list[str] = Field(default_factory=list)
    avg_price: str = "0"
    distance: str | float | list[Any] | None = None


class Restaurant(BaseModel):
    """与 public.restaurants 表一致的读取模型。"""

    model_config = ConfigDict(extra="ignore")

    id: UUID
    gaode_id: str | None = None
    meituan_id: str | None = None
    name: str
    address: str | None = None
    latitude: Decimal | None = None
    longitude: Decimal | None = None
    cuisine: str | None = None
    categories: list[Any] | dict[str, Any] = Field(default_factory=list)
    tags: list[Any] | dict[str, Any] = Field(default_factory=list)
    rating: Decimal = Decimal("0")
    review_count: int = 0
    avg_price: int = 0
    price_level: str | None = None
    phone: str | None = None
    opening_hours: str | None = None
    cover_image: str | None = None
    images: list[Any] | dict[str, Any] = Field(default_factory=list)
    source: str = "gaode"
    is_active: bool = True
    created_at: datetime | None = None
    updated_at: datetime | None = None


class RestaurantCreate(BaseModel):
    """写入 restaurants 的字段子集（upsert 用）。"""

    model_config = ConfigDict(extra="ignore")

    gaode_id: str | None = None
    meituan_id: str | None = None
    name: str
    address: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    cuisine: str | None = None
    categories: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    rating: float = 0.0
    review_count: int = 0
    avg_price: int = 0
    price_level: str | None = None
    phone: str | None = None
    opening_hours: str | None = None
    cover_image: str | None = None
    images: list[str] = Field(default_factory=list)
    source: str = "gaode"
    is_active: bool = True
