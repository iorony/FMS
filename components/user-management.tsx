"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/ui";
import { CreationPanel } from "@/components/creation-panel";
import { formatDate, roleLabel } from "@/lib/ui";
import { sentenceCase } from "@/lib/text";

type Profile = { id: string; full_name: string; email: string; role: string; is_active: boolean; hourly_rate: number | null; regular_daily_minutes: number; overtime_multiplier: number; created_at: string };
type Feedback = { tone: "success" | "error"; text: string } | null;
type Props = { profiles: Profile[]; actorRole: "admin" | "coordinator" };

async function request(action: string, payload: Record<string, unknown>) {
  const response = await fetch("/api/admin/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
  });
  const raw = await response.text();
  let message = `El servidor respondió un error ${response.status}. Reinicia el servidor web y vuelve a intentarlo.`;
  try {
    const parsed = JSON.parse(raw) as { message?: unknown };
    if (parsed.message) message = String(parsed.message);
  } catch {
    /* respuesta no JSON: se conserva el mensaje de arriba */
  }
  return { ok: response.ok, message };
}

type Panel = "edit" | "password" | null;

export function UserManagement({ profiles, actorRole }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  /** El aviso se guarda por fila para que aparezca junto a la acción, no al inicio de la página. */
  const [feedback, setFeedback] = useState<Record<string, Feedback>>({});
  /** Un solo panel abierto por persona: evita dos cajas lado a lado de alto desigual. */
  const [openPanel, setOpenPanel] = useState<Record<string, Panel>>({});
  const isAdmin = actorRole === "admin";

  const togglePanel = (id: string, panel: Panel) =>
    setOpenPanel((current) => ({ ...current, [id]: current[id] === panel ? null : panel }));

  const notify = (key: string, tone: "success" | "error", text: string) =>
    setFeedback((current) => ({ ...current, [key]: { tone, text } }));

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy("invite");
    const result = await request("invite", {
      email: String(data.get("email") ?? "").trim(),
      fullName: sentenceCase(data.get("full_name")),
      role: String(data.get("role") ?? ""),
    });
    setBusy(null);
    notify("invite", result.ok ? "success" : "error", result.message);
    if (result.ok) { form.reset(); router.refresh(); }
  }

  async function edit(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(`edit-${id}`);
    const result = await request("edit", {
      id,
      fullName: sentenceCase(data.get("full_name")),
      role: String(data.get("role") ?? ""),
      isActive: data.get("is_active") === "on",
      hourlyRate: String(data.get("hourly_rate") ?? "").trim(),
      regularDailyMinutes: String(data.get("regular_daily_minutes") ?? "").trim(),
      overtimeMultiplier: String(data.get("overtime_multiplier") ?? "").trim(),
    });
    setBusy(null);
    notify(`edit-${id}`, result.ok ? "success" : "error", result.message);
    if (result.ok) { setOpenPanel((current) => ({ ...current, [id]: null })); router.refresh(); }
  }

  async function resetPassword(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const password = String(new FormData(form).get("password") ?? "");
    if (password.length < 8) {
      return notify(`password-${id}`, "error", "La contraseña temporal debe tener al menos 8 caracteres.");
    }
    setBusy(`password-${id}`);
    const result = await request("resetPassword", { id, password });
    setBusy(null);
    notify(`password-${id}`, result.ok ? "success" : "error", result.message);
    if (result.ok) { form.reset(); setOpenPanel((current) => ({ ...current, [id]: null })); }
  }

  async function remove(id: string) {
    if (!confirm("¿Eliminar esta cuenta? Esta acción revoca su acceso.")) return;
    setBusy(`delete-${id}`); const result = await request("delete", { id }); setBusy(null);
    notify(`delete-${id}`, result.ok ? "success" : "error", result.message); if (result.ok) router.refresh();
  }

  return (
    <div className="stack">
      {isAdmin && (
        <CreationPanel title="Invitar a una persona">
            <p className="help">Recibirá un correo para crear su contraseña y entrar con el rol asignado.</p>
            <form className="form" onSubmit={invite}>
              <div className="form-row">
                <label className="field">
                  Nombre completo
                  <input required name="full_name" maxLength={120} placeholder="Nombre y apellido" />
                </label>
                <label className="field">
                  Correo electrónico
                  <input required name="email" type="email" placeholder="correo@empresa.com" />
                </label>
              </div>
              <label className="field">
                Rol
                <select name="role" defaultValue="technician">
                  <option value="technician">Técnico — ejecuta órdenes en campo</option>
                  <option value="coordinator">Coordinador — planifica y cierra órdenes</option>
                  <option value="admin">Administrador — gestiona usuarios y catálogos</option>
                </select>
              </label>
              {feedback.invite && <p className={`msg ${feedback.invite.tone}`} role="status">{feedback.invite.text}</p>}
              <div className="actions">
                <button className="btn" disabled={busy !== null}>
                  {busy === "invite" ? "Enviando…" : "Enviar invitación"}
                </button>
              </div>
            </form>
        </CreationPanel>
      )}

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>{isAdmin ? "Personas con acceso" : "Restablecer acceso técnico"}</h2>
            <p>
              {isAdmin
                ? "Edita nombre, rol y estado de una cuenta, o define una contraseña temporal."
                : "Puedes definir una contraseña temporal para un técnico cuando pierda el acceso."}
            </p>
          </div>
        </div>

        {profiles.length ? (
          <div>
            {profiles.map((profile) => {
              const editKey = `edit-${profile.id}`;
              const passwordKey = `password-${profile.id}`;
              const canEdit = isAdmin;
              const canResetPassword = isAdmin || profile.role === "technician";
              const active = openPanel[profile.id] ?? null;

              return (
                <article className="user-card" key={profile.id}>
                  <div className="user-top">
                    <div className="user-id">
                      <span className="user-name">{profile.full_name || "Sin nombre"}</span>
                      <span className="user-meta">
                        {profile.email} · {roleLabel(profile.role)} · alta {formatDate(profile.created_at)}
                      </span>
                      {profile.role === "technician" && <span className="user-meta"><strong>Configuración de pago:</strong> {profile.hourly_rate === null ? "tarifa pendiente" : `Q ${Number(profile.hourly_rate).toFixed(2)} / hora`} · jornada {profile.regular_daily_minutes / 60} h · extra ×{profile.overtime_multiplier}</span>}
                    </div>
                    <span className={`badge ${profile.is_active ? "cerrada" : "borrador"}`}>
                      {profile.is_active ? "Activo" : "Inactivo"}
                    </span>
                  </div>

                  {(canEdit || canResetPassword) && (
                    <div className="user-tools">
                      {canEdit && (
                        <button
                          type="button"
                          className="user-toggle"
                          aria-pressed={active === "edit"}
                          aria-expanded={active === "edit"}
                          onClick={() => togglePanel(profile.id, "edit")}
                        >
                          <span className="user-toggle-mark">{active === "edit" ? "−" : "＋"}</span>
                          {profile.role === "technician" ? "Editar acceso y pago" : "Editar acceso"}
                        </button>
                      )}
                      {canResetPassword && (
                        <button
                          type="button"
                          className="user-toggle"
                          aria-pressed={active === "password"}
                          aria-expanded={active === "password"}
                          onClick={() => togglePanel(profile.id, "password")}
                        >
                          <span className="user-toggle-mark">{active === "password" ? "−" : "＋"}</span>
                          Restablecer contraseña
                        </button>
                      )}
                      {isAdmin && <button type="button" className="user-toggle" disabled={busy !== null} onClick={() => remove(profile.id)}>Eliminar cuenta</button>}
                    </div>
                  )}

                  {active === null && [editKey, passwordKey, `delete-${profile.id}`].map((key) => feedback[key] && <p key={key} className={`msg ${feedback[key]!.tone}`} role="status">{feedback[key]!.text}</p>)}

                  {active === "edit" && canEdit && (
                    <div className="user-panel">
                      <form className="inline-form" onSubmit={(event) => edit(event, profile.id)}>
                        <label className="field">
                          Nombre completo
                          <input required name="full_name" maxLength={120} defaultValue={profile.full_name} />
                        </label>
                        <label className="field">
                          Rol
                          <select name="role" defaultValue={profile.role}>
                            <option value="technician">Técnico</option>
                            <option value="coordinator">Coordinador</option>
                            <option value="admin">Administrador</option>
                          </select>
                        </label>
                        {profile.role === "technician" && (
                          <><label className="field">Tarifa por hora (Q)<input name="hourly_rate" type="number" min="0" step="0.01" defaultValue={profile.hourly_rate ?? ""} placeholder="Ej.: 45.00" /><span className="help">Se utiliza para estimar el pago según las horas validadas por GPS.</span></label><label className="field">Jornada normal (minutos)<input name="regular_daily_minutes" type="number" min="60" max="1440" step="15" defaultValue={profile.regular_daily_minutes} /><span className="help">El excedente se toma como hora extra.</span></label><label className="field">Multiplicador de hora extra<input name="overtime_multiplier" type="number" min="1" max="5" step="0.01" defaultValue={profile.overtime_multiplier} /></label></>
                        )}
                        <label className="switch">
                          <input type="checkbox" name="is_active" defaultChecked={profile.is_active} />
                          <span>Cuenta activa</span>
                        </label>
                        <span className="help">Una cuenta inactiva no puede iniciar sesión ni recibir órdenes.</span>
                        {feedback[editKey] && <p className={`msg ${feedback[editKey]!.tone}`} role="status">{feedback[editKey]!.text}</p>}
                        <div className="actions">
                          <button className="btn small" disabled={busy !== null}>
                            {busy === editKey ? "Guardando…" : "Guardar cambios"}
                          </button>
                          <button type="button" className="btn ghost small" disabled={busy !== null} onClick={() => togglePanel(profile.id, "edit")}>Descartar cambios</button>
                        </div>
                      </form>
                    </div>
                  )}

                  {active === "password" && canResetPassword && (
                    <div className="user-panel">
                      <form className="inline-form" onSubmit={(event) => resetPassword(event, profile.id)}>
                        <label className="field">
                          Contraseña temporal
                          <input required name="password" type="password" minLength={8} autoComplete="new-password" placeholder="Mínimo 8 caracteres" />
                        </label>
                        <span className="help">Comunícala de forma segura; no se muestra de nuevo ni queda visible en pantalla.</span>
                        {feedback[passwordKey] && <p className={`msg ${feedback[passwordKey]!.tone}`} role="status">{feedback[passwordKey]!.text}</p>}
                        <div className="actions">
                          <button className="btn ghost small" disabled={busy !== null}>
                            {busy === passwordKey ? "Actualizando…" : "Cambiar contraseña"}
                          </button>
                          <button type="button" className="btn ghost small" disabled={busy !== null} onClick={() => togglePanel(profile.id, "password")}>Cancelar</button>
                        </div>
                      </form>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title="No hay cuentas para mostrar"
            hint={isAdmin ? "Invita a la primera persona desde el formulario de arriba." : "No hay técnicos registrados todavía."}
          />
        )}
      </section>
    </div>
  );
}
