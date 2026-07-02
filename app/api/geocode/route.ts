import { NextRequest, NextResponse } from "next/server";
import { cfEnv } from "@/lib/server";
import { verifyUploadCookie } from "@/lib/tokens";
import { parseLat, parseLng } from "@/lib/metadata";

export const dynamic = "force-dynamic";

// Reverse-geocode a photo's GPS to a *suggested* city for the upload form.
// Gated behind the upload capability cookie so it can't be abused as an open
// geocoding proxy. Results are cached per isolate on coarse coordinates to stay
// well within OpenStreetMap Nominatim's usage policy (≈1 req/s, attribution).

const cache = new Map<string, string | null>();

function pickCity(addr: Record<string, unknown>): string | null {
  const order = ["city", "town", "village", "municipality", "county", "state"];
  for (const key of order) {
    const v = addr[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

export async function GET(req: NextRequest) {
  const env = cfEnv();
  if (!(await verifyUploadCookie(req.cookies.get("pa_upload")?.value, env.AUTH_SECRET))) {
    return NextResponse.json({ error: "not_authorized" }, { status: 403 });
  }

  const lat = parseLat(req.nextUrl.searchParams.get("lat"));
  const lng = parseLng(req.nextUrl.searchParams.get("lng"));
  if (lat === null || lng === null) {
    return NextResponse.json({ error: "bad_coords" }, { status: 400 });
  }

  // ~1km granularity keeps nearby photos on the same cache entry.
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  if (cache.has(key)) {
    return NextResponse.json({ city: cache.get(key) });
  }

  const url =
    `https://nominatim.openstreetmap.org/reverse?format=json` +
    `&lat=${lat}&lon=${lng}&zoom=10&addressdetails=1&accept-language=de`;

  let city: string | null = null;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "PartyHalle/1.0 (photo party app)" },
    });
    if (res.ok) {
      const data = (await res.json()) as { address?: Record<string, unknown> };
      city = data.address ? pickCity(data.address) : null;
    }
  } catch {
    // Suggestion is best-effort; the uploader can always type the city.
    return NextResponse.json({ city: null });
  }

  cache.set(key, city);
  return NextResponse.json({ city });
}
