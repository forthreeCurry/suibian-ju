/** 高德逆地理编码代理 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = searchParams.get("lat");
  const lon = searchParams.get("lon");

  if (!lat || !lon) {
    return Response.json({ error: "缺少 lat/lon 参数" }, { status: 400 });
  }

  const key = process.env.GAODE_API_KEY;
  if (!key) {
    return Response.json({ address: `${Number(lat).toFixed(4)}, ${Number(lon).toFixed(4)}` });
  }

  const url = `https://restapi.amap.com/v3/geocode/regeo?key=${key}&location=${lon},${lat}`;

  try {
    const res = await fetch(url);
    const text = await res.text();

    const debug = searchParams.get("debug");
    if (debug === "1") {
      return Response.json({ raw: text.substring(0, 1000), url: url.substring(0, 150) });
    }

    const data = JSON.parse(text);

    const formatted = data?.regeocode?.formatted_address;
    if (formatted && typeof formatted === "string" && formatted.length > 0) {
      // "地图上所选位置" 是 Gaode 的通用占位，尝试用组件拼
      if (formatted.includes("地图上所选位置")) {
        const c = data.regeocode?.addressComponent || {};
        const parts = [c.province, c.city, c.district, c.township, c.streetNumber?.street].filter(Boolean);
        if (parts.length > 0) {
          return Response.json({ address: parts.join("") });
        }
      }
      return Response.json({ address: formatted });
    }

    return Response.json({ address: `${Number(lat).toFixed(4)}, ${Number(lon).toFixed(4)}` });
  } catch {
    return Response.json({ address: `${Number(lat).toFixed(4)}, ${Number(lon).toFixed(4)}` });
  }
}
