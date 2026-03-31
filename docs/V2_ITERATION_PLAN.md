# 「随便聚」V2.0 迭代方案 - AI 智能推荐系统升级

## 版本信息

| 项目 | 内容 |
|------|------|
| **文档版本** | V2.0 |
| **制定时间** | 2026 年 3 月 |
| **执行周期** | 6-8 周 |
| **优先级** | P0（核心功能重构） |
| **负责人** | 独立产品负责人（全栈） |

---

## 一、迭代背景与目标

### 1.1 当前问题（V1.0 局限）

| 维度 | 现状 | 问题 |
|------|------|------|
| **数据源** | 18 家虚拟餐厅 | 数据不真实、无法体现实时性、缺乏说服力 |
| **推荐算法** | 规则引擎（if-else+ 加权） | 推荐维度单一、缺乏个性化深度 |
| **覆盖范围** | 仅望京 SOHO 商圈（固定） | 无法扩展到其他城市/商圈，用户体验割裂 |
| **位置获取** | MVP 阶段固定望京 SOHO | 无法根据用户实际位置推荐，实用性低 |
| **用户信任** | 无第三方背书 | 推荐理由缺乏可信度 |

### 1.2 V2.0 核心目标

```
┌─────────────────────────────────────────────────────────┐
│                   V2.0 升级目标                          │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ✅ 真实数据：接入高德 + 美团官方 API，覆盖 1000+ 餐厅     │
│  ✅ 智能推荐：多 Agent 协作，推荐准确率提升至 85%+        │
│  ✅ 实时定位：GPS+ 基站+WIFI 三重定位，全国任意位置可用   │
│  ✅ 实时性：营业状态、排队情况、价格变动实时更新         │
│  ✅ 个性化：用户授权采集小红书笔记/截图，千人千面推荐   │
│  ✅ 可扩展：支持北京/上海/广州/深圳等一线城市           │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 1.3 核心指标（OKR）

| 目标 | 关键结果 | 当前值 | 目标值 |
|------|---------|--------|--------|
| **数据覆盖** | 接入餐厅数量 | 18 家 | 1000+ 家 |
| **推荐质量** | 用户满意度评分 | 3.5/5 | 4.5/5 |
| **转化效率** | 推荐→导航转化率 | - | >30% |
| **用户参与** | 人均分享笔记数 | 0 | 2.5 篇 |
| **技术性能** | 推荐生成耗时 | <2s | <3s |

---

## 二、整体架构设计

### 2.1 系统架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                         用户交互层                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  偏好收集     │  │  社交分享     │  │  推荐结果     │          │
│  │  (位置/预算)  │  │  (小红书链接) │  │  (带解释)     │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      数据获取层（Data Layer）                    │
│  ┌────────────────┐  ┌────────────────  ┌────────────────┐    │
│  │  高德地图 API   │  │  美团开放平台   │  │  用户授权采集    │    │
│  │  (POI 数据)     │  │  (店铺详情)     │  │  (链接/截图)     │    │
│  └────────────────┘  └────────────────  └────────────────┘    │
│           ↓                   ↓                    ↓            │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              数据清洗与标准化管道（ETL）                  │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    向量数据库层（Vector DB）                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Supabase pgvector                                      │   │
│  │  - 餐厅 Embedding 向量（语义检索）                        │   │
│  │  - 用户偏好 Embedding 向量（个性化匹配）                  │   │
│  │  - 小红书笔记 Embedding（真实评价聚合）                   │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                     Agent 决策层（AI Brain）                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ 约束过滤 Agent │  │ 多目标优化 Agent│  │ 可解释性 Agent │          │
│  │  (硬条件过滤)  │  │  (智能排序)    │  │  (理由生成)    │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                              ↓                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  本地模型：Qwen2.5-7B-Instruct（Ollama 部署）             │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      应用服务层（API Service）                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  FastAPI 推荐服务（Python）                               │   │
│  │  - POST /recommend（生成推荐）                           │   │
│  │  - POST /parse-note（解析小红书笔记）                     │   │
│  │  - GET /restaurants（餐厅列表）                          │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 技术栈选型

| 层级 | 技术 | 选型理由 |
|------|------|---------|
| **前端** | Next.js 16 + React 19 | 保持现有架构，降低迁移成本 |
| **后端 API** | FastAPI（Python） | AI 生态丰富，LangChain 原生支持 |
| **向量数据库** | Supabase pgvector | 与现有 PostgreSQL 兼容，免费额度够用 |
| **Embedding** | Xenova/all-MiniLM-L6-v2 | 轻量级（80MB），384 维，精度高 |
| **LLM 模型** | Qwen2.5-7B-Instruct | 免费商用、中文能力强、本地部署 |
| **Agent 框架** | LangChain + LangGraph | 多 Agent 协作、状态管理 |
| **模型部署** | Ollama | 一键部署、API 兼容 OpenAI |
| **地图数据** | 高德地图 API | 免费额度高（10 万次/天）、数据准确 |
| **生活服务** | 美团开放平台 | 官方合作、实时价格、优惠信息 |

---

## 三、数据获取层设计

### 3.1 高德地图 API 接入

#### 3.1.1 API 申请

```yaml
申请流程：
  1. 注册高德开放平台：https://lbs.amap.com/
  2. 创建应用（个人开发者即可）
  3. 获取 Key（Web 服务 API）
  4. 实名认证（需身份证）

配额限制：
  - 基础配额：10,000 次/天（免费）
  - 认证后：100,000 次/天（免费）
  - QPS 限制：50 次/秒

费用：
  - 免费额度内：¥0
  - 超出部分：¥0.004/次
```

#### 3.1.2 核心接口

```typescript
// src/lib/gaode-api.ts

interface GaodeRestaurant {
  id: string;
  name: string;
  address: string;
  location: { lat: number; lng: number };
  type: string;           // 菜系分类
  tel: string;            // 联系电话
  rating: string;         // 评分（0-5）
  shop_hours: string;     // 营业时间
  photos: string[];       // 图片
  avg_price: string;      // 人均消费
}

/**
 * POI 搜索 - 获取商圈餐厅
 * 文档：https://lbs.amap.com/api/webservice/guide/api/search
 */
export async function searchRestaurants(
  location: { lat: number; lng: number },
  radius: number = 3000,  // 半径 3km
  keywords: string = '美食'
): Promise<GaodeRestaurant[]> {
  const params = {
    key: process.env.GAODE_API_KEY!,
    location: `${location.lng},${location.lat}`,
    keywords,
    types: '050000',      // 餐饮服务
    offset: 25,
    radius,
    extensions: 'all'     // 返回详细信息
  };

  const url = 'https://restapi.amap.com/v3/place/text?' + 
    new URLSearchParams(params);
  
  const response = await fetch(url);
  const data = await response.json();
  
  if (data.status === '1') {
    return data.pois.map((poi: any) => ({
      id: poi.id,
      name: poi.name,
      address: poi.address,
      location: { lat: poi.location.lat, lng: poi.location.lon },
      type: poi.type,
      tel: poi.tel,
      rating: poi.biz_ext?.rating || '0',
      shop_hours: poi.biz_ext?.shop_hours || '',
      photos: poi.photos?.map((p: any) => p.url) || [],
      avg_price: poi.biz_ext?.avg_price || '0'
    }));
  }
  
  throw new Error(`高德 API 错误：${data.info}`);
}

/**
 * 周边搜索 - 基于用户位置推荐
 */
export async function searchNearby(
  location: { lat: number; lng: number },
  types: string = '050000'
): Promise<GaodeRestaurant[]> {
  const params = {
    key: process.env.GAODE_API_KEY!,
    location: `${location.lng},${location.lat}`,
    types,
    offset: 25,
    radius: 3000,
    sort: 'distance',     // 按距离排序
    order: 'asc'
  };

  const url = 'https://restapi.amap.com/v3/place/around?' + 
    new URLSearchParams(params);
  
  const response = await fetch(url);
  const data = await response.json();
  
  return data.status === '1' ? data.pois : [];
}
```

#### 3.1.3 数据同步策略

```typescript
// src/lib/data-sync.ts

/**
 * 定时同步商圈数据
 * 策略：每天凌晨 3 点全量更新，每小时增量更新
 */
export async function syncRestaurantsForArea(
  areaName: string,
  centerLocation: { lat: number; lng: number }
) {
  console.log(`开始同步 ${areaName} 商圈数据...`);
  
  // 1. 获取所有餐厅
  const restaurants = await searchRestaurants(centerLocation, 5000);
  
  // 2. 去重 + 更新
  for (const resto of restaurants) {
    await supabase
      .from('restaurants')
      .upsert({
        gaode_id: resto.id,
        name: resto.name,
        address: resto.address,
        location: resto.location,
        cuisine: resto.type,
        phone: resto.tel,
        rating: parseFloat(resto.rating),
        avg_price: parseInt(resto.avg_price),
        photos: resto.photos,
        last_updated: new Date()
      }, {
        onConflict: 'gaode_id'
      });
  }
  
  console.log(`同步完成：${restaurants.length} 家餐厅`);
}

// 定时任务（使用 Vercel Cron Jobs）
// 全量更新：每天 03:00
// 增量更新：每小时整点
```

---

### 3.1.4 位置获取模块（新增）

#### 3.1.4.1 技术选型

```typescript
/**
 * V2.0 位置获取方案：三重定位 + 智能降级
 * 
 * 优先级：
 * 1. GPS 定位（精度：5-10 米）- 户外最佳
 * 2. 基站定位（精度：100-1000 米）- 室内/地下室
 * 3. WiFi 定位（精度：20-50 米）- 城市环境
 * 4. IP 定位（精度：1-5 公里）- 兜底方案
 */
```

#### 3.1.4.2 前端定位实现

```typescript
// src/lib/location-service.ts

interface LocationResult {
  latitude: number;
  longitude: number;
  accuracy: number;       // 精度（米）
  address?: string;       // 逆地理编码地址
  timestamp: number;
  source: 'gps' | 'network' | 'wifi' | 'ip';
}

interface LocationOptions {
  enableHighAccuracy?: boolean;  // 是否启用高精度
  timeout?: number;              // 超时时间（毫秒）
  maximumAge?: number;           // 缓存时间（毫秒）
}

/**
 * 浏览器 Geolocation API 定位
 * 支持 GPS + 网络定位
 */
export async function getCurrentPosition(
  options: LocationOptions = {}
): Promise<LocationResult> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("浏览器不支持定位"));
      return;
    }

    const defaultOptions: LocationOptions = {
      enableHighAccuracy: true,  // 启用高精度
      timeout: 10000,            // 10 秒超时
      maximumAge: 300000         // 5 分钟缓存
    };

    const mergedOptions = { ...defaultOptions, ...options };

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        
        resolve({
          latitude,
          longitude,
          accuracy: accuracy || 100,
          timestamp: position.timestamp,
          source: accuracy && accuracy < 50 ? 'gps' : 'network'
        });
      },
      (error) => {
        console.error("定位失败:", error);
        
        // 降级到 IP 定位
        if (error.code === error.POSITION_UNAVAILABLE) {
          getIPLocation().then(resolve).catch(reject);
        } else {
          reject(error);
        }
      },
      mergedOptions
    );
  });
}

/**
 * IP 定位（兜底方案）
 * 使用高德 IP 定位 API
 */
export async function getIPLocation(): Promise<LocationResult> {
  const response = await fetch(
    `https://restapi.amap.com/v3/ip?key=${process.env.NEXT_PUBLIC_GAODE_API_KEY}`
  );
  
  const data = await response.json();
  
  if (data.status !== '1') {
    throw new Error("IP 定位失败");
  }

  // 解析返回的矩形区域，取中心点
  const rectangle = data.rectangle.split(',').map(Number);
  const centerLat = (rectangle[1] + rectangle[3]) / 2;
  const centerLng = (rectangle[0] + rectangle[2]) / 2;

  return {
    latitude: centerLat,
    longitude: centerLng,
    accuracy: 5000,  // IP 定位精度约 5km
    address: data.city,
    timestamp: Date.now(),
    source: 'ip'
  };
}

/**
 * 逆地理编码：坐标 → 地址
 */
export async function reverseGeocode(
  latitude: number,
  longitude: number
): Promise<string> {
  const response = await fetch(
    `https://restapi.amap.com/v3/geocode/regeo?` +
    `key=${process.env.NEXT_PUBLIC_GAODE_API_KEY}&` +
    `location=${longitude},${latitude}`
  );
  
  const data = await response.json();
  
  if (data.status === '1' && data.regeocode) {
    return data.regeocode.formatted_address;
  }
  
  throw new Error("地址解析失败");
}

/**
 * 智能定位：组合多种定位方式
 * 策略：先尝试高精度定位，失败则降级
 */
export async function smartLocate(): Promise<LocationResult> {
  try {
    // 1. 尝试高精度定位（GPS）
    console.log("尝试 GPS 定位...");
    const gpsLocation = await getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 8000
    });
    
    if (gpsLocation.accuracy < 50) {
      console.log("GPS 定位成功，精度:", gpsLocation.accuracy);
      return gpsLocation;
    }
    
    // 2. GPS 精度不足，尝试网络定位
    console.log("GPS 精度不足，尝试网络定位...");
    const networkLocation = await getCurrentPosition({
      enableHighAccuracy: false,
      timeout: 5000
    });
    
    if (networkLocation.accuracy < 500) {
      console.log("网络定位成功，精度:", networkLocation.accuracy);
      return networkLocation;
    }
    
    // 3. 降级到 IP 定位
    console.log("网络定位精度不足，使用 IP 定位...");
    return await getIPLocation();
    
  } catch (error) {
    // 所有定位都失败，使用 IP 定位兜底
    console.error("定位失败，使用 IP 定位兜底:", error);
    return await getIPLocation();
  }
}

/**
 * 监听位置变化（持续定位）
 */
export function watchLocation(
  callback: (location: LocationResult) => void,
  options?: LocationOptions
): number {
  const watchId = navigator.geolocation.watchPosition(
    (position) => {
      const { latitude, longitude, accuracy } = position.coords;
      
      callback({
        latitude,
        longitude,
        accuracy: accuracy || 100,
        timestamp: position.timestamp,
        source: accuracy && accuracy < 50 ? 'gps' : 'network'
      });
    },
    (error) => {
      console.error("位置监听失败:", error);
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000,  // 1 分钟缓存
      ...options
    }
  );
  
  return watchId;
}

// 停止监听
export function clearLocationWatch(watchId: number) {
  navigator.geolocation.clearWatch(watchId);
}
```

#### 3.1.4.3 前端定位组件

```typescript
// src/components/LocationSelector.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { smartLocate, reverseGeocode, watchLocation, clearLocationWatch } from "@/src/lib/location-service";

interface LocationSelectorProps {
  onLocationChange?: (location: {
    lat: number;
    lng: number;
    address: string;
  }) => void;
}

export default function LocationSelector({ onLocationChange }: LocationSelectorProps) {
  const [locating, setLocating] = useState(false);
  const [location, setLocation] = useState<{
    lat: number;
    lng: number;
    address: string;
    accuracy: number;
    source: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 定位
  const handleLocate = useCallback(async () => {
    setLocating(true);
    setError(null);

    try {
      const result = await smartLocate();
      const address = await reverseGeocode(result.latitude, result.longitude);

      const locationData = {
        lat: result.latitude,
        lng: result.longitude,
        address,
        accuracy: result.accuracy,
        source: result.source
      };

      setLocation(locationData);
      onLocationChange?.(locationData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "定位失败，请重试");
    } finally {
      setLocating(false);
    }
  }, [onLocationChange]);

  // 组件挂载时自动定位
  useEffect(() => {
    handleLocate();

    // 可选：持续监听位置变化（适用于移动场景）
    // const watchId = watchLocation((result) => {
    //   reverseGeocode(result.latitude, result.longitude).then(address => {
    //     setLocation({
    //       lat: result.latitude,
    //       lng: result.longitude,
    //       address,
    //       accuracy: result.accuracy,
    //       source: result.source
    //     });
    //   });
    // });

    // return () => clearLocationWatch(watchId);
  }, []);

  return (
    <div className="w-full max-w-sm space-y-3 rounded-2xl bg-white/90 p-5 shadow-lg">
      {/* 定位按钮 */}
      <button
        onClick={handleLocate}
        disabled={locating}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 py-3 font-semibold text-white disabled:opacity-50"
      >
        {locating ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            定位中...
          </>
        ) : (
          <>
            <span>📍</span>
            获取当前位置
          </>
        )}
      </button>

      {/* 定位结果 */}
      <AnimatePresence>
        {location && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-2 overflow-hidden"
          >
            <div className="rounded-xl bg-green-50 p-3">
              <div className="flex items-start gap-2">
                <span className="text-xl">✅</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-green-800">
                    定位成功
                  </p>
                  <p className="mt-1 text-xs text-green-700">
                    📍 {location.address}
                  </p>
                  <div className="mt-2 flex items-center gap-3 text-xs text-green-600">
                    <span>精度：±{Math.round(location.accuracy)}m</span>
                    <span>•</span>
                    <span>
                      来源：{
                        location.source === 'gps' ? 'GPS' :
                        location.source === 'network' ? '网络' :
                        location.source === 'wifi' ? 'WiFi' : 'IP'
                      }
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 手动修改地址（可选） */}
            <button
              onClick={() => {
                // 打开地图选择器
              }}
              className="w-full cursor-pointer rounded-xl border border-gray-200 py-2 text-sm text-gray-600 hover:bg-gray-50"
            >
              ️ 在地图上手动调整（可选）
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 错误提示 */}
      {error && (
        <div className="rounded-xl bg-red-50 p-3 text-sm text-red-600">
          ⚠️ {error}
          <button
            onClick={handleLocate}
            className="ml-2 font-semibold underline"
          >
            重试
          </button>
        </div>
      )}

      {/* 定位说明 */}
      <div className="mt-2 rounded-xl bg-blue-50 p-3">
        <p className="text-xs text-blue-700">
          💡 定位权限仅用于推荐附近餐厅，不会记录或分享您的位置信息
        </p>
      </div>
    </div>
  );
}
```

#### 3.1.4.4 数据库扩展

```sql
-- 新增用户位置历史表（可选，用于优化推荐）
create table user_location_history (
  id uuid primary key default gen_random_uuid(),
  user_id text,  -- 匿名用户可用设备 ID
  latitude numeric(10, 8) not null,
  longitude numeric(11, 8) not null,
  address text,
  accuracy numeric,
  location_source text check (location_source in ('gps', 'network', 'wifi', 'ip')),
  created_at timestamptz default now()
);

-- 创建索引
create index idx_user_location_history_user on user_location_history(user_id);
create index idx_user_location_history_time on user_location_history(created_at desc);

-- 创建函数：获取用户常用位置
create or replace function get_user_frequent_locations(
  p_user_id text,
  p_limit int default 5
)
returns table (
  latitude numeric,
  longitude numeric,
  address text,
  visit_count bigint
)
language plpgsql
as $$
begin
  return query
  select
    latitude,
    longitude,
    max(address) as address,
    count(*) as visit_count
  from user_location_history
  where user_id = p_user_id
  group by latitude, longitude
  order by visit_count desc
  limit p_limit;
end;
$$;
```

---

### 3.2 美团开放平台接入

#### 3.2.1 API 申请

```yaml
申请流程：
  1. 注册美团开放平台：https://open.meituan.com/
  2. 创建应用（选择"美团联盟"）
  3. 提交审核（需营业执照，可用个体户）
  4. 获取 appkey + secret

配额限制：
  - QPS：100 次/秒
  - 日调用量：根据审核结果

费用：
  - 基础 API：免费
  - 高级功能：CPS 分成（优惠券核销）
```

#### 3.2.2 核心接口

```typescript
// src/lib/meituan-api.ts

interface MeituanShop {
  shopId: string;
  shopName: string;
  address: string;
  latitude: number;
  longitude: number;
  avgPrice: number;
  score: number;
  commentCount: number;
  categories: string[];
  coupons: Coupon[];
}

interface Coupon {
  id: string;
  title: string;
  price: number;        // 原价
  couponPrice: number;  // 券后价
  discount: number;     // 折扣力度
  validUntil: string;   // 有效期
}

/**
 * 店铺查询 API
 * 文档：https://union.meituan.com/
 */
export async function searchMeituanShops(
  cityId: number,
  cateId: number = 0,    // 类目 ID（0=美食）
  sort: number = 0       // 排序（0=默认，1=销量，2=评分）
): Promise<MeituanShop[]> {
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = generateSign({
    appkey: process.env.MEITUAN_APPKEY!,
    secret: process.env.MEITUAN_SECRET!,
    timestamp
  });

  const params = {
    appkey: process.env.MEITUAN_APPKEY!,
    timestamp,
    sign,
    cityId,
    cateId,
    sort,
    limit: 20
  };

  const url = 'https://api-meituan.com/union/v1/shop/search?' + 
    new URLSearchParams(params);
  
  const response = await fetch(url);
  const data = await response.json();
  
  if (data.code === 200) {
    return data.data.shops.map((shop: any) => ({
      shopId: shop.shopId,
      shopName: shop.shopName,
      address: shop.address,
      latitude: shop.latitude,
      longitude: shop.longitude,
      avgPrice: shop.avgPrice,
      score: shop.score,
      commentCount: shop.commentCount,
      categories: shop.categories,
      coupons: shop.coupons || []
    }));
  }
  
  throw new Error(`美团 API 错误：${data.msg}`);
}

/**
 * 优惠券查询
 */
export async function getShopCoupons(shopId: string): Promise<Coupon[]> {
  // 实现类似...
  return [];
}
```

---

### 3.3 数据融合与标准化

#### 3.3.1 统一数据模型

```typescript
// src/types/restaurant.ts

export interface Restaurant {
  // 基础信息
  id: string;                    // 内部 ID
  name: string;                  // 名称
  address: string;               // 地址
  location: { lat: number; lng: number };
  
  // 分类
  cuisine: string;               // 菜系
  categories: string[];          // 多标签分类
  tags: string[];                // 特色标签
  
  // 评价指标
  rating: number;                // 综合评分（0-5）
  reviewCount: number;           // 评论数
  tasteScore?: number;           // 口味分
  envScore?: number;             // 环境分
  serviceScore?: number;         // 服务分
  
  // 消费信息
  avgPrice: number;              // 人均消费
  priceLevel: 'low' | 'mid' | 'high';
  
  // 营业信息
  phone?: string;
  openingHours?: string;
  isOpenNow: boolean;
  
  // 图片
  coverImage?: string;
  images: string[];
  
  // 来源标识
  source: 'gaode' | 'meituan' | 'user_import';
  gaodeId?: string;
  meituanId?: string;
  
  // 元数据
  createdAt: Date;
  updatedAt: Date;
}
```

#### 3.3.2 数据融合逻辑

```typescript
// src/lib/data-merge.ts

/**
 * 合并高德 + 美团数据
 * 策略：以高德为基础，补充美团优惠券和详细评分
 */
export async function mergeRestaurantData(
  gaodeData: GaodeRestaurant[],
  meituanData: MeituanShop[]
): Promise<Restaurant[]> {
  const merged: Restaurant[] = [];
  
  for (const gaode of gaodeData) {
    // 查找匹配的美团店铺（基于名称 + 位置）
    const meituan = meituanData.find(mt => 
      isSameShop(gaode, mt)
    );
    
    const restaurant: Restaurant = {
      id: generateId(),
      name: gaode.name,
      address: gaode.address,
      location: gaode.location,
      cuisine: gaode.type,
      categories: parseCategories(gaode.type),
      tags: generateTags(gaode),
      rating: parseFloat(gaode.rating) || 0,
      reviewCount: 0,
      avgPrice: parseInt(gaode.avg_price) || 0,
      priceLevel: classifyPriceLevel(parseInt(gaode.avg_price)),
      phone: gaode.tel,
      openingHours: gaode.shop_hours,
      isOpenNow: checkIsOpenNow(gaode.shop_hours),
      images: gaode.photos || [],
      source: 'gaode',
      gaodeId: gaode.id,
      meituanId: meituan?.shopId,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    // 补充美团数据
    if (meituan) {
      restaurant.rating = Math.max(restaurant.rating, meituan.score);
      restaurant.reviewCount = meituan.commentCount;
      restaurant.avgPrice = meituan.avgPrice || restaurant.avgPrice;
      restaurant.categories = [...new Set([
        ...restaurant.categories,
        ...meituan.categories
      ])];
    }
    
    merged.push(restaurant);
  }
  
  return merged;
}

/**
 * 判断两家店是否为同一家
 * 策略：名称相似度 + 位置距离
 */
function isSameShop(gaode: GaodeRestaurant, meituan: MeituanShop): boolean {
  // 1. 名称相似度
  const nameSimilarity = calculateStringSimilarity(
    gaode.name,
    meituan.shopName
  );
  
  // 2. 位置距离（Haversine 公式）
  const distance = calculateDistance(
    gaode.location.lat,
    gaode.location.lng,
    meituan.latitude,
    meituan.longitude
  );
  
  // 名称相似且距离<100 米，认为是同一家
  return nameSimilarity > 0.8 && distance < 0.1;
}
```

---

## 四、向量数据库设计

### 4.1 Supabase pgvector 配置

#### 4.1.1 启用扩展

```sql
-- Supabase SQL Editor 执行

-- 1. 启用 pgvector 扩展
create extension if not exists vector;

-- 2. 创建餐厅表
create table restaurants (
  id uuid primary key default gen_random_uuid(),
  gaode_id text unique,
  meituan_id text unique,
  name text not null,
  address text,
  location geography(POINT, 4326),
  cuisine text,
  categories jsonb default '[]',
  tags jsonb default '[]',
  rating numeric(3,2) default 0,
  review_count int default 0,
  avg_price int default 0,
  price_level text check (price_level in ('low', 'mid', 'high')),
  phone text,
  opening_hours text,
  images jsonb default '[]',
  source text not null default 'gaode',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 3. 创建向量表（单独存储，便于扩展）
create table restaurant_embeddings (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references restaurants(id) on delete cascade,
  embedding vector(384),  -- 使用 384 维向量
  tags_text text,         -- 用于生成向量的标签文本
  created_at timestamptz default now()
);

-- 4. 创建向量索引（IVFFlat 算法）
create index on restaurant_embeddings 
using ivfflat (embedding vector_cosine_ops)
with (lists = 100);

-- 5. 创建地理位置索引
create index on restaurants using gist (location);

-- 6. 创建组合查询函数
create or replace function search_restaurants(
  query_embedding vector(384),
  match_location geography,
  max_distance_km float default 5,
  match_budget text default null,
  match_threshold float default 0.6,
  max_results int default 20
)
returns table (
  id uuid,
  name text,
  address text,
  cuisine text,
  rating numeric,
  avg_price int,
  distance_km float,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    r.id,
    r.name,
    r.address,
    r.cuisine,
    r.rating,
    r.avg_price,
    st_distance(r.location, match_location) / 1000 as distance_km,
    1 - (re.embedding <=> query_embedding) as similarity
  from restaurants r
  join restaurant_embeddings re on r.id = re.restaurant_id
  where
    1 - (re.embedding <=> query_embedding) > match_threshold
    and st_distance(r.location, match_location) <= max_distance_km * 1000
    and (match_budget is null or r.price_level = match_budget)
  order by
    similarity desc,
    r.rating desc,
    distance_km asc
  limit max_results;
end;
$$;
```

### 4.2 Embedding 生成

#### 4.2.1 模型选择

```yaml
推荐模型：Xenova/all-MiniLM-L6-v2
- 维度：384
- 大小：80MB
- 速度：快（CPU 友好）
- 精度：STS 任务 83.3
- 许可证：Apache 2.0（免费商用）

备选模型：
- BAAI/bge-small-zh-v1.5（中文优化，512 维）
- text2vec-base-chinese（中文语义，768 维）
```

#### 4.2.2 生成逻辑

```typescript
// src/lib/embedding.ts
import { pipeline } from '@xenova/transformers';
import { supabase } from './supabase';

// 单例模式加载模型
let embedder: any = null;

async function getEmbedder() {
  if (!embedder) {
    embedder = await pipeline(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2',
      { quantized: false }
    );
  }
  return embedder;
}

/**
 * 为餐厅生成 Embedding 向量
 * 策略：组合名称、菜系、标签等关键信息
 */
export async function generateRestaurantEmbedding(
  restaurant: Restaurant
): Promise<number[]> {
  const embedder = await getEmbedder();
  
  // 构建用于嵌入的文本
  const textForEmbedding = [
    restaurant.name,
    restaurant.cuisine,
    ...(restaurant.categories || []),
    ...(restaurant.tags || []),
    `人均${restaurant.avgPrice}元`,
    `评分${restaurant.rating}`
  ].join(' ');
  
  // 生成向量
  const output = await embedder(textForEmbedding, {
    pooling: 'mean',
    normalize: true
  });
  
  return Array.from(output.data);
}

/**
 * 为用户偏好生成 Embedding 向量
 */
export async function generateUserPreferenceEmbedding(
  preferences: {
    likes: string[];
    dislikes: string[];
    budget?: string;
    scenario?: string;
  }
): Promise<number[]> {
  const embedder = await getEmbedder();
  
  const text = [
    ...preferences.likes,
    preferences.scenario || '',
    preferences.budget ? `预算${preferences.budget}` : ''
  ].filter(Boolean).join(' ');
  
  const output = await embedder(text, {
    pooling: 'mean',
    normalize: true
  });
  
  return Array.from(output.data);
}

/**
 * 批量生成并存储向量
 */
export async function indexRestaurants(
  restaurantIds: string[]
) {
  const { data: restaurants } = await supabase
    .from('restaurants')
    .select('*')
    .in('id', restaurantIds);
  
  if (!restaurants) return;
  
  for (const restaurant of restaurants) {
    const embedding = await generateRestaurantEmbedding(restaurant);
    
    await supabase
      .from('restaurant_embeddings')
      .upsert({
        restaurant_id: restaurant.id,
        embedding,
        tags_text: [
          restaurant.cuisine,
          ...(restaurant.categories || []),
          ...(restaurant.tags || [])
        ].join(' ')
      });
  }
}
```

### 4.3 向量检索优化

#### 4.3.1 混合检索策略

```typescript
// src/lib/search.ts

/**
 * 混合检索：向量相似度 + 地理位置 + 业务规则
 */
export async function searchRestaurantsWithFilters(
  userPreferences: UserPreferences,
  location: { lat: number; lng: number },
  filters: {
    maxDistanceKm?: number;
    budget?: string;
    minRating?: number;
  }
) {
  // 1. 生成用户偏好向量
  const userEmbedding = await generateUserPreferenceEmbedding({
    likes: userPreferences.taste_likes.likes,
    dislikes: userPreferences.taste_likes.dislikes,
    budget: userPreferences.budget,
    scenario: userPreferences.scenario
  });
  
  // 2. 调用数据库函数进行混合检索
  const { data, error } = await supabase.rpc('search_restaurants', {
    query_embedding: userEmbedding,
    match_location: `POINT(${location.lng} ${location.lat})`,
    max_distance_km: filters.maxDistanceKm || 5,
    match_budget: classifyBudget(userPreferences.budget),
    match_threshold: 0.6,
    max_results: 50
  });
  
  if (error) throw error;
  
  // 3. 后处理：应用额外过滤
  let results = data || [];
  
  if (filters.minRating) {
    results = results.filter(r => r.rating >= filters.minRating);
  }
  
  // 4. 去重（同一家店多个来源）
  results = deduplicateRestaurants(results);
  
  return results.slice(0, 20);
}

/**
 * 向量 + 关键词混合检索（高级）
 */
export async function hybridSearch(
  query: string,
  userEmbedding: number[],
  location: { lat: number; lng: number }
) {
  // 1. 向量检索（语义相似度）
  const { data: vectorResults } = await supabase.rpc('search_restaurants', {
    query_embedding: userEmbedding,
    match_location: `POINT(${location.lng} ${location.lat})`,
    max_distance_km: 5,
    match_threshold: 0.5,
    max_results: 100
  });
  
  // 2. 关键词检索（全文匹配）
  const { data: keywordResults } = await supabase
    .from('restaurants')
    .select('*')
    .or(`name.ilike.%${query}%,cuisine.ilike.%${query}%`)
    .limit(50);
  
  // 3. 融合结果（RRF 算法）
  const fused = reciprocalRankFusion([vectorResults, keywordResults]);
  
  return fused.slice(0, 20);
}
```

---

## 五、Agent 系统设计

### 5.1 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                  多 Agent 协作流程                        │
│                                                         │
│  用户输入                                                │
│    ↓                                                    │
│  ┌──────────────────────────────────────────────────┐  │
│  │  约束过滤 Agent（硬条件）                          │  │
│  │  - 位置范围过滤                                   │  │
│  │  - 预算过滤                                       │  │
│  │  - 忌口过滤（一票否决）                           │  │
│  │  输出：候选餐厅池（20-30 家）                       │  │
│  └──────────────────────────────────────────────────┘  │
│    ↓                                                    │
│  ┌──────────────────────────────────────────────────┐  │
│  │  多目标优化 Agent（智能排序）                       │  │
│  │  - 口味匹配度（40%）                              │  │
│  │  - 预算符合度（20%）                              │  │
│  │  - 距离便利性（20%）                              │  │
│  │  - 天气适应性（10%）                              │  │
│  │  - 综合评分（10%）                                │  │
│  │  输出：Top3 推荐 + 得分                            │  │
│  └──────────────────────────────────────────────────┘  │
│    ↓                                                    │
│  ┌──────────────────────────────────────────────────┐  │
│  │  可解释性 Agent（理由生成）                        │  │
│  │  - 个性化推荐理由                                 │  │
│  │  - 引用小红书真实评价                             │  │
│  │  - 避雷提醒                                       │  │
│  │  输出：最终推荐结果（带解释）                      │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 5.2 约束过滤 Agent

```python
# app/agents/filter_agent.py
from langchain_core.prompts import PromptTemplate
from langchain_ollama import ChatOllama
from pydantic import BaseModel, Field
import json

class FilterResult(BaseModel):
    """约束过滤结果"""
    passed_ids: list[str] = Field(description="符合所有约束的餐厅 ID 列表")
    filtered_count: int = Field(description="被过滤掉的餐厅数量")
    reasons: dict[str, int] = Field(description="各原因的过滤数量")

FILTER_PROMPT = PromptTemplate.from_template("""
你是一个餐厅推荐约束过滤专家。
根据用户约束条件，从候选餐厅中筛选出符合要求的餐厅。

## 用户约束
- 位置范围：{location}（最大距离 {max_distance}km）
- 人均预算：{budget} 元
- 忌口清单：{dietary_restrictions}
- 交通方式：{transport_mode}

## 候选餐厅列表（{total}家）
{candidates}

## 过滤规则
1. **位置过滤**：距离 > {max_distance}km 的餐厅剔除
2. **预算过滤**：人均价格 > 预算上限 20% 的餐厅剔除
3. **忌口过滤**（一票否决）：餐厅标签包含忌口内容的剔除
4. **营业状态**：当前未营业的餐厅剔除

## 输出要求
请输出符合所有约束的餐厅 ID 列表，以及过滤统计信息。
输出格式必须为合法 JSON：
{{
  "passed_ids": ["id1", "id2", ...],
  "filtered_count": 10,
  "reasons": {{
    "distance": 3,
    "budget": 5,
    "dietary": 2,
    "closed": 0
  }}
}}

输出：
""")

class ConstraintFilterAgent:
    def __init__(self):
        self.llm = ChatOllama(
            model="qwen2.5:7b",
            temperature=0,
            format="json"
        )
        self.chain = FILTER_PROMPT | self.llm.with_structured_output(FilterResult)
    
    def invoke(self, params: dict) -> FilterResult:
        """执行约束过滤"""
        return self.chain.invoke(params)

# 使用示例
async def filter_restaurants(
    candidates: list[Restaurant],
    location: dict,
    budget: str,
    dietary_restrictions: list[str],
    transport_mode: str,
    max_distance: float = 5.0
) -> list[Restaurant]:
    """约束过滤主函数"""
    
    # 预处理：计算距离、解析预算
    budget_range = parse_budget(budget)  # {"min": 80, "max": 120}
    
    # 构建候选餐厅文本
    candidates_text = "\n".join([
        f"ID: {r['id']}, 名称：{r['name']}, 人均：{r['avg_price']}, "
        f"距离：{r['distance_km']:.2f}km, 标签：{','.join(r['tags'])}"
        for r in candidates
    ])
    
    # 调用 Agent
    filter_agent = ConstraintFilterAgent()
    result = await filter_agent.invoke({
        "location": location["address"],
        "max_distance": max_distance,
        "budget": budget,
        "dietary_restrictions": ", ".join(dietary_restrictions),
        "transport_mode": transport_mode,
        "total": len(candidates),
        "candidates": candidates_text
    })
    
    # 返回过滤后的餐厅
    filtered = [r for r in candidates if r["id"] in result.passed_ids]
    return filtered
```

### 5.3 多目标优化 Agent

```python
# app/agents/optimization_agent.py
from langchain_core.prompts import PromptTemplate
from langchain_ollama import ChatOllama
from pydantic import BaseModel, Field

class RecommendationItem(BaseModel):
    """单个推荐项"""
    restaurant_id: str = Field(description="餐厅 ID")
    name: str = Field(description="餐厅名称")
    score: float = Field(description="综合得分（0-100）")
    breakdown: dict[str, float] = Field(description="各维度得分")
    reason: str = Field(description="简短推荐理由")

class OptimizationResult(BaseModel):
    """多目标优化结果"""
    recommendations: list[RecommendationItem] = Field(
        description="Top3 推荐列表"
    )

OPTIMIZATION_PROMPT = PromptTemplate.from_template("""
你是一个多目标决策优化专家。
根据用户偏好，对候选餐厅进行综合评分排序。

## 用户偏好
{user_preferences}

## 天气情况
{weather_info}

## 候选餐厅详情（{count}家）
{restaurants}

## 评分维度与权重
1. **口味匹配度（40%）**：用户喜好与餐厅特色的匹配
   - 用户喜欢的标签命中数量 × 10 分
   - 用户不喜欢的标签命中数量 × (-15) 分
   
2. **预算符合度（20%）**：人均消费与预算的匹配
   - 在预算范围内：20 分
   - 超出预算<20%：10 分
   - 超出预算>20%：0 分
   
3. **距离便利性（20%）**：基于交通方式的可达性
   - 步行/骑行：<1km: 20 分，1-3km: 15 分
   - 地铁/开车：<5km: 20 分，5-10km: 15 分
   
4. **天气适应性（10%）**：
   - 雨天：室内餐厅 +10 分，室外 -10 分
   - 高温（>32°C）：有空调 +10 分
   
5. **综合评分（10%）**：
   - 店铺评分 × 2 分（满分 10 分）

## 输出要求
请计算每家餐厅的综合得分，输出 Top3 推荐。
输出格式必须为合法 JSON：
{{
  "recommendations": [
    {{
      "restaurant_id": "...",
      "name": "...",
      "score": 95.5,
      "breakdown": {{
        "taste_match": 35,
        "budget_fit": 20,
        "distance": 18,
        "weather_adapt": 10,
        "overall_rating": 9.5
      }},
      "reason": "一句话推荐理由"
    }}
  ]
}}

输出：
""")

class MultiObjectiveOptimizer:
    def __init__(self):
        self.llm = ChatOllama(
            model="qwen2.5:7b",
            temperature=0.1,
            format="json"
        )
        self.chain = OPTIMIZATION_PROMPT | self.llm.with_structured_output(
            OptimizationResult
        )
    
    def invoke(self, params: dict) -> OptimizationResult:
        """执行多目标优化"""
        return self.chain.invoke(params)
```

### 5.4 可解释性 Agent

```python
# app/agents/explanation_agent.py
from langchain_core.prompts import PromptTemplate
from langchain_ollama import ChatOllama
from pydantic import BaseModel, Field

class Citation(BaseModel):
    """引用来源"""
    excerpt: str = Field(description="用户评价原文")
    likes: int = Field(description="点赞数")
    source: str = Field(description="来源平台（小红书/抖音）")

class ExplanationItem(BaseModel):
    """单个推荐的解释"""
    restaurant_id: str
    shop_name: str
    main_reason: str = Field(
        description="主要推荐理由（200 字以内）"
    )
    personalized_reasons: dict[str, str] = Field(
        description="针对不同用户的个性化理由"
    )
    citations: list[Citation] = Field(
        description="真实用户评价引用"
    )
    warning: str | None = Field(
        default=None,
        description="避雷提醒（如有）"
    )

EXPLANATION_PROMPT = PromptTemplate.from_template("""
你是一个推荐解释生成专家。
为每家推荐餐厅生成个性化、有说服力的推荐理由。

## 用户需求
- 用户 A（发起人）：{user_a_prefs}
- 用户 B（成员）：{user_b_prefs}
- 用户 C（成员）：{user_c_prefs}

## 餐厅信息
{restaurant}

## 小红书真实评价
{xiaohongshu_notes}

## 生成要求
1. **主推荐理由**：综合所有人偏好，突出最大卖点
2. **个性化理由**：
   - 对注重性价比的用户：强调价格
   - 对无辣不欢的用户：强调辣度
   - 对注重环境的用户：强调装修
3. **引用真实评价**：增强可信度
4. **避雷提醒**：如有负面评价，客观提醒

## 输出格式
{{
  "restaurant_id": "...",
  "shop_name": "...",
  "main_reason": "...",
  "personalized_reasons": {{
    "user_a": "...",
    "user_b": "...",
    "user_c": "..."
  }},
  "citations": [
    {{"excerpt": "...", "likes": 327, "source": "小红书"}},
    {{"excerpt": "...", "likes": 156, "source": "小红书"}}
  ],
  "warning": "有用户反映周末排队较长"
}}

输出：
""")

class ExplanationGenerator:
    def __init__(self):
        self.llm = ChatOllama(
            model="qwen2.5:7b",
            temperature=0.3,  # 稍高温度增加创造性
            format="json"
        )
        self.chain = EXPLANATION_PROMPT | self.llm.with_structured_output(
            ExplanationItem
        )
    
    def invoke(self, params: dict) -> ExplanationItem:
        """生成解释"""
        return self.chain.invoke(params)
```

### 5.5 用户授权采集 Agent（小红书链接/评论区截图）

```python
# app/agents/social_parser_agent.py
from langchain_core.prompts import PromptTemplate
from langchain_ollama import ChatOllama
from pydantic import BaseModel, Field
import base64
from PIL import Image
import io

class ParsedSocialNote(BaseModel):
    """解析后的社交笔记"""
    platform: str = Field(description="平台：xiaohongshu/douyin")
    shop_name: str | None = Field(description="店铺名称")
    location: str | None = Field(description="地理位置")
    cuisine: str | None = Field(description="菜系")
    price_range: str | None = Field(description="价格区间")
    tags: list[str] = Field(default=[], description="标签")
    highlights: list[str] = Field(default=[], description="亮点")
    complaints: list[str] = Field(default=[], description="槽点")
    sentiment: str = Field(
        description="情感倾向：positive/neutral/negative"
    )
    suitable_scenarios: list[str] = Field(
        default=[],
        description="适合场景"
    )
    must_order_dishes: list[str] = Field(
        default=[],
        description="必点菜"
    )

PARSE_PROMPT = PromptTemplate.from_template("""
你是一个社交媒体美食笔记解析专家。
从用户提供的小红书/抖音笔记中提取店铺信息和用户偏好。

## 笔记内容
标题：{title}
正文：{content}
标签：{hashtags}

## 评论区（可选）
{comments}

## 提取要求
请提取以下信息（JSON 格式）：
{{
  "platform": "xiaohongshu",
  "shop_name": "店铺名称（如果有）",
  "location": "地理位置（商圈/地标）",
  "cuisine": "菜系类型",
  "price_range": "价格区间（如：人均 100-150）",
  "tags": ["标签 1", "标签 2"],
  "highlights": ["用户夸赞的点"],
  "complaints": ["用户吐槽的点"],
  "sentiment": "positive/neutral/negative",
  "suitable_scenarios": ["聚餐", "约会", "打卡"],
  "must_order_dishes": ["必点菜品"]
}}

注意：
- 如果信息缺失，字段留空或设为 null
- 区分客观描述和主观评价
- 提取原文中的关键词（如"绝了""天花板"）

输出：
""")

class SocialNoteParser:
    def __init__(self):
        self.llm = ChatOllama(
            model="qwen2.5:7b",
            temperature=0.2,
            format="json"
        )
        self.chain = PARSE_PROMPT | self.llm.with_structured_output(
            ParsedSocialNote
        )
    
    async def parse_text(self, text: str, comments: list[str] = None) -> ParsedSocialNote:
        """解析文本内容（从小红书链接提取）"""
        # 简单 NLP 提取
        title = text.split('\n')[0][:50]
        content = text[:500]
        hashtags = extract_hashtags(text)
        
        return await self.chain.invoke({
            "title": title,
            "content": content,
            "hashtags": ", ".join(hashtags),
            "comments": "\n".join(comments or [])
        })
    
    async def parse_comment_screenshot(self, image_base64: str) -> ParsedSocialNote:
        """
        解析评论区截图（OCR + LLM）
        用户场景：用户截取小红书笔记的评论区，包含多条真实评价
        """
        # 1. Base64 转图片
        image_data = base64.b64decode(image_base64)
        image = Image.open(io.BytesIO(image_data))
        
        # 2. OCR 识别（使用 PaddleOCR）
        from paddleocr import PaddleOCR
        ocr = PaddleOCR(use_angle_cls=True, lang='ch')
        result = ocr.ocr(image)
        
        # 提取文字（按行组织）
        lines = []
        for line in result[0]:
            text = line[1][0]
            confidence = line[1][1]
            if confidence > 0.6:  # 过滤低置信度
                lines.append(text)
        
        # 3. 识别评论结构
        # 评论区通常格式："用户名：评论内容" 或 "@用户名 回复：评论"
        comments = []
        main_content = []
        for line in lines:
            if ':' in line or ':' in line:
                comments.append(line)
            else:
                main_content.append(line)
        
        # 4. 调用 LLM 解析
        return await self.chain.invoke({
            "title": "评论区截图",
            "content": "\n".join(main_content),
            "hashtags": "",
            "comments": comments
        })
    
    async def parse_url(self, url: str) -> ParsedSocialNote:
        """
        解析小红书链接
        用户场景：用户分享小红书笔记链接，后端解析内容
        """
        # 方案 A：调用第三方解析服务（推荐）
        # 使用类似"轻抖"、"解析狗"等第三方 API
        response = await fetch(f"{PARSER_SERVICE_URL}/xiaohongshu", {
            "method": "POST",
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"url": url})
        })
        
        if response.status != 200:
            raise Exception(f"解析失败：{response.status}")
        
        data = await response.json()
        return await self.parse_text(
            data.get("content", ""),
            data.get("comments", [])
        )
    
    async def parse(self, input_type: str, content: str) -> ParsedSocialNote:
        """
        统一解析接口
        :param input_type: "url" | "screenshot"
        :param content: 链接或 Base64 图片
        """
        if input_type == "url":
            return await self.parse_url(content)
        elif input_type == "screenshot":
            return await self.parse_comment_screenshot(content)
        else:
            raise ValueError(f"不支持的输入类型：{input_type}")
```

#### 5.5.1 前端组件设计

```typescript
// src/components/SocialShareUpload.tsx
"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";

interface SocialShareUploadProps {
  onComplete?: (data: ParsedSocialNote) => void;
}

export default function SocialShareUpload({ onComplete }: SocialShareUploadProps) {
  const [uploadType, setUploadType] = useState<"url" | "screenshot">("url");
  const [urlInput, setUrlInput] = useState("");
  const [screenshotBase64, setScreenshotBase64] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 处理链接提交
  const handleUrlSubmit = useCallback(async () => {
    if (!urlInput.trim()) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // 验证链接格式
      if (!urlInput.includes("xiaohongshu.com") && !urlInput.includes("xhslink.com")) {
        throw new Error("请输入有效的小红书链接");
      }
      
      const response = await fetch("/api/parse-social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "url",
          content: urlInput
        })
      });
      
      if (!response.ok) throw new Error("解析失败，请重试");
      
      const data = await response.json();
      onComplete?.(data);
      setUrlInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "解析失败");
    } finally {
      setLoading(false);
    }
  }, [urlInput, onComplete]);

  // 处理截图上传
  const handleScreenshotUpload = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    
    try {
      // 转 Base64
      const base64 = await fileToBase64(file);
      setScreenshotBase64(base64);
      
      const response = await fetch("/api/parse-social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "screenshot",
          content: base64
        })
      });
      
      if (!response.ok) throw new Error("解析失败，请重试");
      
      const data = await response.json();
      onComplete?.(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "解析失败");
    } finally {
      setLoading(false);
    }
  }, [onComplete]);

  return (
    <div className="flex w-full max-w-lg flex-col gap-4 rounded-2xl bg-white/90 p-6 shadow-lg">
      {/* 切换上传类型 */}
      <div className="flex gap-2">
        <button
          onClick={() => setUploadType("url")}
          className={`flex-1 rounded-xl py-3 text-sm font-semibold transition-colors ${
            uploadType === "url"
              ? "bg-gradient-to-r from-red-500 to-pink-500 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          📎 粘贴链接
        </button>
        <button
          onClick={() => setUploadType("screenshot")}
          className={`flex-1 rounded-xl py-3 text-sm font-semibold transition-colors ${
            uploadType === "screenshot"
              ? "bg-gradient-to-r from-red-500 to-pink-500 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          📸 上传截图
        </button>
      </div>

      {/* 链接输入 */}
      {uploadType === "url" && (
        <div className="space-y-3">
          <textarea
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="粘贴小红书笔记链接，如：https://www.xiaohongshu.com/explore/..."
            className="h-24 w-full resize-none rounded-xl border border-gray-200 p-3 text-sm focus:border-pink-500 focus:outline-none"
          />
          <button
            onClick={handleUrlSubmit}
            disabled={loading || !urlInput.trim()}
            className="w-full cursor-pointer rounded-xl bg-gradient-to-r from-red-500 to-pink-500 py-3 font-semibold text-white disabled:opacity-50"
          >
            {loading ? "解析中..." : "开始解析"}
          </button>
        </div>
      )}

      {/* 截图上传 */}
      {uploadType === "screenshot" && (
        <div className="space-y-3">
          <label className="flex h-40 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 transition-colors hover:bg-gray-100">
            {screenshotBase64 ? (
              <img
                src={screenshotBase64}
                alt="预览"
                className="h-full w-full object-contain rounded-lg"
              />
            ) : (
              <>
                <span className="text-4xl">📸</span>
                <p className="mt-2 text-sm text-gray-500">
                  点击上传评论区截图
                </p>
                <p className="text-xs text-gray-400">
                  支持小红书/抖音笔记的评论区截图
                </p>
              </>
            )}
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleScreenshotUpload(file);
              }}
              className="hidden"
            />
          </label>
          {screenshotBase64 && (
            <button
              onClick={() => setScreenshotBase64(null)}
              className="w-full cursor-pointer rounded-xl bg-gray-200 py-3 text-sm font-semibold text-gray-700"
            >
              重新上传
            </button>
          )}
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="rounded-xl bg-red-50 p-3 text-sm text-red-600">
          ⚠️ {error}
        </div>
      )}

      {/* 使用说明 */}
      <div className="mt-2 rounded-xl bg-blue-50 p-4">
        <p className="text-sm font-semibold text-blue-800">💡 使用提示</p>
        <ul className="mt-2 list-inside list-disc text-xs text-blue-600 space-y-1">
          <li>粘贴小红书笔记链接，AI 自动解析店铺信息和评价</li>
          <li>上传评论区截图，AI 识别多条真实用户评价</li>
          <li>解析结果将用于个性化推荐，让 AI 更懂你的口味</li>
        </ul>
      </div>
    </div>
  );
}

// 工具函数：File 转 Base64
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
```

#### 5.5.2 API 路由实现

```typescript
// src/app/api/parse-social/route.ts
import { NextRequest, NextResponse } from "next/server";
import { SocialNoteParser } from "@/src/lib/social-parser";

const parser = new SocialNoteParser();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, content } = body;

    if (!type || !content) {
      return NextResponse.json(
        { success: false, error: "缺少必要参数" },
        { status: 400 }
      );
    }

    if (!["url", "screenshot"].includes(type)) {
      return NextResponse.json(
        { success: false, error: "不支持的解析类型" },
        { status: 400 }
      );
    }

    // 调用解析服务
    const result = await parser.parse(type, content);

    return NextResponse.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error("解析失败:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "解析失败"
      },
      { status: 500 }
    );
  }
}
```

---

## 六、API 服务设计

### 6.1 FastAPI 架构

```python
# app/main.py
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import uvicorn

from app.agents.filter_agent import ConstraintFilterAgent
from app.agents.optimization_agent import MultiObjectiveOptimizer
from app.agents.explanation_agent import ExplanationGenerator
from app.agents.social_parser_agent import SocialNoteParser
from app.services.search_service import SearchService

app = FastAPI(
    title="随便聚推荐 API",
    description="AI 智能餐厅推荐系统",
    version="2.0.0"
)

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 生产环境需限制
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 初始化服务
search_service = SearchService()
filter_agent = ConstraintFilterAgent()
optimizer = MultiObjectiveOptimizer()
explainer = ExplanationGenerator()
note_parser = SocialNoteParser()


class RecommendationRequest(BaseModel):
    """推荐请求"""
    room_id: str
    preferences: dict
    location: dict
    weather: Optional[dict] = None


class RecommendationResponse(BaseModel):
    """推荐响应"""
    success: bool
    data: list[dict]
    metadata: dict


@app.post("/api/recommend", response_model=RecommendationResponse)
async def generate_recommendation(req: RecommendationRequest):
    """
    生成餐厅推荐
    
    流程：
    1. 向量检索候选餐厅
    2. 约束过滤
    3. 多目标优化排序
    4. 生成个性化解释
    """
    try:
        # 1. 向量检索
        candidates = await search_service.search(
            user_preferences=req.preferences,
            location=req.location,
            limit=50
        )
        
        if not candidates:
            raise HTTPException(status_code=404, detail="未找到符合条件的餐厅")
        
        # 2. 约束过滤
        filtered = await filter_agent.invoke({
            "candidates": candidates,
            "location": req.location,
            "budget": req.preferences.get("budget", ""),
            "dietary_restrictions": req.preferences.get("dietary_restrictions", []),
            "transport_mode": req.preferences.get("transport_mode", "subway"),
            "max_distance": 5.0
        })
        
        # 3. 多目标优化
        optimization_result = await optimizer.invoke({
            "user_preferences": req.preferences,
            "weather_info": req.weather,
            "restaurants": filtered
        })
        
        # 4. 生成解释
        recommendations = []
        for rec in optimization_result.recommendations:
            explanation = await explainer.invoke({
                "user_a_prefs": req.preferences,
                "user_b_prefs": {},  # 可扩展
                "user_c_prefs": {},
                "restaurant": rec,
                "xiaohongshu_notes": []  # 可扩展
            })
            recommendations.append({
                **rec.dict(),
                "explanation": explanation.dict()
            })
        
        return RecommendationResponse(
            success=True,
            data=recommendations,
            metadata={
                "total_candidates": len(candidates),
                "after_filter": len(filtered),
                "final_count": len(recommendations)
            }
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class ParseNoteRequest(BaseModel):
    """笔记解析请求"""
    type: str  # "text" | "screenshot" | "url"
    content: str
    platform: str  # "xiaohongshu" | "douyin"


class ParseNoteResponse(BaseModel):
    """笔记解析响应"""
    success: bool
    data: dict


@app.post("/api/parse-note", response_model=ParseNoteResponse)
async def parse_social_note(req: ParseNoteRequest):
    """解析小红书/抖音笔记"""
    try:
        if req.type == "text":
            result = await note_parser.parse_text(req.content)
        elif req.type == "screenshot":
            result = await note_parser.parse_screenshot(req.content)
        elif req.type == "url":
            result = await note_parser.parse_url(req.content)
        else:
            raise ValueError(f"Unsupported type: {req.type}")
        
        return ParseNoteResponse(success=True, data=result.dict())
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/restaurants")
async def list_restaurants(
    location: str,
    cuisine: Optional[str] = None,
    min_rating: Optional[float] = None,
    limit: int = 20
):
    """餐厅列表查询"""
    results = await search_service.list_restaurants(
        location=location,
        cuisine=cuisine,
        min_rating=min_rating,
        limit=limit
    )
    return {"success": True, "data": results}


if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )
```

### 6.2 部署配置

```yaml
# Railway / Render 部署配置
# railway.toml

[build]
builder = "NIXPACKS"
buildCommand = "pip install -r requirements.txt"

[deploy]
startCommand = "python -m uvicorn app.main:app --host 0.0.0.0 --port $PORT"
healthcheckPath = "/health"
healthcheckTimeout = 100
restartPolicyType = "ON_FAILURE"

[env]
PYTHON_VERSION = "3.11"
GAODE_API_KEY = "{{GAODE_API_KEY}}"
MEITUAN_APPKEY = "{{MEITUAN_APPKEY}}"
MEITUAN_SECRET = "{{MEITUAN_SECRET}}"
SUPABASE_URL = "{{SUPABASE_URL}}"
SUPABASE_KEY = "{{SUPABASE_KEY}}"
OLLAMA_HOST = "http://ollama:11434"
```

---

## 七、实施计划

### 7.1 时间规划（6-8 周）

```
┌─────────────────────────────────────────────────────────────┐
│                    V2.0 迭代甘特图                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Week 1-2: 数据获取层                                        │
│ ████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   │
│ - 高德 API 接入 + 数据同步                                   │
│ - 美团 API 申请（并行）                                      │
│                                                             │
│ Week 3: 向量数据库                                          │
│ ░░░░░░░░░░████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   │
│ - pgvector 配置 + 索引优化                                   │
│ - Embedding 生成 + 批量入库                                  │
│                                                             │
│ Week 4-5: Agent 开发                                        │
│ ░░░░░░░░░░░░░░░░░░████████████░░░░░░░░░░░░░░░░░░░░░░░░░░   │
│ - 约束过滤 Agent                                            │
│ - 多目标优化 Agent                                          │
│ - 可解释性 Agent                                            │
│ - 社交笔记解析 Agent                                        │
│                                                             │
│ Week 6: API 服务 + 前端集成                                  │
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░████████░░░░░░░░░░░░░░░░░░░░░░   │
│ - FastAPI 开发                                              │
│ - 前端组件改造                                              │
│                                                             │
│ Week 7-8: 测试 + 优化                                       │
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░████████░░░░░░░░░░░░░░   │
│ - 端到端测试                                                │
│ - 性能优化                                                  │
│ - 灰度发布                                                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 7.2 里程碑

| 阶段 | 时间 | 交付物 | 验收标准 |
|------|------|--------|---------|
| **Phase 1** | Week 2 | 高德 API 接入完成 | 1000+ 餐厅入库 |
| **Phase 2** | Week 3 | 向量数据库上线 | 检索耗时<100ms |
| **Phase 3** | Week 5 | 4 个 Agent 完成 | 单元测试通过率 100% |
| **Phase 4** | Week 6 | API 服务部署 | 响应时间<3s |
| **Phase 5** | Week 8 | 全量发布 | 用户满意度>4.5 |

---

## 八、风险评估与应对

| 风险 | 概率 | 影响 | 应对措施 |
|------|------|------|---------|
| **API 申请失败** | 中 | 高 | 备选方案：仅用高德 API+ 人工导入 |
| **模型效果不佳** | 中 | 中 | A/B 测试 + 人工规则兜底 |
| **性能瓶颈** | 低 | 高 | 缓存策略 + 异步处理 |
| **法律合规** | 低 | 高 | 仅用户授权采集 + 法律顾问审核 |

---

## 九、成本估算

| 项目 | 月度成本 | 备注 |
|------|---------|------|
| **高德 API** | ¥0 | 免费额度内 |
| **美团 API** | ¥0 | 基础功能免费 |
| **Supabase** | ¥0 | 免费额度（500MB 数据库） |
| **Railway 部署** | ¥50-100 | 基础套餐 |
| **Ollama 服务器** | ¥200-400 | GPU 实例（可选） |
| **总计** | **¥250-500/月** | 个人可承受 |

---

## 十、总结

V2.0 迭代将「随便聚」从 MVP 原型升级为真正的 AI 智能推荐产品：

### 核心升级

✅ **数据真实**：高德 + 美团官方 API，1000+ 真实餐厅  
✅ **算法智能**：多 Agent 协作，推荐准确率 85%+  
✅ **体验个性**：用户授权采集社交笔记，千人千面  
✅ **架构可扩展**：支持多城市、多平台扩展  

### 技术亮点

- 向量数据库 + 语义检索
- LangChain 多 Agent 协作
- 本地模型部署（成本可控）
- 混合检索策略（向量 + 关键词 + 地理位置）

### 商业价值

- 提升用户信任度（真实数据 + 真实评价）
- 增强用户粘性（社交分享 + 个性化）
- 降低运营成本（自动化推荐）
- 可扩展商业模式（餐厅合作 + 优惠券分成）

---

**文档版本**：V2.0  
**最后更新**：2026 年 3 月  
**下一步**：启动 Phase 1（高德 API 接入）
