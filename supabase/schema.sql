-- ============================================================
-- 随便聚 完整数据库 Schema（含 migration-002 扩展）
-- 首次部署：在 Supabase SQL Editor 中一次性执行
-- 已有库增量更新：执行 migration-002-expand.sql
-- ============================================================

create extension if not exists "pgcrypto";

-- ============================================================
-- 1. rooms — 房间表
-- ============================================================
create table public.rooms (
  id                uuid primary key default gen_random_uuid(),
  short_code        text not null unique,
  host_id           text not null,
  status            text not null default 'waiting'
    check (status in ('waiting', 'voting', 'calculating', 'finished')),
  name              text,
  scene             text not null default 'instant'
    check (scene in ('instant', 'planned')),
  max_members       int  not null default 10,
  date_time         timestamptz,
  location_strategy text not null default 'smart'
    check (location_strategy in ('smart', 'manual')),
  budget_mode       text not null default 'anonymous'
    check (budget_mode in ('anonymous', 'unified')),
  created_at        timestamptz not null default now()
);

comment on table  public.rooms                    is '聚餐房间';
comment on column public.rooms.short_code         is '6 位分享码';
comment on column public.rooms.host_id            is '发起人 member_id';
comment on column public.rooms.status             is '状态流转：waiting → voting → calculating → finished';
comment on column public.rooms.name               is '聚餐名称（可选，如"周五火锅局"）';
comment on column public.rooms.scene              is '场景类型：instant 即时聚 / planned 提前聚';
comment on column public.rooms.max_members        is '人数上限，默认 10';
comment on column public.rooms.date_time          is '聚餐时间（提前聚场景使用）';
comment on column public.rooms.location_strategy  is '位置策略：smart 智能商圈 / manual 手动选择';
comment on column public.rooms.budget_mode        is '预算模式：anonymous 匿名 / unified 统一';

-- ============================================================
-- 2. members — 成员表
-- ============================================================
create table public.members (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references public.rooms (id) on delete cascade,
  nickname   text not null,
  avatar_url text,
  joined_at  timestamptz not null default now()
);

comment on table  public.members            is '房间成员';
comment on column public.members.avatar_url is '随机分配的 Emoji 头像';

-- ============================================================
-- 3. preferences — 偏好表
-- ============================================================
create table public.preferences (
  id                   uuid primary key default gen_random_uuid(),
  member_id            uuid not null unique references public.members (id) on delete cascade,
  budget               text,
  dietary_restrictions jsonb not null default '[]'::jsonb,
  taste_likes          jsonb not null default '[]'::jsonb,
  departure_location   jsonb,
  transport_mode       text
    check (transport_mode is null or transport_mode in ('subway', 'drive', 'bike', 'walk')),
  created_at           timestamptz not null default now()
);

comment on table  public.preferences                      is '成员偏好（匿名，其他人不可见）';
comment on column public.preferences.budget               is '人均预算（数字字符串，如 "120"）';
comment on column public.preferences.dietary_restrictions  is '忌口列表，如 ["香菜","海鲜过敏"]';
comment on column public.preferences.taste_likes           is '口味偏好，如 {"likes":["无辣不欢"],"neutrals":[...],"dislikes":[...]}';
comment on column public.preferences.departure_location    is '出发地，格式 {"lat":39.9,"lng":116.4,"address":"xxx"}';
comment on column public.preferences.transport_mode        is '交通方式：subway / drive / bike / walk';

-- ============================================================
-- 4. results — AI 推荐结果表
-- ============================================================
create table public.results (
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

-- ============================================================
-- 5. 索引
-- ============================================================
create index idx_members_room_id     on public.members     (room_id);
create index idx_preferences_member  on public.preferences (member_id);
create index idx_results_room_id     on public.results     (room_id);

-- ============================================================
-- 6. Row Level Security — MVP 阶段允许匿名用户所有操作
-- ============================================================

-- rooms
alter table public.rooms enable row level security;
create policy "rooms_select" on public.rooms for select using (true);
create policy "rooms_insert" on public.rooms for insert with check (true);
create policy "rooms_update" on public.rooms for update using (true) with check (true);

-- members
alter table public.members enable row level security;
create policy "members_select" on public.members for select using (true);
create policy "members_insert" on public.members for insert with check (true);
create policy "members_update" on public.members for update using (true) with check (true);

-- preferences
alter table public.preferences enable row level security;
create policy "preferences_select" on public.preferences for select using (true);
create policy "preferences_insert" on public.preferences for insert with check (true);
create policy "preferences_update" on public.preferences for update using (true) with check (true);

-- results
alter table public.results enable row level security;
create policy "results_select" on public.results for select using (true);
create policy "results_insert" on public.results for insert with check (true);
create policy "results_update" on public.results for update using (true) with check (true);

-- ============================================================
-- 7. Realtime — 开启实时订阅
-- ============================================================
alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.members;
alter publication supabase_realtime add table public.preferences;
alter publication supabase_realtime add table public.results;
