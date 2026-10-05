import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { FieldExecution } from "@/components/field-execution";
import { OrderFinalization } from "@/components/order-finalization";
import { MaterialPrediction } from "@/components/material-prediction";
import { EmptyState, PriorityTag, StatusBadge, StatusFlow } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, one, relativeDay, statusLabel } from "@/lib/ui";

export const dynamic = "force-dynamic";

type HistoryEntry = { id: string; created_at: string; from_status: string | null; to_status: string; note: string | null };
type TimelineEvent = { id: string; created_at: string; event_type: string; description: string; actor_name: string | null };
type TeamMember = { technician_id: string; participation_role: string; profiles: { full_name: string } | { full_name: string }[] | null };
type Requirements = { inicio: boolean; cierre: boolean; materiales: boolean; evidencias: boolean; firma: boolean };

function describeNextAction(status: string, manager: boolean, requirements: Requirements) {
  if (status === "cerrada") return { tone: "done", title: "Orden cerrada formalmente", text: "El expediente fue validado y no requiere más acciones." };
  if (status === "borrador") return { tone: "plan", title: manager ? "Asigna un técnico" : "Esperando asignación", text: manager ? "Define la persona responsable y la fecha de visita para iniciar la orden." : "Coordinación debe asignarte esta orden antes de que puedas ejecutarla." };
  if (status === "asignada") return { tone: manager ? "plan" : "work", title: manager ? "Esperar llegada al sitio" : "Registrar llegada", text: manager ? "El técnico asignado debe registrar su ubicación GPS para comenzar." : "Al llegar al sitio, registra tu ubicación GPS para iniciar la orden." };
  if (status === "en_proceso") {
    if (!requirements.materiales) return { tone: "work", title: "Registrar materiales utilizados", text: "Documenta al menos un material consumido durante la visita." };
    if (!requirements.evidencias) return { tone: "work", title: "Tomar evidencia fotográfica", text: "Agrega una fotografía que respalde el trabajo realizado." };
    return { tone: "work", title: "Registrar salida del sitio", text: "Finaliza la visita registrando tu ubicación GPS de salida." };
  }
  if (!requirements.firma) return { tone: "due", title: manager ? "Pendiente de firma del cliente" : "Capturar firma de conformidad", text: manager ? "El técnico debe capturar la conformidad del cliente en el sitio." : "Pide al cliente que firme para completar el expediente." };
  return { tone: "due", title: manager ? "Validar y cerrar la orden" : "Esperar validación administrativa", text: manager ? "El expediente está completo y puede recibir el cierre formal." : "El expediente está completo; coordinación realizará el cierre formal." };
}

export default async function OrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { id } = await params;

  const [{ data: profile }, { data: order }, { data: materials }, { data: team }, { data: timeline }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).single(),
    supabase
      .from("work_orders")
      .select("*,clients(name,contact_name,contact_phone),profiles:assigned_technician_id(full_name,email),work_order_status_history(*),location_records(*),evidences(*),customer_signatures(signer_name,signed_at),work_order_materials(id,quantity,unit,unit_cost,total_cost,note,materials(name,sku))")
      .eq("id", id)
      .single(),
    supabase.from("materials").select("id,name,sku,unit,unit_cost,minimum_quantity").eq("is_active", true).order("name"),
    supabase.from("work_order_technicians").select("technician_id,participation_role,profiles:technician_id(full_name)").eq("work_order_id", id),
    supabase.from("work_order_timeline_events").select("id,created_at,event_type,description,actor_name").eq("work_order_id", id).order("created_at", { ascending: false }),
  ]);

  if (!order) notFound();

  const client = one<{ name: string; contact_name: string | null; contact_phone: string | null }>(order.clients);
  const technician = one<{ full_name: string; email: string }>(order.profiles);
  const signature = one<{ signer_name: string; signed_at: string }>(order.customer_signatures);
  const history: HistoryEntry[] = order.work_order_status_history ?? [];
  const timelineEvents = (timeline ?? []) as TimelineEvent[];
  const locations = order.location_records ?? [];
  const evidences = order.evidences ?? [];
  const consumptions = order.work_order_materials ?? [];
  const teamMembers = (team ?? []) as TeamMember[];
  const helpers = teamMembers
    .filter((member) => member.participation_role === "ayudante")
    .map((member) => one(member.profiles)?.full_name)
    .filter((name): name is string => Boolean(name));
  const siteLatitude = order.site_latitude === null || order.site_latitude === undefined ? null : Number(order.site_latitude);
  const siteLongitude = order.site_longitude === null || order.site_longitude === undefined ? null : Number(order.site_longitude);
  const hasSitePoint = siteLatitude !== null && siteLongitude !== null;

  const isManager = profile?.role === "admin" || profile?.role === "coordinator";
  const isResponsible = order.assigned_technician_id === user.id;
  const isHelper = (team ?? []).some((member) => member.technician_id === user.id && member.participation_role === "ayudante");
  const canExecute = profile?.role === "technician" && (isResponsible || isHelper);
  const requirements: Requirements = {
    inicio: locations.some((item: { record_type: string }) => item.record_type === "inicio"),
    cierre: locations.some((item: { record_type: string }) => item.record_type === "cierre"),
    materiales: consumptions.length > 0,
    evidencias: evidences.length > 0,
    firma: Boolean(signature),
  };
  const nextAction = describeNextAction(order.status, isManager, requirements);

  return (
    <AppShell
      title={order.code}
      description={order.address}
      actions={
        <>
          <Link className="btn ghost" href="/ordenes">Volver al listado</Link>
          {isManager && order.status !== "cerrada" && (
            <Link className="btn ghost" href={`/ordenes/${order.id}/editar`}>Editar orden</Link>
          )}
          <StatusBadge status={order.status} />
        </>
      }
    >
      <div className="stack">
        <section className="panel">
          <div className="panel-head">
            <h2>Avance de la orden</h2>
            <span className="muted">{statusLabel(order.status)}</span>
          </div>
          <StatusFlow status={order.status} history={history} />
          <div className={`order-next-action ${nextAction.tone}`}>
            <span>Próximo paso</span>
            <strong>{nextAction.title}</strong>
            <p>{nextAction.text}</p>
          </div>
          <div className="panel-body">
            <div className="kv">
              <div>
                <span className="k">Cliente</span>
                <span className="v">{client?.name ?? "—"}</span>
              </div>
              <div>
                <span className="k">Contacto en sitio</span>
                <span className="v">
                  {client?.contact_name ?? "—"}
                  {client?.contact_phone && ` · ${client.contact_phone}`}
                </span>
              </div>
              <div>
                <span className="k">Técnico asignado</span>
                <span className="v">{technician?.full_name ?? "Sin asignar"}</span>
              </div>
              <div>
                <span className="k">Equipo de campo</span>
                <span className="v">{technician?.full_name ?? "Sin responsable"}{helpers.length ? ` · Ayudantes: ${helpers.join(", ")}` : " · Sin ayudantes"}</span>
              </div>
              <div>
                <span className="k">Prioridad</span>
                <span className="v"><PriorityTag priority={order.priority} /></span>
              </div>
              <div>
                <span className="k">Programada</span>
                <span className="v">
                  {formatDateTime(order.scheduled_at)}
                  {order.scheduled_at && <span className="help">{relativeDay(order.scheduled_at)}</span>}
                </span>
              </div>
              <div>
                <span className="k">Tiempo planificado</span>
                <span className="v">{order.planned_duration_minutes ?? 60} min</span>
              </div>
              <div>
                <span className="k">Dirección</span>
                <span className="v">{order.address}</span>
              </div>
              {hasSitePoint && <div>
                <span className="k">Punto del sitio</span>
                <span className="v"><a className="site-navigation-link" href={`https://www.waze.com/ul?ll=${siteLatitude}%2C${siteLongitude}&navigate=yes`} target="_blank" rel="noreferrer">Abrir navegación en Waze ↗</a><span className="help">{siteLatitude.toFixed(6)}, {siteLongitude.toFixed(6)}</span></span>
              </div>}
            </div>
          </div>
          <div className="panel-body">
            <span className="k muted">Descripción del trabajo</span>
            <p style={{ marginTop: 6, maxWidth: "72ch" }}>{order.description}</p>
          </div>
        </section>

        <FieldExecution
          orderId={order.id}
          status={order.status}
          canExecute={canExecute}
          canRegisterProjectGps={isResponsible}
          locations={locations}
          evidences={evidences}
          consumptions={consumptions}
          materials={materials ?? []}
        />

        <OrderFinalization
          orderId={order.id}
          status={order.status}
          canSign={isResponsible}
          canClose={isManager}
          signature={signature}
          requirements={requirements}
        />

        {isManager && <MaterialPrediction orderId={order.id} materials={materials ?? []} />}

        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Bitácora de la orden</h2>
              <p>Eventos del expediente con fecha, hora y responsable.</p>
            </div>
          </div>
          {timelineEvents.length ? (
            <table className="table-stack">
              <thead>
                <tr><th>Fecha</th><th>Evento</th><th>Responsable</th></tr>
              </thead>
              <tbody>
                {timelineEvents.map((entry) => (
                  <tr key={entry.id}>
                    <td data-label="Fecha">{formatDateTime(entry.created_at)}</td>
                    <td data-label="Evento">{entry.description}</td>
                    <td data-label="Responsable">{entry.actor_name ?? "No disponible"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState title="Sin eventos registrados" hint="La bitácora se llena automáticamente al documentar la orden." />
          )}
        </section>
      </div>
    </AppShell>
  );
}
