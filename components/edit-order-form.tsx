"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

type Client = { id: string; name: string };
type Technician = { id: string; full_name: string };
type Order = { id: string; client_id: string; assigned_technician_id: string | null; priority: string; scheduled_at: string | null; address: string; description: string; status: string };
const toLocalInput = (value: string | null) => value ? new Date(value).toISOString().slice(0, 16) : "";

export function EditOrderForm({ order, clients, technicians }: { order: Order; clients: Client[]; technicians: Technician[] }) {
  const router = useRouter(); const [message, setMessage] = useState(""); const [sending, setSending] = useState(false);
  const assignmentLocked = ["en_proceso", "pendiente_de_cierre", "cerrada", "cancelada"].includes(order.status);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSending(true); setMessage(""); const form = new FormData(event.currentTarget); const assignedTechnicianId = String(form.get("assigned_technician_id") || "") || null; const supabase = createClient();
    const { error } = await supabase.from("work_orders").update({ client_id: String(form.get("client_id")), assigned_technician_id: assignedTechnicianId, priority: String(form.get("priority")), scheduled_at: new Date(String(form.get("scheduled_at"))).toISOString(), address: String(form.get("address")).trim(), description: String(form.get("description")).trim() }).eq("id", order.id);
    if (error) { setSending(false); setMessage("No fue posible guardar los cambios. Revisa los permisos y campos."); return; }
    if (order.status === "borrador" && assignedTechnicianId) { const { error: transitionError } = await supabase.rpc("transition_work_order", { order_id: order.id, next_status: "asignada", transition_note: "Técnico asignado desde edición administrativa." }); if (transitionError) { setSending(false); setMessage("Se guardó la orden, pero no fue posible asignarla. Intenta nuevamente."); return; } }
    setSending(false); router.push(`/ordenes/${order.id}`); router.refresh();
  }
  return <form className="form" onSubmit={submit}><div className="form-row"><label className="field">Cliente<select required name="client_id" defaultValue={order.client_id}>{clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label><label className="field">Técnico asignado<select disabled={assignmentLocked} name="assigned_technician_id" defaultValue={order.assigned_technician_id ?? ""}>{order.status === "borrador" && <option value="">Sin asignar (borrador)</option>}{technicians.map(technician => <option key={technician.id} value={technician.id}>{technician.full_name}</option>)}</select>{assignmentLocked && <span className="help">La asignación se protege mientras la orden está en ejecución o finalizada.</span>}</label></div><div className="form-row"><label className="field">Prioridad<select name="priority" defaultValue={order.priority}><option value="baja">Baja</option><option value="media">Media</option><option value="alta">Alta</option><option value="critica">Crítica</option></select></label><label className="field">Fecha y hora programada<input required name="scheduled_at" type="datetime-local" defaultValue={toLocalInput(order.scheduled_at)} /></label></div><label className="field">Dirección de instalación<input required name="address" maxLength={300} defaultValue={order.address} /></label><label className="field">Descripción del trabajo<textarea required name="description" maxLength={2000} defaultValue={order.description} /></label>{message && <div className="notice error">{message}</div>}<div className="actions"><button className="button" disabled={sending}>{sending ? "Guardando…" : "Guardar cambios"}</button><button type="button" className="button secondary" onClick={() => router.back()}>Cancelar</button></div></form>;
}
