/** V2 Python 后端 API 客户端。 */

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";
const TIMEOUT_MS = 25_000;

export type ApiResult<T> = { success: true; data: T } | { success: false; error: string };

export type RestaurantItem = {
  id: string;
  name: string;
  address: string | null;
  cuisine: string | null;
  categories: string[];
  tags: string[];
  rating: number;
  review_count: number;
  avg_price: number;
  price_level: string | null;
  cover_image: string | null;
  opening_hours: string | null;
  source: string;
};

export type RestaurantStats = {
  total_restaurants: number;
  indexed: number;
  not_indexed: number;
  cuisines: Record<string, number>;
  price_levels: Record<string, number>;
};

// V2 推荐结果类型
export type V2Breakdown = {
  taste_match: number;
  budget_fit: number;
  distance: number;
  weather_adapt: number;
  overall_rating: number;
};

export type V2Recommendation = {
  restaurant_id: string;
  name: string;
  score: number;
  breakdown: V2Breakdown;
  brief_reason: string;
  main_reason: string;
  personalized_tags: string[];
  citations: { excerpt: string; likes: number; source: string }[];
  warning: string | null;
};

export type V2RecommendResult = {
  recommendations: V2Recommendation[];
  metadata: {
    room_id: string;
    total_candidates: number;
    after_filter: number;
    processing_time_ms: number;
    stages: { stage: string; elapsed_ms: number; ok: boolean }[];
    errors: string[] | null;
  };
};

async function request<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { success: false, error: `[${res.status}] ${text || res.statusText}` };
    }

    const data = (await res.json()) as T;
    return { success: true, data };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { success: false, error: "请求超时" };
    }
    return { success: false, error: `网络错误: ${(err as Error).message}` };
  } finally {
    clearTimeout(timer);
  }
}

export const apiClient = {
  /** 分页查询餐厅列表。 */
  async listRestaurants(params?: {
    page?: number;
    page_size?: number;
    cuisine?: string;
  }): Promise<ApiResult<{ items: RestaurantItem[]; total: number; page: number; page_size: number }>> {
    const p = new URLSearchParams();
    if (params?.page) p.set("page", String(params.page));
    if (params?.page_size) p.set("page_size", String(params.page_size));
    if (params?.cuisine) p.set("cuisine", params.cuisine);
    const qs = p.toString();
    return request(`/api/v2/restaurants${qs ? `?${qs}` : ""}`);
  },

  /** 餐厅数据统计。 */
  async getStats(): Promise<ApiResult<RestaurantStats>> {
    return request("/api/v2/restaurants/stats");
  },

  /** V2 智能推荐。 */
  async recommendV2(params: {
    room_id: string;
    preferences: Record<string, unknown>;
    location: { lat: number; lng: number };
    weather?: Record<string, unknown> | null;
  }): Promise<ApiResult<V2RecommendResult>> {
    return request<V2RecommendResult>("/api/v2/recommend", {
      method: "POST",
      body: JSON.stringify(params),
    });
  },

  /** 健康检查。 */
  async health(): Promise<ApiResult<{ status: string }>> {
    return request("/health");
  },
};
