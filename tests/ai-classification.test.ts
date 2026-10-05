import { describe, expect, it } from "vitest";
import { parseClassification } from "../lib/ai-classification";

describe("contrato de clasificación asistida", () => {
  it("acepta JSON rodeado de texto y normaliza la categoría", () => {
    expect(parseClassification('Resultado: {"category":" cableado ","confidence":0.87}'))
      .toEqual({ category: "cableado", confidence: 0.87 });
  });

  it("rechaza respuestas incompletas o con confianza fuera de rango", () => {
    expect(() => parseClassification('{"category":"","confidence":0.5}')).toThrow("incompleta");
    expect(() => parseClassification('{"category":"otro","confidence":1.1}')).toThrow("incompleta");
    expect(() => parseClassification("sin JSON")).toThrow("válida");
  });
});
