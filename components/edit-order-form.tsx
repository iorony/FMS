"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { SiteLocationPicker } from "@/components/site-location-picker";
import { sentenceCase } from "@/lib/text";

type Client = { id: string; name: string };
type Technician = { id: string; full_name: string };
type Order = {
  id: string; client_id: string; assigned_technician_id: string | null;
  priority: string; scheduled_at: string | null; planned_duration_minutes: number; address: string; description: string; status: string; site_latitude: number | null; site_longitude: number | null;
};

/** datetime-local necesita hora local, no UTC. */
function toLocalInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function EditOrderForm({ order, clients, technicians, helperIds }: { order: Order; clients: Client[]; technicians: Technician[]; helperIds: string[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [helpers, setHelpers] = useState<string[]>(helperIds);
  const [siteLatitude, setSiteLatitude] = useState<number | null>(order.site_latitude === null ? null : Number(order.site_latitude));
  const [siteLongitude, setSiteLongitude] = useState<number | null>(order.site_longitude === null ? null : Number(order.site_longitude));
  const assignmentLocked = ["en_proceso", "pendiente_de_cierre", "cerrada", "cancelada"].includes(order.status);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setError("");
    const data = new FormData(event.currentTarget);
    // Un control deshabilitado no se incluye en FormData. Para una orden ya
    // iniciada conservamos la asignación existente en lugar de borrarla.
    const assignedTechnicianId = assignmentLocked
      ? order.assigned_technician_id
      : String(data.get("assigned_technician_id") || "") || null;
    const supabase = createClient();

    const { error: updateError } = await supabase.from("work_orders").update({
      client_id: String(data.get("client_id")),
      assigned_technician_id: assignedTechnicianId,
      priority: String(data.get("priority")),
      scheduled_at: new Date(String(data.get("scheduled_at"))).toISOString(),
      planned_duration_minutes: Number(data.get("planned_duration_minutes")),
      address: sentenceCase(data.get("address")),
      description: sentenceCase(data.get("description")),
      site_latitude: siteLatitude,
      site_longitude: siteLongitude,
    }).eq("id", order.id);

    if (updateError) {
      setSending(false);
      const missingLocationColumns = updateError.message.includes("site_latitude") || updateError.message.includes("site_longitude");
      setError(missingLocationColumns
        ? "Falta actualizar la base de datos para guardar el punto del mapa. Aplica la migración de ubicación y vuelve a intentarlo."
        : "No fue posible guardar los cambios. Revisa los datos e inténtalo nuevamente.");
      return;
    }

    if (!assignmentLocked) {
      const selectedHelpers = helpers.filter((id) => id !== assignedTechnicianId);
      const { error: clearHelpersError } = await supabase.from("work_order_technicians").delete().eq("work_order_id", order.id).eq("participation_role", "ayudante");
      if (clearHelpersError) {
        setSending(false);
        setError("Se guardó la orden, pero no se pudo actualizar el equipo de ayudantes.");
        return;
      }
      if (selectedHelpers.length) {
        const { error: saveHelpersError } = await supabase.from("work_order_technicians").insert(selectedHelpers.map((technician_id) => ({ work_order_id: order.id, technician_id, participation_role: "ayudante" })));
        if (saveHelpersError) {
          setSending(false);
          setError("Se guardó la orden, pero no se pudo completar el equipo de ayudantes.");
          return;
        }
      }
    }

    if (order.status === "borrador" && assignedTechnicianId) {
      const { error: transitionError } = await supabase.rpc("transition_work_order", {
        order_id: order.id,
        next_status: "asignada",
        transition_note: "Técnico asignado desde edición administrativa.",
      });
      if (transitionError) {
        setSending(false);
        setError("Los cambios se guardaron, pero la orden no pudo asignarse. Vuelve a intentarlo.");
        return;
      }
    }

    setSending(false);
    router.push(`/ordenes/${order.id}`);
    router.refresh();
  }

  async function cancelOrder() {
    if (!confirm("¿Cancelar esta orden? La bitácora se conserva y podrás restaurarla después como borrador.")) return;
    setSending(true); setError("");
    const { error: cancelError } = await createClient().rpc("transition_work_order", {
      order_id: order.id, next_status: "cancelada", transition_note: "Orden cancelada por administración.",
    });
    setSending(false);
    if (cancelError) return setError("No fue posible cancelar la orden. Inténtalo nuevamente.");
    router.push(`/ordenes/${order.id}`); router.refresh();
  }

  async function restoreOrder() {
    if (!confirm("¿Restaurar esta orden como borrador? Conserva su historial y podrás ajustarla antes de asignarla nuevamente.")) return;
    setSending(true); setError("");
    const { error: restoreError } = await createClient().rpc("transition_work_order", {
      order_id: order.id, next_status: "borrador", transition_note: "Orden restaurada como borrador por administración.",
    });
    setSending(false);
    if (restoreError) return setError("No fue posible restaurar la orden. Inténtalo nuevamente.");
    router.push(`/ordenes/${order.id}`); router.refresh();
  }

  return (
    <form className="form order-form" onSubmit={submit}>
      <section className="form-section" aria-labelledby="edit-assignment-heading">
        <span className="form-section-title" id="edit-assignment-heading">Cliente y asignación</span>
      <div className="form-row">
        <label className="field">
          Cliente
          <select required name="client_id" defaultValue={order.client_id}>
            {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
          </select>
        </label>
        <label className="field">
          Técnico asignado
          <select disabled={assignmentLocked} name="assigned_technician_id" defaultValue={order.assigned_technician_id ?? ""}>
            {order.status === "borrador" && <option value="">Dejar sin asignar</option>}
            {technicians.map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}
          </select>
          {assignmentLocked && <span className="help">La asignación se bloquea cuando la orden ya está en ejecución o finalizada.</span>}
        </label>
      </div>
      <fieldset className="field helper-picker">
        <legend>Ayudantes técnicos</legend>
        <span className="help">Participan en la orden sin sustituir al técnico responsable.</span>
        <div className="helper-options">
          {technicians.filter((item) => item.id !== order.assigned_technician_id).map((item) => <label className="switch" key={item.id}><input type="checkbox" disabled={assignmentLocked} checked={helpers.includes(item.id)} onChange={() => setHelpers((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])} /><span>{item.full_name}</span></label>)}
        </div>
        {assignmentLocked && <span className="help">El equipo no se puede modificar cuando la orden ya está en ejecución o finalizada.</span>}
      </fieldset>
      </section>

      <section className="form-section" aria-labelledby="edit-planning-heading">
        <span className="form-section-title" id="edit-planning-heading">Planificación</span>
      <div className="form-row">
        <label className="field">
          Prioridad
          <select name="priority" defaultValue={order.priority}>
            <option value="baja">Baja</option>
            <option value="media">Media</option>
            <option value="alta">Alta</option>
            <option value="critica">Crítica</option>
          </select>
        </label>
        <label className="field">
          Fecha y hora programada
          <input required name="scheduled_at" type="datetime-local" defaultValue={toLocalInput(order.scheduled_at)} />
        </label>
      </div>
        <label className="field">
          Duración programada (minutos)
          <input required name="planned_duration_minutes" type="number" min="15" max="1440" step="15" defaultValue={order.planned_duration_minutes ?? 60} />
          <span className="help">La comparación de horario usa esta duración y los registros GPS.</span>
        </label>
      </section>

      <section className="form-section" aria-labelledby="edit-scope-heading">
        <span className="form-section-title" id="edit-scope-heading">Ubicación y alcance</span>
      <div className="location-layout">
        <div className="location-details">
          <label className="field">
            Dirección de instalación
            <input required name="address" maxLength={300} defaultValue={order.address} />
            <span className="help">La dirección guía al técnico; el punto del mapa indica el lugar exacto.</span>
          </label>
          <label className="field">
            Descripción del trabajo
            <textarea required name="description" maxLength={2000} defaultValue={order.description} />
          </label>
        </div>
        <SiteLocationPicker latitude={siteLatitude} longitude={siteLongitude} onChange={(latitude, longitude) => { setSiteLatitude(latitude); setSiteLongitude(longitude); }} />
      </div>
      </section>

      {error && <p className="msg error" role="alert">{error}</p>}

      <div className="actions">
        <button className="btn" disabled={sending}>{sending ? "Guardando…" : "Guardar cambios"}</button>
        {["borrador", "asignada"].includes(order.status) && <button type="button" className="btn ghost" disabled={sending} onClick={cancelOrder}>Cancelar orden</button>}
        {order.status === "cancelada" && <button type="button" className="btn ghost" disabled={sending} onClick={restoreOrder}>Restaurar como borrador</button>}
        <button type="button" className="btn ghost" onClick={() => router.back()}>Cancelar</button>
      </div>
    </form>
  );
}
