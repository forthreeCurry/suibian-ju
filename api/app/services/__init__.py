"""业务服务模块。"""

from __future__ import annotations

from app.services.gaode_service import GaodeApiError, GaodeService

__all__ = [
    "DataMergeService",
    "DataSyncService",
    "GaodeApiError",
    "GaodeService",
    "MeituanService",
    "MockMeituanService",
]


def __getattr__(name: str):
    if name == "DataSyncService":
        from app.services.data_sync import DataSyncService
        return DataSyncService
    if name == "DataMergeService":
        from app.services.data_merge import merge_restaurant_data as DataMergeService
        return DataMergeService
    if name in ("MeituanService", "MockMeituanService"):
        from app.services import meituan_service as _m
        return getattr(_m, name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
