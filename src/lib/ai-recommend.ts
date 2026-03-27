import { supabase } from "@/src/lib/supabase";
import type { WeatherSnapshot } from "@/src/lib/weather";

// ----- 对外类型 -----

export type Recommendation = {
  name: string;
  cuisine: string;
  avgPrice: number;
  rating: number;
  tags: string[];
  reason: string;
  matchScore: number;
};

// ----- 内置假餐厅库（MVP） -----

type FakeRestaurant = {
  name: string;
  cuisine: string;
  avgPrice: number;
  rating: number;
  tags: string[];
  indoor: boolean;
  hasAC: boolean;
};

const FAKE_RESTAURANTS: FakeRestaurant[] = [
  {
    name: "巴蜀焰重庆火锅",
    cuisine: "川味火锅",
    avgPrice: 118,
    rating: 4.7,
    tags: ["无辣不欢", "地摊烟火气", "大口吃肉", "海鲜盛宴"],
    indoor: true,
    hasAC: true,
  },
  {
    name: "巷尾炭火烤肉工坊",
    cuisine: "韩式烤肉",
    avgPrice: 135,
    rating: 4.6,
    tags: ["大口吃肉", "地摊烟火气", "高颜值出片"],
    indoor: true,
    hasAC: true,
  },
  {
    name: "青禾轻食沙拉站",
    cuisine: "轻食",
    avgPrice: 58,
    rating: 4.4,
    tags: ["清淡养生", "精致日料"],
    indoor: true,
    hasAC: true,
  },
  {
    name: "渔港蒸汽海鲜馆",
    cuisine: "海鲜",
    avgPrice: 168,
    rating: 4.8,
    tags: ["海鲜盛宴", "清淡养生", "高颜值出片"],
    indoor: true,
    hasAC: true,
  },
  {
    name: "一叶和食屋",
    cuisine: "日料",
    avgPrice: 198,
    rating: 4.7,
    tags: ["精致日料", "清淡养生", "高颜值出片"],
    indoor: true,
    hasAC: true,
  },
  {
    name: "老街牛肉面庄",
    cuisine: "面食",
    avgPrice: 42,
    rating: 4.3,
    tags: ["碳水狂魔", "地摊烟火气"],
    indoor: true,
    hasAC: false,
  },
  {
    name: "夜市烧烤大排档",
    cuisine: "烧烤",
    avgPrice: 78,
    rating: 4.2,
    tags: ["地摊烟火气", "大口吃肉", "无辣不欢"],
    indoor: false,
    hasAC: false,
  },
  {
    name: "云海云南过桥米线",
    cuisine: "滇味",
    avgPrice: 48,
    rating: 4.4,
    tags: ["碳水狂魔", "清淡养生"],
    indoor: true,
    hasAC: true,
  },
  {
    name: "本帮红烧肉·上海菜",
    cuisine: "本帮菜",
    avgPrice: 112,
    rating: 4.5,
    tags: ["大口吃肉", "清淡养生"],
    indoor: true,
    hasAC: true,
  },
  {
    name: "禅心素食自助",
    cuisine: "素食",
    avgPrice: 68,
    rating: 4.3,
    tags: ["清淡养生", "精致日料"],
    indoor: true,
    hasAC: true,
  },
  {
    name: "炙焰牛排馆",
    cuisine: "西餐",
    avgPrice: 228,
    rating: 4.8,
    tags: ["大口吃肉", "高颜值出片", "精致日料"],
    indoor: true,
    hasAC: true,
  },
  {
    name: "大碗宽面·西北风味",
    cuisine: "西北菜",
    avgPrice: 52,
    rating: 4.2,
    tags: ["碳水狂魔", "无辣不欢"],
    indoor: true,
    hasAC: false,
  },
  {
    name: "椰林海南鸡饭",
    cuisine: "海南菜",
    avgPrice: 72,
    rating: 4.5,
    tags: ["清淡养生", "碳水狂魔"],
    indoor: true,
    hasAC: true,
  },
  {
    name: "江边城外烤鱼",
    cuisine: "烤鱼",
    avgPrice: 98,
    rating: 4.5,
    tags: ["海鲜盛宴", "无辣不欢", "地摊烟火气"],
    indoor: true,
    hasAC: true,
  },
  {
    name: "玻璃花房西餐厅",
    cuisine: "融合西餐",
    avgPrice: 188,
    rating: 4.6,
    tags: ["高颜值出片", "清淡养生", "大口吃肉"],
    indoor: true,
    hasAC: true,
  },
  {
    name: "胡同涮肉坊",
    cuisine: "老北京涮肉",
    avgPrice: 125,
    rating: 4.6,
    tags: ["大口吃肉", "地摊烟火气"],
    indoor: true,
    hasAC: true,
  },
  {
    name: "泰香柠檬鱼",
    cuisine: "东南亚菜",
    avgPrice: 108,
    rating: 4.5,
    tags: ["海鲜盛宴", "无辣不欢", "高颜值出片"],
    indoor: true,
    hasAC: true,
  },
  {
    name: "写字楼便当工坊",
    cuisine: "简餐",
    avgPrice: 35,
    rating: 4.0,
    tags: ["清淡养生", "碳水狂魔"],
    indoor: true,
    hasAC: true,
  },
];

// ----- 工具 -----

type PreferenceRow = {
  budget: string | null;
  dietary_restrictions: unknown;
  taste_likes: unknown;
};

function parseBudgetMid(budget: string | null): number | null {
  if (!budget) return null;
  const m = budget.trim().match(/^(\d+)\s*-\s*(\d+)$/);
  if (m) return (Number(m[1]) + Number(m[2])) / 2;
  const n = Number(budget);
  return Number.isFinite(n) ? n : null;
}

function median(values: number[]): number {
  if (values.length === 0) return 100;
  const s = [...values].sort((a, b) => a - b);
  const i = Math.floor(s.length / 2);
  return s.length % 2 ? s[i]! : (s[i - 1]! + s[i]!) / 2;
}

function normalizeTaste(taste_likes: unknown): {
  likes: string[];
  neutrals: string[];
  dislikes: string[];
} {
  if (!taste_likes || typeof taste_likes !== "object") {
    return { likes: [], neutrals: [], dislikes: [] };
  }
  const o = taste_likes as Record<string, unknown>;
  const arr = (v: unknown) =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string")
      : [];
  return {
    likes: arr(o.likes),
    neutrals: arr(o.neutrals),
    dislikes: arr(o.dislikes),
  };
}

function normalizeRestrictions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((s) => s.trim());
}

function aggregateTasteScores(prefs: PreferenceRow[]): Map<string, number> {
  const scores = new Map<string, number>();
  for (const p of prefs) {
    const t = normalizeTaste(p.taste_likes);
    for (const tag of t.likes) {
      scores.set(tag, (scores.get(tag) ?? 0) + 2);
    }
    for (const tag of t.neutrals) {
      scores.set(tag, (scores.get(tag) ?? 0) + 1);
    }
    for (const tag of t.dislikes) {
      scores.set(tag, (scores.get(tag) ?? 0) - 2);
    }
  }
  return scores;
}

function collectRestrictions(prefs: PreferenceRow[]): string[] {
  const out: string[] = [];
  for (const p of prefs) {
    out.push(...normalizeRestrictions(p.dietary_restrictions));
  }
  return [...new Set(out)];
}

function restaurantViolatesRestriction(
  rest: FakeRestaurant,
  restrictions: string[],
): boolean {
  const blob = `${rest.name}${rest.cuisine}${rest.tags.join("")}`.toLowerCase();
  for (const r of restrictions) {
    const q = r.toLowerCase();
    if (q.length < 2) continue;
    if (blob.includes(q)) return true;
  }
  return false;
}

function budgetWindowFromPrefs(prefs: PreferenceRow[]): {
  lo: number;
  hi: number;
  center: number;
} {
  const mids: number[] = [];
  for (const p of prefs) {
    const m = parseBudgetMid(p.budget);
    if (m != null) mids.push(m);
  }
  if (mids.length === 0) {
    return { center: 100, lo: 70, hi: 130 };
  }
  const center = median(mids);
  return { center, lo: center * 0.7, hi: center * 1.3 };
}

function isWetWeather(w: WeatherSnapshot | null): boolean {
  if (!w) return false;
  const c = w.weatherCode;
  if (c >= 51 && c <= 67) return true;
  if (c >= 80 && c <= 99) return true;
  if (c >= 71 && c <= 77) return true;
  return /雨|雪|雷暴|阵雨/.test(w.description);
}

function isHotWeather(w: WeatherSnapshot | null): boolean {
  return !!w && w.temp_max >= 32;
}

function buildReason(
  rest: FakeRestaurant,
  topPositiveTags: string[],
  budgetCenter: number,
  weather: WeatherSnapshot | null,
): string {
  const hit = rest.tags.filter((t) => topPositiveTags.includes(t));
  const tastePart =
    hit.length > 0
      ? `契合大家偏好的「${hit.slice(0, 2).join("」「")}」标签`
      : "综合口味标签后仍较均衡";

  const budgetPart =
    Math.abs(rest.avgPrice - budgetCenter) <= budgetCenter * 0.25
      ? "人均落在全员预算中位区间附近"
      : "在可接受的预算弹性范围内";

  let weatherPart = "";
  if (weather && isWetWeather(weather)) {
    weatherPart = rest.indoor
      ? "明日有降水可能，室内就餐更省心"
      : "明日可能有降水，建议备选室内店";
  } else if (weather && isHotWeather(weather) && rest.hasAC) {
    weatherPart = "高温天优先有空调环境";
  }

  const parts = [tastePart, budgetPart];
  if (weatherPart) parts.push(weatherPart);
  return `${parts.join("；")}。`;
}

function scoreRestaurant(
  rest: FakeRestaurant,
  tasteScores: Map<string, number>,
  budgetLo: number,
  budgetHi: number,
  budgetCenter: number,
  weather: WeatherSnapshot | null,
): number {
  let s = rest.rating * 18;

  for (const tag of rest.tags) {
    const w = tasteScores.get(tag);
    if (w != null && w > 0) s += w * 6;
    if (w != null && w < 0) s += w * 5;
  }

  if (rest.avgPrice >= budgetLo && rest.avgPrice <= budgetHi) {
    s += 28;
  } else if (rest.avgPrice >= budgetLo * 0.85 && rest.avgPrice <= budgetHi * 1.15) {
    s += 12;
  } else {
    s -= 35;
  }

  const dist = Math.abs(rest.avgPrice - budgetCenter);
  s += Math.max(0, 22 - dist * 0.12);

  if (weather && isWetWeather(weather)) {
    s += rest.indoor ? 22 : -18;
  }
  if (weather && isHotWeather(weather)) {
    s += rest.hasAC ? 14 : -6;
  }

  return s;
}

function toRecommendations(
  prefs: PreferenceRow[],
  weather: WeatherSnapshot | null,
): Recommendation[] {
  const tasteScores = aggregateTasteScores(prefs);
  const topPositiveTags = [...tasteScores.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);

  const restrictions = collectRestrictions(prefs);
  let { lo, hi, center } = budgetWindowFromPrefs(prefs);

  let pool = FAKE_RESTAURANTS.filter(
    (r) => !restaurantViolatesRestriction(r, restrictions),
  );
  if (pool.length < 3) {
    pool = [...FAKE_RESTAURANTS];
  }

  const scored = pool.map((rest) => ({
    rest,
    score: scoreRestaurant(rest, tasteScores, lo, hi, center, weather),
  }));

  let sorted = [...scored].sort((a, b) => b.score - a.score);

  const inBudget = sorted.filter(
    (x) => x.rest.avgPrice >= lo && x.rest.avgPrice <= hi,
  );
  if (inBudget.length >= 3) {
    sorted = inBudget.sort((a, b) => b.score - a.score);
  } else if (sorted.length < 3) {
    sorted = [...scored].sort((a, b) => b.score - a.score);
  }

  const top = sorted.slice(0, 3);
  const maxS = Math.max(...top.map((t) => t.score), 1);

  return top.map((t, i) => {
    const r = t.rest;
    const normalized = t.score / maxS;
    const matchScore = Math.min(
      99,
      Math.round(74 + normalized * 24) - i * 2,
    );
    return {
      name: r.name,
      cuisine: r.cuisine,
      avgPrice: r.avgPrice,
      rating: r.rating,
      tags: [...r.tags],
      reason: buildReason(r, topPositiveTags, center, weather),
      matchScore: Math.max(61, matchScore),
    };
  });
}

/**
 * 纯规则引擎（便于单测 / 预览）
 */
export function runRecommendationEngine(
  prefs: PreferenceRow[],
  weather: WeatherSnapshot | null,
): Recommendation[] {
  if (prefs.length === 0) {
    return FAKE_RESTAURANTS.slice(0, 3).map((r, i) => ({
      name: r.name,
      cuisine: r.cuisine,
      avgPrice: r.avgPrice,
      rating: r.rating,
      tags: [...r.tags],
      reason: "暂无人偏好数据，先给你三个口碑备选。",
      matchScore: 88 - i * 3,
    }));
  }
  return toRecommendations(prefs, weather);
}

/**
 * 1. 读取房间成员偏好与 results 中的天气
 * 2. 规则引擎产出 Top3
 * 3. 写入 results.recommendations，并将 rooms.status 设为 finished
 */
export async function generateRecommendations(
  roomId: string,
): Promise<Recommendation[]> {
  const { data: members, error: memErr } = await supabase
    .from("members")
    .select("id")
    .eq("room_id", roomId);

  if (memErr) throw memErr;

  const memberIds = (members ?? []).map((m) => m.id as string);
  if (memberIds.length === 0) {
    const recs = runRecommendationEngine([], null);
    await persistRecommendationsAndFinish(roomId, recs, null);
    return recs;
  }

  const { data: prefRows, error: prefErr } = await supabase
    .from("preferences")
    .select("budget, dietary_restrictions, taste_likes")
    .in("member_id", memberIds);

  if (prefErr) throw prefErr;

  const prefs = (prefRows ?? []) as PreferenceRow[];

  const { data: latestResult, error: resErr } = await supabase
    .from("results")
    .select("id, weather_info")
    .eq("room_id", roomId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (resErr) throw resErr;

  let weather: WeatherSnapshot | null = null;
  if (latestResult?.weather_info && typeof latestResult.weather_info === "object") {
    const w = latestResult.weather_info as Partial<WeatherSnapshot>;
    if (
      typeof w.temp_max === "number" &&
      typeof w.description === "string" &&
      typeof w.weatherCode === "number"
    ) {
      weather = w as WeatherSnapshot;
    }
  }

  const recs = runRecommendationEngine(prefs, weather);
  await persistRecommendationsAndFinish(roomId, recs, latestResult?.id ?? null);
  return recs;
}

async function persistRecommendationsAndFinish(
  roomId: string,
  recs: Recommendation[],
  latestResultId: string | null,
) {
  if (latestResultId) {
    const { error: uErr } = await supabase
      .from("results")
      .update({ recommendations: recs })
      .eq("id", latestResultId);
    if (uErr) throw uErr;
  } else {
    const { error: iErr } = await supabase.from("results").insert({
      room_id: roomId,
      recommendations: recs,
      weather_info: null,
    });
    if (iErr) throw iErr;
  }

  const { error: rErr } = await supabase
    .from("rooms")
    .update({ status: "finished" })
    .eq("id", roomId);

  if (rErr) throw rErr;
}
