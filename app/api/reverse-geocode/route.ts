import { NextRequest, NextResponse } from "next/server";
import { LOCATION_ADDRESS_FALLBACK } from "@/src/lib/locationLabels";

const UA =
  "SuibianJu/1.0 (+https://github.com/suibian-ju; contact: app reverse geocode)";

type NominatimAddr = Record<string, string | undefined>;

function buildReadableAddress(
  displayName: string | undefined,
  addr: NominatimAddr | undefined,
): string {
  const trimmed = displayName?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  if (trimmed.length > 0) {
    return trimmed.slice(0, 5).join(" · ");
  }

  if (addr && typeof addr === "object") {
    const parts = [
      addr.amenity,
      addr.building,
      addr.road,
      addr.neighbourhood,
      addr.suburb,
      addr.quarter,
      addr.city_district,
      addr.district,
      addr.city,
      addr.town,
      addr.village,
      addr.county,
      addr.state,
      addr.region,
      addr.country,
    ].filter((x): x is string => typeof x === "string" && x.length > 0);

    const seen = new Set<string>();
    const unique: string[] = [];
    for (const p of parts) {
      if (!seen.has(p)) {
        seen.add(p);
        unique.push(p);
      }
      if (unique.length >= 5) break;
    }
    if (unique.length > 0) return unique.join(" · ");
  }

  return LOCATION_ADDRESS_FALLBACK;
}

export async function GET(req: NextRequest) {
  const lat = req.nextUrl.searchParams.get("lat");
  const lon = req.nextUrl.searchParams.get("lon");
  if (!lat || !lon) {
    return NextResponse.json({ error: "missing lat or lon" }, { status: 400 });
  }

  const latN = Number(lat);
  const lonN = Number(lon);
  if (!Number.isFinite(latN) || !Number.isFinite(lonN)) {
    return NextResponse.json({ error: "invalid coordinates" }, { status: 400 });
  }

  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("lat", String(latN));
  url.searchParams.set("lon", String(lonN));
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("accept-language", "zh");

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url.toString(), {
      headers: { "User-Agent": UA },
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(t);

    if (!res.ok) {
      return NextResponse.json({ address: LOCATION_ADDRESS_FALLBACK }, { status: 200 });
    }

    const data = (await res.json()) as {
      display_name?: string;
      address?: NominatimAddr;
    };

    const address = buildReadableAddress(data.display_name, data.address);

    return NextResponse.json({ address });
  } catch {
    clearTimeout(t);
    return NextResponse.json({ address: LOCATION_ADDRESS_FALLBACK });
  }
}
