import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { UserManagement } from "@/components/user-management";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin" && profile?.role !== "coordinator") redirect("/dashboard");

  let query = supabase
    .from("profiles")
    .select("id,full_name,email,role,is_active,created_at")
    .order("created_at", { ascending: false });
  if (profile.role === "coordinator") query = query.eq("role", "technician");
  const { data: profiles } = await query;

  // La lista de personas no depende de la tarifa. Así el directorio sigue
  // visible si una instalación antigua aún no ejecutó la migración de nómina.
  const { data: rates } = await supabase.from("profiles").select("id,hourly_rate,regular_daily_minutes,overtime_multiplier");
  const payrollByUser = new Map((rates ?? []).map((item) => [item.id, item]));
  const profilesWithRates = (profiles ?? []).map((item) => ({ ...item, hourly_rate: payrollByUser.get(item.id)?.hourly_rate ?? null, regular_daily_minutes: payrollByUser.get(item.id)?.regular_daily_minutes ?? 480, overtime_multiplier: payrollByUser.get(item.id)?.overtime_multiplier ?? 1.5 }));

  return (
    <AppShell
      title={profile.role === "admin" ? "Usuarios y roles" : "Acceso de técnicos"}
      description={profile.role === "admin" ? "Edita cuentas, roles y estado de acceso del sistema." : "Restablece contraseñas de técnicos cuando sea necesario."}
    >
      <UserManagement profiles={profilesWithRates} actorRole={profile.role} />
    </AppShell>
  );
}
