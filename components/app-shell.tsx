import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return <div className="shell">
    <aside className="sidebar"><div className="brand">PLUS SERVICE GT<small>FIELD SERVICE MANAGEMENT</small></div><nav className="nav"><Link href="/dashboard">Resumen operativo</Link><Link href="/ordenes">Órdenes</Link><Link href="/ordenes/nueva">Nueva orden</Link><Link href="/clientes">Clientes</Link><Link href="/materiales">Materiales</Link></nav></aside>
    <main className="main"><div className="topbar"><div><h1>Gestión de operaciones</h1><p>Control centralizado de órdenes de instalación.</p></div><div className="user">{user?.email ?? "Sesión no identificada"}</div></div>{children}</main>
  </div>;
}
