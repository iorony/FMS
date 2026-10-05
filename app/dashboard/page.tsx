import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { DailyAttendance } from "@/components/daily-attendance";
import { EmptyState, PriorityTag, StatusBadge } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { formatDate, guatemalaWorkDate, isSameDay, one, relativeDay } from "@/lib/ui";

export const dynamic = "force-dynamic";

type Order = {
  id: string;
  code: string;
  status: string;
  priority: string;
  scheduled_at: string | null;
  address: string;
  clients: { name: string } | { name: string }[] | null;
  profiles: { full_name: string } | { full_name: string }[] | null;
  customer_signatures: { id: string }[] | null;
};

type Task = { order: Order; reason: string; urgent: boolean; cta: string };

const OPEN = ["borrador", "asignada", "en_proceso"];

/**
 * Inicio responde "¿qué tengo que hacer hoy?".
 * El histórico y el cumplimiento documental viven en /reportes.
 */
function buildTasks(orders: Order[], role: string | null): Task[] {
  const now = new Date();
  const isTechnician = role === "technician";
  const tasks: Task[] = [];

  for (const order of orders) {
    const overdue = order.scheduled_at ? new Date(order.scheduled_at) < now : false;
    const signed = (order.customer_signatures?.length ?? 0) > 0;
    const technician = one(order.profiles)?.full_name;

    if (order.status === "borrador" && !isTechnician) {
      tasks.push({ order, reason: "Sin técnico asignado", urgent: overdue, cta: "Asignar" });
    } else if (order.status === "asignada" && overdue) {
      tasks.push({ order, reason: `Programada ${relativeDay(order.scheduled_at)} y aún no inicia`, urgent: true, cta: "Ver orden" });
    } else if (order.status === "asignada" && isSameDay(order.scheduled_at)) {
      tasks.push({ order, reason: isTechnician ? "Te toca hoy" : `Hoy con ${technician ?? "el técnico asignado"}`, urgent: false, cta: "Ver orden" });
    } else if (order.status === "pendiente_de_cierre" && !signed) {
      tasks.push({
        order,
        reason: isTechnician ? "Falta la firma de conformidad del cliente" : "Esperando la firma del cliente en sitio",
        urgent: true,
        cta: isTechnician ? "Capturar firma" : "Ver orden",
      });
    } else if (order.status === "pendiente_de_cierre" && signed && !isTechnician) {
      tasks.push({ order, reason: "Expediente completo, listo para validar y cerrar", urgent: false, cta: "Validar cierre" });
    }
  }

  return tasks.sort((a, b) => Number(b.urgent) - Number(a.urgent)).slice(0, 6);
}

export default async function Dashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: data }, { data: attendance }] = await Promise.all([
    supabase.from("profiles").select("role,full_name").eq("id", user.id).single(),
    supabase
      .from("work_orders")
      .select("id,code,status,priority,scheduled_at,address,clients(name),profiles:assigned_technician_id(full_name),customer_signatures(id)")
      .order("scheduled_at", { ascending: true }),
    supabase.from("daily_attendance_records").select("clock_in_at,clock_out_at").eq("technician_id", user.id).eq("work_date", guatemalaWorkDate()).maybeSingle(),
  ]);

  const role = profile?.role ?? null;
  const isTechnician = role === "technician";
  const orders = (data ?? []) as Order[];

  const tasks = buildTasks(orders, role);
  const today = orders.filter((order) => isSameDay(order.scheduled_at) && OPEN.includes(order.status));
  const upcoming = orders
    .filter((order) => OPEN.includes(order.status) && order.scheduled_at && new Date(order.scheduled_at) > new Date())
    .slice(0, 6);
  const inProgress = orders.filter((order) => order.status === "en_proceso");
  const awaiting = orders.filter((order) => order.status === "pendiente_de_cierre");
  const overdue = orders.filter(
    (order) => order.scheduled_at && new Date(order.scheduled_at) < new Date() && ["borrador", "asignada"].includes(order.status),
  );

  const fullName = profile?.full_name?.trim();
  const agenda = today.length ? today : upcoming;

  return (
    <AppShell
      title={fullName ? `Hola, ${fullName}` : "Inicio"}
      description={
        isTechnician
          ? "Tus instalaciones de hoy y los pasos que faltan por completar."
          : "Lo que necesita una decisión o un seguimiento hoy. El histórico completo está en Reportes."
      }
      actions={<Link className="btn ghost" href="/ordenes">Buscar en todas las órdenes</Link>}
    >
      <section className="stats" aria-label="Indicadores del día">
        <article className="stat">
          <span className="stat-label">Programadas para hoy</span>
          <span className="stat-value">{today.length}</span>
          <span className="stat-foot">{overdue.length ? `${overdue.length} con fecha vencida sin iniciar` : "Sin atrasos de planificación"}</span>
        </article>
        <article className="stat" data-tone="work">
          <span className="stat-label">En proceso ahora</span>
          <span className="stat-value">{inProgress.length}</span>
          <span className="stat-foot">Técnico en sitio con GPS de llegada</span>
        </article>
        <article className="stat" data-tone="due">
          <span className="stat-label">{isTechnician ? "Por firmar" : "Esperan validación"}</span>
          <span className="stat-value">{awaiting.length}</span>
          <span className="stat-foot">{isTechnician ? "Conformidad del cliente pendiente" : "Cierre formal por autorizar"}</span>
        </article>
        <article className="stat">
          <span className="stat-label">Abiertas en total</span>
          <span className="stat-value">{orders.filter((order) => OPEN.includes(order.status) || order.status === "pendiente_de_cierre").length}</span>
          <span className="stat-foot">De {orders.length} órdenes visibles</span>
        </article>
      </section>
      {isTechnician && <DailyAttendance clockedIn={Boolean(attendance?.clock_in_at)} clockedOut={Boolean(attendance?.clock_out_at)} />}

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Requiere tu atención</h2>
            <p>Órdenes detenidas por una acción tuya o de tu equipo.</p>
          </div>
        </div>
        {tasks.length ? (
          <div className="todo-list">
            {tasks.map(({ order, reason, urgent, cta }) => (
              <div className="todo" key={order.id}>
                <div className="todo-main">
                  <span className="todo-title">
                    <span className="mono">{order.code}</span> · {one(order.clients)?.name ?? "Sin cliente"}
                  </span>
                  <span className="todo-why">{urgent ? <b>{reason}</b> : reason}</span>
                </div>
                <div className="todo-side">
                  <StatusBadge status={order.status} />
                  <Link className="btn ghost small" href={`/ordenes/${order.id}`}>{cta}</Link>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Nada pendiente por ahora"
            hint={isTechnician
              ? "Cuando te asignen una instalación o falte un paso en campo, aparecerá aquí."
              : "Ninguna orden está detenida esperando una asignación, una firma o una validación."}
          />
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>{today.length ? "Agenda de hoy" : "Próximas programadas"}</h2>
            <p>{today.length ? "Instalaciones con fecha para hoy." : "Las siguientes instalaciones en el calendario."}</p>
          </div>
        </div>
        {agenda.length ? (
          <table className="table-stack">
            <thead>
              <tr><th>Orden</th><th>Cliente</th><th>Técnico</th><th>Prioridad</th><th>Programada</th><th>Estado</th></tr>
            </thead>
            <tbody>
              {agenda.map((order) => (
                <tr key={order.id}>
                  <td data-label="">
                    <Link href={`/ordenes/${order.id}`} className="cell-link mono">{order.code}</Link>
                    <span className="sub">{order.address}</span>
                  </td>
                  <td data-label="Cliente">{one(order.clients)?.name ?? "—"}</td>
                  <td data-label="Técnico">{one(order.profiles)?.full_name ?? "Sin asignar"}</td>
                  <td data-label="Prioridad"><PriorityTag priority={order.priority} /></td>
                  <td data-label="Programada">
                    <span>
                      {formatDate(order.scheduled_at)}
                      {order.scheduled_at && <span className="sub">{relativeDay(order.scheduled_at)}</span>}
                    </span>
                  </td>
                  <td data-label="Estado"><StatusBadge status={order.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState
            title="No hay instalaciones programadas"
            hint={isTechnician ? "Coordinación aún no te ha asignado trabajo próximo." : "Crea una orden para empezar a planificar la semana."}
            action={!isTechnician ? <Link className="btn" href="/ordenes/nueva">Crear orden</Link> : undefined}
          />
        )}
      </section>
    </AppShell>
  );
}
