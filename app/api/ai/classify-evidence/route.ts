import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { parseClassification } from "@/lib/ai-classification";

export async function POST(request: Request) {
  try {
    const { evidenceId } = await request.json() as { evidenceId?: string };
    if (!evidenceId) return NextResponse.json({ error: "La evidencia es obligatoria." }, { status: 400 });

    // La app nativa no tiene cookies de sesión: acepta también un token Bearer,
    // igual que /api/admin/users, verificado con el cliente de servicio.
    let admin: ReturnType<typeof createAdminClient>;
    try {
      admin = createAdminClient();
    } catch {
      return NextResponse.json({ error: "La clasificación IA no está configurada. Define SUPABASE_SERVICE_ROLE_KEY en el servidor." }, { status: 503 });
    }
    const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    const supabase = await createClient();
    const { data: { user } } = bearer ? await admin.auth.getUser(bearer) : await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
    const profileQuery = bearer ? admin.from("profiles") : supabase.from("profiles");
    const { data: profile } = await profileQuery.select("role").eq("id", user.id).single();
    if (!profile || !["admin", "coordinator"].includes(profile.role)) return NextResponse.json({ error: "No tienes permiso para clasificar evidencias." }, { status: 403 });

    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_VISION_MODEL;
    if (!apiKey || !model) return NextResponse.json({ error: "La clasificación IA no está configurada. Define OPENAI_API_KEY y OPENAI_VISION_MODEL en el servidor." }, { status: 503 });

    const evidenceQuery = bearer ? admin.from("evidences") : supabase.from("evidences");
    const { data: evidence, error: evidenceError } = await evidenceQuery.select("id,storage_path").eq("id", evidenceId).single();
    if (evidenceError || !evidence) return NextResponse.json({ error: "No se encontró la evidencia." }, { status: 404 });
    const { data: signed, error: signedError } = await admin.storage.from("evidences").createSignedUrl(evidence.storage_path, 600);
    if (signedError || !signed) throw new Error("No se pudo preparar la imagen privada para clasificación.");

    const labels = process.env.EVIDENCE_CLASSIFICATION_LABELS || "instalación terminada, cableado, equipo instalado, incidencia, seguridad, otro";
    const aiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        store: false,
        input: [{ role: "user", content: [
          { type: "input_text", text: `Clasifica esta evidencia de una instalación de red. Usa una categoría de esta lista: ${labels}. Responde solo JSON válido con {"category":"...","confidence":0 a 1}. Si no es posible determinarlo, usa "otro" con confianza baja.` },
          { type: "input_image", image_url: signed.signedUrl, detail: "low" },
        ] }],
      }),
    });
    const payload = await aiResponse.json() as { output_text?: string; error?: { message?: string } };
    if (!aiResponse.ok) throw new Error("No fue posible clasificar la evidencia.");
    const result = parseClassification(payload.output_text || "");
    // El cliente de servicio se usa únicamente para leer el archivo privado.
    // La RPC debe conservar el JWT del móvil: de otro modo auth.uid() sería
    // null y PostgreSQL rechazaría la clasificación aunque ya se validó al
    // coordinador en esta ruta.
    const rpcClient = bearer
      ? createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        { global: { headers: { Authorization: `Bearer ${bearer}` } } },
      )
      : supabase;
    const { error: saveError } = await rpcClient.rpc("record_evidence_classification", {
      evidence_id: evidenceId, category: result.category, confidence_value: result.confidence, version: model,
    });
    if (saveError) throw new Error("No fue posible guardar la clasificación de la evidencia.");
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: "No fue posible clasificar la evidencia. Inténtalo nuevamente." }, { status: 500 });
  }
}
