export type Classification = { category: string; confidence: number };

/** Validates the minimal response contract accepted from the AI provider. */
export function parseClassification(value: string): Classification {
  const match = value.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("El servicio de IA no devolvió una clasificación válida.");
  const parsed = JSON.parse(match[0]) as Partial<Classification>;
  if (
    typeof parsed.category !== "string"
    || !parsed.category.trim()
    || typeof parsed.confidence !== "number"
    || parsed.confidence < 0
    || parsed.confidence > 1
  ) {
    throw new Error("El servicio de IA devolvió una clasificación incompleta.");
  }
  return { category: parsed.category.trim().slice(0, 120), confidence: parsed.confidence };
}
