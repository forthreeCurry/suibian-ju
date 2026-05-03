/** 三重降级定位服务：GPS → 网络定位 → IP 定位。 */

export interface LocationResult {
  latitude: number;
  longitude: number;
  accuracy: number;
  address?: string;
  timestamp: number;
  source: "gps" | "network" | "wifi" | "ip";
}

const GPS_TIMEOUT_MS = 8000;
const NETWORK_TIMEOUT_MS = 5000;
const HIGH_ACCURACY_THRESHOLD = 50; // < 50m 视为高精度

function getCurrentPosition(options?: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("浏览器不支持定位"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: GPS_TIMEOUT_MS,
      maximumAge: 300_000, // 5 分钟缓存
      ...options,
    });
  });
}

function classifySource(accuracy: number): LocationResult["source"] {
  if (accuracy <= 0) return "network";
  if (accuracy < HIGH_ACCURACY_THRESHOLD) return "gps";
  return "network";
}

async function tryGps(): Promise<LocationResult | null> {
  try {
    const pos = await getCurrentPosition({
      enableHighAccuracy: true,
      timeout: GPS_TIMEOUT_MS,
    });
    const { latitude, longitude, accuracy } = pos.coords;
    return {
      latitude,
      longitude,
      accuracy,
      timestamp: Date.now(),
      source: classifySource(accuracy),
    };
  } catch {
    return null;
  }
}

async function tryNetwork(): Promise<LocationResult | null> {
  try {
    const pos = await getCurrentPosition({
      enableHighAccuracy: false,
      timeout: NETWORK_TIMEOUT_MS,
    });
    const { latitude, longitude, accuracy } = pos.coords;
    return {
      latitude,
      longitude,
      accuracy,
      timestamp: Date.now(),
      source: classifySource(accuracy),
    };
  } catch {
    return null;
  }
}

async function tryIPLocation(): Promise<LocationResult | null> {
  try {
    const res = await fetch("/api/ip-locate");
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.latitude || !data.longitude) return null;
    return {
      latitude: Number(data.latitude),
      longitude: Number(data.longitude),
      accuracy: Number(data.accuracy ?? 5000),
      address: data.city || undefined,
      timestamp: Date.now(),
      source: "ip",
    };
  } catch {
    return null;
  }
}

/** 智能定位：GPS → 网络 → IP 逐级降级。 */
export async function smartLocate(): Promise<LocationResult> {
  const gps = await tryGps();
  if (gps) return gps;

  const net = await tryNetwork();
  if (net) return net;

  const ip = await tryIPLocation();
  if (ip) return ip;

  throw new Error("无法获取位置信息，请检查定位权限或网络连接后重试");
}

/** 逆地理编码：先尝试已有的 Nominatim API Route，失败则返回经纬度字符串。 */
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(`/api/reverse-geocode?lat=${lat}&lon=${lng}`);
    if (!res.ok) throw new Error("逆地理请求失败");
    const data = await res.json();
    return data.address || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  } catch {
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
}

let watchId: number | null = null;

/** 持续定位。 */
export function watchLocation(
  callback: (result: LocationResult) => void,
  onError?: (err: GeolocationPositionError) => void,
): number {
  if (!navigator.geolocation) {
    onError?.({
      code: 2,
      message: "浏览器不支持定位",
      PERMISSION_DENIED: 1,
      POSITION_UNAVAILABLE: 2,
      TIMEOUT: 3,
    } as GeolocationPositionError & { code: number });
    return -1;
  }
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      callback({
        latitude,
        longitude,
        accuracy,
        timestamp: Date.now(),
        source: classifySource(accuracy),
      });
    },
    (err) => onError?.(err),
    { enableHighAccuracy: true, maximumAge: 60_000 },
  );
  return watchId;
}

export function clearLocationWatch(): void {
  if (watchId != null && navigator.geolocation) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
}
