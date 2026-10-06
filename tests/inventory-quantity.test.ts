import { describe, expect, it } from "vitest";
import { assignmentBalance, inventoryQuantity } from "../mobile/lib/inventory";

describe("cantidades de inventario", () => {
  it("rechaza vacío, negativos, notación exponencial y más de dos decimales", () => {
    for (const value of ["", " ", "-1", "1e2", "Infinity", "1.001", "abc"]) expect(inventoryQuantity(value, true)).toBeNull();
  });
  it("acepta coma decimal y permite cero solo en ajuste", () => {
    expect(inventoryQuantity(" 2,50 ")).toBe(2.5);
    expect(inventoryQuantity("0")).toBeNull();
    expect(inventoryQuantity("0", true)).toBe(0);
  });
  it("descuenta consumo y devolución del saldo sin residuos decimales", () => {
    expect(assignmentBalance({ assigned_quantity: 8, consumed_quantity: 3, returned_quantity: 2 })).toBe(3);
    expect(assignmentBalance({ assigned_quantity: 0.3, consumed_quantity: 0.1, returned_quantity: 0.2 })).toBe(0);
  });
});
