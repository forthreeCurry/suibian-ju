# 「随便聚」V2.0 开发计划（更新版）

> 基于当前项目状态重新规划，2026-05-02

---

## 当前进度盘点

| 模块 | 状态 |
|------|------|
| **V1.0 前端完整** | ✅ 首页/建房/偏好收集/等待大厅/AI Loading/结果展示 |
| **Supabase 基础表** | ✅ rooms / members / preferences / results |
| **V2 DB 迁移 SQL** | ✅ migration-v2-001-restaurants.sql 已编写，⚠️ 需确认 Supabase 是否已执行 |
| **FastAPI 项目** | ✅ main.py / config.py / models/restaurant.py |
| **高德 API 服务** | ✅ gaode_service.py 完整实现（POI搜索/周边/逆地理/IP定位） |
| **数据同步服务** | ✅ data_sync.py 完整实现（商圈同步 + upsert） |
| **美团 API** | ❌ 未开始 |
| **数据融合** | ❌ 未开始 |
| **定位升级** | ❌ 未开始 |
| **向量检索** | ❌ 未开始 |
| **AI Agent** | ❌ 未开始 |
| **前后端联调** | ❌ 未开始 |

---

## 阶段总览

```
Phase 1  数据库部署 + 数据接入      ████████░░░░░░░░░░  (当前 → 1-2天)
Phase 2  定位升级 + 向量检索        ░░░░░░░░████░░░░░░  (2-3天)
Phase 3  AI Agent 引擎              ░░░░░░░░░░░░████░░  (3-5天)
Phase 4  服务整合 + 前端联调         ░░░░░░░░░░░░░░░░██  (2-3天)
```

| 阶段 | 轮次 | 核心目标 |
|------|------|---------|
| Phase 1 | 第 1-3 轮 | 执行 DB 迁移 → 第一批真实餐厅数据入库 → 美团 Mock + 数据融合 |
| Phase 2 | 第 4-6 轮 | 智能定位升级 → Embedding 生成 → 向量搜索 API |
| Phase 3 | 第 7-9 轮 | 约束过滤 Agent → 优化+解释 Agent → 社交笔记 Agent |
| Phase 4 | 第 10-11 轮 | 推荐编排 → 前端切换到 V2 API → 端到端跑通 |

---

## Phase 1：数据库部署 + 数据接入（当前阶段）

### 第 1 轮 — 执行 DB 迁移 + 首次数据同步

**目标**：确保 Supabase 上 V2 新表存在，灌入第一批真实餐厅数据。

**任务清单**：
1. 确认 migration-v2-001-restaurants.sql 是否已在 Supabase SQL Editor 执行
   - 如未执行，提醒用户在 Supabase 中执行
2. 创建 `api/.env` 文件并填入真实密钥（GAODE_API_KEY + SUPABASE_URL/KEY）
3. 启动 FastAPI 后端：`cd api && uvicorn app.main:app --reload --port 8000`
4. 验证 `/health` 和 `/api/v2/status` 返回正常
5. 调用 `POST /api/v2/sync/popular` 同步 10 个北京热门商圈餐厅
6. 确认 restaurants 表中有 > 500 家餐厅
7. 调用 `GET /api/v2/restaurants` 验证数据可查询

**验收**：restaurants 表有实际餐厅数据，`GET /api/v2/restaurants` 能分页查询。

---

### 第 2 轮 — 美团 Mock 服务 + 数据融合

**目标**：美团 API 可能需企业资质，先实现 Mock 降级，后续可切换真实 API。

**任务清单**：
1. 创建 `api/app/services/meituan_service.py`：
   - `MeituanService` 类：美团联盟 API 调用框架（签名生成 + 请求）
   - `MockMeituanService` 类：根据高德已入库餐厅生成模拟评分/评论/优惠券
   - 通过 `MEITUAN_MOCK_ENABLED=true` 切换
2. 创建 `api/app/services/data_merge.py`：
   - `merge_restaurant_data()`：名称相似度 + 地理距离匹配同一家店
   - `generate_tags()`：根据菜系/价位/评分自动生成标签
   - `check_is_open_now()`：解析营业时间判断是否营业中
3. 更新 `data_sync.py`：sync_area 完成后自动尝试匹配美团数据
4. 在 `main.py` 添加 `GET /api/v2/restaurants/stats` 端点
5. 重新执行 `POST /api/v2/sync/popular`，验证融合后的数据（tags 非空、price_level 已分类）

**验收**：restaurants 表中 tags 字段非空，price_level 已分类。`/api/v2/restaurants/stats` 显示统计。

---

### 第 3 轮 — 前端餐厅浏览页（可选但推荐）

**目标**：在前端能看到入库的餐厅，增强信心。

**任务清单**：
1. 创建 `src/lib/api-client.ts`：封装 Python 后端 API 调用
2. 在首页添加底部"浏览附近美食"入口
3. 新建 `src/components/RestaurantList.tsx`：展示餐厅卡片列表
   - 显示：封面图、名称、菜系、评分、人均、标签
   - 支持按菜系/价位筛选
   - 分页加载

**验收**：前端能看到从 Supabase 加载的真实餐厅数据。

---

## Phase 2：定位升级 + 向量检索

### 第 4 轮 — 智能定位升级

**目标**：GPS → 网络 → IP 三重降级定位，全国任意位置可用。

**任务清单**：
1. 创建 `src/lib/location-service.ts`：
   - `getCurrentPosition()`：浏览器 GPS 定位（高精度，8s 超时）
   - `getIPLocation()`：调用后端 IP 定位兜底
   - `smartLocate()`：GPS → 网络 → IP 逐级降级
   - `reverseGeocode()`：调用高德逆地理编码
2. 创建 `src/app/api/ip-locate/route.ts`：代理高德 IP 定位 API
3. 创建 `src/lib/location-cache.ts`：localStorage 缓存定位结果（30分钟TTL）
4. 升级 `src/components/LocationStep.tsx`：
   - 自动定位动画（蓝色脉冲）
   - 成功后显示：地址 + 精度来源（GPS/网络/IP）
   - 失败降级：手动输入
   - 保留交通方式选择

**验收**：打开页面自动定位到当前城市。手动拒绝定位权限后降级到 IP 定位。北京外城市也能取得合理坐标。

---

### 第 5 轮 — Embedding 生成 + 批量索引

**目标**：为所有餐厅生成向量嵌入，为语义搜索做准备。

**任务清单**：
1. 创建 `api/app/services/supabase_client.py`：封装 Supabase Python 客户端（单例）
2. 创建 `api/app/services/embedding_service.py`：
   - 加载 `all-MiniLM-L6-v2` 模型（sentence-transformers，384维）
   - `generate_restaurant_embedding()`：名称+菜系+标签拼接文本 → 向量
   - `batch_index_restaurants()`：批量生成 embedding 并写入 restaurant_embeddings 表
   - 降级方案：如果模型加载失败，使用简单的 TF-IDF 或随机向量（确保服务不崩溃）
3. 更新 `data_sync.py`：sync_area 完成后自动为新餐厅生成 embedding
4. 在 `main.py` 添加：
   - `POST /api/v2/embeddings/index`：手动触发批量索引
   - `GET /api/v2/embeddings/stats`：查看已索引/未索引数量
5. 命令行工具：`python -m api.scripts.seed_data` 一键同步+索引

**验收**：`POST /api/v2/embeddings/index` 后，restaurant_embeddings 表有向量数据。stats 显示覆盖率 > 90%。

---

### 第 6 轮 — 向量搜索 API

**目标**：实现语义 + 地理 + 预算的混合搜索。

**任务清单**：
1. 创建 `api/app/services/search_service.py`：
   - `vector_search()`：调用 Supabase RPC `search_restaurants_v2`
   - `keyword_search()`：名称+菜系全文匹配
   - `hybrid_search()`：RRF（Reciprocal Rank Fusion）融合向量搜索和关键词搜索
   - `search_with_filters()`：高层接口，生成偏好 embedding → 混合搜索 → 后处理
2. 在 `main.py` 添加 `POST /api/v2/search`：
   - 接受：query(可选)、preferences、location、filters
   - 返回：餐厅列表 + 相似度 + 距离 + 耗时
3. 性能优化：
   - embedding 模型全局单例（避免每次请求重新加载）
   - 搜索结果内存缓存（5分钟 TTL）

**验收**：`POST /api/v2/search` 传入偏好和位置，返回相关度排序的餐厅列表。响应 < 1s。

---

## Phase 3：AI Agent 引擎

### 第 7 轮 — 约束过滤 Agent + 基础框架

**目标**：实现第一个 Agent，硬条件过滤（距离/预算/忌口/营业状态）。

**任务清单**：
1. 创建 `api/app/agents/base.py`：
   - `BaseAgent` 抽象类：统一 LLM 调用、JSON 解析、降级逻辑
   - `_try_llm_with_fallback()`：LLM 可用则用，不可用则降级
2. 创建 `api/app/agents/filter_agent.py`：
   - Pydantic 模型：FilterInput / FilterResult
   - `ConstraintFilterAgent`：
     - LLM 路径：构建 Prompt → Ollama qwen2.5:7b → 解析 JSON
     - 降级路径：纯规则引擎（距离/预算/忌口/营业状态）
3. 在 `main.py` 添加 `POST /api/v2/agents/filter/test` 调试端点
4. 创建 `api/tests/test_filter_agent.py`（至少 3 个测试用例）

**验收**：调试端点返回正确的过滤结果。即使 Ollama 未启动，降级模式正常工作。

---

### 第 8 轮 — 多目标优化 Agent + 可解释性 Agent

**目标**：智能评分排序 + 个性化推荐理由。

**任务清单**：
1. 创建 `api/app/agents/optimization_agent.py`：
   - `MultiObjectiveOptimizer`：5 维度评分（口味40% + 预算20% + 距离20% + 天气10% + 评分10%）
   - LLM 路径：Prompt → Ollama → Top 3 排序
   - 降级路径：纯数学加权计算
2. 创建 `api/app/agents/explanation_agent.py`：
   - `ExplanationGenerator`：为每家推荐餐厅生成个性化理由
   - LLM 路径：生成 200 字内中文推荐理由 + 避雷提醒
   - 降级路径：模板引擎拼凑理由
3. 在 `main.py` 添加调试端点
4. 编写 `test_optimization_agent.py` 和 `test_explanation_agent.py`

**验收**：各 Agent 单元测试通过。能输出 Top 3 排序和中文推荐理由。

---

### 第 9 轮 — 社交笔记解析 Agent（可选，视时间决定是否现在做）

**目标**：解析小红书链接/截图，提取美食标签。

**任务清单**：
1. 创建 `api/app/agents/social_parser_agent.py`：
   - `SocialNoteParser`：LLM 提取结构化信息
   - 降级：正则 + 关键词匹配
   - OCR 可选（PaddleOCR，安装失败不影响核心功能）
2. 创建前端组件 `src/components/SocialShareUpload.tsx`：
   - 粘贴链接 / 上传截图 双模式
   - 解析结果彩色标签展示
3. 创建 `src/app/api/parse-social/route.ts`（代理到 Python 后端）

**验收**：粘贴小红书链接后能看到解析结果。OCR 不可用时友好提示。

---

## Phase 4：服务整合 + 前端联调

### 第 10 轮 — 推荐服务编排

**目标**：把所有 Agent 串成完整的推荐流程。

**任务清单**：
1. 创建 `api/app/services/recommendation_service.py`：
   - `RecommendationService.generate_recommendations()`：
     - Step 1: 候选检索（混合搜索 50 家）
     - Step 2: 约束过滤（硬条件筛选）
     - Step 3: 多目标优化（5 维评分 Top 3）
     - Step 4: 生成解释（并行生成 3 个推荐理由）
     - Step 5: 组装返回
   - 每步有降级策略，核心流程不崩
2. 完善 `POST /api/v2/recommend`：
   - 接受 room_id + preferences + location + weather
   - 返回 Top 3 推荐 + 分数明细 + 推荐理由 + 各阶段耗时
3. 全局中间件：请求日志 + 异常处理 + 限流

**验收**：调用 `/api/v2/recommend`，5 秒内返回 3 个推荐，每个有分数和理由。

---

### 第 11 轮 — 前端切换到 V2 API

**目标**：前端从 V1 规则引擎切换到 V2 Python 后端。

**任务清单**：
1. 完善 `src/lib/api-client.ts`：封装 `recommendV2()`、降级到 V1 逻辑
2. 修改 `RoomClient.tsx`：
   - 房主点击"生成 AI 推荐" → 调用 V2 API
   - V2 失败自动降级到 V1 `ai-recommend.ts`
   - 通过 `NEXT_PUBLIC_USE_V2_API=true` 控制
3. 升级结果展示页：
   - V2 推荐卡片：分数明细（口味/预算/距离/天气/评分）
   - 推荐理由区域（explanation_agent 的 main_reason）
   - 小红书引用（如有）
   - 避雷提醒（黄色标签）
4. 偏好收集流程增加可选"社交笔记"步骤
5. 更新 `.env.local` 和文档

**验收**：完整跑通新流程——建房 → 填偏好 → 生成推荐 → 看到 V2 版结果（带分数+理由）。V2 API 不可用时自动降级到 V1。

---

## 执行建议

1. **严格按阶段顺序**，Phase 1 是基础，必须先完成
2. **每轮完成后验证**，确认功能正常再进下一轮
3. **Ollama 安装**：Phase 3 开始前完成：`ollama pull qwen2.5:7b`
4. **高德 API Key**：确保 GAODE_API_KEY 已在 `.env` 中配置
5. **降级机制贯穿始终**：每个依赖外部服务的模块都要有降级
6. **Phase 3 的 3 个 Agent 可根据 Ollama 是否就绪灵活调整顺序**
7. **环境变量切勿提交到 Git**

---

## 环境变量清单

```bash
# 高德地图（必需）
GAODE_API_KEY=

# Supabase（必需）
SUPABASE_URL=
SUPABASE_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# 美团（可选，Phase 1 第 2 轮用 Mock）
MEITUAN_APPKEY=
MEITUAN_SECRET=
MEITUAN_MOCK_ENABLED=true

# Ollama（Phase 3 需要）
OLLAMA_HOST=http://localhost:11434

# 前后端通信
NEXT_PUBLIC_API_BASE=http://localhost:8000
NEXT_PUBLIC_USE_V2_API=true
CORS_ORIGINS=http://localhost:3000
```
