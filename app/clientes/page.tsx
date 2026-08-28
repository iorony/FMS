import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { CatalogForm } from "@/components/catalog-form";
import { createClient } from "@/lib/supabase/server";
export const dynamic="force-dynamic";
export default async function Clients(){const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)redirect("/login");const {data:clients}=await supabase.from("clients").select("id,name,contact_name,contact_phone,email,is_active").order("name");return <AppShell><section className="panel"><div className="panel-head"><h2>Clientes</h2></div><div style={{padding:20}}><CatalogForm type="clients"/></div></section><section className="panel" style={{marginTop:20}}><table><thead><tr><th>Cliente</th><th>Contacto</th><th>Teléfono</th><th>Correo</th><th>Estado</th></tr></thead><tbody>{clients?.length?clients.map(c=><tr key={c.id}><td>{c.name}</td><td>{c.contact_name??"—"}</td><td>{c.contact_phone??"—"}</td><td>{c.email??"—"}</td><td>{c.is_active?"Activo":"Inactivo"}</td></tr>):<tr><td colSpan={5}>No hay clientes registrados.</td></tr>}</tbody></table></section></AppShell>}
