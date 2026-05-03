/** 高德 IP 定位 API 代理（避免前端暴露 GAODE_API_KEY）。 */

import { NextResponse } from "next/server";

const GAODE_IP_URL = "https://restapi.amap.com/v3/ip";

export async function GET(): Promise<NextResponse> {
  const key = process.env.GAODE_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "GAODE_API_KEY not configured" }, { status: 503 });
  }

  const url = `${GAODE_IP_URL}?key=${encodeURIComponent(key)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
    clearTimeout(timer);

    if (!res.ok) {
      return NextResponse.json({ error: "IP locate upstream error" }, { status: 502 });
    }

    const data = (await res.json()) as Record<string, unknown>;
    const status = String(data.status ?? "");
    if (status !== "1") {
      return NextResponse.json({ error: "IP locate failed" }, { status: 502 });
    }

    const rect = String(data.rectangle ?? "");
    let latitude = 0;
    let longitude = 0;
    if (rect.includes(";")) {
      const [lo, hi] = rect.split(";", 2);
      const [lng1, lat1] = lo.split(",").map(Number);
      const [lng2, lat2] = hi.split(",").map(Number);
      latitude = (lat1 + lat2) / 2;
      longitude = (lng1 + lng2) / 2;
    }

    return NextResponse.json({
      latitude,
      longitude,
      city: data.city ?? data.province ?? "",
      accuracy: 5000,
    });
  } catch {
    clearTimeout(timer);
    return NextResponse.json({ error: "IP locate timeout" }, { status: 504 });
  }
}
