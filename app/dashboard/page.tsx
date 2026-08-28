import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const labels: Record<string, string> = { borrador:"Borrador", asignada:"Asignada", en_proceso:"En proceso", cerrada:"Cerrada" };
export default async function Dashboard() {
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) redirect("/login");
  const { data: orders } = await supabase.from("work_orders").select("id,code,status,scheduled_at,clients(name),profiles:assigned_technician_id(full_name)").order("created_at", {ascending:false}).limit(8);
  const counts = Object.fromEntries(["asignada","en_proceso","cerrada"].map((status) => [status, orders?.filter((order) => order.status === status).length ?? 0]));
  return <AppShell><section className="grid"><div className="card"><span className="label">Órdenes visibles</span><div className="metric">{orders?.length ?? 0}</div></div><div className="card"><span className="label">Asignadas</span><div className="metric">{counts.asignada}</div></div><div className="card"><span className="label">En proceso</span><div className="metric">{counts.en_proceso}</div></div><div className="card"><span className="label">Cerradas</span><div className="metric">{counts.cerrada}</div></div></section><section className="panel"><div className="panel-head"><h2>Órdenes recientes</h2></div><table><thead><tr><th>Orden</th><th>Cliente</th><th>Técnico</th><th>Programada</th><th>Estado</th></tr></thead><tbody>{orders?.length ? orders.map((order) => { const client=Array.isArray(order.clients)?order.clients[0]:order.clients; const technician=Array.isArray(order.profiles)?order.profiles[0]:order.profiles; return <tr key={order.id}><td>{order.code}</td><td>{client?.name ?? "—"}</td><td>{technician?.full_name ?? "Sin asignar"}</td><td>{order.scheduled_at ? new Date(order.scheduled_at).toLocaleDateString("es-GT") : "—"}</td><td><span className={`badge ${order.status}`}>{labels[order.status] ?? order.status}</span></td></tr>; }) : <tr><td colSpan={5}>Aún no hay órdenes registradas.</td></tr>}</tbody></table></section></AppShell>;
}
