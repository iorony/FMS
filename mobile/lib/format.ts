export function formatDateTime(value: string | null) {
  if (!value) return "Sin programación";
  return new Date(value).toLocaleString("es-GT", { timeZone: "America/Guatemala", dateStyle: "medium", timeStyle: "short" });
}

export function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("es-GT", { timeZone: "America/Guatemala", day: "2-digit", month: "short", year: "numeric" });
}

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/** "hoy", "mañana", "hace 3 días": más útil que una fecha exacta en campo. */
export function relativeDay(value: string | null) {
  if (!value) return "";
  const days = Math.round((startOfDay(new Date(value)) - startOfDay(new Date())) / 86_400_000);
  if (days === 0) return "hoy";
  if (days === 1) return "mañana";
  if (days === -1) return "ayer";
  return days > 0 ? `en ${days} días` : `hace ${Math.abs(days)} días`;
}

export function isToday(value: string | null) {
  if (!value) return false;
  return startOfDay(new Date(value)) === startOfDay(new Date());
}

export function isOverdue(value: string | null) {
  return value ? new Date(value).getTime() < Date.now() : false;
}

export function errorMessage(error: unknown, fallback = "Inténtalo nuevamente.") {
  const message = error instanceof Error ? error.message.trim() : "";
  const safePrefixes = [
    "Tu sesión", "No autorizado", "No tienes permiso", "La orden", "Primero ",
    "Escribe ", "No hay ", "Este dispositivo", "Autoriza ", "Se requiere ",
    "La imagen ", "La firma ", "No encontramos ",
  ];
  return safePrefixes.some((prefix) => message.startsWith(prefix)) ? message : fallback;
}

/** Formato único para campos descriptivos; no debe usarse en códigos ni correos. */
export function sentenceCase(value: string) {
  const text = value.trim().replace(/\s+/g, " ");
  return text ? text.charAt(0).toLocaleUpperCase("es-GT") + text.slice(1).toLocaleLowerCase("es-GT") : "";
}

export function daysAgo(days: number) {
  return new Date(Date.now() - days * 86_400_000);
}
