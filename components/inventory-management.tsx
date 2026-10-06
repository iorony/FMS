"use client";

import { FormEvent, Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { sentenceCase, userErrorMessage } from "@/lib/text";

type Material = { id: string; sku: string; name: string; unit: string; unit_cost: number; minimum_quantity: number; is_active: boolean; on_hand_quantity: number };
type Client = { id: string; name: string };
type Assignment = { id: string; assigned_quantity: number; consumed_quantity: number; returned_quantity: number; assigned_at: string; clients: { name: string } | { name: string }[] | null; materials: { name: string; unit: string; sku: string } | { name: string; unit: string; sku: string }[] | null };
type Feedback = { tone: "success" | "error"; text: string } | null;

const one = <T,>(value: T | T[] | null) => Array.isArray(value) ? value[0] : value;

type Movement = { id: string; movement_type: string; quantity_delta: number; note: string | null; created_at: string; materials: { name: string; unit: string } | { name: string; unit: string }[] | null };

export function InventoryManagement({ materials, clients, assignments, movements, canManage }: { materials: Material[]; clients: Client[]; assignments: Assignment[]; movements: Movement[]; canManage: boolean }) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [feedbackScope, setFeedbackScope] = useState<"assign" | "return">("assign");
  const [busy, setBusy] = useState(false);
  const [returningId, setReturningId] = useState<string | null>(null);

  async function assign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true); setFeedback(null); setFeedbackScope("assign");
    const { error } = await createClient().rpc("assign_material_to_client", { p_client_id: data.get("client_id"), p_material_id: data.get("material_id"), p_quantity: Number(data.get("quantity")), p_note: sentenceCase(data.get("note")) || null });
    setBusy(false);
    if (error) return setFeedback({ tone: "error", text: userErrorMessage(error, "No fue posible asignar el material.") });
    form.reset(); setFeedback({ tone: "success", text: "Material asignado al cliente. El saldo salió de la bodega." }); router.refresh();
  }

  async function returnAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true); setFeedback(null); setFeedbackScope("return");
    const { error } = await createClient().rpc("return_client_material", { p_assignment_id: data.get("assignment_id"), p_quantity: Number(data.get("quantity")), p_note: sentenceCase(data.get("note")) || null });
    setBusy(false);
    if (error) return setFeedback({ tone: "error", text: userErrorMessage(error, "No fue posible registrar la devolución.") });
    form.reset(); setReturningId(null); setFeedback({ tone: "success", text: "Devolución registrada; el material volvió a bodega." }); router.refresh();
  }

  return <>
    {canManage && <div className="inventory-assign"><h3>Asignar material a cliente</h3><p className="help">La asignación descuenta el saldo de bodega y deja disponible ese material para sus órdenes.</p>
      <form className="form" onSubmit={assign}><div className="form-row"><label className="field">Cliente<select name="client_id" required defaultValue=""><option value="" disabled>Elige un cliente</option>{clients.filter(c => c.name).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label className="field">Material<select name="material_id" required defaultValue=""><option value="" disabled>Elige un material</option>{materials.filter(m => m.is_active).map(m => <option key={m.id} value={m.id}>{m.name} · disponible {Number(m.on_hand_quantity).toFixed(2)} {m.unit}</option>)}</select></label><label className="field">Cantidad<input required name="quantity" type="number" min="0.01" step="0.01" /></label></div><label className="field">Nota<input name="note" maxLength={300} placeholder="Ej. Material entregado para instalación de octubre" /></label><div className="actions"><button className="btn" disabled={busy}>Asignar al cliente</button></div></form>
      {feedback && feedbackScope === "assign" && <p className={`msg ${feedback.tone}`} role={feedback.tone === "error" ? "alert" : "status"}>{feedback.text}</p>}
    </div>}
    <div className="inventory-assign">
      <h3>Saldos asignados a clientes</h3>
      {feedback && feedbackScope === "return" && <p className={`msg ${feedback.tone}`} role={feedback.tone === "error" ? "alert" : "status"}>{feedback.text}</p>}
      {assignments.length ? <table className="table-stack"><thead><tr><th>Cliente</th><th>Material</th><th>Asignado</th><th>Usado</th><th>Devuelto</th><th>Saldo</th>{canManage && <th>Acciones</th>}</tr></thead><tbody>{assignments.map(a => {
        const m = one(a.materials); const c = one(a.clients); const available = Number(a.assigned_quantity) - Number(a.consumed_quantity) - Number(a.returned_quantity); const isReturning = returningId === a.id;
        return <Fragment key={a.id}>
          <tr><td data-label="Cliente">{c?.name ?? "—"}</td><td data-label="Material">{m?.name ?? "Material"}<span className="sub">{m?.sku}</span></td><td data-label="Asignado">{a.assigned_quantity} {m?.unit}</td><td data-label="Usado">{a.consumed_quantity} {m?.unit}</td><td data-label="Devuelto">{a.returned_quantity} {m?.unit}</td><td data-label="Saldo"><strong>{available.toFixed(2)} {m?.unit}</strong></td>{canManage && <td data-label="Acciones">{available > 0 ? <button type="button" className="btn ghost small" aria-expanded={isReturning} onClick={() => setReturningId(isReturning ? null : a.id)}>Devolver a bodega</button> : "—"}</td>}</tr>
          {canManage && isReturning && <tr className="catalog-panel-row"><td colSpan={7} data-label=""><div className="catalog-panel inventory-action-panel"><strong>Devolver {m?.name ?? "material"} a bodega</strong><p className="help">Saldo disponible en el cliente: {available.toFixed(2)} {m?.unit}.</p><form className="form" onSubmit={returnAssignment}><input type="hidden" name="assignment_id" value={a.id} /><div className="form-row"><label className="field">Cantidad a devolver<input required name="quantity" type="number" min="0.01" max={available} step="0.01" inputMode="decimal" /></label><label className="field">Motivo<input name="note" required maxLength={300} placeholder="Ej. Sobrante de instalación" /></label></div><div className="actions"><button className="btn small" disabled={busy}>{busy ? "Guardando…" : "Confirmar devolución"}</button><button type="button" className="btn ghost small" disabled={busy} onClick={() => setReturningId(null)}>Cancelar</button></div></form></div></td></tr>}
        </Fragment>;
      })}</tbody></table> : <p className="help">Aún no hay materiales asignados a clientes.</p>}
    </div>
    {canManage && <div className="inventory-assign"><h3>Últimos movimientos de bodega</h3>{movements.length ? <table className="table-stack"><thead><tr><th>Material</th><th>Movimiento</th><th>Cantidad</th><th>Detalle</th></tr></thead><tbody>{movements.map((movement) => { const material = one(movement.materials); return <tr key={movement.id}><td data-label="Material">{material?.name ?? "Material"}</td><td data-label="Movimiento">{movement.movement_type.replace("_", " ")}</td><td data-label="Cantidad"><strong>{Number(movement.quantity_delta) > 0 ? "+" : ""}{Number(movement.quantity_delta).toFixed(2)} {material?.unit}</strong></td><td data-label="Detalle">{movement.note ?? "—"}</td></tr>; })}</tbody></table> : <p className="help">Los ajustes, asignaciones y devoluciones se verán aquí.</p>}</div>}
  </>;
}
