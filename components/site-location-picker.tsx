"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type LeafletMap = { setView: (center: [number, number], zoom: number) => LeafletMap; on: (event: string, callback: (event: { latlng: { lat: number; lng: number } }) => void) => LeafletMap; remove: () => void };
type LeafletMarker = { setLatLng: (point: [number, number]) => LeafletMarker; addTo: (map: LeafletMap) => LeafletMarker };
type Leaflet = { map: (element: HTMLElement) => LeafletMap; tileLayer: (url: string, options: object) => { addTo: (map: LeafletMap) => unknown }; marker: (point: [number, number]) => LeafletMarker };
type SearchResult = { id: string; label: string; address: string; latitude: number; longitude: number; source: "Sitio guardado" | "Google Maps" | "OpenStreetMap" };

declare global { interface Window { L?: Leaflet } }

const GUATEMALA_CENTER: [number, number] = [14.6349, -90.5069];

function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  return new Promise<Leaflet>((resolve, reject) => {
    const stylesheetId = "leaflet-styles";
    if (!document.getElementById(stylesheetId)) {
      const stylesheet = document.createElement("link");
      stylesheet.id = stylesheetId; stylesheet.rel = "stylesheet";
      stylesheet.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(stylesheet);
    }
    const existing = document.getElementById("leaflet-script") as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => window.L ? resolve(window.L) : reject(new Error("No se pudo iniciar el mapa.")), { once: true });
      existing.addEventListener("error", () => reject(new Error("No se pudo cargar el mapa.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.id = "leaflet-script"; script.async = true;
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => window.L ? resolve(window.L) : reject(new Error("No se pudo iniciar el mapa."));
    script.onerror = () => reject(new Error("No se pudo cargar el mapa."));
    document.head.appendChild(script);
  });
}

export function SiteLocationPicker({ latitude, longitude, onChange }: { latitude: number | null; longitude: number | null; onChange: (latitude: number | null, longitude: number | null) => void }) {
  const elementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<LeafletMarker | null>(null);
  const leafletRef = useRef<Leaflet | null>(null);
  const coordinatesRef = useRef({ latitude, longitude });
  const [mapError, setMapError] = useState("");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState("");

  useEffect(() => { coordinatesRef.current = { latitude, longitude }; }, [latitude, longitude]);

  const setPoint = useCallback((nextLatitude: number, nextLongitude: number, center = true) => {
    const lat = Number(nextLatitude.toFixed(6)); const lng = Number(nextLongitude.toFixed(6));
    onChange(lat, lng);
    if (leafletRef.current && mapRef.current) {
      const point: [number, number] = [lat, lng];
      if (markerRef.current) markerRef.current.setLatLng(point);
      else markerRef.current = leafletRef.current.marker(point).addTo(mapRef.current);
      if (center) mapRef.current.setView(point, 16);
    }
  }, [onChange]);

  useEffect(() => {
    let active = true;
    loadLeaflet().then((leaflet) => {
      if (!active || !elementRef.current) return;
      leafletRef.current = leaflet;
      const coordinates = coordinatesRef.current;
      const initial: [number, number] = coordinates.latitude !== null && coordinates.longitude !== null ? [coordinates.latitude, coordinates.longitude] : GUATEMALA_CENTER;
      const map = leaflet.map(elementRef.current).setView(initial, coordinates.latitude !== null && coordinates.longitude !== null ? 16 : 12);
      mapRef.current = map;
      leaflet.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
      if (coordinates.latitude !== null && coordinates.longitude !== null) markerRef.current = leaflet.marker(initial).addTo(map);
      map.on("click", (event) => setPoint(event.latlng.lat, event.latlng.lng, false));
    }).catch(() => active && setMapError("No fue posible cargar el mapa. Inténtalo nuevamente."));
    return () => { active = false; mapRef.current?.remove(); mapRef.current = null; markerRef.current = null; };
    // El mapa se inicializa una vez; los cambios posteriores se aplican abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (latitude === null || longitude === null || !leafletRef.current || !mapRef.current) return;
    const point: [number, number] = [latitude, longitude];
    if (markerRef.current) markerRef.current.setLatLng(point);
    else markerRef.current = leafletRef.current.marker(point).addTo(mapRef.current);
  }, [latitude, longitude]);

  function useCurrentLocation() {
    if (!navigator.geolocation) return setMapError("Este dispositivo no permite obtener la ubicación actual.");
    navigator.geolocation.getCurrentPosition(
      (position) => setPoint(position.coords.latitude, position.coords.longitude),
      () => setMapError("No fue posible obtener la ubicación actual. Selecciona el punto directamente en el mapa."),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }

  async function searchPlace() {
    const term = search.trim();
    if (term.length < 3) { setSearchMessage("Escribe al menos 3 caracteres para buscar."); return; }
    setSearching(true); setSearchMessage(""); setResults([]);
    try {
      const response = await fetch(`/api/places/search?q=${encodeURIComponent(term)}`);
      if (!response.ok) throw new Error("No fue posible buscar la ubicación.");
      const payload = await response.json() as { results?: SearchResult[] };
      const mapped = payload.results ?? [];
      setResults(mapped);
      if (!mapped.length) setSearchMessage("No encontramos la empresa. Prueba con nombre, zona o municipio; también puedes marcar el punto en el mapa.");
    } catch {
      setSearchMessage("No fue posible buscar ahora. Puedes seleccionar el punto directamente en el mapa.");
    } finally { setSearching(false); }
  }

  const hasPoint = latitude !== null && longitude !== null;
  return <div className="site-picker">
    <div className="site-picker-head"><div><strong>Punto de ubicación <em>Opcional</em></strong><span>Busca una empresa, dirección o sitio usado anteriormente; también puedes elegir el punto exacto en el mapa.</span></div><button className="btn ghost small" type="button" onClick={useCurrentLocation}>Usar mi ubicación</button></div>
    <div className="site-search"><input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); searchPlace(); } }} placeholder="Buscar dirección, negocio o punto de referencia" aria-label="Buscar ubicación" /><button className="btn ghost small" type="button" onClick={searchPlace} disabled={searching}>{searching ? "Buscando…" : "Buscar"}</button></div>
    {(results.length > 0 || searchMessage) && <div className="site-results" role="status">{searchMessage && <span className="help">{searchMessage}</span>}{results.map((result) => <button key={result.id} type="button" onClick={() => { setPoint(result.latitude, result.longitude); setSearch(result.label); setResults([]); setSearchMessage(""); }}><strong>{result.label}</strong><span>{result.address} · {result.source}</span></button>)}</div>}
    <div className="site-map" ref={elementRef} aria-label="Mapa para seleccionar la ubicación de la orden" />
    {mapError && <p className="help" role="alert">{mapError}</p>}
    <div className="site-picker-foot"><span>{hasPoint ? `${latitude.toFixed(6)}, ${longitude.toFixed(6)}` : "Sin punto seleccionado"}</span>{hasPoint && <span className="site-navigation-actions"><a className="btn quiet" href={`https://www.waze.com/ul?ll=${latitude}%2C${longitude}&navigate=yes`} target="_blank" rel="noreferrer">Waze ↗</a><a className="btn quiet" href={`https://www.google.com/maps/dir/?api=1&destination=${latitude}%2C${longitude}`} target="_blank" rel="noreferrer">Google Maps ↗</a><button className="btn quiet" type="button" onClick={() => onChange(null, null)}>Quitar punto</button></span>}</div>
  </div>;
}
