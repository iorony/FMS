import { NextResponse } from "next/server";
import { POST as classifyEvidence } from "@/app/api/ai/classify-evidence/route";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Drains a small batch so photo uploads never wait on the model. Vercel Cron
 * invokes this endpoint; its secret is also required for direct calls.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET ?? process.env.AI_JOB_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  try {
    const admin = createAdminClient();
    const { data: jobs, error } = await admin.from("ai_jobs")
      .select("id,evidence_id,attempts")
      .eq("job_type", "classify_evidence")
      .eq("status", "queued")
      .lte("scheduled_at", new Date().toISOString())
      .order("created_at")
      .limit(5);
    if (error) throw error;

    let completed = 0;
    for (const job of jobs ?? []) {
      await admin.from("ai_jobs").update({ status: "processing", attempts: job.attempts + 1 }).eq("id", job.id);
      const response = await classifyEvidence(new Request("http://internal/api/ai/classify-evidence", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-ai-job-secret": secret },
        body: JSON.stringify({ evidenceId: job.evidence_id }),
      }));
      if (response.ok) {
        await admin.from("ai_jobs").update({ status: "completed", completed_at: new Date().toISOString(), last_error: null }).eq("id", job.id);
        completed += 1;
      } else {
        const payload = await response.json().catch(() => ({ error: "Error de clasificación." }));
        const retryAt = new Date(Date.now() + Math.min(60, 2 ** (job.attempts + 1)) * 60_000).toISOString();
        await admin.from("ai_jobs").update({ status: job.attempts >= 2 ? "failed" : "queued", scheduled_at: retryAt, last_error: payload.error ?? "Error de clasificación." }).eq("id", job.id);
      }
    }
    return NextResponse.json({ processed: jobs?.length ?? 0, completed });
  } catch {
    return NextResponse.json({ error: "No fue posible procesar las evidencias pendientes." }, { status: 500 });
  }
}
