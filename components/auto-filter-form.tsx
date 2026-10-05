"use client";

import { useRef, type ChangeEvent, type ReactNode } from "react";

export function AutoFilterForm({ children, className, role }: { children: ReactNode; className?: string; role?: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  function handleChange(event: ChangeEvent<HTMLFormElement>) {
    const target = event.target;
    // Las listas y los calendarios se aplican al instante. El texto se envía
    // solo al confirmar la búsqueda, evitando una navegación por cada letra.
    if (target instanceof HTMLSelectElement || (target instanceof HTMLInputElement && target.type === "date")) formRef.current?.requestSubmit();
  }

  return <form ref={formRef} className={className} method="get" role={role} onChange={handleChange}>
    {children}
  </form>;
}
