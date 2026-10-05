import { supabase } from "./supabase";
import { apiUrl } from "./web-app-url";

/**
 * Llama a la API administrativa de la versión web (invitar, editar, eliminar
 * o restablecer contraseña) usando el token de la sesión actual. La app
 * nativa no reimplementa esta lógica: reutiliza el mismo endpoint que ya
 * valida rol y permisos del lado del servidor.
 */
export async function callAdminApi(action: string, payload: Record<string, unknown>) {
  const url = apiUrl(process.env.EXPO_PUBLIC_WEB_APP_URL, "/api/admin/users");
  if (!url) return { ok: false, message: "Configura EXPO_PUBLIC_WEB_APP_URL con una URL http(s) válida en el archivo .env." };
  try {
    const { data } = await supabase.auth.getSession();
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
      body: JSON.stringify({ action, ...payload }),
    });
    const result = await response.json().catch(() => ({ message: "El servidor no devolvió una respuesta válida." }));
    return { ok: response.ok, message: String(result.message ?? "Ocurrió un error inesperado.") };
  } catch {
    return { ok: false, message: "No fue posible contactar al servidor web. Verifica tu conexión." };
  }
}
