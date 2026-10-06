import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { CatalogForm } from "@/components/catalog-form";
import { CreationPanel } from "@/components/creation-panel";
import { CatalogTable } from "@/components/catalog-table";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: clients }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).single(),
    supabase.from("clients").select("id,name,contact_name,contact_phone,email,address,is_active").order("name"),
  ]);
  const canManage = profile?.role === "admin";

  return (
    <AppShell
      title="Clientes"
      description="Empresas y personas para las que se ejecutan instalaciones. Cada orden pertenece a un cliente activo."
    >
      <div className="stack">
        {canManage && (
          <CreationPanel title="Registrar cliente"><CatalogForm type="clients" /></CreationPanel>
        )}

        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Catálogo de clientes</h2>
              <p>{clients?.length ?? 0} registro{(clients?.length ?? 0) === 1 ? "" : "s"}.</p>
            </div>
          </div>
          <CatalogTable type="clients" records={clients ?? []} canManage={canManage} />
        </section>
      </div>
    </AppShell>
  );
}
