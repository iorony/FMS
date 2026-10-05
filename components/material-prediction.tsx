"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { userErrorMessage } from "@/lib/text";

type Material = { id: string; name: string; unit: string };
type Estimate = { material_id: string; estimated_quantity: number; recommended_quantity: number; minimum_quantity: number; unit: string; unit_cost: number; estimated_cost: number; sample_size: number };
type Feedback = { tone: "success" | "error"; text: string } | null;

/** Referencia estadística, no una orden de compra: siempre requiere aceptación explícita antes de usarse en planificación. */
export function MaterialPrediction({ orderId, materials }: { orderId: string; materials: Material[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [estimates, setEstimates] = useState<Estimate[] | null>(null);
  const [predictionId, setPredictionId] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const totalCost = estimates?.reduce((total, item) => total + Number(item.estimated_cost || 0), 0) ?? 0;

  async function generate() {
    setBusy(true);
    setFeedback(null);
    const { data, error } = await createClient().rpc("create_material_prediction", { order_id: orderId });
    setBusy(false);
    if (error) return setFeedback({ tone: "error", text: userErrorMessage(error, "No fue posible generar la estimación.") });

    const materialsList = data?.prediction?.materials;
    setPredictionId(data?.id ?? null);
    setAccepted(Boolean(data?.accepted_at));
    setEstimates(Array.isArray(materialsList) ? materialsList : []);
  }

  async function accept() {
    if (!predictionId) return;
    setBusy(true);
    setFeedback(null);
    const { error } = await createClient().rpc("accept_material_prediction", { prediction_id: predictionId, accepted: null });
    setBusy(false);
    if (error) return setFeedback({ tone: "error", text: userErrorMessage(error, "No fue posible guardar la estimación.") });
    setAccepted(true);
    setFeedback({ tone: "success", text: "Estimación aceptada para planificación." });
    router.refresh();
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Estimación de materiales</h2>
          <p>Referencia para la IA basada en órdenes cerradas de la misma prioridad. Calcula una compra sugerida, el mínimo aplicable y su costo; requiere revisión antes de planificar.</p>
        </div>
      </div>
      <div className="panel-body">
        <div className="actions">
          <button className="btn" type="button" onClick={generate} disabled={busy}>
            {busy && !estimates ? "Calculando…" : estimates ? "Recalcular estimación" : "Generar estimación"}
          </button>
        </div>

        {feedback && <p className={`msg ${feedback.tone}`} role={feedback.tone === "error" ? "alert" : "status"}>{feedback.text}</p>}

        {estimates && (
          estimates.length ? (
            <>
              <div className="record-list">
                {estimates.map((item) => (
                  <div className="record" key={item.material_id}>
                    <strong>{materials.find((material) => material.id === item.material_id)?.name ?? "Material"} · comprar {item.recommended_quantity} {item.unit}</strong>
                    <span>Consumo estimado: {item.estimated_quantity} {item.unit} · mínimo: {item.minimum_quantity} {item.unit} · Q {Number(item.estimated_cost).toFixed(2)} · muestra: {item.sample_size} registro{item.sample_size === 1 ? "" : "s"}</span>
                  </div>
                ))}
              </div>
              <p className="msg info">Costo estimado de materiales: <strong>Q {totalCost.toFixed(2)}</strong></p>
              <div className="actions">
                <button className="btn ghost" type="button" disabled={busy || accepted} onClick={accept}>
                  {accepted ? "Estimación aceptada" : busy ? "Guardando…" : "Aceptar estimación para planificación"}
                </button>
              </div>
            </>
          ) : (
            <p className="help">No se encontraron consumos históricos aplicables a esta orden.</p>
          )
        )}
      </div>
    </section>
  );
}
