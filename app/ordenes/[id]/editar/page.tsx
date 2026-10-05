import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { EditOrderForm } from "@/components/edit-order-form";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function EditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin" && profile?.role !== "coordinator") redirect("/ordenes");

  const { id } = await params;
  const [{ data: order }, { data: clients }, { data: technicians }, { data: team }] = await Promise.all([
    supabase.from("work_orders").select("id,client_id,assigned_technician_id,priority,scheduled_at,planned_duration_minutes,address,description,status,code,site_latitude,site_longitude").eq("id", id).single(),
    supabase.from("clients").select("id,name").eq("is_active", true).order("name"),
    supabase.from("profiles").select("id,full_name").eq("role", "technician").eq("is_active", true).order("full_name"),
    supabase.from("work_order_technicians").select("technician_id,participation_role").eq("work_order_id", id),
  ]);

  if (!order) notFound();

  return (
    <AppShell
      title={`Editar ${order.code}`}
      description="Al asignar un técnico a un borrador, la orden queda lista para ejecutarse en campo."
      actions={<Link className="btn ghost" href={`/ordenes/${order.id}`}>Volver a la orden</Link>}
    >
      <section className="panel">
        <div className="panel-body">
          <EditOrderForm order={order} clients={clients ?? []} technicians={technicians ?? []} helperIds={(team ?? []).filter((member) => member.participation_role === "ayudante").map((member) => member.technician_id)} />
        </div>
      </section>
    </AppShell>
  );
}
