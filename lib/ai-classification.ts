export type Classification = { category: string; confidence: number };

export const DEFAULT_EVIDENCE_CLASSIFICATION_LABELS = [
  "instalación terminada",
  "cableado",
  "equipo instalado",
  "incidencia",
  "seguridad",
  "otro",
] as const;

/**
 * Converts the environment setting into a stable, safe enum for the model and
 * for the database boundary. The fallback means a malformed deployment setting
 * cannot silently allow arbitrary categories to enter the review queue.
 */
export function evidenceClassificationLabels(value = process.env.EVIDENCE_CLASSIFICATION_LABELS): string[] {
  const labels = value
    ?.split(",")
    .map((label) => label.trim())
    .filter(Boolean)
    .filter((label, index, all) => all.indexOf(label) === index)
    .filter((label) => label.length <= 120);
  return labels?.length ? labels : [...DEFAULT_EVIDENCE_CLASSIFICATION_LABELS];
}

/** Validates the strict response contract accepted from the AI provider. */
export function parseClassification(value: string, allowedCategories?: readonly string[]): Classification {
  let parsed: Partial<Classification>;
  try {
    parsed = JSON.parse(value.trim()) as Partial<Classification>;
  } catch {
    throw new Error("El servicio de IA no devolvió una clasificación válida.");
  }
  if (
    typeof parsed.category !== "string"
    || !parsed.category.trim()
    || typeof parsed.confidence !== "number"
    || parsed.confidence < 0
    || parsed.confidence > 1
  ) {
    throw new Error("El servicio de IA devolvió una clasificación incompleta.");
  }
  const category = parsed.category.trim();
  if (allowedCategories && !allowedCategories.includes(category)) {
    throw new Error("El servicio de IA devolvió una categoría no permitida.");
  }
  return { category: category.slice(0, 120), confidence: parsed.confidence };
}
