import { describe, expect, it } from "vitest";
import { evidenceClassificationLabels, parseClassification } from "../lib/ai-classification";

describe("contrato de clasificación de evidencias", () => {
  it("acepta una respuesta JSON del esquema permitido", () => {
    const labels = ["cableado", "otro"];
    expect(parseClassification('{"category":"cableado","confidence":0.82}', labels)).toEqual({
      category: "cableado",
      confidence: 0.82,
    });
  });

  it("rechaza categorías que no pertenecen al catálogo", () => {
    expect(() => parseClassification('{"category":"inventada","confidence":0.5}', ["otro"])).toThrow("no permitida");
  });

  it("usa el catálogo predeterminado cuando la configuración no es válida", () => {
    expect(evidenceClassificationLabels(" , ")).toContain("otro");
  });
});
