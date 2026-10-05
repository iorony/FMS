import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { OrderForm } from "@/components/order-form";
import { EmptyState } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function NewOrderPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin" && profile?.role !== "coordinator") redirect("/ordenes");

  const [{ data: clients }, { data: technicians }] = await Promise.all([
    supabase.from("clients").select("id,name").eq("is_active", true).order("name"),
    supabase.from("profiles").select("id,full_name").eq("role", "technician").eq("is_active", true).order("full_name"),
  ]);

  return (
    <AppShell
      title="Crear orden de instalación"
      description="Define el sitio, la fecha y quién la ejecuta. Puedes asignar el técnico ahora o dejarla en borrador."
      actions={<Link className="btn ghost" href="/ordenes">Cancelar</Link>}
    >
      <section className="panel">
        {clients?.length ? (
          <div className="panel-body">
            <OrderForm clients={clients} technicians={technicians ?? []} />
          </div>
        ) : (
          <EmptyState
            title="Primero registra un cliente"
            hint="Una orden siempre pertenece a un cliente activo del catálogo."
            action={<Link className="btn" href="/clientes">Ir a clientes</Link>}
          />
        )}
      </section>
    </AppShell>
  );
}
