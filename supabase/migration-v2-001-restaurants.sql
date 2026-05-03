-- ============================================================
-- 随便聚 迁移 V2-001 — 餐厅、向量、位置与社交笔记缓存
-- 在 Supabase SQL Editor 中执行（增量，不重建已有表）
-- 依赖：public schema、pgcrypto（gen_random_uuid）
-- ============================================================

-- ============================================================
-- 1. pgvector
-- ============================================================
create extension if not exists vector;

-- ============================================================
-- 2. restaurants — 餐厅主表
-- ============================================================
create table if not exists public.restaurants (
  id             uuid primary key default gen_random_uuid(),
  gaode_id       text unique,
  meituan_id     text unique,
  name           text not null,
  address        text,
  latitude       numeric(10, 8),
  longitude      numeric(11, 8),
  cuisine        text,
  categories     jsonb not null default '[]'::jsonb,
  tags           jsonb not null default '[]'::jsonb,
  rating         numeric(3, 2) not null default 0,
  review_count   int not null default 0,
  avg_price      int not null default 0,
  price_level    text
    check (price_level is null or price_level in ('low', 'mid', 'high')),
  phone          text,
  opening_hours  text,
  cover_image    text,
  images         jsonb not null default '[]'::jsonb,
  source         text not null default 'gaode',
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.restaurants is '餐厅主表（高德/美团等来源）';
comment on column public.restaurants.gaode_id is '高德 POI ID';
comment on column public.restaurants.meituan_id is '美团店铺 ID';
comment on column public.restaurants.cuisine is '菜系';
comment on column public.restaurants.source is '数据来源，默认 gaode';

-- ============================================================
-- 3. restaurant_embeddings — 向量存储
-- ============================================================
create table if not exists public.restaurant_embeddings (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null unique
    references public.restaurants (id) on delete cascade,
  embedding      vector(384) not null,
  text_content   text,
  created_at     timestamptz not null default now()
);

comment on table public.restaurant_embeddings is '餐厅文本向量（384 维）';
comment on column public.restaurant_embeddings.text_content is '生成 embedding 的原始文本';

-- ============================================================
-- 4. user_location_history — 位置记录
-- ============================================================
create table if not exists public.user_location_history (
  id               uuid primary key default gen_random_uuid(),
  user_id          text not null,
  latitude         numeric(10, 8) not null,
  longitude        numeric(11, 8) not null,
  address          text,
  accuracy         numeric,
  location_source  text
    check (location_source is null or location_source in ('gps', 'network', 'wifi', 'ip')),
  created_at       timestamptz not null default now()
);

comment on table public.user_location_history is '用户/匿名设备位置历史';
comment on column public.user_id is '登录用户或设备指纹等匿名标识';

-- ============================================================
-- 5. social_notes — 社交笔记解析缓存
-- ============================================================
create table if not exists public.social_notes (
  id           uuid primary key default gen_random_uuid(),
  url          text,
  platform     text
    check (platform is null or platform in ('xiaohongshu', 'douyin')),
  raw_content  text,
  parsed_data  jsonb,
  shop_name    text,
  sentiment    text,
  created_at   timestamptz not null default now()
);

comment on table public.social_notes is '小红书/抖音等笔记解析结果缓存';

-- ============================================================
-- 6. 索引
-- ============================================================
create index if not exists idx_restaurants_gaode_id
  on public.restaurants (gaode_id);

create index if not exists idx_restaurants_meituan_id
  on public.restaurants (meituan_id);

create index if not exists idx_restaurants_cuisine
  on public.restaurants (cuisine);

create index if not exists idx_restaurants_price_level
  on public.restaurants (price_level);

-- IVFFlat：表极空时若创建失败，可先导入数据后再执行本段
create index if not exists idx_restaurant_embeddings_ivfflat_cosine
  on public.restaurant_embeddings
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

create index if not exists idx_user_location_history_user_created
  on public.user_location_history (user_id, created_at desc);

-- ============================================================
-- 7. 向量 + 距离检索函数
-- cosine 相似度：1 - (embedding <=> query_embedding)
-- 距离：Haversine（球面近似，单位 km）
-- ============================================================
create or replace function public.search_restaurants_v2(
  query_embedding vector(384),
  user_lat numeric,
  user_lng numeric,
  max_distance_km double precision default 5,
  match_budget text default null,
  match_threshold double precision default 0.6,
  max_results int default 20
)
returns table (
  id uuid,
  name text,
  address text,
  cuisine text,
  rating numeric,
  avg_price int,
  distance_km double precision,
  similarity double precision
)
language sql
stable
security invoker
set search_path = public
as $$
  with base as (
    select
      r.id,
      r.name,
      r.address,
      r.cuisine,
      r.rating,
      r.avg_price,
      r.latitude,
      r.longitude,
      (1::double precision - (re.embedding <=> query_embedding)::double precision)
        as similarity
    from public.restaurants r
    inner join public.restaurant_embeddings re on re.restaurant_id = r.id
    where r.is_active = true
      and r.latitude is not null
      and r.longitude is not null
      and (1::double precision - (re.embedding <=> query_embedding)::double precision)
        > match_threshold
      and (
        match_budget is null
        or btrim(match_budget) = ''
        or r.avg_price <= (match_budget)::numeric
      )
  ),
  with_dist as (
    select
      b.*,
      (
        6371.0 * acos(
          least(
            1.0::double precision,
            greatest(
              -1.0::double precision,
              cos(radians(user_lat::double precision))
                * cos(radians(b.latitude::double precision))
                * cos(
                  radians(b.longitude::double precision)
                  - radians(user_lng::double precision)
                )
                + sin(radians(user_lat::double precision))
                * sin(radians(b.latitude::double precision))
            )
          )
        )
      ) as distance_km
    from base b
  )
  select
    w.id,
    w.name,
    w.address,
    w.cuisine,
    w.rating,
    w.avg_price,
    w.distance_km,
    w.similarity
  from with_dist w
  where w.distance_km < max_distance_km
  order by w.similarity desc, w.rating desc nulls last, w.distance_km asc
  limit max_results;
$$;

comment on function public.search_restaurants_v2(
  vector, numeric, numeric, double precision, text, double precision, int
) is '按向量相似度 + Haversine 距离 + 可选人均预算筛选餐厅';

grant execute on function public.search_restaurants_v2(
  vector, numeric, numeric, double precision, text, double precision, int
) to anon, authenticated;

-- ============================================================
-- 8. Row Level Security — MVP 全放行
-- ============================================================
alter table public.restaurants enable row level security;
drop policy if exists "restaurants_select" on public.restaurants;
drop policy if exists "restaurants_insert" on public.restaurants;
drop policy if exists "restaurants_update" on public.restaurants;
drop policy if exists "restaurants_delete" on public.restaurants;
create policy "restaurants_select" on public.restaurants for select using (true);
create policy "restaurants_insert" on public.restaurants for insert with check (true);
create policy "restaurants_update" on public.restaurants for update using (true) with check (true);
create policy "restaurants_delete" on public.restaurants for delete using (true);

alter table public.restaurant_embeddings enable row level security;
drop policy if exists "restaurant_embeddings_select" on public.restaurant_embeddings;
drop policy if exists "restaurant_embeddings_insert" on public.restaurant_embeddings;
drop policy if exists "restaurant_embeddings_update" on public.restaurant_embeddings;
drop policy if exists "restaurant_embeddings_delete" on public.restaurant_embeddings;
create policy "restaurant_embeddings_select" on public.restaurant_embeddings for select using (true);
create policy "restaurant_embeddings_insert" on public.restaurant_embeddings for insert with check (true);
create policy "restaurant_embeddings_update" on public.restaurant_embeddings for update using (true) with check (true);
create policy "restaurant_embeddings_delete" on public.restaurant_embeddings for delete using (true);

alter table public.user_location_history enable row level security;
drop policy if exists "user_location_history_select" on public.user_location_history;
drop policy if exists "user_location_history_insert" on public.user_location_history;
drop policy if exists "user_location_history_update" on public.user_location_history;
drop policy if exists "user_location_history_delete" on public.user_location_history;
create policy "user_location_history_select" on public.user_location_history for select using (true);
create policy "user_location_history_insert" on public.user_location_history for insert with check (true);
create policy "user_location_history_update" on public.user_location_history for update using (true) with check (true);
create policy "user_location_history_delete" on public.user_location_history for delete using (true);

alter table public.social_notes enable row level security;
drop policy if exists "social_notes_select" on public.social_notes;
drop policy if exists "social_notes_insert" on public.social_notes;
drop policy if exists "social_notes_update" on public.social_notes;
drop policy if exists "social_notes_delete" on public.social_notes;
create policy "social_notes_select" on public.social_notes for select using (true);
create policy "social_notes_insert" on public.social_notes for insert with check (true);
create policy "social_notes_update" on public.social_notes for update using (true) with check (true);
create policy "social_notes_delete" on public.social_notes for delete using (true);

-- ============================================================
-- 9. Realtime 发布（重复执行时忽略已存在）
-- ============================================================
do $pub$
begin
  alter publication supabase_realtime add table public.restaurants;
exception
  when duplicate_object then
    null;
end;
$pub$;

do $pub$
begin
  alter publication supabase_realtime add table public.restaurant_embeddings;
exception
  when duplicate_object then
    null;
end;
$pub$;
