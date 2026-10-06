"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { formatDateTime } from "@/lib/ui";
import { sentenceCase, userErrorMessage } from "@/lib/text";

type Location = { id: string; record_type: "inicio" | "cierre"; latitude: number; longitude: number; accuracy_meters: number | null; captured_at: string };
type Evidence = { id: string; storage_path: string; suggested_category: string | null; final_category: string | null; review_status: string; confidence: number | null; created_at: string; reviewed_at?: string | null; review_note?: string | null };
type Consumption = { id: string; quantity: number; unit: string; unit_cost: number; total_cost: number; note: string | null; materials: { name: string; sku: string } | { name: string; sku: string }[] | null };
type Material = { id: string; material_id: string; assigned_quantity: number; consumed_quantity: number; returned_quantity: number; materials: { id: string; name: string; sku: string; unit: string; unit_cost: number; minimum_quantity: number } | null };
type Feedback = { tone: "success" | "error"; text: string } | null;

type Props = {
  orderId: string;
  status: string;
  canExecute: boolean;
  canRegisterProjectGps?: boolean;
  locations: Location[];
  evidences: Evidence[];
  consumptions: Consumption[];
  materials: Material[];
};

const locationLabel: Record<string, string> = { inicio: "Inicio", cierre: "Cierre" };

function getPosition() {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Este dispositivo no permite obtener la ubicación."));
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  });
}

function readableError(error: unknown) {
  if (typeof GeolocationPositionError !== "undefined" && error instanceof GeolocationPositionError) {
    if (error.code === error.PERMISSION_DENIED) return "Autoriza el acceso a la ubicación para registrar tu presencia en el sitio.";
    if (error.code === error.TIMEOUT) return "El GPS tardó demasiado. Sal a cielo abierto y vuelve a intentarlo.";
    return "No se pudo obtener la ubicación. Revisa que el GPS esté encendido.";
  }
  return userErrorMessage(error, "No fue posible completar la operación.");
}

/** Miniaturas firmadas: las evidencias viven en un bucket privado. */
function useSignedThumbs(evidences: Evidence[]) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const paths = evidences.map((item) => item.storage_path).join("|");

  useEffect(() => {
    let active = true;
    (async () => {
      if (!paths) return setUrls({});
      const { data } = await createClient().storage.from("evidences").createSignedUrls(paths.split("|"), 600);
      if (!active || !data) return;
      const map: Record<string, string> = {};
      for (const item of data) {
        if (item.path && item.signedUrl) map[item.path] = item.signedUrl;
      }
      setUrls(map);
    })();
    return () => { active = false; };
  }, [paths]);

  return urls;
}

function Records({ locations }: { locations: Location[] }) {
  if (!locations.length) return null;
  return (
    <div className="record-list">
      {locations.map((item) => (
        <div className="record" key={item.id}>
          <strong>{locationLabel[item.record_type]} · {formatDateTime(item.captured_at)}</strong>
          <span className="mono">
            {Number(item.latitude).toFixed(6)}, {Number(item.longitude).toFixed(6)} · ±{Math.round(Number(item.accuracy_meters ?? 0))} m
          </span>
        </div>
      ))}
    </div>
  );
}

function MaterialList({ consumptions }: { consumptions: Consumption[] }) {
  if (!consumptions.length) return null;
  return (
    <div className="record-list">
      {consumptions.map((item) => {
        const material = Array.isArray(item.materials) ? item.materials[0] : item.materials;
        return (
          <div className="record" key={item.id}>
            <strong>{material?.name ?? "Material"} — {item.quantity} {item.unit}</strong>
            <span>{material?.sku ? `SKU ${material.sku}` : ""} · Q {Number(item.total_cost).toFixed(2)}{item.note ? ` · ${item.note}` : ""}</span>
          </div>
        );
      })}
    </div>
  );
}

function EvidenceGrid({ evidences, canReview = false }: { evidences: Evidence[]; canReview?: boolean }) {
  const urls = useSignedThumbs(evidences);
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [classifying, setClassifying] = useState(false);

  /** Escape cierra la galería y no queda scroll de fondo mientras está abierta. */
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setIsOpen(false); };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  if (!evidences.length) return null;

  const selectedEvidence = evidences[selectedIndex];
  const selectedUrl = selectedEvidence ? urls[selectedEvidence.storage_path] : undefined;
  const openGallery = (index = 0) => {
    setSelectedIndex(index);
    setCategory(evidences[index]?.final_category ?? "");
    setNote(evidences[index]?.review_note ?? "");
    setReviewError(null);
    setIsOpen(true);
  };

  async function reviewEvidence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const finalCategory = sentenceCase(category);
    const reviewNote = sentenceCase(note);
    if (!finalCategory) return setReviewError("Indica una categoría antes de guardar la revisión.");
    setReviewing(true);
    setReviewError(null);
    const { error } = await createClient().rpc("review_evidence", {
      evidence_id: selectedEvidence.id,
      category: finalCategory,
      note: reviewNote || null,
    });
    setReviewing(false);
    if (error) return setReviewError(userErrorMessage(error, "No fue posible guardar la revisión de evidencia."));
    router.refresh();
  }

  async function classifyEvidence() {
    setClassifying(true);
    setReviewError(null);
    try {
      const response = await fetch("/api/ai/classify-evidence", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ evidenceId: selectedEvidence.id }),
      });
      const payload = await response.json() as { category?: string; confidence?: number; error?: string };
      if (!response.ok || !payload.category) throw new Error(payload.error || "No fue posible clasificar la evidencia.");
      setCategory(payload.category);
      setReviewError(`Sugerencia IA: ${payload.category} (${Math.round((payload.confidence ?? 0) * 100)}%). Revísala antes de confirmarla.`);
      router.refresh();
    } catch (error) {
      setReviewError(userErrorMessage(error, "No fue posible clasificar la evidencia."));
    } finally {
      setClassifying(false);
    }
  }

  return (
    <>
      <button type="button" className="evidence-folder" onClick={() => openGallery()} aria-label={`Abrir ${evidences.length} evidencias fotográficas`}>
        <span className="folder-icon" aria-hidden="true">
          <span className="folder-tab" />
          <span className="folder-body">
            {evidences.slice(0, 3).map((item, index) => (
              <span className="folder-preview" key={item.id} style={{ zIndex: 3 - index }}>
                {urls[item.storage_path] && <Image src={urls[item.storage_path]} alt="" fill sizes="56px" unoptimized style={{ objectFit: "cover" }} />}
              </span>
            ))}
          </span>
        </span>
        <span className="evidence-folder-copy">
          <strong>Carpeta de evidencias</strong>
          <span>{evidences.length} {evidences.length === 1 ? "fotografía" : "fotografías"} · Ver vista previa</span>
        </span>
      </button>

      {isOpen && (
        <div className="evidence-modal-backdrop" role="presentation" onMouseDown={() => setIsOpen(false)}>
          <section className="evidence-modal" role="dialog" aria-modal="true" aria-labelledby="evidence-gallery-title" onMouseDown={(event) => event.stopPropagation()}>
            <header className="evidence-modal-head">
              <div>
                <h3 id="evidence-gallery-title">Evidencias fotográficas</h3>
                <p>{selectedIndex + 1} de {evidences.length}</p>
              </div>
              <button type="button" className="btn ghost evidence-close" onClick={() => setIsOpen(false)}>Cerrar</button>
            </header>
            <div className="evidence-preview">
              {selectedUrl ? (
                <Image src={selectedUrl} alt={`Evidencia del ${formatDateTime(selectedEvidence.created_at)}`} fill sizes="(max-width: 760px) 92vw, 680px" unoptimized style={{ objectFit: "contain" }} />
              ) : <span className="help">Cargando vista previa…</span>}
            </div>
            <div className="evidence-meta">
              <span>{selectedEvidence.final_category ?? selectedEvidence.suggested_category ?? "Sin clasificar"}</span>
              <span>{formatDateTime(selectedEvidence.created_at)}</span>
            </div>
            {canReview && (
              <form className="evidence-review" onSubmit={reviewEvidence}>
                <label>
                  Categoría final
                  <input value={category} onChange={(event) => setCategory(event.target.value)} maxLength={120} placeholder="Ej.: instalación terminada" />
                </label>
                <label>
                  Nota de revisión
                  <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} placeholder="Opcional" />
                </label>
                {reviewError && <p className="msg error" role="alert">{reviewError}</p>}
                <div className="button-row">
                  <button type="button" className="btn ghost" disabled={classifying || reviewing} onClick={classifyEvidence}>{classifying ? "Clasificando…" : "Clasificar con IA"}</button>
                  <button className="btn" disabled={reviewing || classifying}>{reviewing ? "Guardando…" : "Guardar revisión"}</button>
                </div>
              </form>
            )}
            <div className="evidence-strip" aria-label="Seleccionar evidencia">
              {evidences.map((item, index) => (
                <button type="button" className="evidence-thumb" data-active={index === selectedIndex} key={item.id} onClick={() => { setSelectedIndex(index); setCategory(item.final_category ?? ""); setNote(item.review_note ?? ""); setReviewError(null); }} aria-label={`Ver evidencia ${index + 1}`}>
                  {urls[item.storage_path] && <Image src={urls[item.storage_path]} alt="" fill sizes="88px" unoptimized style={{ objectFit: "cover" }} />}
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  );
}

export function FieldExecution({ orderId, status, canExecute, canRegisterProjectGps = canExecute, locations, evidences, consumptions, materials }: Props) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState("");

  const hasStart = locations.some((item) => item.record_type === "inicio");
  const hasEnd = locations.some((item) => item.record_type === "cierre");
  const canRecord = status === "en_proceso" && hasStart;
  const activeAssignment = useMemo(() => materials.find((material) => material.id === selectedMaterial), [materials, selectedMaterial]);
  const activeMaterial = activeAssignment?.materials ?? null;
  const availableQuantity = activeAssignment ? Number(activeAssignment.assigned_quantity) - Number(activeAssignment.consumed_quantity) - Number(activeAssignment.returned_quantity) : 0;

  const notify = (tone: "success" | "error", text: string) => {
    setFeedback({ tone, text });
    window.setTimeout(() => setFeedback(null), 6000);
  };

  async function recordLocation(recordType: "inicio" | "cierre") {
    setBusy(true);
    setFeedback(null);
    try {
      const position = await getPosition();
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Tu sesión expiró. Inicia sesión nuevamente.");
      const { error } = await supabase.rpc("register_field_location", {
        order_id: orderId,
        record_type: recordType,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy_meters: position.coords.accuracy,
      });
      if (error) throw new Error(error.message);
      notify("success", recordType === "inicio"
        ? "Inicio registrado. La orden pasó a en proceso."
        : "Cierre registrado. La orden quedó pendiente de firma y validación.");
      router.refresh();
    } catch (error) {
      notify("error", readableError(error));
    } finally {
      setBusy(false);
    }
  }

  async function addMaterial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const quantity = Number(data.get("quantity"));
    if (!selectedMaterial || !activeMaterial || !Number.isFinite(quantity) || quantity <= 0) {
      return notify("error", "Elige un material e ingresa una cantidad mayor que cero.");
    }
    setBusy(true);
    try {
      if (quantity > availableQuantity) throw new Error(`La cantidad supera el saldo asignado al cliente (${availableQuantity.toFixed(2)} ${activeMaterial.unit}).`);
      const { error } = await createClient().rpc("consume_client_material", {
        p_work_order_id: orderId, p_assignment_id: selectedMaterial, p_quantity: quantity, p_note: sentenceCase(data.get("note")) || null,
      });
      if (error) throw new Error(error.message);
      form.reset();
      setSelectedMaterial("");
      notify("success", `${activeMaterial.name} agregado al consumo de la orden.`);
      router.refresh();
    } catch (error) {
      notify("error", readableError(error));
    } finally {
      setBusy(false);
    }
  }

  async function uploadEvidence(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 10 * 1024 * 1024) {
      input.value = "";
      return notify("error", "La evidencia debe ser una imagen JPG, PNG o WebP de hasta 10 MB.");
    }
    setBusy(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Tu sesión expiró. Inicia sesión nuevamente.");
      const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${user.id}/${orderId}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from("evidences").upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw new Error(uploadError.message);
      const { error: evidenceError } = await supabase.from("evidences").insert({
        work_order_id: orderId, storage_path: path, review_status: "pending", created_by: user.id,
      });
      if (evidenceError) {
        await supabase.storage.from("evidences").remove([path]);
        throw new Error(evidenceError.message);
      }
      input.value = "";
      notify("success", "Evidencia guardada. Queda pendiente de clasificación.");
      router.refresh();
    } catch (error) {
      notify("error", readableError(error));
    } finally {
      setBusy(false);
    }
  }

  /* --------------------------- Vista de supervisión (admin / coordinación) */
  if (!canExecute) {
    const nothingYet = !locations.length && !consumptions.length && !evidences.length;
    return (
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Ejecución en campo</h2>
            <p>Solo el técnico asignado registra GPS, materiales y evidencias. Aquí puedes supervisar el avance.</p>
          </div>
        </div>
        {nothingYet ? (
          <div className="panel-body">
            <p className="msg info">El técnico aún no ha registrado actividad en el sitio.</p>
          </div>
        ) : (
          <div className="panel-body grid-3">
            <div className="field-card">
              <h3>Presencia en sitio</h3>
              {locations.length ? <Records locations={locations} /> : <p className="help">Sin registros de GPS.</p>}
            </div>
            <div className="field-card">
              <h3>Materiales utilizados ({consumptions.length})</h3>
              {consumptions.length ? <MaterialList consumptions={consumptions} /> : <p className="help">Sin consumos registrados.</p>}
            </div>
            <div className="field-card">
              <h3>Evidencias ({evidences.length})</h3>
              {evidences.length ? <EvidenceGrid evidences={evidences} canReview /> : <p className="help">Sin fotografías cargadas.</p>}
            </div>
          </div>
        )}
      </section>
    );
  }

  /* --------------------------- Vista de campo (técnico asignado) */
  const canStart = canRegisterProjectGps && ["asignada", "en_proceso"].includes(status);
  const canFinish = canRegisterProjectGps && hasStart && !hasEnd && ["en_proceso", "pendiente_de_cierre"].includes(status);

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Trabajo en campo</h2>
          <p>Sigue los tres pasos en orden. Cada registro queda con hora y responsable.</p>
        </div>
      </div>

      {feedback && (
        <div className="panel-body" style={{ paddingBottom: 0, borderTop: 0 }}>
          <p className={`msg ${feedback.tone}`} role="status">{feedback.text}</p>
        </div>
      )}

      <div className="panel-body grid-3">
        <div className="field-card" data-done={hasEnd}>
          <header>
            <span className="step-tag">1</span>
            <h3>Presencia en sitio</h3>
          </header>
          <p className="help">Toma la ubicación al llegar y al terminar. Se guarda la precisión del GPS.</p>
          {!canRegisterProjectGps && <p className="help">El técnico responsable registra el GPS de inicio y entrega del proyecto. Tu jornada personal se registra arriba.</p>}

          <button className={`btn field ${hasStart ? "done" : ""}`} disabled={busy || hasStart || !canStart} onClick={() => recordLocation("inicio")}>
            {hasStart ? "Inicio registrado" : busy ? "Obteniendo GPS…" : "Registrar llegada"}
          </button>
          {!hasStart && !canStart && <span className="help">Disponible cuando coordinación te asigne la orden.</span>}

          <button className={`btn field ghost ${hasEnd ? "done" : ""}`} disabled={busy || !canFinish} onClick={() => recordLocation("cierre")}>
            {hasEnd ? "Salida registrada" : "Registrar salida"}
          </button>
          {!hasEnd && !hasStart && <span className="help">Primero registra la llegada.</span>}

          <Records locations={locations} />
        </div>

        <div className="field-card" data-done={consumptions.length > 0}>
          <header>
            <span className="step-tag">2</span>
            <h3>Materiales utilizados</h3>
          </header>
          <p className="help">Registra el consumo real de material previamente asignado a este cliente.</p>

          <form className="inline-form" onSubmit={addMaterial}>
            <select required disabled={busy || !canRecord} value={selectedMaterial} onChange={(event) => setSelectedMaterial(event.target.value)} aria-label="Material">
              <option value="">Elige un material</option>
              {materials.filter((assignment) => Number(assignment.assigned_quantity) > Number(assignment.consumed_quantity) + Number(assignment.returned_quantity)).map((assignment) => (
                <option key={assignment.id} value={assignment.id}>{assignment.materials?.name} ({assignment.materials?.sku}) · saldo {(Number(assignment.assigned_quantity) - Number(assignment.consumed_quantity) - Number(assignment.returned_quantity)).toFixed(2)} {assignment.materials?.unit}</option>
              ))}
            </select>
            <input
              required disabled={busy || !canRecord} name="quantity" type="number" inputMode="decimal" min="0.01" step="0.01"
              placeholder={activeMaterial ? `Cantidad en ${activeMaterial.unit}` : "Cantidad"} aria-label="Cantidad"
            />
            <input disabled={busy || !canRecord} name="note" maxLength={300} placeholder="Observación (opcional)" aria-label="Observación" />
            {activeMaterial && <span className="help">Saldo asignado: {availableQuantity.toFixed(2)} {activeMaterial.unit} · Q {Number(activeMaterial.unit_cost).toFixed(2)} por {activeMaterial.unit}</span>}
            <button className="btn" disabled={busy || !canRecord || !selectedMaterial}>Agregar material</button>
            {hasStart && !canRecord && <span className="help">El consumo se registra mientras la orden está en proceso.</span>}
            {!hasStart && <span className="help">Registra la llegada para habilitar el consumo.</span>}
          </form>

          <MaterialList consumptions={consumptions} />
        </div>

        <div className="field-card" data-done={evidences.length > 0}>
          <header>
            <span className="step-tag">3</span>
            <h3>Evidencias fotográficas</h3>
          </header>
          <p className="help">Las fotos se guardan en almacenamiento privado, visibles solo para esta orden.</p>

          <label className="dropzone">
            <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={uploadEvidence} disabled={busy || !canRecord} />
            <span>{busy ? "Subiendo…" : "Tomar o adjuntar fotografía"}</span>
            <small>{canRecord ? "JPG, PNG o WebP · hasta 10 MB" : hasStart ? "Disponible mientras la orden está en proceso" : "Registra la llegada para habilitar la cámara"}</small>
          </label>

          <EvidenceGrid evidences={evidences} />
        </div>
      </div>
    </section>
  );
}
