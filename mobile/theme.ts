/**
 * Tokens compartidos con la aplicación web.
 * Colores semánticos compartidos: azul para planificación, naranja para
 * trabajo de campo, café para cierres pendientes y verde para cierre formal.
 */
export const C = {
  graphite: "#343534",
  graphite2: "#484a47",
  graphite3: "#62645f",
  ink: "#252625",
  inkSoft: "#51534e",
  muted: "#74766f",
  paper: "#f5f6f2",
  surface: "#ffffff",
  surface2: "#f7f8f4",
  line: "#dfe2d9",
  lineSoft: "#eaede6",
  action: "#2166b1",
  actionSoft: "#e8f1fb",
  orange: "#d86d16",
  orangeSoft: "#fff0e3",
  brown: "#7a542d",
  brownSoft: "#fbf4dc",
  ok: "#287a4b",
  okSoft: "#e7f5ec",
  danger: "#b4231f",
  dangerSoft: "#fdeceb",
  onDark: "#f7f8f4",
  onDark2: "#cdd0c7",
};

export type Status = "borrador" | "asignada" | "en_proceso" | "pendiente_de_cierre" | "cerrada" | "cancelada";
export type Role = "admin" | "coordinator" | "technician";

export const STATUS_LABEL: Record<Status, string> = {
  borrador: "Borrador",
  asignada: "Asignada",
  en_proceso: "En proceso",
  pendiente_de_cierre: "Pendiente de cierre",
  cerrada: "Cerrada",
  cancelada: "Cancelada",
};

export const STATUS_ICON: Record<Status, string> = {
  borrador: "✎", asignada: "↗", en_proceso: "◔", pendiente_de_cierre: "◷", cerrada: "✓", cancelada: "×",
};

export const STATUS_TONE: Record<Status, { bg: string; color: string }> = {
  borrador: { bg: "#eef1f4", color: "#5e625a" },
  asignada: { bg: C.actionSoft, color: C.action },
  en_proceso: { bg: C.orangeSoft, color: C.orange },
  pendiente_de_cierre: { bg: C.brownSoft, color: C.brown },
  cerrada: { bg: C.okSoft, color: C.ok },
  cancelada: { bg: C.dangerSoft, color: C.danger },
};

export const PRIORITY_LABEL: Record<string, string> = {
  baja: "Baja", media: "Media", alta: "Alta", critica: "Crítica",
};

export const PRIORITY_COLOR: Record<string, string> = {
  baja: "#c9cdc3", media: "#c9cdc3", alta: C.orange, critica: C.danger,
};

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Administración",
  coordinator: "Coordinación",
  technician: "Trabajo de campo",
};
