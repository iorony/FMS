import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const roles = ["admin", "coordinator", "technician"] as const;
type Role = typeof roles[number];

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Sesión no válida." }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ message: "Solo un administrador puede crear usuarios." }, { status: 403 });

  const body = await request.json().catch(() => null) as { email?: unknown; fullName?: unknown; role?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const fullName = typeof body?.fullName === "string" ? body.fullName.trim() : "";
  const role = body?.role;
  if (!/^\S+@\S+\.\S+$/.test(email) || !fullName || fullName.length > 120 || !roles.includes(role as Role)) {
    return NextResponse.json({ message: "Completa nombre, correo y rol con valores válidos." }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const origin = new URL(request.url).origin;
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName },
      redirectTo: `${origin}/login`,
    });
    if (error || !data.user) return NextResponse.json({ message: error?.message ?? "No fue posible enviar la invitación." }, { status: 400 });

    const { error: profileError } = await admin.from("profiles").upsert({ id: data.user.id, email, full_name: fullName, role, is_active: true }, { onConflict: "id" });
    if (profileError) return NextResponse.json({ message: "La invitación se envió, pero no se pudo asignar el rol. Revísalo en Supabase." }, { status: 500 });

    return NextResponse.json({ message: `Invitación enviada a ${email}.` });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No fue posible crear el usuario.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
