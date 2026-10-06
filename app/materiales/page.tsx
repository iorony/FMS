import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { CatalogForm } from "@/components/catalog-form";
import { CreationPanel } from "@/components/creation-panel";
import { CatalogTable } from "@/components/catalog-table";
import { InventoryManagement } from "@/components/inventory-management";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function MaterialsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: materials }, { data: materialUsage }, { data: inventory }, { data: clients }, { data: assignments }, { data: movements }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).single(),
    supabase.from("materials").select("id,sku,name,unit,unit_cost,minimum_quantity,is_active").order("name"),
    supabase.from("material_client_consumption_summary").select("material_id,client_id,client_name,unit,consumed_quantity,consumed_cost,last_consumed_at").order("last_consumed_at", { ascending: false }),
    supabase.from("material_inventory").select("material_id,on_hand_quantity"),
    supabase.from("clients").select("id,name").eq("is_active", true).order("name"),
    supabase.from("client_material_assignments").select("id,assigned_quantity,consumed_quantity,returned_quantity,assigned_at,clients(name),materials(name,unit,sku)").order("assigned_at", { ascending: false }),
    supabase.from("material_stock_movements").select("id,movement_type,quantity_delta,note,created_at,materials(name,unit)").order("created_at", { ascending: false }).limit(12),
  ]);
  const canManage = profile?.role === "admin";
  const inventoryByMaterial = new Map((inventory ?? []).map((item) => [item.material_id, Number(item.on_hand_quantity)]));
  const materialsWithStock = (materials ?? []).map((material) => ({ ...material, on_hand_quantity: inventoryByMaterial.get(material.id) ?? 0 }));

  return (
    <AppShell
      title="Materiales"
      description="Inventario de bodega y materiales entregados a cada cliente. Todo consumo queda ligado a una orden."
    >
      <div className="stack">
        {canManage && (
          <CreationPanel title="Agregar material"><CatalogForm type="materials" /></CreationPanel>
        )}

        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Materiales e inventario</h2>
              <p>Un solo catálogo: define cada insumo, actualiza su saldo de bodega y consulta el consumo por cliente.</p>
            </div>
          </div>
          <CatalogTable type="materials" records={materialsWithStock} canManage={canManage} materialUsage={materialUsage ?? []} />
          <div className="panel-body"><InventoryManagement materials={materialsWithStock} clients={clients ?? []} assignments={assignments ?? []} movements={movements ?? []} canManage={canManage} /></div>
        </section>
      </div>
    </AppShell>
  );
}
