# 「随便聚」V2.0 分阶段实施指令手册

> 基于 `v2.dev.md` 迭代方案，拆解为 **7 个阶段、13 轮指令**。
> 每轮直接复制 prompt 发给 AI 即可，阶段间有明确的验收标准。

---

## 现有资产盘点（V1.0）

| 已有 | 状态 |
|------|------|
| Next.js 16 + React 19 前端 | ✅ 可用 |
| Supabase (rooms/members/preferences/results 表) | ✅ 可用 |
| 首页双入口 + 建房流程 | ✅ 可用 |
| 3 步偏好收集 (位置→预算→口味) | ✅ 可用 |
| 等待大厅 + AI Loading | ✅ 可用 |
| 规则引擎推荐 (ai-recommend.ts) | ✅ 需替换 |
| 结果展示页 | ✅ 需升级 |
| Python 后端 | ❌ 无，需新建 |
| 真实餐厅数据 | ❌ 无，需接入 |
| 向量数据库 | ❌ 无，需搭建 |
| AI Agent 系统 | ❌ 无，需开发 |

---

## 阶段总览

```
Phase 1  基础设施与数据库 ████░░░░░░░░░░░░░░░░░░  (Week 1)
Phase 2  外部数据接入     ░░░░████░░░░░░░░░░░░░░  (Week 1-2)
Phase 3  定位服务升级     ░░░░░░░░██░░░░░░░░░░░░  (Week 2)
Phase 4  向量检索系统     ░░░░░░░░░░████░░░░░░░░  (Week 3)
Phase 5  AI Agent 引擎    ░░░░░░░░░░░░░░██████░░  (Week 4-5)
Phase 6  服务整合与联调   ░░░░░░░░░░░░░░░░░░████  (Week 6)
Phase 7  测试优化与上线   ░░░░░░░░░░░░░░░░░░░░██  (Week 7-8)
```

| 阶段 | 轮次 | 核心交付 | 验收标准 |
|------|------|---------|---------|
| Phase 1 | 第 1-2 轮 | FastAPI 项目 + 数据库 Schema | 项目可启动，表结构正确 |
| Phase 2 | 第 3-4 轮 | 高德/美团 API + 数据融合 | 1000+ 餐厅入库 |
| Phase 3 | 第 5 轮 | 智能定位服务 | 三重降级定位可用 |
| Phase 4 | 第 6-7 轮 | Embedding + 向量检索 | 检索耗时 <100ms |
| Phase 5 | 第 8-10 轮 | 4 个 AI Agent | 各 Agent 单测通过 |
| Phase 6 | 第 11-12 轮 | FastAPI 服务 + 前端联调 | 推荐流程端到端跑通 |
| Phase 7 | 第 13 轮 | 测试 + 部署 | 线上可用 |

---

## Phase 1：基础设施与数据库（Week 1）

### 第 1 轮 — Python 后端项目初始化

```
我需要在当前 Next.js 项目的根目录下新建一个 Python 后端项目，用于 AI 推荐服务。

请完成以下任务：

1. 在项目根目录创建 `api/` 目录作为 Python 后端的根目录，目录结构如下：
   api/
   ├── app/
   │   ├── __init__.py
   │   ├── main.py           # FastAPI 入口
   │   ├── config.py          # 配置管理（环境变量）
   │   ├── agents/            # AI Agent 模块
   │   │   └── __init__.py
   │   ├── services/          # 业务服务
   │   │   └── __init__.py
   │   └── models/            # Pydantic 数据模型
   │       └── __init__.py
   ├── requirements.txt
   ├── .env.example
   └── README.md

2. requirements.txt 内容（请用 pip 查询最新稳定版本号）：
   - fastapi
   - uvicorn[standard]
   - langchain
   - langchain-ollama
   - langchain-community
   - langgraph
   - supabase (Python 客户端)
   - httpx (异步 HTTP 客户端)
   - pydantic
   - python-dotenv
   - transformers (HuggingFace，用于 Embedding)
   - torch (CPU 版本即可)
   - paddleocr (可选，用于截图 OCR)
   - Pillow

3. config.py：使用 pydantic-settings 管理环境变量：
   - GAODE_API_KEY
   - MEITUAN_APPKEY / MEITUAN_SECRET
   - SUPABASE_URL / SUPABASE_KEY
   - OLLAMA_HOST (默认 http://localhost:11434)
   - CORS_ORIGINS (默认 ["http://localhost:3000"])

4. main.py：创建基础 FastAPI 应用：
   - 标题 "随便聚推荐 API"，版本 "2.0.0"
   - 配置 CORS 中间件（允许前端跨域）
   - 添加 GET /health 健康检查端点
   - 添加 GET /api/v2/status 返回服务状态

5. .env.example：列出所有需要的环境变量（值留空）

6. 更新根目录 .gitignore，添加 Python 相关忽略项：
   __pycache__/、*.pyc、api/.env、api/venv/

确保 main.py 可以通过 `cd api && uvicorn app.main:app --reload` 正常启动。
```

**验收**：`cd api && pip install -r requirements.txt && uvicorn app.main:app --reload`，访问 `http://localhost:8000/health` 返回 200。

---

### 第 2 轮 — 数据库 Schema 扩展

```
@supabase/schema.sql @docs/v2.dev.md

请帮我写一段 SQL 迁移脚本（增量修改，不是重建），保存为 supabase/migration-v2-001-restaurants.sql，用于在 Supabase SQL Editor 中执行。

需要完成以下所有操作：

1. 启用 pgvector 扩展：
   CREATE EXTENSION IF NOT EXISTS vector;

2. 创建 restaurants 表（餐厅主表）：
   - id (uuid PK, gen_random_uuid())
   - gaode_id (text, UNIQUE，高德 POI ID)
   - meituan_id (text, UNIQUE，美团店铺 ID)
   - name (text NOT NULL)
   - address (text)
   - latitude (numeric(10,8))
   - longitude (numeric(11,8))
   - cuisine (text，菜系)
   - categories (jsonb DEFAULT '[]')
   - tags (jsonb DEFAULT '[]')
   - rating (numeric(3,2) DEFAULT 0)
   - review_count (int DEFAULT 0)
   - avg_price (int DEFAULT 0)
   - price_level (text CHECK in ('low','mid','high'))
   - phone (text)
   - opening_hours (text)
   - cover_image (text)
   - images (jsonb DEFAULT '[]')
   - source (text NOT NULL DEFAULT 'gaode')
   - is_active (boolean DEFAULT true)
   - created_at (timestamptz DEFAULT now())
   - updated_at (timestamptz DEFAULT now())

3. 创建 restaurant_embeddings 表（向量存储）：
   - id (uuid PK)
   - restaurant_id (uuid FK → restaurants.id ON DELETE CASCADE, UNIQUE)
   - embedding (vector(384)，384 维向量)
   - text_content (text，用于生成向量的原始文本)
   - created_at (timestamptz DEFAULT now())

4. 创建 user_location_history 表（位置记录）：
   - id (uuid PK)
   - user_id (text，匿名用户可用设备指纹)
   - latitude (numeric(10,8) NOT NULL)
   - longitude (numeric(11,8) NOT NULL)
   - address (text)
   - accuracy (numeric)
   - location_source (text CHECK in ('gps','network','wifi','ip'))
   - created_at (timestamptz DEFAULT now())

5. 创建 social_notes 表（社交笔记解析结果缓存）：
   - id (uuid PK)
   - url (text)
   - platform (text，'xiaohongshu' 或 'douyin')
   - raw_content (text)
   - parsed_data (jsonb，解析后的结构化数据)
   - shop_name (text)
   - sentiment (text)
   - created_at (timestamptz DEFAULT now())

6. 创建所有必要的索引：
   - restaurants 表：gaode_id, meituan_id, cuisine, price_level 单列索引
   - restaurant_embeddings 表：IVFFlat 向量索引 (vector_cosine_ops, lists=100)
   - user_location_history 表：user_id, created_at DESC

7. 创建向量搜索函数 search_restaurants_v2：
   - 参数：query_embedding vector(384), user_lat numeric, user_lng numeric, max_distance_km float DEFAULT 5, match_budget text DEFAULT NULL, match_threshold float DEFAULT 0.6, max_results int DEFAULT 20
   - 返回：id, name, address, cuisine, rating, avg_price, distance_km (使用 Haversine 公式计算), similarity
   - 过滤：相似度 > threshold, 距离 < max_distance, 可选预算过滤
   - 排序：similarity DESC, rating DESC, distance ASC

8. 所有新表开启 RLS，MVP 阶段设置全放行策略（SELECT/INSERT/UPDATE/DELETE 全 allow）。

9. 将 restaurants 和 restaurant_embeddings 加入 Supabase Realtime 发布。

请同时更新 supabase/schema.sql 的注释，在文件末尾追加 V2.0 新增表结构的说明。
```

**验收**：在 Supabase SQL Editor 执行迁移脚本，所有表和索引创建成功，`search_restaurants_v2` 函数可调用。

---

## Phase 2：外部数据接入（Week 1-2）

### 第 3 轮 — 高德地图 API 接入

```
@docs/v2.dev.md @api/app/config.py

在 Python 后端新建高德地图 API 服务模块。

1. 创建 api/app/services/gaode_service.py：

   实现 GaodeService 类，包含以下方法：

   a) search_restaurants(location: dict, radius: int = 3000, keywords: str = "美食") -> list[dict]
      - 调用高德 POI 搜索 API：https://restapi.amap.com/v3/place/text
      - 参数：key, location(lng,lat), keywords, types=050000(餐饮服务), offset=25, radius, extensions=all
      - 解析返回的 pois 数组，提取：id, name, address, location, type, tel, rating, shop_hours, photos, avg_price
      - 处理分页：如果 count > offset，循环翻页获取全部数据（page 参数）
      - 错误处理：status != '1' 时抛出异常

   b) search_nearby(lat: float, lng: float, radius: int = 3000) -> list[dict]
      - 调用高德周边搜索 API：https://restapi.amap.com/v3/place/around
      - 按距离排序

   c) reverse_geocode(lat: float, lng: float) -> str
      - 调用高德逆地理编码：https://restapi.amap.com/v3/geocode/regeo
      - 返回 formatted_address

   d) ip_locate() -> dict
      - 调用高德 IP 定位：https://restapi.amap.com/v3/ip
      - 返回 {latitude, longitude, city, accuracy}

   使用 httpx.AsyncClient 做异步 HTTP 请求，添加请求频率限制（QPS <= 50）。
   所有方法添加日志记录和错误处理。

2. 创建 api/app/models/restaurant.py：

   定义 Pydantic 模型：
   - GaodeRestaurant：高德 API 原始数据模型
   - Restaurant：统一的餐厅数据模型（对应数据库 restaurants 表）
   - RestaurantCreate：创建餐厅时的输入模型

3. 创建 api/app/services/data_sync.py：

   实现数据同步服务 DataSyncService：

   a) sync_area(area_name: str, center_lat: float, center_lng: float, radius: int = 5000)
      - 调用 GaodeService 获取区域内所有餐厅
      - 对每家餐厅执行 upsert 到 Supabase restaurants 表（基于 gaode_id 去重）
      - 自动分类 price_level：<50 为 low, 50-150 为 mid, >150 为 high
      - 返回同步统计：新增数量、更新数量、总数

   b) sync_popular_areas()
      - 预定义热门商圈列表（望京SOHO、三里屯、国贸CBD、中关村、五道口等 10 个北京商圈）
      - 每个商圈包含 name、center_lat、center_lng
      - 依次同步每个商圈

4. 在 main.py 中添加两个临时调试端点：
   - POST /api/v2/sync/area — 同步指定商圈（参数：area_name, lat, lng, radius）
   - POST /api/v2/sync/popular — 同步所有预定义热门商圈
   - GET /api/v2/restaurants — 查询已入库餐厅列表（支持分页、菜系筛选）
```

**验收**：调用 `POST /api/v2/sync/area` 同步望京 SOHO 商圈，数据库 restaurants 表成功写入数据，`GET /api/v2/restaurants` 可查询。

---

### 第 4 轮 — 美团 API 接入 + 数据融合管道

```
@api/app/services/gaode_service.py @api/app/models/restaurant.py @docs/v2.dev.md

在 Python 后端实现美团 API 接入和多源数据融合。

1. 创建 api/app/services/meituan_service.py：

   实现 MeituanService 类：

   a) search_shops(city_id: int, cate_id: int = 0, sort: int = 0, limit: int = 20) -> list[dict]
      - 调用美团联盟 API（如果 API 审核未通过，先写好接口框架，内部 mock 返回测试数据）
      - 返回：shopId, shopName, address, latitude, longitude, avgPrice, score, commentCount, categories
   
   b) get_coupons(shop_id: str) -> list[dict]
      - 获取店铺优惠券信息
      - 返回：id, title, price, couponPrice, discount, validUntil

   c) generate_sign(params: dict) -> str
      - 美团 API 签名生成（MD5）

   ⚠️ 重要：美团 API 可能需要企业资质才能审核通过。
   请在代码中实现完整逻辑，但同时提供一个 MockMeituanService 作为降级方案：
   - mock 数据基于高德已入库的餐厅，随机生成评分、评论数、优惠券
   - 通过配置项 MEITUAN_MOCK_ENABLED=true 切换

2. 创建 api/app/services/data_merge.py：

   实现数据融合服务 DataMergeService：

   a) merge_restaurant_data(gaode_list: list, meituan_list: list) -> list[Restaurant]
      - 以高德数据为基础
      - 匹配逻辑：名称相似度 > 0.8 AND 地理距离 < 100 米，视为同一家店
      - 名称相似度：使用 difflib.SequenceMatcher
      - 地理距离：Haversine 公式
      - 合并策略：高德提供基础信息 + 位置，美团补充评分/评论数/优惠券

   b) classify_price_level(avg_price: int) -> str
      - <50: 'low', 50-150: 'mid', >150: 'high'

   c) generate_tags(restaurant: dict) -> list[str]
      - 根据菜系、价位、评分自动生成标签
      - 如："高评分"(>=4.5), "性价比高"(评分/价格比高), "深夜食堂"(营业到凌晨)

   d) check_is_open_now(opening_hours: str) -> bool
      - 解析营业时间字符串，判断当前是否营业

3. 更新 data_sync.py 的 sync_area 方法：
   - 同步完高德数据后，自动尝试匹配美团数据
   - 融合后的数据写入 restaurants 表
   - 日志输出：匹配成功数、未匹配数

4. 更新 main.py，添加端点：
   - GET /api/v2/restaurants/stats — 返回数据统计（总数、各菜系数量、各价位数量）
```

**验收**：执行商圈同步后，restaurants 表中有融合后的完整数据，tags 字段非空，price_level 已分类。调用 `/api/v2/restaurants/stats` 能看到统计信息。

---

## Phase 3：定位服务升级（Week 2）

### 第 5 轮 — 智能定位服务 + 前端组件

```
@src/components/LocationStep.tsx @api/app/services/gaode_service.py @docs/v2.dev.md

升级定位服务，实现三重定位降级策略，替换现有的简单定位方案。

1. 创建 src/lib/location-service.ts（前端定位核心模块）：

   接口定义：
   interface LocationResult {
     latitude: number;
     longitude: number;
     accuracy: number;
     address?: string;
     timestamp: number;
     source: 'gps' | 'network' | 'wifi' | 'ip';
   }

   实现以下函数：

   a) getCurrentPosition(options?) — 浏览器 Geolocation API 封装
      - enableHighAccuracy: true
      - timeout: 10000ms
      - maximumAge: 300000ms (5分钟缓存)
      - 根据 accuracy 判断来源（<50m → gps, 否则 → network）

   b) getIPLocation() — IP 定位兜底
      - 调用高德 IP 定位 API（通过 Next.js API Route 代理，避免前端暴露 Key）
      - 解析矩形区域取中心点
      - accuracy 设为 5000m

   c) smartLocate() — 智能定位主函数
      - 策略：GPS(8s超时) → 网络定位(5s超时) → IP定位(兜底)
      - 每步检查精度，精度足够则直接返回
      - 所有方式失败则抛出明确错误

   d) reverseGeocode(lat, lng) — 逆地理编码
      - 调用已有的 /api/reverse-geocode 路由（或改为调用高德逆地理编码 API Route）

   e) watchLocation(callback) / clearLocationWatch(watchId) — 持续定位

2. 创建 src/app/api/ip-locate/route.ts（API Route 代理）：
   - 调用高德 IP 定位 API（服务端持有 Key）
   - 返回 { latitude, longitude, city, accuracy }

3. 重写 src/components/LocationStep.tsx：

   在现有组件基础上升级：

   a) 自动定位：组件挂载时自动调用 smartLocate()
   b) 定位结果展示：
      - 成功：绿色卡片，显示地址 + 精度 + 来源（GPS/网络/IP）
      - 定位中：蓝色脉冲动画 + "正在获取您的位置..."
      - 失败：红色提示 + 重试按钮 + 手动输入框降级
   c) 手动调整入口：保留现有地图选点功能（ManualLocationMap）
   d) 定位说明：底部浅蓝提示 "定位权限仅用于推荐附近餐厅，不会记录或分享您的位置信息"

   交通方式选择保持不变（地铁/开车/骑行/步行四选一）。

4. （可选）创建 src/lib/location-cache.ts：
   - 使用 localStorage 缓存最近一次定位结果
   - 缓存有效期 30 分钟
   - 下次打开时先使用缓存，后台静默更新
```

**验收**：打开页面自动定位成功（或降级到 IP 定位），显示地址和精度来源。手动拒绝定位权限后能自动降级到 IP 定位。

---

## Phase 4：向量检索系统（Week 3）

### 第 6 轮 — Embedding 生成与批量入库

```
@api/app/models/restaurant.py @docs/v2.dev.md

在 Python 后端实现 Embedding 生成和批量索引服务。

1. 创建 api/app/services/embedding_service.py：

   实现 EmbeddingService 类（单例模式）：

   a) 模型加载：
      - 使用 sentence-transformers 库加载 all-MiniLM-L6-v2 模型
      - 单例模式：全局只加载一次
      - 支持 CPU 运行（不强制 GPU）
      - 模型维度：384

   b) generate_restaurant_embedding(restaurant: dict) -> list[float]
      - 构建用于嵌入的文本，组合以下字段（用空格连接）：
        名称、菜系、categories 列表、tags 列表、"人均{avg_price}元"、"评分{rating}"
      - 生成 384 维归一化向量
      - 返回 list[float]

   c) generate_user_preference_embedding(preferences: dict) -> list[float]
      - 根据用户偏好构建文本：
        likes 列表、scenario、"预算{budget}" 
      - 生成向量

   d) generate_query_embedding(query: str) -> list[float]
      - 通用文本→向量

   e) batch_index_restaurants(restaurant_ids: list[str] = None)
      - 如果不传 ID，则查询所有未生成 embedding 的餐厅（LEFT JOIN restaurant_embeddings WHERE embedding IS NULL）
      - 批量生成 embedding 并 upsert 到 restaurant_embeddings 表
      - 每 50 条提交一次，避免内存溢出
      - 返回处理统计：成功数、失败数、耗时

2. 更新 data_sync.py：
   - sync_area 完成后自动调用 batch_index_restaurants 为新入库的餐厅生成 embedding

3. 在 main.py 添加端点：
   - POST /api/v2/embeddings/index — 手动触发批量索引
   - GET /api/v2/embeddings/stats — 查看索引统计（已索引数/未索引数/总数）

4. 创建 api/app/services/supabase_client.py：
   - 封装 Supabase Python 客户端初始化（单例）
   - 提供常用方法：query, insert, upsert, rpc 等
   - 统一错误处理
```

**验收**：调用 `POST /api/v2/embeddings/index`，restaurant_embeddings 表成功写入 384 维向量数据。`GET /api/v2/embeddings/stats` 显示已索引数量 > 0。

---

### 第 7 轮 — 向量检索 + 混合搜索

```
@api/app/services/embedding_service.py @supabase/migration-v2-001-restaurants.sql @docs/v2.dev.md

实现向量检索和混合搜索服务。

1. 创建 api/app/services/search_service.py：

   实现 SearchService 类：

   a) vector_search(user_embedding: list[float], lat: float, lng: float, max_distance_km: float = 5, budget: str = None, threshold: float = 0.6, limit: int = 50) -> list[dict]
      - 调用 Supabase RPC 函数 search_restaurants_v2
      - 传入用户偏好 embedding + 位置 + 距离 + 预算过滤
      - 返回按相似度排序的餐厅列表

   b) keyword_search(query: str, lat: float, lng: float, limit: int = 50) -> list[dict]
      - Supabase 全文检索：name ILIKE + cuisine ILIKE
      - 计算距离并排序

   c) hybrid_search(query: str, user_embedding: list[float], lat: float, lng: float, filters: dict) -> list[dict]
      - 同时执行向量检索和关键词检索
      - 使用 RRF（Reciprocal Rank Fusion）算法融合结果
      - RRF 公式：score = Σ(1 / (k + rank_i))，k=60
      - 去重（同一餐厅可能在两个结果中出现）
      - 返回融合后的 Top N

   d) search_with_filters(user_preferences: dict, location: dict, filters: dict) -> list[dict]
      - 高层接口，供推荐 API 调用
      - 步骤：
        1. 生成用户偏好 embedding
        2. 执行混合搜索
        3. 后处理过滤（最低评分等）
        4. 去重
      - 返回候选餐厅列表（20-50 家）

2. 实现 RRF 融合算法 reciprocal_rank_fusion(result_lists: list[list[dict]], k: int = 60) -> list[dict]：
   - 对每个结果列表中的每个餐厅，计算 1/(k+rank)
   - 多个列表的分数求和
   - 按总分降序排列

3. 在 main.py 添加搜索端点：
   - POST /api/v2/search — 接受 query(可选), preferences(可选), location(必须), filters(可选)
   - 返回搜索结果 + 元数据（总匹配数、检索耗时）

4. 优化搜索性能：
   - 对 embedding_service 的模型加载使用 @lru_cache 或全局单例
   - 搜索结果缓存（相同参数 5 分钟内返回缓存，使用简单的内存字典 + TTL）
```

**验收**：调用 `POST /api/v2/search` 传入偏好和位置，返回按相关度排序的餐厅列表，响应时间 < 500ms。向量相似度和距离均参与排序。

---

## Phase 5：AI Agent 引擎（Week 4-5）

### 第 8 轮 — 约束过滤 Agent

```
@api/app/services/search_service.py @docs/v2.dev.md

实现第一个 AI Agent：约束过滤 Agent，负责硬条件筛选。

前置说明：
- 使用 LangChain + Ollama 接入本地 Qwen2.5-7B 模型
- 如果 Ollama 未安装或模型未下载，代码需有降级方案（使用纯规则引擎替代）
- Agent 输入输出使用 Pydantic 模型严格校验

1. 创建 api/app/agents/filter_agent.py：

   Pydantic 模型：
   - FilterInput：candidates(list), location(dict), max_distance(float), budget(str), dietary_restrictions(list[str]), transport_mode(str)
   - FilterResult：passed_ids(list[str]), filtered_count(int), filter_reasons(dict[str,int])

   实现 ConstraintFilterAgent 类：

   a) __init__：
      - 尝试连接 Ollama (ChatOllama model="qwen2.5:7b", temperature=0, format="json")
      - 连接失败时设置 self.use_fallback = True
      - 定义 PromptTemplate（参考 v2.dev.md 中的 FILTER_PROMPT）

   b) invoke(input: FilterInput) -> FilterResult
      - 如果 LLM 可用：
        构建 Prompt → 调用 LLM → 解析 JSON 输出 → 验证 Pydantic 模型
      - 如果 LLM 不可用（降级）：
        使用纯规则引擎过滤

   c) _rule_based_filter(input: FilterInput) -> FilterResult
      - 降级方案，纯 Python 规则：
        1. 距离过滤：超过 max_distance 的剔除
        2. 预算过滤：人均 > 预算上限 * 1.2 的剔除
        3. 忌口过滤（一票否决）：标签包含忌口内容的剔除
        4. 营业状态过滤：当前未营业的剔除
      - 返回过滤结果和统计

2. 创建 api/app/agents/base.py：
   - 定义 BaseAgent 抽象类
   - 包含通用方法：_try_llm_with_fallback, _parse_json_output, _validate_output
   - 统一的错误处理和日志记录
   - LLM 调用超时设置（30s）

3. 编写单元测试 api/tests/test_filter_agent.py：
   - 测试正常过滤流程（有足够候选餐厅）
   - 测试全部过滤（所有餐厅都不满足条件）
   - 测试忌口一票否决
   - 测试降级模式（mock LLM 不可用）
   - 使用 pytest + mock

4. 在 main.py 添加调试端点：
   - POST /api/v2/agents/filter/test — 接受测试输入，返回过滤结果
```

**验收**：运行 `cd api && pytest tests/test_filter_agent.py -v`，所有测试通过。调用调试端点返回正确的过滤结果。即使 Ollama 未启动，降级模式也能正常工作。

---

### 第 9 轮 — 多目标优化 Agent + 可解释性 Agent

```
@api/app/agents/filter_agent.py @api/app/agents/base.py @docs/v2.dev.md

实现第二和第三个 AI Agent。

1. 创建 api/app/agents/optimization_agent.py（多目标优化 Agent）：

   Pydantic 模型：
   - OptimizationInput：candidates(list), user_preferences(dict), weather_info(dict|None)
   - ScoreBreakdown：taste_match(float), budget_fit(float), distance(float), weather_adapt(float), overall_rating(float)
   - RecommendationItem：restaurant_id(str), name(str), score(float), breakdown(ScoreBreakdown), brief_reason(str)
   - OptimizationResult：recommendations(list[RecommendationItem]) — 固定 Top 3

   实现 MultiObjectiveOptimizer 类（继承 BaseAgent）：

   a) invoke(input: OptimizationInput) -> OptimizationResult
      - LLM 方案：Prompt 指导 LLM 按 5 个维度打分（口味40%、预算20%、距离20%、天气10%、评分10%）
      - 降级方案：纯数学计算各维度得分

   b) _calculate_scores(input: OptimizationInput) -> OptimizationResult
      - 降级方案，精确计算：
        - 口味匹配(40%)：用户 likes 标签命中 +10分, dislikes 命中 -15分
        - 预算符合(20%)：在范围内 20分, 超 20% 以内 10分, 超更多 0分
        - 距离便利(20%)：根据 transport_mode 分段评分
        - 天气适应(10%)：雨天→室内 +10, 高温→空调 +10
        - 综合评分(10%)：rating * 2
      - 加权求和，取 Top 3

2. 创建 api/app/agents/explanation_agent.py（可解释性 Agent）：

   Pydantic 模型：
   - ExplanationInput：restaurant(dict), user_preferences(dict), social_notes(list[dict]|None)
   - Citation：excerpt(str), likes(int), source(str)
   - ExplanationResult：restaurant_id(str), main_reason(str, 200字以内), personalized_tags(list[str]), citations(list[Citation]), warning(str|None)

   实现 ExplanationGenerator 类（继承 BaseAgent）：

   a) invoke(input: ExplanationInput) -> ExplanationResult
      - LLM 方案：生成个性化推荐理由 + 引用小红书评价 + 避雷提醒
      - 降级方案：基于模板生成推荐理由

   b) _template_based_explanation(input: ExplanationInput) -> ExplanationResult
      - 降级方案，模板引擎：
        - 根据匹配原因组合理由（如 "评分 {rating} 分的 {cuisine} 餐厅，人均 ¥{price}，距离你 {distance}km"）
        - 根据标签添加亮点（如 "适合聚餐"、"有包间"、"必吃推荐"）
        - 如果有社交笔记，引用评价原文

3. 编写单元测试：
   - api/tests/test_optimization_agent.py：测试评分计算、Top3 排序、边界条件
   - api/tests/test_explanation_agent.py：测试理由生成、引用格式、降级模式
```

**验收**：两个 Agent 的单元测试全部通过。优化 Agent 能输出合理的 Top 3 排序和分数明细。解释 Agent 能生成可读的中文推荐理由。

---

### 第 10 轮 — 社交笔记解析 Agent + 前端组件

```
@api/app/agents/base.py @docs/v2.dev.md

实现第四个 Agent（社交笔记解析）并创建前端上传组件。

1. 创建 api/app/agents/social_parser_agent.py：

   Pydantic 模型：
   - SocialNoteInput：input_type(Literal["url","text","screenshot"]), content(str), platform(str="xiaohongshu")
   - ParsedSocialNote：platform(str), shop_name(str|None), location(str|None), cuisine(str|None), price_range(str|None), tags(list[str]), highlights(list[str]), complaints(list[str]), sentiment(Literal["positive","neutral","negative"]), suitable_scenarios(list[str]), must_order_dishes(list[str])

   实现 SocialNoteParser 类（继承 BaseAgent）：

   a) parse_text(content: str) -> ParsedSocialNote
      - 使用 LLM 从文本中提取结构化信息
      - 降级：使用正则 + 关键词匹配提取

   b) parse_url(url: str) -> ParsedSocialNote
      - 验证 URL 格式（xiaohongshu.com 或 xhslink.com）
      - 使用 httpx 请求页面内容（带合理的 User-Agent）
      - 提取正文内容后调用 parse_text
      - 如果无法直接获取内容，返回友好提示

   c) parse_screenshot(image_base64: str) -> ParsedSocialNote
      - 尝试使用 PaddleOCR 识别图片文字
      - OCR 不可用时返回错误提示（不要让服务崩溃）
      - 识别后调用 parse_text

   d) parse(input: SocialNoteInput) -> ParsedSocialNote
      - 统一入口，根据 input_type 分发

   ⚠️ 重要：OCR 功能是可选的。如果 PaddleOCR 安装失败（某些环境依赖复杂），
   parse_screenshot 应该返回清晰的错误信息而非崩溃。请在代码中做好 try/except。

2. 创建前端组件 src/components/SocialShareUpload.tsx：

   UI 设计（毛玻璃白色卡片风格，与现有组件一致）：

   a) 顶部切换标签：📎 粘贴链接 | 📸 上传截图
   
   b) 链接输入模式：
      - textarea 输入框，placeholder "粘贴小红书笔记链接..."
      - 自动检测链接格式（包含 xiaohongshu.com 或 xhslink.com）
      - 提交按钮 "开始解析"
   
   c) 截图上传模式：
      - 虚线边框拖拽区域，点击或拖拽上传
      - 图片预览
      - 自动开始解析
   
   d) 解析结果展示：
      - 成功：显示提取的店铺名、菜系、标签、亮点/槽点
      - 各信息用彩色胶囊标签展示
      - "✅ 已采纳，将用于个性化推荐" 提示
   
   e) 加载态：skeleton + "AI 正在分析笔记内容..."
   f) 错误态：红色提示 + 重试

   Props：onComplete(data: ParsedNote) => void

3. 创建 src/app/api/parse-social/route.ts（Next.js API Route）：
   - 接收前端请求（type + content）
   - 转发到 Python 后端 POST /api/v2/parse-note
   - 代理模式，处理错误

4. 在 Python 后端 main.py 添加：
   - POST /api/v2/parse-note — 接收解析请求，调用 SocialNoteParser
   - 解析结果同时存入 social_notes 表（缓存，避免重复解析）
```

**验收**：前端上传小红书链接后，能看到解析结果（店铺名、标签等）。即使 LLM 不可用，降级的正则方案也能提取基本信息。截图功能在 OCR 不可用时给出友好提示。

---

## Phase 6：服务整合与前端联调（Week 6）

### 第 11 轮 — FastAPI 推荐服务编排

```
@api/app/main.py @api/app/agents/ @api/app/services/ @docs/v2.dev.md

将所有 Agent 和服务编排为完整的推荐流程。

1. 创建 api/app/services/recommendation_service.py：

   实现 RecommendationService 类，编排完整推荐流程：

   a) generate_recommendations(room_id: str, preferences: dict, location: dict, weather: dict = None) -> dict

   流程编排（顺序执行）：

   Step 1 - 候选检索：
   - 调用 SearchService.search_with_filters 获取候选餐厅（50家）
   - 如果候选数 < 5，放宽搜索条件（增大距离、降低阈值）重试一次

   Step 2 - 约束过滤：
   - 调用 ConstraintFilterAgent 过滤不符合硬条件的餐厅
   - 如果过滤后 < 3 家，跳过部分软约束（如放宽预算限制）

   Step 3 - 多目标优化：
   - 调用 MultiObjectiveOptimizer 对过滤后的餐厅进行评分排序
   - 取 Top 3

   Step 4 - 生成解释：
   - 对 Top 3 中的每家餐厅，调用 ExplanationGenerator 生成推荐理由
   - 并行执行 3 个解释生成（asyncio.gather）

   Step 5 - 组装结果：
   - 合并推荐列表 + 分数 + 解释
   - 添加元数据（处理耗时、各阶段耗时、候选数量等）

   返回格式：
   {
     "recommendations": [...],
     "metadata": {
       "total_candidates": 50,
       "after_filter": 25,
       "processing_time_ms": 2500,
       "stages": { "search": 200, "filter": 800, "optimize": 1000, "explain": 500 }
     }
   }

   b) 错误处理：任何阶段失败都有降级策略，不能让整个推荐崩溃
      - 搜索失败：返回空结果 + 友好提示
      - 过滤 Agent 失败：跳过 LLM 过滤，使用规则引擎
      - 优化 Agent 失败：使用简单的评分排序
      - 解释 Agent 失败：使用模板理由

2. 更新 main.py，完善所有 API 端点：

   POST /api/v2/recommend（核心推荐接口）：
   - 请求体：room_id, preferences, location, weather(可选)
   - 调用 RecommendationService.generate_recommendations
   - 将结果存入 results 表
   - 返回推荐结果

   POST /api/v2/parse-note（社交笔记解析）：
   - 已在第 10 轮实现，确认完整可用

   GET /api/v2/restaurants（餐厅列表）：
   - 支持筛选：cuisine, min_rating, price_level, location(lat,lng), radius
   - 支持分页：page, page_size
   - 支持排序：sort_by(rating/price/distance)

   GET /api/v2/health（健康检查）：
   - 检查 Supabase 连接
   - 检查 Ollama 连接（可选）
   - 返回各服务状态

3. 添加全局中间件：
   - 请求日志（记录每个请求的路径、耗时、状态码）
   - 全局异常处理（500 错误返回统一格式）
   - 请求限流（基础实现，单 IP 100 次/分钟）
```

**验收**：调用 `POST /api/v2/recommend` 传入真实偏好数据和位置，在 5 秒内返回 Top 3 推荐结果，每个结果包含完整的分数明细和推荐理由。

---

### 第 12 轮 — 前端联调与组件升级

```
@src/components/RoomClient.tsx @src/lib/ai-recommend.ts @docs/v2.dev.md

将前端推荐流程从 V1 规则引擎切换到 V2 Python 后端 API。

1. 创建 src/lib/api-client.ts（V2 API 客户端）：

   封装对 Python 后端的调用：

   a) const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000"

   b) recommendV2(params: { roomId, preferences, location, weather }) -> RecommendationResult
      - POST ${API_BASE}/api/v2/recommend
      - 超时设置 15 秒
      - 错误处理：网络错误、超时、500 等

   c) parseNote(params: { type, content }) -> ParsedNote
      - POST ${API_BASE}/api/v2/parse-note

   d) searchRestaurants(params) -> Restaurant[]
      - GET ${API_BASE}/api/v2/restaurants

   统一错误处理：每个方法都 try-catch，返回 { success, data, error } 格式。

2. 修改 RoomClient.tsx 中的推荐触发逻辑：

   当房主点击"生成 AI 推荐"时：
   - 优先调用 V2 API（api-client.ts 的 recommendV2）
   - V2 失败时降级到 V1（现有的 ai-recommend.ts）
   - 通过环境变量 NEXT_PUBLIC_USE_V2_API=true 控制是否启用 V2

   将 V2 返回的结果格式转换为 results 表的 recommendations 格式后存入数据库。

3. 升级结果展示页（在 RoomClient.tsx 的 finished 状态中）：

   V2 推荐结果卡片升级：
   - 每张卡片增加"推荐理由"区域（来自 explanation_agent 的 main_reason）
   - 显示分数明细：口味匹配 XX% | 预算符合 XX% | 距离 XX km
   - 如果有小红书引用（citations），显示一条精选评价
   - 如果有避雷提醒（warning），用黄色标签展示
   - 保留原有的投票按钮
   
4. 在偏好收集流程中集成 SocialShareUpload：

   修改 RoomClient.tsx，在 step_taste 完成后、提交前，增加一个可选步骤：
   - 显示 SocialShareUpload 组件
   - 标题 "📱 分享你喜欢的美食笔记（可选）"
   - 底部两个按钮："跳过" 和 "完成"
   - 用户可以跳过不上传
   - 解析结果存入 preferences 的 social_notes 字段（需要先在 preferences 表加这个 jsonb 字段）

   注意：这是可选步骤，不影响主流程。进度条从 3 步变为 4 步（位置→预算→口味→社交笔记）。

5. 更新 .env.local.example，添加：
   - NEXT_PUBLIC_API_BASE=http://localhost:8000
   - NEXT_PUBLIC_USE_V2_API=true
```

**验收**：完整跑通新流程——创建房间 → 填写偏好 (可选上传笔记) → 生成推荐 → 看到 V2 版带理由的推荐结果。V2 API 不可用时自动降级到 V1。

---

## Phase 7：测试优化与上线（Week 7-8）

### 第 13 轮 — 端到端测试 + 性能优化 + 部署配置

```
@api/ @src/ @docs/v2.dev.md

最终阶段：测试、优化和部署准备。

1. Python 后端测试完善：

   创建 api/tests/ 下的测试文件：

   a) test_integration.py — 集成测试：
      - 测试完整推荐流程（搜索→过滤→优化→解释）
      - 测试各阶段降级机制（mock LLM 不可用）
      - 测试空结果处理
      - 测试异常输入（无效坐标、空偏好等）

   b) test_search_service.py — 搜索测试：
      - 测试向量搜索返回格式
      - 测试混合搜索 RRF 融合
      - 测试距离计算准确性

   c) test_api_endpoints.py — API 端点测试：
      - 使用 FastAPI TestClient
      - 测试所有端点的正常响应和错误响应
      - 测试 CORS 头

2. 性能优化：

   a) Python 后端优化：
      - Embedding 模型预加载（应用启动时加载，不是首次请求时）
      - 搜索结果缓存（TTL 5 分钟）
      - Agent 调用并行化（filter 串行，optimize+explain 尽可能并行）
      - 数据库连接池配置

   b) 前端优化：
      - API 请求超时和重试策略（最多重试 2 次，指数退避）
      - 推荐结果本地缓存（同一房间 30 分钟内不重复请求）
      - SocialShareUpload 的图片压缩（上传前压缩到 1MB 以内）

3. 部署配置：

   a) 创建 api/Dockerfile：
      - 基础镜像 python:3.11-slim
      - 安装依赖
      - 暴露端口
      - 启动命令 uvicorn

   b) 创建 api/railway.toml（Railway 部署配置）：
      - build 和 deploy 配置
      - 环境变量模板
      - 健康检查路径

   c) 创建 docker-compose.yml（本地开发用）：
      - 服务：api (FastAPI), ollama (Ollama LLM)
      - 网络和端口映射
      - 环境变量注入

   d) 更新根目录 README.md：
      - V2.0 架构说明
      - 本地开发启动步骤（前端 + 后端 + Ollama）
      - 环境变量说明
      - API 文档链接（FastAPI 自动生成的 /docs）

4. 创建 api/scripts/seed_data.py（数据初始化脚本）：
   - 同步 10 个北京热门商圈的餐厅数据
   - 批量生成 Embedding
   - 输出统计报告
   - 可通过 `python -m api.scripts.seed_data` 执行

5. Vercel 前端部署更新：
   - 确认 NEXT_PUBLIC_API_BASE 环境变量指向 Python 后端线上地址
   - 确认 NEXT_PUBLIC_USE_V2_API 在生产环境设为 true
```

**验收**：
- `cd api && pytest tests/ -v`：所有测试通过
- `docker-compose up`：前后端均可正常启动
- 推荐接口响应时间 < 3 秒（不含 Ollama 冷启动）
- V2 API 不可用时前端自动降级到 V1，用户无感知

---

## 执行建议

1. **严格按阶段顺序执行**，每个阶段完成后验收通过再进入下一阶段
2. **每轮完成后先测试**，确认功能正常再进入下一轮
3. **Phase 1-2 最关键**，数据层是一切的基础，务必确保数据质量
4. **Ollama 安装建议**：在 Phase 5 开始前完成 Ollama 安装和模型下载：
   ```bash
   # 安装 Ollama：https://ollama.ai
   ollama pull qwen2.5:7b
   ```
5. **高德 API Key 申请**：在 Phase 2 开始前完成，申请地址 https://lbs.amap.com/
6. **降级机制贯穿始终**：每个依赖外部服务的模块都必须有降级方案，确保核心流程不中断
7. **Phase 5 的 3 轮可适当合并**：如果前几轮推进顺利，第 9 轮（两个 Agent）可以拆成两轮分别完成
8. **环境变量管理**：所有密钥通过 .env 管理，绝不硬编码，.env 文件加入 .gitignore

---

## 附录：环境变量清单

```bash
# === 高德地图 ===
GAODE_API_KEY=                    # 高德 Web 服务 API Key
NEXT_PUBLIC_GAODE_JS_KEY=         # 高德 JS API Key（前端地图，可选）

# === 美团 ===
MEITUAN_APPKEY=                   # 美团联盟 App Key
MEITUAN_SECRET=                   # 美团联盟 Secret
MEITUAN_MOCK_ENABLED=true         # 美团 API 未审批前使用 mock

# === Supabase ===
NEXT_PUBLIC_SUPABASE_URL=         # Supabase 项目 URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=    # Supabase 匿名 Key
SUPABASE_URL=                     # Python 后端用（同上）
SUPABASE_KEY=                     # Python 后端用（同上）

# === Ollama ===
OLLAMA_HOST=http://localhost:11434  # Ollama 服务地址

# === 前后端通信 ===
NEXT_PUBLIC_API_BASE=http://localhost:8000   # Python 后端地址
NEXT_PUBLIC_USE_V2_API=true                  # 是否启用 V2 推荐
CORS_ORIGINS=["http://localhost:3000"]       # CORS 允许的前端地址
```

---

**文档版本**：V2.0-Phases
**制定时间**：2026 年 3 月
**总计**：7 个阶段、13 轮指令
**预计周期**：6-8 周
