"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Profile = { id: string; full_name: string; email: string; role: string; is_active: boolean; created_at: string };

export function UserManagement({ profiles }: { profiles: Profile[] }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true); setMessage("");
    const form = event.currentTarget;
    const response = await fetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: String(new FormData(form).get("email") ?? ""), fullName: String(new FormData(form).get("full_name") ?? ""), role: String(new FormData(form).get("role") ?? "") }) });
    const result = await response.json().catch(() => ({ message: "No fue posible procesar la solicitud." }));
    setSending(false);
    setMessage(result.message);
    if (response.ok) { form.reset(); router.refresh(); }
  }

  return <>
    <section className="panel"><div className="panel-head"><div><h2>Invitar usuario</h2><p>El usuario recibirá un correo para activar su acceso.</p></div></div><div className="order-detail"><form className="form" onSubmit={submit}><div className="form-row"><label className="field">Nombre completo<input required name="full_name" maxLength={120} placeholder="Nombre y apellido" /></label><label className="field">Correo electrónico<input required name="email" type="email" placeholder="correo@empresa.com" /></label></div><label className="field">Rol<select name="role" defaultValue="technician"><option value="technician">Técnico</option><option value="coordinator">Coordinador</option><option value="admin">Administrador</option></select></label>{message && <div className={`notice ${message.startsWith("Invitación") ? "success" : "error"}`}>{message}</div>}<div className="actions"><button className="button" disabled={sending}>{sending ? "Enviando…" : "Enviar invitación"}</button></div></form></div></section>
    <section className="panel section-gap"><div className="panel-head"><h2>Usuarios registrados</h2></div><table><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th>Registro</th></tr></thead><tbody>{profiles.length ? profiles.map(profile => <tr key={profile.id}><td>{profile.full_name || "—"}</td><td>{profile.email}</td><td>{profile.role}</td><td>{profile.is_active ? "Activo" : "Inactivo"}</td><td>{new Date(profile.created_at).toLocaleDateString("es-GT")}</td></tr>) : <tr><td colSpan={5}>No hay usuarios registrados.</td></tr>}</tbody></table></section>
  </>;
}
