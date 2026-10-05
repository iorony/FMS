import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AutoFilterForm } from "@/components/auto-filter-form";
import { EmptyState, PriorityTag, StatusBadge } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { ORDER_STATUS_LABELS, PRIORITY_LABELS, formatDate, formatDateTime, guatemalaWorkDate, one, priorityLabel, relativeDay, statusLabel } from "@/lib/ui";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ q?: string; status?: string; priority?: string; view?: string }>;

const QUICK_VIEWS = [
  { value: "hoy", label: "Hoy" },
  { value: "atrasadas", label: "Atrasadas" },
  { value: "sin_asignar", label: "Sin asignar" },
  { value: "en_proceso", label: "En proceso" },
  { value: "pendiente_de_cierre", label: "Por cerrar" },
  { value: "cerrada", label: "Cerradas" },
];

function documentationHealth(order: { location_records?: { record_type: string }[] | null; work_order_materials?: { count: number }[] | null; evidences?: { count: number }[] | null; customer_signatures?: { count: number }[] | null }) {
  const locations = order.location_records ?? [];
  const completeGps = locations.some((item) => item.record_type === "inicio") && locations.some((item) => item.record_type === "cierre");
  const complete = [completeGps, (order.work_order_materials?.[0]?.count ?? 0) > 0, (order.evidences?.[0]?.count ?? 0) > 0, (order.customer_signatures?.[0]?.count ?? 0) > 0];
  const missing = [!completeGps ? "GPS" : "", !complete[1] ? "materiales" : "", !complete[2] ? "evidencias" : "", !complete[3] ? "firma" : ""].filter(Boolean);
  return { completed: complete.filter(Boolean).length, missing };
}

export default async function OrdersPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const filters = await searchParams;
  const q = filters.q?.trim() ?? "";
  const status = filters.status ?? "";
  const priority = filters.priority ?? "";
  const view = filters.view ?? "";
  const hasFilters = Boolean(q || status || priority || view);

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const fieldStaff = profile?.role === "technician";
  let query = supabase
    .from("work_orders")
    .select("id,code,status,priority,scheduled_at,updated_at,address,assigned_technician_id,clients(name),profiles:assigned_technician_id(full_name),location_records(record_type),work_order_materials(count),evidences(count),customer_signatures(count)")
    .order("created_at", { ascending: false });

  if (fieldStaff) query = query.in("status", ["asignada", "en_proceso", "pendiente_de_cierre", "cerrada", "cancelada"]);

  if (q) query = query.or(`code.ilike.%${q.replaceAll(",", "")}%,address.ilike.%${q.replaceAll(",", "")}%`);
  if (status) query = query.eq("status", status);
  if (priority) query = query.eq("priority", priority);
  const today = guatemalaWorkDate();
  const startOfToday = `${today}T00:00:00-06:00`;
  const startOfTomorrow = `${today}T23:59:59.999-06:00`;
  if (view === "hoy") query = query.gte("scheduled_at", startOfToday).lte("scheduled_at", startOfTomorrow);
  if (view === "atrasadas") query = query.lt("scheduled_at", startOfToday).in("status", ["borrador", "asignada"]);
  if (view === "sin_asignar") query = query.is("assigned_technician_id", null).eq("status", "borrador");
  if (["en_proceso", "pendiente_de_cierre", "cerrada"].includes(view)) query = query.eq("status", view);

  const { data: orders, error } = await query;

  const canPlan = profile?.role === "admin" || profile?.role === "coordinator";

  return (
    <AppShell
      title="Órdenes de trabajo"
      description="Consulta, filtra y da seguimiento a las instalaciones según los permisos de tu rol."
      actions={canPlan ? <Link className="btn" href="/ordenes/nueva">Crear orden</Link> : undefined}
    >
      <section className="panel">
        <div className="quick-filters" aria-label="Vistas rápidas de órdenes">
          <span>Ver:</span>
          <Link className={`quick-filter ${!view ? "active" : ""}`} href="/ordenes">Todas</Link>
          {QUICK_VIEWS.map((item) => <Link key={item.value} className={`quick-filter ${view === item.value ? "active" : ""}`} href={`/ordenes?view=${item.value}`}>{item.label}</Link>)}
        </div>
        <AutoFilterForm className="filters" role="search">
          {view && <input type="hidden" name="view" value={view} />}
          <label>
            Buscar
            <input name="q" type="search" defaultValue={q} placeholder="Código o dirección" />
          </label>
          <label>
            Estado
            <select name="status" defaultValue={status}>
              <option value="">Todos</option>
              {Object.entries(ORDER_STATUS_LABELS).map(([value, label]) => (
                <option value={value} key={value}>{label}</option>
              ))}
            </select>
          </label>
          <label>
            Prioridad
            <select name="priority" defaultValue={priority}>
              <option value="">Todas</option>
              {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                <option value={value} key={value}>{label}</option>
              ))}
            </select>
          </label>
          <button className="btn" type="submit">Buscar</button>
          {hasFilters && <Link className="btn ghost" href="/ordenes">Limpiar</Link>}
        </AutoFilterForm>

        {hasFilters && (
          <div className="chips">
            <span className="count">{orders?.length ?? 0} resultado{(orders?.length ?? 0) === 1 ? "" : "s"} con:</span>
            {q && <span className="chip">Texto: {q}</span>}
            {status && <span className="chip">Estado: {statusLabel(status)}</span>}
            {priority && <span className="chip">Prioridad: {priorityLabel(priority)}</span>}
            {view && <span className="chip">Vista: {QUICK_VIEWS.find((item) => item.value === view)?.label ?? view}</span>}
          </div>
        )}

        {error ? (
          <div className="panel-body">
            <p className="msg error">No fue posible cargar las órdenes. Inténtalo nuevamente.</p>
          </div>
        ) : orders?.length ? (
          <table className="table-stack">
            <thead>
              <tr>
                <th>Orden</th>
                <th>Cliente</th>
                <th>Ubicación</th>
                <th>Técnico</th>
                <th>Prioridad</th>
                <th>Programada</th>
                <th>Progreso</th>
                <th>Estado</th>
                <th>Actualizada</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>{/* El mismo registro conserva tabla densa en escritorio y ficha en móvil. */}
                  <td data-label="">
                    <Link href={`/ordenes/${order.id}`} className="cell-link mono">{order.code}</Link>
                  </td>
                  <td data-label="Cliente">{one(order.clients)?.name ?? "—"}</td>
                  <td data-label="Ubicación">{order.address}</td>
                  <td data-label="Técnico">{one(order.profiles)?.full_name ?? "Sin asignar"}</td>
                  <td data-label="Prioridad"><PriorityTag priority={order.priority} /></td>
                  <td data-label="Programada">
                    <span>
                      {formatDate(order.scheduled_at)}
                      {order.scheduled_at && <span className="sub">{relativeDay(order.scheduled_at)}</span>}
                    </span>
                  </td>
                  <td data-label="Progreso">
                    {(() => {
                      const health = documentationHealth(order);
                      return <><span className={`order-health ${health.completed === 4 ? "complete" : "pending"}`}>{health.completed} de 4 requisitos</span><span className="sub">{health.completed === 4 ? "Expediente completo" : `Falta: ${health.missing.join(", ")}`}</span></>;
                    })()}
                  </td>
                  <td data-label="Estado"><StatusBadge status={order.status} /></td>
                  <td data-label="Actualizada">{formatDateTime(order.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState
            title={hasFilters ? "Ninguna orden coincide con los filtros" : "Aún no hay órdenes registradas"}
            hint={
              hasFilters
                ? "Prueba con otro código, dirección o combinación de estado y prioridad."
                : "Las órdenes que crees o que te asignen aparecerán en este listado."
            }
            action={hasFilters ? <Link className="btn ghost" href="/ordenes">Quitar filtros</Link> : canPlan ? <Link className="btn" href="/ordenes/nueva">Crear orden</Link> : undefined}
          />
        )}
      </section>
    </AppShell>
  );
}
