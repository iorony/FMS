"use client";
import { useState } from "react";
import { userErrorMessage } from "@/lib/text";
type Result = { summary: string; alerts: string[] };
export function OrderAiSummary({ orderId }: { orderId: string }) {
  const [busy, setBusy] = useState(false); const [result, setResult] = useState<Result | null>(null); const [error, setError] = useState<string | null>(null);
  async function generate() { setBusy(true); setError(null); try { const response = await fetch("/api/ai/order-close-summary", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId }) }); const payload = await response.json() as Result & { error?: string }; if (!response.ok || !payload.summary) throw new Error(payload.error || "No fue posible generar el resumen."); setResult(payload); } catch (caught) { setError(userErrorMessage(caught, "No fue posible generar el resumen asistido.")); } finally { setBusy(false); } }
  return <section className="panel"><div className="panel-head"><div><h2>Resumen asistido de cierre</h2><p>Borrador basado en el expediente. Revísalo y edítalo antes de usarlo como comunicación o acta.</p></div></div><div className="panel-body"><button className="btn ghost" type="button" disabled={busy} onClick={generate}>{busy ? "Preparando borrador…" : result ? "Generar otro borrador" : "Generar borrador"}</button>{error && <p className="msg error" role="alert">{error}</p>}{result && <div className="record-list"><div className="record"><strong>Borrador</strong><span>{result.summary}</span></div>{result.alerts.length > 0 && <div className="record"><strong>Aspectos a revisar</strong><span>{result.alerts.join(" · ")}</span></div>}</div>}</div></section>;
}
