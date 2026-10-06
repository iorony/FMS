import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Summary = { summary: string; alerts: string[] };

export async function POST(request: Request) {
  try {
    const { orderId } = await request.json() as { orderId?: string };
    if (!orderId) return NextResponse.json({ error: "La orden es obligatoria." }, { status: 400 });
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    if (!profile || !["admin", "coordinator"].includes(profile.role)) return NextResponse.json({ error: "No tienes permiso para generar resúmenes." }, { status: 403 });
    const { data: order, error } = await supabase.from("work_orders")
      .select("code,status,priority,address,description,scheduled_at,started_at,closed_at,clients(name),location_records(record_type,captured_at,accuracy_meters),work_order_materials(quantity,unit,note,materials(name)),evidences(suggested_category,final_category,review_status,confidence),customer_signatures(signer_name,signed_at)")
      .eq("id", orderId).single();
    if (error || !order) return NextResponse.json({ error: "No se encontró la orden." }, { status: 404 });
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_TEXT_MODEL ?? process.env.OPENAI_VISION_MODEL;
    if (!apiKey || !model) return NextResponse.json({ error: "El resumen IA no está configurado." }, { status: 503 });
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model, store: false, max_output_tokens: 500,
        input: [{ role: "user", content: [{ type: "input_text", text: `Redacta un borrador objetivo de cierre de una orden de instalación. No inventes hechos, no declares correcto el trabajo y señala información faltante o inconsistente como alertas. Datos:\n${JSON.stringify(order)}` }] }],
        text: { format: { type: "json_schema", name: "order_close_summary", strict: true, schema: { type: "object", properties: { summary: { type: "string" }, alerts: { type: "array", items: { type: "string" } } }, required: ["summary", "alerts"], additionalProperties: false } } },
      }),
    });
    const payload = await response.json() as { output_text?: string; error?: { message?: string } };
    if (!response.ok) throw new Error(payload.error?.message || "No fue posible generar el resumen.");
    const parsed = JSON.parse(payload.output_text ?? "") as Partial<Summary>;
    if (typeof parsed.summary !== "string" || !Array.isArray(parsed.alerts)) throw new Error("El resumen IA no cumplió el formato esperado.");
    const result: Summary = { summary: parsed.summary.trim().slice(0, 3000), alerts: parsed.alerts.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, 12) };
    if (!result.summary) throw new Error("El resumen IA quedó vacío.");
    const { error: saveError } = await supabase.from("work_order_ai_summaries").insert({ work_order_id: orderId, summary: result.summary, alerts: result.alerts, model_version: model, prompt_version: "order-close-summary-v1", created_by: user.id });
    if (saveError) throw new Error("No fue posible guardar el resumen.");
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "No fue posible generar el resumen asistido. Inténtalo nuevamente." }, { status: 500 });
  }
}
