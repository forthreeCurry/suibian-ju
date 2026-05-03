"""Supabase Python 客户端单例。"""

from __future__ import annotations

import logging
from functools import lru_cache
from typing import Any

from supabase import Client, create_client

from app.config import Settings, get_settings

logger = logging.getLogger(__name__)


class SupabaseError(RuntimeError):
    """Supabase 操作异常。"""


def _build_client(settings: Settings) -> Client:
    url = settings.supabase_url
    key = settings.supabase_key
    if not url or not key:
        raise SupabaseError("SUPABASE_URL / SUPABASE_KEY 未配置")
    return create_client(str(url), str(key))


@lru_cache(maxsize=1)
def get_supabase_client() -> Client:
    """全局单例 Supabase 客户端。"""
    settings = get_settings()
    return _build_client(settings)


def supabase_query(
    table: str,
    *,
    select: str = "*",
    count: str | None = None,
    filters: dict[str, Any] | None = None,
    order: str | None = None,
    order_desc: bool = True,
    limit: int | None = None,
    offset: int | None = None,
    in_: tuple[str, list[Any]] | None = None,
    not_is: tuple[str, str] | None = None,
) -> list[dict[str, Any]]:
    """通用查询封装。"""
    client = get_supabase_client()
    q = client.table(table).select(select, count=count)

    if filters:
        for k, v in filters.items():
            q = q.eq(k, v)
    if in_:
        col, vals = in_
        q = q.in_(col, vals)
    if not_is:
        col, val = not_is
        q = q.not_.is_(col, val)
    if order:
        direction = "desc" if order_desc else "asc"
        q = q.order(order, ascending=(direction == "asc"))
    if limit is not None:
        q = q.limit(limit)
    if offset is not None:
        q = q.range(offset, offset + (limit or 100) - 1) if offset else q.limit(limit or 100)

    result = q.execute()
    return result.data or []


def supabase_upsert(table: str, rows: list[dict[str, Any]], on_conflict: str | None = None) -> None:
    """批量 upsert。"""
    if not rows:
        return
    client = get_supabase_client()
    kwargs: dict[str, Any] = {}
    if on_conflict:
        kwargs["on_conflict"] = on_conflict
    client.table(table).upsert(rows, **kwargs).execute()


def supabase_update(table: str, match: dict[str, Any], patch: dict[str, Any]) -> None:
    """按条件更新。"""
    client = get_supabase_client()
    q = client.table(table).update(patch)
    for k, v in match.items():
        q = q.eq(k, v)
    q.execute()


def supabase_rpc(fn_name: str, params: dict[str, Any]) -> list[dict[str, Any]]:
    """调用 Postgres 函数。"""
    client = get_supabase_client()
    result = client.rpc(fn_name, params).execute()
    return result.data or []
