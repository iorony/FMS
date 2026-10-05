import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

const GUATEMALA_CITY = { latitude: 14.6349, longitude: -90.5069 };
const CACHE_TIME_MS = 24 * 60 * 60 * 1000;
const PUBLIC_LOOKUP_INTERVAL_MS = 1_100;

type PlaceResult = {
  id: string; label: string; address: string; latitude: number; longitude: number;
  source: "Sitio guardado" | "OpenStreetMap";
};

const cache = new Map<string, { expiresAt: number; results: PlaceResult[] }>();
let lastPublicLookupAt = 0;

function cleanForLike(value: string) { return value.replace(/[,%()]/g, " ").trim(); }
function cleanForRegex(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function unique(results: PlaceResult[]) {
  const seen = new Set<string>();
  return results.filter((result) => {
    const key = `${result.latitude.toFixed(5)},${result.longitude.toFixed(5)}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0, 8);
}

async function getInternalPlaces(supabase: Awaited<ReturnType<typeof createClient>>, term: string): Promise<PlaceResult[]> {
  const pattern = `%${cleanForLike(term)}%`;
  const [{ data: matchingClients }, { data: byAddress }] = await Promise.all([
    supabase.from("clients").select("id").ilike("name", pattern).limit(8),
    supabase
    .from("work_orders")
    .select("id,address,site_latitude,site_longitude,clients(name)")
    .not("site_latitude", "is", null).not("site_longitude", "is", null)
    .ilike("address", pattern).order("created_at", { ascending: false }).limit(8),
  ]);
  const clientIds = (matchingClients ?? []).map((client) => client.id);
  const { data: byClient } = clientIds.length
    ? await supabase.from("work_orders").select("id,address,site_latitude,site_longitude,clients(name)").not("site_latitude", "is", null).not("site_longitude", "is", null).in("client_id", clientIds).order("created_at", { ascending: false }).limit(8)
    : { data: [] };
  const results: PlaceResult[] = [];
  for (const order of [...(byAddress ?? []), ...(byClient ?? [])]) {
    const latitude = Number(order.site_latitude); const longitude = Number(order.site_longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    const client = Array.isArray(order.clients) ? order.clients[0] : order.clients;
    results.push({ id: `saved-${order.id}`, label: client?.name ?? "Sitio usado anteriormente", address: order.address, latitude, longitude, source: "Sitio guardado" });
  }
  return unique(results);
}

function canUsePublicSearch() {
  if (Date.now() - lastPublicLookupAt < PUBLIC_LOOKUP_INTERVAL_MS) return false;
  lastPublicLookupAt = Date.now(); return true;
}

async function searchOpenStreetMap(term: string): Promise<PlaceResult[]> {
  if (!canUsePublicSearch()) return [];
  const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&countrycodes=gt&q=${encodeURIComponent(`${term}, Guatemala`)}`, {
    headers: { Accept: "application/json", "User-Agent": "PlusServiceGT/1.0 (site-location-search)" }, next: { revalidate: 86_400 },
  });
  if (!response.ok) return [];
  const found = await response.json() as { place_id: number; display_name: string; lat: string; lon: string }[];
  return found.flatMap((item) => {
    const latitude = Number(item.lat); const longitude = Number(item.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
    return [{ id: `osm-${item.place_id}`, label: item.display_name.split(",")[0] ?? "Lugar", address: item.display_name, latitude, longitude, source: "OpenStreetMap" as const }];
  });
}

async function searchOpenStreetMapBusinesses(term: string): Promise<PlaceResult[]> {
  if (!canUsePublicSearch()) return [];
  const query = `[out:json][timeout:12];nwr["name"~"${cleanForRegex(term)}",i](around:30000,${GUATEMALA_CITY.latitude},${GUATEMALA_CITY.longitude});out center 8;`;
  const response = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "PlusServiceGT/1.0 (site-location-search)" },
    body: `data=${encodeURIComponent(query)}`, next: { revalidate: 86_400 },
  });
  if (!response.ok) return [];
  const payload = await response.json() as { elements?: { id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: { name?: string; "addr:street"?: string; "addr:city"?: string } }[] };
  return (payload.elements ?? []).flatMap((item) => {
    const latitude = item.lat ?? item.center?.lat; const longitude = item.lon ?? item.center?.lon;
    if (typeof latitude !== "number" || typeof longitude !== "number") return [];
    return [{ id: `osm-business-${item.id}`, label: item.tags?.name ?? term, address: [item.tags?.["addr:street"], item.tags?.["addr:city"], "Guatemala"].filter(Boolean).join(", "), latitude, longitude, source: "OpenStreetMap" as const }];
  });
}

export async function GET(request: NextRequest) {
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const cookieClient = await createClient();
  const tokenClient = bearer
    ? createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { global: { headers: { Authorization: `Bearer ${bearer}` } } })
    : null;
  const { data: { user } } = bearer ? await tokenClient!.auth.getUser() : await cookieClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  // La app nativa no envía cookies. Conservamos el JWT en el cliente de datos
  // para que los sitios guardados respeten las mismas políticas RLS que la web.
  const supabase = tokenClient ?? cookieClient;
  const term = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (term.length < 3 || term.length > 80) return NextResponse.json({ results: [] });
  const key = term.toLocaleLowerCase("es-GT"); const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return NextResponse.json({ results: cached.results, cached: true });
  const internal = await getInternalPlaces(supabase, term);
  let external = await searchOpenStreetMap(term);
  if (!external.length) external = await searchOpenStreetMapBusinesses(term);
  const results = unique([...internal, ...external]);
  cache.set(key, { expiresAt: Date.now() + CACHE_TIME_MS, results });
  return NextResponse.json({ results, cached: false });
}
