"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

export function SignOutButton({ label = "Cerrar sesión" }: { label?: string }) {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  async function signOut() {
    setLeaving(true);
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <button type="button" className="signout" onClick={signOut} disabled={leaving}>
      {leaving ? "Saliendo…" : label}
    </button>
  );
}
