import { redirect } from "next/navigation";
import { SideNav, TabBar, type NavItem } from "@/components/side-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { BrandLogo } from "@/components/brand-logo";
import { createClient } from "@/lib/supabase/server";
import { initials, roleLabel } from "@/lib/ui";

type Props = {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
};

function navFor(role: string | null): NavItem[] {
  const items: NavItem[] = [
    { href: "/dashboard", label: "Inicio", short: "Inicio", icon: "resumen", group: "Operación", tab: true },
    { href: "/ordenes", label: "Órdenes de trabajo", short: "Órdenes", icon: "ordenes", group: "Operación", tab: true },
  ];
  if (role === "technician") {
    items.push({ href: "/reportes", label: "Mis horas y pagos", short: "Mis horas", icon: "reportes", group: "Seguimiento", tab: true });
  }
  if (role !== "technician") {
    items.push({ href: "/ordenes/nueva", label: "Crear orden", short: "Crear", icon: "nueva", group: "Operación", tab: true });
    items.push({ href: "/reportes", label: "Asistencia y preliquidación", short: "Asistencia", icon: "reportes", group: "Seguimiento", tab: true });
    items.push({ href: "/reportes/ordenes", label: "Reporte de órdenes", short: "Rep. órdenes", icon: "ordenes", group: "Seguimiento" });
    items.push({ href: "/ia", label: "Calidad de IA", short: "Calidad IA", icon: "resumen", group: "Seguimiento" });
  }
  if (role === "coordinator") {
    items.push({ href: "/usuarios", label: "Acceso de técnicos", short: "Acceso", icon: "usuarios", group: "Administración", tab: true });
  }
  if (role === "admin") {
    items.push(
      { href: "/clientes", label: "Clientes", short: "Clientes", icon: "clientes", group: "Catálogos" },
      { href: "/materiales", label: "Materiales", short: "Materiales", icon: "materiales", group: "Catálogos" },
      { href: "/usuarios", label: "Usuarios y roles", short: "Usuarios", icon: "usuarios", group: "Administración", tab: true },
    );
  }
  return items;
}

export async function AppShell({ title, description, actions, children }: Props) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name,email,role")
    .eq("id", user.id)
    .single();

  const role = profile?.role ?? null;
  const name = profile?.full_name?.trim() || user.email || "Usuario";
  const items = navFor(role);

  return (
    <div className="app">
      <a className="skip-link" href="#contenido">Ir al contenido</a>

      <aside className="sidebar">
        <div className="brand">
          <BrandLogo />
          <span className="brand-name">Plus Service<span>Gestión de campo</span></span>
        </div>

        <SideNav items={items} />

        <div className="identity">
          <div className="identity-row">
            <span className="avatar" aria-hidden="true">{initials(profile?.full_name, user.email)}</span>
            <div className="identity-text">
              <span className="identity-name">{name}</span>
              <span className="identity-role">{roleLabel(role)}</span>
            </div>
          </div>
          <SignOutButton />
        </div>
      </aside>

      <header className="mobile-top">
        <BrandLogo />
        <span className="brand-name">Plus Service<span>Gestión de campo</span></span>
        <span className="avatar" title={`${name} · ${roleLabel(role)}`}>{initials(profile?.full_name, user.email)}</span>
        <SignOutButton label="Salir" />
      </header>

      <main className="content" id="contenido">
        <div className="page-head">
          <div>
            <h1>{title}</h1>
            {description && <p>{description}</p>}
          </div>
          {actions && <div className="page-actions">{actions}</div>}
        </div>
        {children}
      </main>

      <TabBar items={items} />
    </div>
  );
}
