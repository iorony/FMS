export const WORK_ORDER_STATUSES = [
  "borrador",
  "asignada",
  "en_proceso",
  "pendiente_de_cierre",
  "cerrada",
  "cancelada",
] as const;

export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];
export type WorkOrderRole = "admin" | "coordinator" | "technician";

export type ClosureRequirements = {
  hasStartGps: boolean;
  hasEndGps: boolean;
  hasEvidence: boolean;
  hasMaterial: boolean;
  hasSignature: boolean;
};

/** Mirrors the transitions enforced by the PostgreSQL RPCs. */
export function canTransition(
  role: WorkOrderRole,
  current: WorkOrderStatus,
  next: WorkOrderStatus,
): boolean {
  if (role === "technician") {
    return (current === "asignada" && next === "en_proceso")
      || (current === "en_proceso" && next === "pendiente_de_cierre");
  }

  return (current === "borrador" && (next === "asignada" || next === "cancelada"))
    || (current === "asignada" && next === "cancelada")
    || (current === "cancelada" && next === "borrador")
    || (current === "pendiente_de_cierre" && next === "cerrada");
}

export function missingClosureRequirements(requirements: ClosureRequirements): string[] {
  return [
    !requirements.hasStartGps && "GPS de inicio",
    !requirements.hasEndGps && "GPS de cierre",
    !requirements.hasEvidence && "evidencia",
    !requirements.hasMaterial && "material",
    !requirements.hasSignature && "firma del cliente",
  ].filter((item): item is string => Boolean(item));
}

export function canCloseOrder(status: WorkOrderStatus, requirements: ClosureRequirements): boolean {
  return status === "pendiente_de_cierre" && missingClosureRequirements(requirements).length === 0;
}
