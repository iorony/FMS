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
  if (profile?.role !== "admin") redirect("/dashboard");
  const { data: profiles } = await supabase.from("profiles").select("id,full_name,email,role,is_active,created_at").order("created_at", { ascending: false });
  return <AppShell><UserManagement profiles={profiles ?? []} /></AppShell>;
}
