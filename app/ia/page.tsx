import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

type EvidenceQuality = { model_version: string | null; reviewed_samples: number; matching_reviews: number; agreement_percent: number | null; average_confidence: number | null };
type MaterialQuality = { model_version: string | null; compared_materials: number; mean_absolute_error: number | null; mean_absolute_cost_error: number | null };

const percentage = (value: number | null) => value === null ? "—" : `${Number(value).toFixed(1)}%`;
const quantity = (value: number | null) => value === null ? "—" : Number(value).toFixed(2);

export default async function AiQualityPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || profile.role === "technician") redirect("/dashboard");
  const [{ data: evidenceRows }, { data: materialRows }] = await Promise.all([
    supabase.from("evidence_classification_quality").select("model_version,reviewed_samples,matching_reviews,agreement_percent,average_confidence").order("model_version"),
    supabase.from("material_prediction_quality").select("model_version,compared_materials,mean_absolute_error,mean_absolute_cost_error").order("model_version"),
  ]);
  const evidence = (evidenceRows ?? []) as EvidenceQuality[];
  const materials = (materialRows ?? []) as MaterialQuality[];
  return <AppShell title="Calidad de IA" description="Métricas reales calculadas a partir de revisiones y consumos cerrados; no sustituyen la validación humana.">
    <section className="panel">
      <div className="panel-head"><div><h2>Clasificación de evidencias</h2><p>Compara la sugerencia con la categoría final que confirmó o corrigió el equipo.</p></div></div>
      {evidence.length ? <table className="table-stack"><thead><tr><th>Modelo</th><th>Revisadas</th><th>Coincidencias</th><th>Acuerdo</th><th>Confianza media</th></tr></thead><tbody>{evidence.map((row) => <tr key={row.model_version ?? "sin-modelo"}><td data-label="Modelo">{row.model_version ?? "Sin versión"}</td><td data-label="Revisadas">{row.reviewed_samples}</td><td data-label="Coincidencias">{row.matching_reviews}</td><td data-label="Acuerdo"><strong>{percentage(row.agreement_percent)}</strong></td><td data-label="Confianza media">{row.average_confidence === null ? "—" : `${Math.round(Number(row.average_confidence) * 100)}%`}</td></tr>)}</tbody></table> : <div className="panel-body"><EmptyState title="Aún no hay revisiones comparables" hint="Clasifica evidencias y confirma o corrige su categoría para alimentar esta métrica." /></div>}
    </section>
    <section className="panel">
      <div className="panel-head"><div><h2>Estimación de materiales</h2><p>El error absoluto compara la predicción aceptada con el consumo real de órdenes cerradas.</p></div></div>
      {materials.length ? <table className="table-stack"><thead><tr><th>Modelo</th><th>Materiales comparados</th><th>Error de cantidad</th><th>Error de costo</th></tr></thead><tbody>{materials.map((row) => <tr key={row.model_version ?? "sin-modelo"}><td data-label="Modelo">{row.model_version ?? "Sin versión"}</td><td data-label="Comparados">{row.compared_materials}</td><td data-label="Error de cantidad">{quantity(row.mean_absolute_error)}</td><td data-label="Error de costo">Q {quantity(row.mean_absolute_cost_error)}</td></tr>)}</tbody></table> : <div className="panel-body"><EmptyState title="Aún no hay estimaciones comparables" hint="Genera estimaciones y cierra órdenes con consumos reales para medir su desempeño." /></div>}
    </section>
  </AppShell>;
}
