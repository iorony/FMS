"use client";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [error, setError] = useState(""); const [loading, setLoading] = useState(false); const router = useRouter();
  async function login(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setLoading(true); setError(""); const data = new FormData(event.currentTarget); const { error } = await createClient().auth.signInWithPassword({ email: String(data.get("email")), password: String(data.get("password")) }); setLoading(false); if (error) setError("No fue posible iniciar sesión. Verifica tus credenciales."); else router.replace("/dashboard"); }
  return <main className="login"><section className="login-card"><div className="brand" style={{color:"#11223a",marginBottom:8}}>PLUS SERVICE GT<small>FIELD SERVICE MANAGEMENT</small></div><h1>Iniciar sesión</h1><p>Accede al panel operativo.</p><form onSubmit={login}><label className="field">Correo electrónico<input required name="email" type="email" autoComplete="email" /></label><label className="field">Contraseña<input required name="password" type="password" autoComplete="current-password" /></label>{error && <div className="notice error">{error}</div>}<button className="button" disabled={loading}>{loading ? "Validando…" : "Iniciar sesión"}</button></form></section></main>;
}
