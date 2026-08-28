import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { CatalogForm } from "@/components/catalog-form";
import { createClient } from "@/lib/supabase/server";
export const dynamic="force-dynamic";
export default async function Materials(){const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)redirect("/login");const {data:materials}=await supabase.from("materials").select("id,sku,name,unit,is_active").order("name");return <AppShell><section className="panel"><div className="panel-head"><h2>Catálogo de materiales</h2></div><div style={{padding:20}}><CatalogForm type="materials"/></div></section><section className="panel" style={{marginTop:20}}><table><thead><tr><th>SKU</th><th>Material</th><th>Unidad</th><th>Estado</th></tr></thead><tbody>{materials?.length?materials.map(m=><tr key={m.id}><td>{m.sku}</td><td>{m.name}</td><td>{m.unit}</td><td>{m.is_active?"Activo":"Inactivo"}</td></tr>):<tr><td colSpan={4}>No hay materiales registrados.</td></tr>}</tbody></table></section></AppShell>}
