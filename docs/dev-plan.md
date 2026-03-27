# 「随便聚」完整开发计划

> 对照竞品 4 阶段流程图，结合 PRD，拆解为 12 轮指令。
> 每轮直接复制指令文本发给 AI 即可。

---

## 现有资产盘点

| 已完成 | 状态 |
|-------|------|
| 首页（创建房间 + 昵称弹窗） | ✅ 可用，需大改 |
| JoinRoomModal（加入房间） | ✅ 可用 |
| SwipeCards（口味滑卡） | ✅ 可用，需升级为3档评分 |
| PrivacyForm（预算+忌口） | ✅ 可用，需加滑块 |
| RoomClient（房间状态机） | ✅ 可用，需重构步骤 |
| Supabase 客户端 + Schema | ✅ 可用，需扩展表结构 |
| Realtime 成员/房间同步 | ✅ 已通 |

---

## 阶段一：首页与建房 (3 轮)

### 第 1 轮 — 数据库扩展

```
@supabase/schema.sql @docs/PRD.md
请帮我写一段 ALTER TABLE 的 SQL 迁移语句（不是重建，是增量修改），用于在 Supabase SQL Editor 中执行：

1. rooms 表新增字段：
   - `name` (text, 聚餐名称，可空)
   - `scene` (text, 'instant' 即时聚 或 'planned' 提前聚, 默认 'instant')
   - `max_members` (int, 人数上限, 默认 10)
   - `date_time` (timestamptz, 聚餐时间, 可空，提前聚场景使用)
   - `location_strategy` (text, 'smart' 智能商圈 或 'manual' 手动选择, 默认 'smart')
   - `budget_mode` (text, 'anonymous' 匿名 或 'unified' 统一, 默认 'anonymous')

2. preferences 表新增字段：
   - `departure_location` (jsonb, 出发地经纬度，如 {"lat":39.9,"lng":116.4,"address":"xxx"})
   - `transport_mode` (text, 交通方式: 'subway','drive','bike','walk')

3. 新建 results 表：
   - id (uuid PK)
   - room_id (外键 rooms.id)
   - recommendations (jsonb, AI推荐结果)
   - weather_info (jsonb, 天气数据)
   - created_at (timestamptz)
   - 开启 RLS，MVP 阶段全放行

请同时更新 schema.sql 中的注释使其与新结构一致。
```

### 第 2 轮 — 重写首页（双入口 + 场景选择 + 房间设置）

```
@docs/PRD.md @app/page.tsx @src/lib/supabase.ts
请重写首页，实现完整的建房流程。

首页大厅：
- 顶部大标题保持 "谁再喊随便，今晚谁买单！"
- 中间两个大卡片入口：
  1. "🔥 发起聚餐" — 我来组局
  2. "🎫 加入房间" — 输入房间号加入（弹出输入框，输入6位数字后跳转 /room/[code]）
- 底部预留一个"最近的局"区域（暂时显示空状态占位："还没有历史记录哦"）

点击"发起聚餐"后，进入一个多步骤的全屏 Modal 流程：

Step 1 - 场景选择：两个大卡片
  - "⚡ 即时聚" — 现在就要吃！按当前位置找
  - "📅 提前聚" — 提前约好，选定商圈和时间

Step 2 - 房间设置（根据场景不同显示不同字段）：
  - 通用：聚餐名称（可选，placeholder "周五火锅局"）、你的昵称、人数上限（2-10 步进器）
  - 仅提前聚显示：日期时间选择器、位置策略（智能推荐/手动选区）
  - 底部确认按钮 "创建房间 🚀"

创建逻辑：将所有字段写入 rooms 表（包括 scene, name, max_members 等新字段），创建 member，存 localStorage，跳转 /room/[short_code]。
```

### 第 3 轮 — 加入房间流程优化

```
@src/components/JoinRoomModal.tsx @src/components/RoomClient.tsx
优化加入房间的流程：

1. JoinRoomModal 改进：
   - 显示房间名称（从 room 数据传入）和已有成员数
   - 如果房间已达人数上限（对比 room.max_members），显示"房间已满"并禁用加入
   - 如果房间状态不是 'waiting'，显示"聚餐已开始，无法加入"

2. 首页"加入房间"入口：
   - 输入 6 位房间号后，先查询 rooms 表验证房间是否存在
   - 存在则跳转，不存在则提示"房间不存在"
```

---

## 阶段二：个人偏好录入 (3 轮)

### 第 4 轮 — Step 1 位置与交通组件

```
@docs/PRD.md 新建组件 @src/components/LocationStep.tsx

这是偏好收集的第一步：收集出发地和交通方式，为 AI 计算"地理中心点"提供依据。

UI：极简白色毛玻璃卡片。

位置获取：
- 一个大按钮 "📍 获取我的位置"，调用 navigator.geolocation.getCurrentPosition
- 成功后显示 "已定位：正在获取地址..." 然后用经纬度调用免费的逆地理编码 API（可以用 https://nominatim.openstreetmap.org/reverse?lat=xxx&lon=xxx&format=json）获取可读地址
- 失败时显示手动输入框（输入地址文本即可，不强求经纬度）

交通方式：4 个大图标按钮横排单选：
- 🚇 地铁  🚗 开车  🚲 骑行  🚶 步行

底部按钮 "下一步 →"，触发 onComplete({ location, transportMode }) 回调。
```

### 第 5 轮 — Step 2 预算与忌口升级

```
@src/components/PrivacyForm.tsx @docs/PRD.md
重写 PrivacyForm，升级为更精细的预算与忌口收集。

预算选择：改为滑块（range input），范围 0-500 元，步进 10。
- 滑块上方实时显示当前值 "人均 ¥XX"
- 两端标注 "学生党" 和 "不差钱"
- 保留原有的胶囊按钮作为快捷选择（点击后滑块跳到对应值）

忌口标签扩展：增加更多选项，分两组：
- 过敏类（红色边框）：海鲜过敏、花生坚果、乳糖不耐、麸质过敏
- 偏好类（橙色边框）：不吃香菜、不吃葱蒜、不吃内脏、不吃辣、吃素、清真

回调不变：onSubmit(budget, restrictions)，budget 现在传数字字符串如 "120"。
```

### 第 6 轮 — Step 3 口味偏好升级为三档评分

```
@src/components/SwipeCards.tsx @docs/PRD.md
重写 SwipeCards，将二选一改为三档评分。

核心改动：
- 卡片展示不变（保持大图 + 渐变遮罩 + 标题）
- 移除拖拽交互
- 卡片底部改为 3 个按钮横排：
  1. "😫 不想吃" — 标记为 dislike
  2. "😐 能接受" — 标记为 neutral
  3. "🤤 想吃！" — 标记为 like
- 点击任一按钮后，当前卡片向上飞出（framer-motion exit 动画），显示下一张
- 8 张卡片全部完成后，onComplete 回调传出格式：
  { likes: ["无辣不欢","大口吃肉"], neutrals: ["清淡养生"], dislikes: ["精致日料"] }

保持背景卡片堆叠效果和进度指示器。
```

---

## 阶段三：协同与等待 (2 轮)

### 第 7 轮 — 重构房间状态机（3步偏好 + 等待大厅）

```
@src/components/RoomClient.tsx @src/lib/supabase.ts
重构房间页的 userStep 状态机，将偏好收集改为3步流程。

新的 userStep 流转：
waiting_to_start → departing → step_location → step_budget → step_taste → submitting → waiting_for_result

具体逻辑：
1. step_location：渲染 <LocationStep>，完成后存入本地 state，切到 step_budget
2. step_budget：渲染 <PrivacyForm>，完成后存入本地 state，切到 step_taste
3. step_taste：渲染 <SwipeCards>，完成后存入本地 state，切到 submitting
4. submitting：自动将 3 步收集的所有数据一次性写入 Supabase preferences 表（包括 departure_location, transport_mode, budget, dietary_restrictions, taste_likes），成功后切到 waiting_for_result

顶部增加步骤进度条：3 个圆点 + 连线，当前步骤高亮，已完成步骤打勾。
```

### 第 8 轮 — 等待大厅（进度同步 + 强制发车）

```
@src/components/RoomClient.tsx @src/lib/supabase.ts
完善 waiting_for_result 阶段的等待大厅。

UI 展示：
- 大标题 "✅ 你已提交！"
- 进度圆环或进度条："3/5 人已完成"
- 成员状态列表：每个成员一行，显示头像+昵称+状态（✅已完成 / ⏳进行中）
  - 通过查询 preferences 表判断某成员是否已提交
- 底部显示房间邀请码，方便催人

实时同步：监听 preferences 表的 INSERT 事件（filter by member_id in 当前房间成员），有新提交时更新进度。

房主特权：
- 房主看到额外按钮 "🚀 立即生成 AI 推荐"（至少1人提交后可点击）
- 点击后将 rooms.status 更新为 'calculating'
- 所有客户端收到状态变更后，进入 AI 计算阶段
```

---

## 阶段四：AI 计算与结果展示 (4 轮)

### 第 9 轮 — AI 终端日志式 Loading

```
@src/components/RoomClient.tsx 新建组件 @src/components/AILoading.tsx
新建一个极具情绪价值的 AI Loading 组件。

不要用普通的转圈 loading！要做成"终端日志"风格：

UI：黑色/深色背景的终端窗口样式（圆角，顶部有红黄绿三个小圆点模拟 macOS 终端）。

内容：用 setInterval 每隔 800ms 依次"打印"一行分析日志，模拟 AI 思考过程：
1. "> 正在收集所有人的偏好数据..."
2. "> 发现 5 位干饭人的口味交集..."
3. "> 正在获取天气信息... 🌤️ 明天 28°C，适合室内餐厅"
4. "> 分析预算范围... 人均 ¥80-150 区间"
5. "> 计算地理中心点... 📍 交通最优区域：[商圈名]"
6. "> 有人不吃辣，降低重辣优先级..."
7. "> 有人吃素，过滤纯肉类餐厅..."
8. "> 正在匹配最佳餐厅..."
9. "> ✅ 计算完成！找到 3 个完美选择"

每行用 framer-motion 做 fade-in 动画，带绿色的 ">" 前缀。

最后一行显示完后，等 1 秒，触发 onComplete 回调进入结果页。
```

### 第 10 轮 — 天气 API 集成

```
@src/lib/supabase.ts 新建 @src/lib/weather.ts
新建天气获取工具函数。

使用免费的 Open-Meteo API（无需 API Key）：
https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lng}&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=Asia/Shanghai&forecast_days=1

创建函数 getWeather(lat: number, lng: number)，返回：
{ temp_max: number, temp_min: number, weatherCode: number, description: string }

weatherCode 映射为中文描述（0=晴天, 1-3=多云, 45-48=雾, 51-67=雨, 71-77=雪, 80-82=阵雨, 95-99=雷暴）。

在房主点击"生成 AI 推荐"时调用，结果存入 results 表的 weather_info 字段。
```

### 第 11 轮 — AI 推荐引擎（模拟）

```
@src/lib/supabase.ts 新建 @src/lib/ai-recommend.ts
新建 AI 推荐引擎函数（MVP 阶段用规则引擎模拟，后续替换为真实 LLM）。

函数签名：generateRecommendations(roomId: string) => Promise<Recommendation[]>

逻辑：
1. 从 preferences 表查出该房间所有成员的偏好
2. 从 results 表查天气信息
3. 规则引擎：
   - 计算预算交集（取所有人预算的中位数 ±30%）
   - 统计口味偏好（likes 权重 +2, neutrals +1, dislikes -2），排序得出 top 口味标签
   - 收集所有忌口，作为硬性排除条件
   - 根据天气调整：下雨天优先室内、高温优先有空调的
4. 从一个内置的假餐厅数据库（硬编码 15-20 家餐厅，包含名称、菜系、人均、标签、是否室内等）中筛选匹配
5. 输出 Top 3，每个包含：
   { name, cuisine, avgPrice, rating, tags[], reason: string (个性化推荐理由), matchScore: number }

将结果写入 results 表，并将 rooms.status 更新为 'finished'。
```

### 第 12 轮 — 结果展示页

```
@src/components/RoomClient.tsx @src/lib/supabase.ts
实现最终的结果展示页。

触发：当 rooms.status 变为 'finished' 时，所有客户端进入结果页。

数据获取：从 results 表查出 recommendations。

UI：
- 标题 "🎯 AI 为你们精选了 3 个好去处"
- 3 张精美的餐厅卡片，按推荐度排序：
  - 第一名带 "👑 最佳匹配" 金色标签
  - 每张卡片显示：餐厅名、菜系标签、人均价格、匹配度百分比、AI 推荐理由
  - 天气提示：如 "🌧️ 明天有雨，该餐厅在室内，不用担心"
- 每张卡片底部有 "👍" 和 "👎" 投票按钮（预留，暂不实现后端逻辑）

底部：
- "本次决策由 AI 全权负责，如有难吃，请痛骂 AI 🤖"
- "📤 分享结果给大家" 按钮
- "🔄 再来一局" 按钮（跳回首页）
```

---

## 执行建议

- **每轮完成后先测试**，确认功能正常再进入下一轮
- **第 1 轮的 SQL 需要在 Supabase Dashboard 执行**，不是在代码里跑
- 第 9-12 轮可以根据实际情况合并或拆分
- 如果某一轮输出不满意，可以直接追问修改，不需要重新发完整指令
