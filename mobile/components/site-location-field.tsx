import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import * as Location from "expo-location";
import { WebView } from "react-native-webview";
import { supabase } from "../lib/supabase";
import { errorMessage } from "../lib/format";
import { C } from "../theme";
import { Button, Input } from "./ui";

type SearchResult = { id: string; label: string; address: string; latitude: number; longitude: number; source: "Sitio guardado" | "OpenStreetMap" };
type Props = { address: string; latitude: number | null; longitude: number | null; onChange: (latitude: number | null, longitude: number | null) => void; onError: (message: string) => void };
const GUATEMALA_CENTER = { latitude: 14.6349, longitude: -90.5069 };

function mapHtml(latitude: number | null, longitude: number | null) {
  const lat = Number.isFinite(latitude) ? latitude : GUATEMALA_CENTER.latitude;
  const lng = Number.isFinite(longitude) ? longitude : GUATEMALA_CENTER.longitude;
  const zoom = latitude !== null && longitude !== null ? 16 : 12;
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"><style>html,body,#map{height:100%;margin:0} .leaflet-control-attribution{font-size:9px}</style></head><body><div id="map"></div><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script><script>const map=L.map('map').setView([${lat},${lng}],${zoom});L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);let marker=${latitude !== null && longitude !== null ? `L.marker([${lat},${lng}]).addTo(map)` : "null"};map.on('click',e=>{if(marker)marker.setLatLng(e.latlng);else marker=L.marker(e.latlng).addTo(map);window.ReactNativeWebView.postMessage(JSON.stringify({latitude:e.latlng.lat,longitude:e.latlng.lng}));});</script></body></html>`;
}

/** Equivalente móvil del selector web: empresas/sitios guardados, GPS y punto manual en mapa. */
export function SiteLocationField({ address, latitude, longitude, onChange, onError }: Props) {
  const [query, setQuery] = useState(""); const [results, setResults] = useState<SearchResult[]>([]); const [searching, setSearching] = useState(false); const [mapOpen, setMapOpen] = useState(false);
  async function useCurrentLocation() { try { const permission = await Location.requestForegroundPermissionsAsync(); if (!permission.granted) throw new Error("Autoriza la ubicación para guardar el punto planificado del sitio."); const point = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }); onChange(Number(point.coords.latitude.toFixed(6)), Number(point.coords.longitude.toFixed(6))); } catch (error) { onError(errorMessage(error, "No fue posible obtener la ubicación actual.")); } }
  async function searchPlace() {
    const term = (query.trim() || address.trim());
    if (term.length < 3) return onError("Escribe el nombre de la empresa, una dirección o un punto de referencia.");
    const url = process.env.EXPO_PUBLIC_WEB_APP_URL;
    if (!url) return onError("Falta configurar EXPO_PUBLIC_WEB_APP_URL para buscar empresas.");
    setSearching(true); setResults([]);
    try {
      const { data } = await supabase.auth.getSession();
      const response = await fetch(`${url}/api/places/search?q=${encodeURIComponent(term)}`, { headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` } });
      const payload = await response.json() as { results?: SearchResult[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "No fue posible buscar la ubicación.");
      setResults(payload.results ?? []);
      if (!(payload.results ?? []).length) onError("No encontramos la empresa. Prueba con nombre, zona o municipio; también puedes elegir el punto en el mapa.");
    } catch (error) { onError(errorMessage(error, "No fue posible buscar la ubicación.")); } finally { setSearching(false); }
  }
  const hasPoint = latitude !== null && longitude !== null;
  return <View style={styles.wrap}>
    <Text style={styles.help}>Busca una empresa, dirección o sitio usado anteriormente. El punto es opcional y no registra el GPS de trabajo.</Text>
    <Input value={query} onChangeText={setQuery} placeholder={address.trim() ? "Buscar empresa o usar dirección escrita" : "Buscar empresa, dirección o referencia"} maxLength={120} />
    <View style={styles.actions}><View style={styles.action}><Button title={searching ? "Buscando…" : "Buscar"} variant="secondary" busy={searching} onPress={searchPlace} /></View><View style={styles.action}><Button title="Mi ubicación" variant="secondary" onPress={useCurrentLocation} /></View></View>
    {results.map((result) => <Pressable key={result.id} onPress={() => { onChange(Number(result.latitude.toFixed(6)), Number(result.longitude.toFixed(6))); setQuery(result.label); setResults([]); }} style={styles.result}><Text style={styles.resultTitle}>{result.label}</Text><Text style={styles.resultMeta}>{result.address} · {result.source}</Text></Pressable>)}
    <Button title="Elegir punto en mapa" variant="secondary" onPress={() => setMapOpen(true)} />
    <Text style={styles.point}>{hasPoint ? `${latitude.toFixed(6)}, ${longitude.toFixed(6)}` : "Sin punto seleccionado"}</Text>
    {hasPoint && <Pressable onPress={() => onChange(null, null)} accessibilityRole="button"><Text style={styles.clear}>Quitar punto</Text></Pressable>}
    <Modal visible={mapOpen} animationType="slide" onRequestClose={() => setMapOpen(false)}><View style={styles.mapScreen}><View style={styles.mapHead}><View style={{ flex: 1 }}><Text style={styles.mapTitle}>Selecciona el punto del sitio</Text><Text style={styles.mapLead}>Toca el mapa para mover el marcador.</Text></View><Pressable onPress={() => setMapOpen(false)} hitSlop={12}><Text style={styles.close}>Cerrar</Text></Pressable></View><WebView originWhitelist={["*"]} source={{ html: mapHtml(latitude, longitude) }} onMessage={(event) => { try { const point = JSON.parse(event.nativeEvent.data) as { latitude: number; longitude: number }; if (Number.isFinite(point.latitude) && Number.isFinite(point.longitude)) onChange(Number(point.latitude.toFixed(6)), Number(point.longitude.toFixed(6))); } catch { onError("No fue posible leer el punto seleccionado."); } }} /><View style={styles.mapFoot}><Text style={styles.point}>{hasPoint ? `${latitude.toFixed(6)}, ${longitude.toFixed(6)}` : "Toca un punto en el mapa"}</Text><Button title="Confirmar ubicación" onPress={() => setMapOpen(false)} /></View></View></Modal>
  </View>;
}

const styles = StyleSheet.create({ wrap: { gap: 9, padding: 12, borderWidth: 1, borderColor: C.line, borderRadius: 12, backgroundColor: C.surface2 }, help: { color: C.muted, fontSize: 12.5, lineHeight: 17 }, actions: { flexDirection: "row", gap: 8 }, action: { flex: 1 }, result: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 9, padding: 10 }, resultTitle: { color: C.ink, fontSize: 13.5, fontWeight: "800" }, resultMeta: { color: C.muted, fontSize: 11.5, lineHeight: 16, marginTop: 2 }, point: { color: C.inkSoft, fontSize: 12.5, fontVariant: ["tabular-nums"] }, clear: { color: C.action, fontSize: 12.5, fontWeight: "800" }, mapScreen: { flex: 1, backgroundColor: C.paper }, mapHead: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderBottomWidth: 1, borderBottomColor: C.line }, mapTitle: { color: C.ink, fontSize: 17, fontWeight: "800" }, mapLead: { color: C.muted, fontSize: 12.5, marginTop: 2 }, close: { color: C.action, fontSize: 14, fontWeight: "800" }, mapFoot: { gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: C.line } });
