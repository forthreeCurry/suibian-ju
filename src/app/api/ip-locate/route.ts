/** 高德 IP 定位代理（前端无法直接调用，Key 不能暴露） */
export async function GET() {
  const key = process.env.GAODE_API_KEY;
  if (!key) {
    return Response.json({ error: "GAODE_API_KEY 未配置" }, { status: 500 });
  }

  try {
    const url = `https://restapi.amap.com/v3/ip?key=${key}`;
    const res = await fetch(url, { next: { revalidate: 0 } });
    const data = await res.json();

    if (data.status !== "1") {
      return Response.json({ error: data.info || "IP 定位失败" }, { status: 502 });
    }

    // 高德 IP 返回矩形区域，取中心点
    const rectangle = (data.rectangle as string).split(";").map((p) => {
      const [lng, lat] = p.split(",").map(Number);
      return { lat, lng };
    });

    const lat = (rectangle[0].lat + rectangle[1].lat) / 2;
    const lng = (rectangle[0].lng + rectangle[1].lng) / 2;

    return Response.json({
      latitude: lat,
      longitude: lng,
      city: data.city || undefined,
      province: data.province || undefined,
      accuracy: 5000,
    });
  } catch {
    return Response.json({ error: "IP 定位服务异常" }, { status: 502 });
  }
}
