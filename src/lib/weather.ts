/**
 * Open-Meteo 免费预报 API（无需 Key）
 * https://open-meteo.com/
 */

const OPEN_METEO_FORECAST =
  "https://api.open-meteo.com/v1/forecast" as const;

export type WeatherSnapshot = {
  temp_max: number;
  temp_min: number;
  weatherCode: number;
  description: string;
};

type OpenMeteoDaily = {
  time?: string[];
  temperature_2m_max?: (number | null)[];
  temperature_2m_min?: (number | null)[];
  weathercode?: (number | null)[];
};

/** WMO weathercode → 中文（与产品约定区间一致） */
export function weatherCodeToDescription(code: number): string {
  const c = code;
  if (c === 0) return "晴天";
  if (c >= 1 && c <= 3) return "多云";
  if (c >= 45 && c <= 48) return "雾";
  if (c >= 51 && c <= 67) return "雨";
  if (c >= 71 && c <= 77) return "雪";
  if (c >= 80 && c <= 82) return "阵雨";
  if (c >= 95 && c <= 99) return "雷暴";
  return "未知";
}

export function formatWeatherLoadingLine(w: WeatherSnapshot): string {
  const hi = Math.round(w.temp_max);
  return `> 正在获取天气信息... 🌤️ 明日最高 ${hi}°C，${w.description}，适合安排聚餐`;
}

export async function getWeather(
  lat: number,
  lng: number,
): Promise<WeatherSnapshot> {
  const url = new URL(OPEN_METEO_FORECAST);
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set(
    "daily",
    "temperature_2m_max,temperature_2m_min,weathercode",
  );
  url.searchParams.set("timezone", "Asia/Shanghai");
  url.searchParams.set("forecast_days", "1");

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Open-Meteo 请求失败：HTTP ${res.status}`);
  }

  const body = (await res.json()) as { daily?: OpenMeteoDaily };
  const d = body.daily;
  const tmax = d?.temperature_2m_max?.[0];
  const tmin = d?.temperature_2m_min?.[0];
  const wc = d?.weathercode?.[0];

  if (tmax == null || tmin == null || wc == null) {
    throw new Error("Open-Meteo 返回的日预报数据不完整");
  }

  const weatherCode = Math.round(Number(wc));
  return {
    temp_max: Number(tmax),
    temp_min: Number(tmin),
    weatherCode,
    description: weatherCodeToDescription(weatherCode),
  };
}
