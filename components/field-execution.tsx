"use client";

import { ChangeEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

type Location = { id: string; record_type: "inicio" | "cierre"; latitude: number; longitude: number; accuracy_meters: number | null; captured_at: string };
type Evidence = { id: string; storage_path: string; suggested_category: string | null; final_category: string | null; review_status: string; confidence: number | null; created_at: string };
type Consumption = { id: string; quantity: number; unit: string; note: string | null; materials: { name: string; sku: string } | { name: string; sku: string }[] | null };
type Material = { id: string; name: string; sku: string; unit: string };
type Props = { orderId: string; status: string; canExecute: boolean; locations: Location[]; evidences: Evidence[]; consumptions: Consumption[]; materials: Material[] };

const categoryOptions = ["Cableado", "Rack o gabinete", "Punto de red", "Canalización", "Equipo instalado", "Área de trabajo", "Otro"];
const locationLabel: Record<string, string> = { inicio: "Inicio", cierre: "Cierre" };

function getPosition() {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Este dispositivo no admite geolocalización."));
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  });
}

function errorMessage(error: unknown) {
  if (error instanceof GeolocationPositionError) {
    if (error.code === error.PERMISSION_DENIED) return "Debes autorizar la ubicación para registrar la presencia en sitio.";
    if (error.code === error.TIMEOUT) return "La ubicación tardó demasiado. Verifica la señal GPS e inténtalo de nuevo.";
  }
  return error instanceof Error ? error.message : "No fue posible completar la operación.";
}

export function FieldExecution({ orderId, status, canExecute, locations, evidences, consumptions, materials }: Props) {
  const router = useRouter();
  const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false); const [selectedMaterial, setSelectedMaterial] = useState("");
  const hasStart = locations.some((item) => item.record_type === "inicio");
  const hasEnd = locations.some((item) => item.record_type === "cierre");
  const activeMaterial = useMemo(() => materials.find((material) => material.id === selectedMaterial), [materials, selectedMaterial]);
  const note = (text: string) => { setMessage(text); window.setTimeout(() => setMessage(""), 5000); };
  const refresh = () => { router.refresh(); };

  async function recordLocation(recordType: "inicio" | "cierre") {
    setBusy(true); setMessage("");
    try {
      const position = await getPosition(); const supabase = createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) throw new Error("Tu sesión expiró. Inicia sesión nuevamente.");
      const { error: insertError } = await supabase.from("location_records").insert({ work_order_id: orderId, record_type: recordType, latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy_meters: position.coords.accuracy, captured_by: user.id });
      if (insertError) throw new Error(insertError.message);
      const nextStatus = recordType === "inicio" ? "en_proceso" : "pendiente_de_cierre";
      const { error: transitionError } = await supabase.rpc("transition_work_order", { order_id: orderId, next_status: nextStatus, transition_note: `Ubicación de ${locationLabel[recordType].toLowerCase()} registrada desde campo.` });
      if (transitionError) throw new Error(transitionError.message);
      note(`Ubicación de ${locationLabel[recordType].toLowerCase()} registrada correctamente.`); refresh();
    } catch (error) { setMessage(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function addMaterial(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const materialForm = event.currentTarget;
    const form = new FormData(materialForm);
    const quantity = Number(form.get("quantity"));
    if (!selectedMaterial || !activeMaterial || !Number.isFinite(quantity) || quantity <= 0) return setMessage("Selecciona un material y una cantidad mayor que cero.");
    setBusy(true); setMessage("");
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Tu sesión expiró. Inicia sesión nuevamente.");
      const { error } = await supabase.from("work_order_materials").insert({ work_order_id: orderId, material_id: selectedMaterial, quantity, unit: activeMaterial.unit, note: String(form.get("note") || "") || null, created_by: user.id });
      if (error) throw new Error(error.message);
      materialForm.reset(); setSelectedMaterial(""); note("Material registrado en la orden."); refresh();
    } catch (error) { setMessage(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function uploadEvidence(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 10 * 1024 * 1024) { event.target.value = ""; return setMessage("Solo se permiten imágenes de hasta 10 MB."); }
    setBusy(true); setMessage(""); const supabase = createClient(); const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setBusy(false); return setMessage("Tu sesión expiró. Inicia sesión nuevamente."); }
    const extension = file.name.split(".").pop()?.toLowerCase() || "jpg"; const path = `${user.id}/${orderId}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from("evidences").upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) { setBusy(false); return setMessage(uploadError.message); }
    const { error: evidenceError } = await supabase.from("evidences").insert({ work_order_id: orderId, storage_path: path, review_status: "pending", created_by: user.id });
    if (evidenceError) { await supabase.storage.from("evidences").remove([path]); setBusy(false); return setMessage(evidenceError.message); }
    event.target.value = ""; setBusy(false); note("Evidencia cargada. Queda pendiente de clasificación por IA o revisión técnica."); refresh();
  }

  if (!canExecute) return <section className="card"><h2>Trabajo de campo</h2><p>Solo el técnico asignado puede registrar GPS, materiales y evidencias. El personal administrativo puede supervisar el historial de la orden.</p></section>;
  return <section className="field-grid"><div className="card"><h2>1. Presencia en sitio</h2><p>Solicita GPS del dispositivo y guarda la precisión junto a la hora del registro.</p><div className="actions"><button className="button" disabled={busy || hasStart || !["asignada", "en_proceso"].includes(status)} onClick={() => recordLocation("inicio")}>{hasStart ? "Inicio registrado" : "Registrar inicio GPS"}</button><button className="button secondary" disabled={busy || !hasStart || hasEnd || !["en_proceso", "pendiente_de_cierre"].includes(status)} onClick={() => recordLocation("cierre")}>{hasEnd ? "Cierre registrado" : "Registrar cierre GPS"}</button></div>{locations.length > 0 && <div className="timeline">{locations.map((item) => <div key={item.id}><strong>{locationLabel[item.record_type]}:</strong> {Number(item.latitude).toFixed(6)}, {Number(item.longitude).toFixed(6)} · precisión {Math.round(Number(item.accuracy_meters ?? 0))} m</div>)}</div>}</div>
    <div className="card"><h2>2. Materiales utilizados</h2><p>Registra cada consumo real asociado a esta orden.</p><form className="compact-form" onSubmit={addMaterial}><select required value={selectedMaterial} onChange={(event) => setSelectedMaterial(event.target.value)}><option value="">Selecciona un material</option>{materials.map((material) => <option key={material.id} value={material.id}>{material.sku} · {material.name}</option>)}</select><input required name="quantity" type="number" min="0.01" step="0.01" placeholder="Cantidad"/><input name="note" maxLength={300} placeholder="Observación (opcional)"/><button className="button" disabled={busy || !hasStart}>Agregar material</button></form>{consumptions.length > 0 && <div className="item-list">{consumptions.map((item) => { const material = Array.isArray(item.materials) ? item.materials[0] : item.materials; return <div key={item.id}><strong>{material?.name ?? "Material"}</strong><span>{item.quantity} {item.unit}{item.note ? ` · ${item.note}` : ""}</span></div>; })}</div>}</div>
    <div className="card"><h2>3. Evidencias fotográficas</h2><p>La foto se guarda privada. La clasificación automática se habilitará al integrar un modelo validado.</p><label className="upload"><input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={uploadEvidence} disabled={busy || !hasStart}/><span>{busy ? "Procesando…" : "Tomar o cargar fotografía"}</span></label>{evidences.length > 0 && <div className="item-list">{evidences.map((item) => <div key={item.id}><strong>Evidencia cargada</strong><span>{item.final_category ?? "Pendiente de clasificación IA"} · {new Date(item.created_at).toLocaleString("es-GT")}</span></div>)}</div>}</div>
    {message && <div className={`notice ${message.includes("correctamente") || message.includes("registrado") || message.includes("cargada") ? "success" : "error"}`}>{message}</div>}</section>;
}
