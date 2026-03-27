-- ============================================================
-- 随便聚 迁移 002 — 扩展表结构
-- 在 Supabase SQL Editor 中执行（增量，不破坏已有数据）
-- ============================================================

-- ============================================================
-- 1. rooms 表新增字段
-- ============================================================
alter table public.rooms
  add column if not exists name              text,
  add column if not exists scene             text not null default 'instant',
  add column if not exists max_members       int  not null default 10,
  add column if not exists date_time         timestamptz,
  add column if not exists location_strategy text not null default 'smart',
  add column if not exists budget_mode       text not null default 'anonymous';

alter table public.rooms
  add constraint rooms_scene_check
    check (scene in ('instant', 'planned'));

alter table public.rooms
  add constraint rooms_location_strategy_check
    check (location_strategy in ('smart', 'manual'));

alter table public.rooms
  add constraint rooms_budget_mode_check
    check (budget_mode in ('anonymous', 'unified'));

comment on column public.rooms.name              is '聚餐名称（可选，如"周五火锅局"）';
comment on column public.rooms.scene             is '场景类型：instant 即时聚 / planned 提前聚';
comment on column public.rooms.max_members       is '人数上限，默认 10';
comment on column public.rooms.date_time         is '聚餐时间（提前聚场景使用）';
comment on column public.rooms.location_strategy is '位置策略：smart 智能商圈 / manual 手动选择';
comment on column public.rooms.budget_mode       is '预算模式：anonymous 匿名 / unified 统一';

-- ============================================================
-- 2. preferences 表新增字段
-- ============================================================
alter table public.preferences
  add column if not exists departure_location jsonb,
  add column if not exists transport_mode     text;

alter table public.preferences
  add constraint preferences_transport_check
    check (transport_mode is null or transport_mode in ('subway', 'drive', 'bike', 'walk'));

comment on column public.preferences.departure_location is '出发地，格式 {"lat":39.9,"lng":116.4,"address":"xxx"}';
comment on column public.preferences.transport_mode     is '交通方式：subway / drive / bike / walk';

-- ============================================================
-- 3. 新建 results 表
-- ============================================================
create table if not exists public.results (
  id              uuid primary key default gen_random_uuid(),
  room_id         uuid not null references public.rooms (id) on delete cascade,
  recommendations jsonb not null default '[]'::jsonb,
  weather_info    jsonb,
  created_at      timestamptz not null default now()
);

comment on table  public.results                 is 'AI 推荐结果';
comment on column public.results.room_id         is '关联房间';
comment on column public.results.recommendations is 'Top N 餐厅推荐，数组格式';
comment on column public.results.weather_info    is '天气数据快照，如 {"temp_max":28,"description":"晴天"}';

create index if not exists idx_results_room_id on public.results (room_id);

-- RLS
alter table public.results enable row level security;

create policy "results_select" on public.results
  for select using (true);

create policy "results_insert" on public.results
  for insert with check (true);

create policy "results_update" on public.results
  for update using (true) with check (true);

-- Realtime
alter publication supabase_realtime add table public.results;
