/** localStorage 定位缓存（30 分钟 TTL）。 */

import type { LocationResult } from "@/src/lib/location-service";

const CACHE_KEY = "suibianju_location";
const TTL_MS = 30 * 60 * 1000; // 30 分钟
const BG_REFRESH_MS = 20 * 60 * 1000; // 20 分钟后后台刷新

interface CacheEntry {
  result: LocationResult;
  storedAt: number;
}

export function getCachedLocation(): LocationResult | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.storedAt > TTL_MS) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    return entry.result;
  } catch {
    return null;
  }
}

export function setCachedLocation(result: LocationResult): void {
  try {
    const entry: CacheEntry = { result, storedAt: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    // localStorage 不可用（隐私模式等），静默忽略
  }
}

/** 缓存是否已过期且可后台刷新。 */
export function needsBackgroundRefresh(): boolean {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return false;
    const entry: CacheEntry = JSON.parse(raw);
    return Date.now() - entry.storedAt > BG_REFRESH_MS;
  } catch {
    return false;
  }
}
