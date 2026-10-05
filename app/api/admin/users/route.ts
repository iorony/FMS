import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { sentenceCase } from "@/lib/text";

const roles = ["admin", "coordinator", "technician"] as const;
type Role = typeof roles[number];
type Body = { action?: unknown; id?: unknown; email?: unknown; fullName?: unknown; role?: unknown; isActive?: unknown; hourlyRate?: unknown; regularDailyMinutes?: unknown; overtimeMultiplier?: unknown; password?: unknown };
const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export async function POST(request: Request) {
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ message: "Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor. Esta clave es necesaria para administrar invitaciones y contraseñas." }, { status: 503 });
  }
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const supabase = await createClient();
  const { data: { user } } = bearer ? await admin.auth.getUser(bearer) : await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Sesión no válida." }, { status: 401 });
  const actorQuery = bearer ? admin.from("profiles") : supabase.from("profiles");
  const { data: actor } = await actorQuery.select("role").eq("id", user.id).single();
  if (actor?.role !== "admin" && actor?.role !== "coordinator") return NextResponse.json({ message: "No tienes permiso para administrar accesos." }, { status: 403 });

  const body = await request.json().catch(() => null) as Body | null;
  const action = body?.action;
  const id = typeof body?.id === "string" ? body.id : "";

  if (action === "invite") {
    if (actor.role !== "admin") return NextResponse.json({ message: "Solo administración puede invitar usuarios." }, { status: 403 });
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const fullName = typeof body?.fullName === "string" ? sentenceCase(body.fullName) : "";
    const role = body?.role;
    if (!/^\S+@\S+\.\S+$/.test(email) || !fullName || fullName.length > 120 || !roles.includes(role as Role)) return NextResponse.json({ message: "Completa nombre, correo y rol con valores válidos." }, { status: 400 });
    const origin = new URL(request.url).origin;
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { data: { full_name: fullName }, redirectTo: `${origin}/login` });
    if (error || !data.user) return NextResponse.json({ message: "No fue posible enviar la invitación. Verifica el correo e inténtalo nuevamente." }, { status: 400 });
    const { error: profileError } = await admin.from("profiles").upsert({ id: data.user.id, email, full_name: fullName, role, is_active: true }, { onConflict: "id" });
    if (profileError) return NextResponse.json({ message: "La invitación se envió, pero no se pudo asignar el rol. Revísalo en Supabase." }, { status: 500 });
    return NextResponse.json({ message: `Invitación enviada a ${email}.` });
  }

  if (!isUuid(id)) return NextResponse.json({ message: "Usuario inválido." }, { status: 400 });

  if (action === "edit") {
    if (actor.role !== "admin") return NextResponse.json({ message: "Solo administración puede editar usuarios." }, { status: 403 });
    const fullName = typeof body?.fullName === "string" ? sentenceCase(body.fullName) : "";
    const role = body?.role;
    const hourlyRateText = typeof body?.hourlyRate === "string" ? body.hourlyRate.trim() : "";
    const hourlyRate = hourlyRateText === "" ? null : Number(hourlyRateText);
    const regularDailyMinutes = Number(body?.regularDailyMinutes ?? 480); const overtimeMultiplier = Number(body?.overtimeMultiplier ?? 1.5);
    if (!fullName || fullName.length > 120 || !roles.includes(role as Role) || typeof body?.isActive !== "boolean" || (hourlyRate !== null && (!Number.isFinite(hourlyRate) || hourlyRate < 0)) || !Number.isInteger(regularDailyMinutes) || regularDailyMinutes < 60 || regularDailyMinutes > 1440 || !Number.isFinite(overtimeMultiplier) || overtimeMultiplier < 1 || overtimeMultiplier > 5) return NextResponse.json({ message: "Completa los datos de edición con valores válidos." }, { status: 400 });
    const { error } = await admin.from("profiles").update({ full_name: fullName, role, is_active: body.isActive, hourly_rate: role === "technician" ? hourlyRate : null, regular_daily_minutes: role === "technician" ? regularDailyMinutes : 480, overtime_multiplier: role === "technician" ? overtimeMultiplier : 1.5 }).eq("id", id);
    if (error) return NextResponse.json({ message: "No fue posible actualizar el usuario. Inténtalo nuevamente." }, { status: 400 });
    return NextResponse.json({ message: "Usuario actualizado correctamente." });
  }

  if (action === "delete") {
    if (actor.role !== "admin") return NextResponse.json({ message: "Solo administración puede eliminar usuarios." }, { status: 403 });
    if (id === user.id) return NextResponse.json({ message: "No puedes eliminar tu propia cuenta." }, { status: 400 });
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) return NextResponse.json({ message: "No fue posible eliminar el usuario. Inténtalo nuevamente." }, { status: 400 });
    return NextResponse.json({ message: "Usuario eliminado correctamente." });
  }

  if (action === "resetPassword") {
    const password = typeof body?.password === "string" ? body.password : "";
    if (password.length < 8 || password.length > 128 || /\u0000/.test(password)) return NextResponse.json({ message: "La contraseña debe tener entre 8 y 128 caracteres válidos." }, { status: 400 });
    const { data: target, error: targetError } = await admin.from("profiles").select("role,email").eq("id", id).single();
    if (targetError || !target) return NextResponse.json({ message: "No fue posible localizar al usuario." }, { status: 404 });
    if (actor.role === "coordinator" && target.role !== "technician") return NextResponse.json({ message: "Coordinación solo puede cambiar contraseñas de técnicos." }, { status: 403 });
    const { error } = await admin.auth.admin.updateUserById(id, { password });
    if (error) return NextResponse.json({ message: "No fue posible actualizar la contraseña. Inténtalo nuevamente." }, { status: 400 });
    return NextResponse.json({ message: `Contraseña actualizada para ${target.email}.` });
  }

  return NextResponse.json({ message: "Acción no reconocida." }, { status: 400 });
}
