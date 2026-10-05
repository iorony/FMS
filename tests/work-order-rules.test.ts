import { describe, expect, it } from "vitest";
import { canCloseOrder, canTransition, missingClosureRequirements } from "../lib/work-order-rules";

const complete = {
  hasStartGps: true,
  hasEndGps: true,
  hasEvidence: true,
  hasMaterial: true,
  hasSignature: true,
};

describe("reglas del ciclo de vida de una orden", () => {
  it("permite únicamente las transiciones de campo del técnico", () => {
    expect(canTransition("technician", "asignada", "en_proceso")).toBe(true);
    expect(canTransition("technician", "en_proceso", "pendiente_de_cierre")).toBe(true);
    expect(canTransition("technician", "asignada", "cerrada")).toBe(false);
  });

  it("impide que administración cierre fuera del estado pendiente", () => {
    expect(canTransition("admin", "asignada", "cerrada")).toBe(false);
    expect(canTransition("coordinator", "pendiente_de_cierre", "cerrada")).toBe(true);
  });

  it("informa exactamente qué falta antes del cierre", () => {
    expect(missingClosureRequirements({ ...complete, hasEndGps: false, hasSignature: false }))
      .toEqual(["GPS de cierre", "firma del cliente"]);
    expect(canCloseOrder("pendiente_de_cierre", complete)).toBe(true);
    expect(canCloseOrder("en_proceso", complete)).toBe(false);
    expect(canCloseOrder("pendiente_de_cierre", { ...complete, hasEvidence: false })).toBe(false);
  });
});
