"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export type NavItem = {
  href: string;
  label: string;
  short: string;
  icon: IconName;
  group: string;
  /** Aparece en la barra inferior de la vista móvil. */
  tab?: boolean;
};

type IconName = "resumen" | "ordenes" | "nueva" | "reportes" | "clientes" | "materiales" | "usuarios";

const paths: Record<IconName, string> = {
  resumen: "M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6v-9h-6v9Zm0-16v5h6V4h-6Z",
  ordenes: "M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm1 5h8M8 12h8M8 16h5",
  nueva: "M12 5v14M5 12h14",
  reportes: "M5 20V10m7 10V4m7 16v-7",
  clientes: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 8a8 8 0 0 1 16 0",
  materiales: "M12 3 4 7.5v9L12 21l8-4.5v-9L12 3Zm0 0v18m8-13.5L4 16.5",
  usuarios: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0M17 11a3 3 0 1 0 0-6m5 15a5 5 0 0 0-4-4.9",
};

function Icon({ name }: { name: IconName }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}

function isActive(pathname: string, href: string) {
  if (href === "/ordenes") return pathname === "/ordenes" || (pathname.startsWith("/ordenes/") && !pathname.startsWith("/ordenes/nueva"));
  if (href === "/reportes") return pathname === "/reportes";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SideNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const groups = items.reduce<Record<string, NavItem[]>>((acc, item) => {
    (acc[item.group] ||= []).push(item);
    return acc;
  }, {});

  return (
    <nav className="nav" aria-label="Navegación principal">
      {Object.entries(groups).map(([group, groupItems]) => (
        <div className="nav-group" key={group}>
          <p>{group}</p>
          {groupItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="nav-link"
              aria-current={isActive(pathname, item.href) ? "page" : undefined}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={paths[item.icon]} />
              </svg>
              {item.label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}

export function TabBar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  // La barra inferior se mantiene en cuatro destinos para conservar iconos y
  // textos legibles. El resto sigue disponible desde "Más".
  const mainItems = items.filter((item) => item.tab).slice(0, 4);
  const mainHrefs = new Set(mainItems.map((item) => item.href));
  const moreItems = items.filter((item) => !mainHrefs.has(item.href));
  const hasActiveMoreItem = moreItems.some((item) => isActive(pathname, item.href));

  return (
    <nav className="tabbar" aria-label="Navegación principal">
      {mainItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="tab"
          aria-current={isActive(pathname, item.href) ? "page" : undefined}
        >
          <Icon name={item.icon} />
          {item.short}
        </Link>
      ))}
      {moreItems.length > 0 && <>
        {moreOpen && <div id="tabbar-more-menu" className="tabbar-more-menu" aria-label="Más secciones">
          {moreItems.map((item) => <Link key={item.href} href={item.href} className="tabbar-more-link" aria-current={isActive(pathname, item.href) ? "page" : undefined} onClick={() => setMoreOpen(false)}>
            <Icon name={item.icon} />
            <span>{item.label}</span>
          </Link>)}
        </div>}
        <button type="button" className="tab tab-more" aria-expanded={moreOpen} aria-controls="tabbar-more-menu" onClick={() => setMoreOpen((open) => !open)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true"><circle cx="5" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="19" cy="12" r="1" fill="currentColor" /></svg>
          Más
          {hasActiveMoreItem && <span className="tab-more-dot" aria-label="Sección actual" />}
        </button>
      </>}
    </nav>
  );
}
