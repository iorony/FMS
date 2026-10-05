import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { CatalogForm } from "@/components/catalog-form";
import { CatalogTable } from "@/components/catalog-table";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function MaterialsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: materials }, { data: materialUsage }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).single(),
    supabase.from("materials").select("id,sku,name,unit,unit_cost,minimum_quantity,is_active").order("name"),
    supabase.from("material_client_consumption_summary").select("material_id,client_id,client_name,unit,consumed_quantity,consumed_cost,last_consumed_at").order("last_consumed_at", { ascending: false }),
  ]);
  const canManage = profile?.role === "admin";

  return (
    <AppShell
      title="Materiales"
      description="Insumos, costos y mínimos de compra que respaldan el consumo real y las estimaciones."
    >
      <div className="stack">
        {canManage && (
          <section className="panel">
            <div className="panel-head"><h2>Agregar material</h2></div>
            <div className="panel-body"><CatalogForm type="materials" /></div>
          </section>
        )}

        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Catálogo de materiales</h2>
              <p>{materials?.length ?? 0} insumo{(materials?.length ?? 0) === 1 ? "" : "s"}.</p>
            </div>
          </div>
          <CatalogTable type="materials" records={materials ?? []} canManage={canManage} materialUsage={materialUsage ?? []} />
        </section>
      </div>
    </AppShell>
  );
}
