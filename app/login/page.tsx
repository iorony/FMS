"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { BrandLogo } from "@/components/brand-logo";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const { error: signInError } = await createClient().auth.signInWithPassword({
      email: String(data.get("email")).trim(),
      password: String(data.get("password")),
    });
    setLoading(false);
    if (signInError) {
      setError("El correo o la contraseña no coinciden. Verifica los datos e inténtalo de nuevo.");
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <main className="auth">
      <section className="auth-card">
        <div className="brand">
          <BrandLogo />
          <span className="brand-name">Plus Service<span>Gestión de campo</span></span>
        </div>

        <h1>Iniciar sesión</h1>
        <p>Usa la cuenta que te asignó la administración de Plus Service.</p>

        <form onSubmit={login}>
          <label className="field">
            Correo electrónico
            <input required name="email" type="email" autoComplete="email" inputMode="email" placeholder="correo@empresa.com" />
          </label>

          <label className="field">
            Contraseña
            <span className="pw-wrap">
              <input
                required
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Tu contraseña"
              />
              <button type="button" className="pw-toggle" onClick={() => setShowPassword((value) => !value)}>
                {showPassword ? "Ocultar" : "Mostrar"}
              </button>
            </span>
          </label>

          {error && <p className="msg error" role="alert">{error}</p>}

          <button className="btn block" disabled={loading}>
            {loading ? "Validando…" : "Entrar al panel"}
          </button>
        </form>

        <p className="auth-foot">¿Sin acceso? Solicita una invitación al administrador del sistema.</p>
      </section>
    </main>
  );
}
