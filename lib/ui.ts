export const ORDER_STATUS_LABELS: Record<string, string> = {
  borrador: "Borrador",
  asignada: "Asignada",
  en_proceso: "En proceso",
  pendiente_de_cierre: "Pendiente de cierre",
  cerrada: "Cerrada",
  cancelada: "Cancelada",
};

export const PRIORITY_LABELS: Record<string, string> = {
  baja: "Baja",
  media: "Media",
  alta: "Alta",
  critica: "Crítica",
};

export const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  coordinator: "Coordinador",
  technician: "Técnico",
};

/** Secuencia normal de una orden; `cancelada` queda fuera del flujo. */
export const ORDER_FLOW = ["borrador", "asignada", "en_proceso", "pendiente_de_cierre", "cerrada"] as const;

export function statusLabel(status: string) {
  return ORDER_STATUS_LABELS[status] ?? status.replaceAll("_", " ");
}

export function priorityLabel(priority: string) {
  return PRIORITY_LABELS[priority] ?? priority;
}

export function roleLabel(role: string | null | undefined) {
  return role ? ROLE_LABELS[role] ?? role : "Sin rol";
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("es-GT", { timeZone: "America/Guatemala", day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("es-GT", {
    timeZone: "America/Guatemala", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

/** Texto relativo corto para fechas programadas: "hoy", "en 3 días", "hace 2 días". */
export function relativeDay(value: string | null | undefined) {
  if (!value) return "";
  const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((startOfDay(new Date(value)) - startOfDay(new Date())) / 86_400_000);
  if (days === 0) return "hoy";
  if (days === 1) return "mañana";
  if (days === -1) return "ayer";
  return days > 0 ? `en ${days} días` : `hace ${Math.abs(days)} días`;
}

export function isSameDay(value: string | null | undefined, reference = new Date()) {
  if (!value) return false;
  const date = new Date(value);
  return date.getFullYear() === reference.getFullYear()
    && date.getMonth() === reference.getMonth()
    && date.getDate() === reference.getDate();
}

export function initials(name: string | null | undefined, fallback: string | null | undefined) {
  const source = (name?.trim() || fallback?.trim() || "").replace(/@.*/, "");
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  if (!parts.length) return "··";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

/** Desempaqueta relaciones de Supabase que llegan como objeto o arreglo. */
export function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

/** Fecha de corte hacia atrás, para filtros de periodo. */
export function daysAgo(days: number) {
  return new Date(Date.now() - days * 86_400_000);
}

/** Día laboral de Guatemala, estable aunque el servidor opere en UTC. */
export function guatemalaWorkDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Guatemala", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}
