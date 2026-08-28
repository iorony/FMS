import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { OrderForm } from "@/components/order-form";
import { createClient } from "@/lib/supabase/server";
export const dynamic="force-dynamic";
export default async function NewOrderPage(){const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)redirect("/login");const [{data:clients},{data:technicians}]=await Promise.all([supabase.from("clients").select("id,name").eq("is_active",true).order("name"),supabase.from("profiles").select("id,full_name").eq("role","technician").eq("is_active",true).order("full_name")]);return <AppShell><section className="panel"><div className="panel-head"><h2>Crear orden de instalación</h2></div><div style={{padding:20}}>{clients?.length?<OrderForm clients={clients} technicians={technicians??[]}/>:<div className="notice error">Antes de crear una orden debes registrar al menos un cliente activo.</div>}</div></section></AppShell>}
