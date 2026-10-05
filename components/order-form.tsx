"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { SiteLocationPicker } from "@/components/site-location-picker";
import { sentenceCase } from "@/lib/text";

type Client = { id: string; name: string };
type Technician = { id: string; full_name: string };

export function OrderForm({ clients, technicians }: { clients: Client[]; technicians: Technician[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [technician, setTechnician] = useState("");
  const [helpers, setHelpers] = useState<string[]>([]);
  const [siteLatitude, setSiteLatitude] = useState<number | null>(null);
  const [siteLongitude, setSiteLongitude] = useState<number | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return router.replace("/login");

    const { data: order, error: insertError } = await supabase.from("work_orders").insert({
      client_id: String(data.get("client_id")),
      assigned_technician_id: technician || null,
      address: sentenceCase(data.get("address")),
      description: sentenceCase(data.get("description")),
      priority: String(data.get("priority")),
      scheduled_at: new Date(String(data.get("scheduled_at"))).toISOString(),
      planned_duration_minutes: Number(data.get("planned_duration_minutes")),
      site_latitude: siteLatitude,
      site_longitude: siteLongitude,
      created_by: user.id,
      status: "borrador",
    }).select("id").single();

    if (insertError) {
      setSending(false);
      const missingLocationColumns = insertError.message.includes("site_latitude") || insertError.message.includes("site_longitude");
      setError(missingLocationColumns
        ? "Falta actualizar la base de datos para guardar el punto del mapa. Aplica la migración de ubicación y vuelve a intentarlo."
        : "No fue posible crear la orden. Revisa los datos e inténtalo nuevamente.");
      return;
    }
    if (order && helpers.length) {
      const { error: helperError } = await supabase.from("work_order_technicians").insert(helpers.filter((id) => id !== technician).map((technician_id) => ({ work_order_id: order.id, technician_id, participation_role: "ayudante" })));
      if (helperError) { setError("La orden fue creada, pero no se pudieron agregar los ayudantes."); setSending(false); return; }
    }
    if (order && technician) {
      const { error: transitionError } = await supabase.rpc("transition_work_order", {
        order_id: order.id,
        next_status: "asignada",
        transition_note: "Técnico asignado al crear la orden.",
      });
      if (transitionError) {
        setSending(false);
        setError("La orden fue creada como borrador, pero no se pudo asignar al técnico. Inténtalo nuevamente desde la edición.");
        return;
      }
    }
    router.push("/ordenes");
    router.refresh();
  }

  return (
    <form className="form order-form" onSubmit={submit}>
      <section className="form-section" aria-labelledby="order-assignment-heading">
      <span className="form-section-title" id="order-assignment-heading">Cliente y asignación</span>
      <div className="form-row">
        <label className="field">
          Cliente
          <select required name="client_id" defaultValue="">
            <option value="" disabled>Elige un cliente</option>
            {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
          </select>
        </label>
        <label className="field">
          Técnico asignado
          <select name="assigned_technician_id" value={technician} onChange={(event) => { const next = event.target.value; setTechnician(next); setHelpers((current) => current.filter((id) => id !== next)); }}>
            <option value="">Dejar sin asignar</option>
            {technicians.map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}
          </select>
          <span className="help">
            {technician
              ? "Al guardar, la orden queda asignada y visible para el técnico en su app."
              : "Sin técnico, la orden se guarda como borrador y no es visible en campo."}
          </span>
        </label>
      </div>

      <fieldset className="field helper-picker">
        <legend>Ayudantes técnicos</legend>
        <span className="help">{technician ? "Participan en la misma orden; el técnico asignado sigue siendo responsable del proyecto." : "Primero selecciona al técnico responsable para agregar ayudantes."}</span>
        <div className="helper-options">
          {technicians.filter((item) => item.id !== technician).map((item) => <label className="switch" key={item.id}><input type="checkbox" disabled={!technician} checked={helpers.includes(item.id)} onChange={() => setHelpers((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])} /><span>{item.full_name}</span></label>)}
        </div>
      </fieldset>
      </section>

      <section className="form-section" aria-labelledby="order-planning-heading">
      <span className="form-section-title" id="order-planning-heading">Planificación</span>
      <div className="form-row">
        <label className="field">
          Prioridad
          <select name="priority" defaultValue="media">
            <option value="baja">Baja</option>
            <option value="media">Media</option>
            <option value="alta">Alta</option>
            <option value="critica">Crítica</option>
          </select>
        </label>
        <label className="field">
          Fecha y hora programada
          <input name="scheduled_at" required type="datetime-local" />
        </label>
      </div>
        <label className="field">
          Duración programada (minutos)
          <input name="planned_duration_minutes" required type="number" min="15" max="1440" step="15" defaultValue="60" />
          <span className="help">Se usa para comparar el horario previsto con el tiempo registrado por GPS.</span>
        </label>

      </section>

      <section className="form-section" aria-labelledby="order-scope-heading">
      <span className="form-section-title" id="order-scope-heading">Ubicación y alcance</span>
      <div className="location-layout">
        <div className="location-details">
          <label className="field">
            Dirección de instalación
            <input required name="address" maxLength={300} placeholder="Zona, calle, referencias del sitio" />
            <span className="help">Escribe referencias claras: el técnico la usa para llegar.</span>
          </label>
          <label className="field">
            Descripción del trabajo
            <textarea required name="description" maxLength={2000} placeholder="Alcance, materiales previstos y condiciones del sitio" />
          </label>
        </div>
        <SiteLocationPicker latitude={siteLatitude} longitude={siteLongitude} onChange={(latitude, longitude) => { setSiteLatitude(latitude); setSiteLongitude(longitude); }} />
      </div>
      </section>

      {error && <p className="msg error" role="alert">{error}</p>}

      <div className="actions">
        <button className="btn" disabled={sending}>{sending ? "Creando…" : technician ? "Crear y asignar orden" : "Guardar borrador"}</button>
        <button type="button" className="btn ghost" onClick={() => router.back()}>Cancelar</button>
      </div>
    </form>
  );
}
