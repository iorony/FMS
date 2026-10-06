/** Normaliza textos descriptivos sin alterar códigos, correos ni números. */
export function sentenceCase(value: FormDataEntryValue | string | null | undefined) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!text) return "";
  return text.charAt(0).toLocaleUpperCase("es-GT") + text.slice(1).toLocaleLowerCase("es-GT");
}

/** Evita exponer detalles de proveedores o base de datos en la interfaz. */
export function userErrorMessage(error: unknown, fallback: string) {
  const raw = error instanceof Error ? error.message : typeof error === "object" && error !== null && "message" in error ? error.message : "";
  const message = typeof raw === "string" ? raw.trim() : "";
  const safePrefixes = [
    "Tu sesión", "No autorizado", "No tienes permiso", "La orden", "Primero ",
    "Escribe ", "No hay ", "Este dispositivo", "Autoriza ", "Se requiere ",
    "Existencia insuficiente:", "La cantidad ", "La devolución ", "La existencia ", "El material ", "El cliente ",
  ];
  return safePrefixes.some((prefix) => message.startsWith(prefix)) ? message : fallback;
}
