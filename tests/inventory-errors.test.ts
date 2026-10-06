import { describe, expect, it } from "vitest";
import { userErrorMessage } from "../lib/text";

describe("inventory business feedback", () => {
  it("shows a useful stock error from a Supabase response object", () => {
    expect(userErrorMessage({ code: "P0001", message: "Existencia insuficiente: disponible 20 Unidad" }, "Error genérico")).toBe("Existencia insuficiente: disponible 20 Unidad");
  });
  it("keeps technical database details private", () => {
    expect(userErrorMessage({ message: "permission denied for relation secret_table" }, "No fue posible guardar.")).toBe("No fue posible guardar.");
  });
  it("accepts only a string message", () => {
    expect(userErrorMessage({ message: 42 }, "Error genérico")).toBe("Error genérico");
  });
});
