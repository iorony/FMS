"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { sentenceCase } from "@/lib/text";

type Client = { id: string; name: string; contact_name: string | null; contact_phone: string | null; email: string | null; address: string | null; is_active: boolean };
type Material = { id: string; sku: string; name: string; unit: string; unit_cost: number; minimum_quantity: number; is_active: boolean };
type Feedback = { tone: "success" | "error"; text: string } | null;

/** Botones de la columna "Acciones": el panel de edición lo pinta la fila que envuelve esta celda. */
export function CatalogActions({ open, onToggle, busy, onDelete }: { open: boolean; onToggle: () => void; busy: boolean; onDelete: () => void }) {
  return (
    <div className="catalog-actions">
      <button type="button" className="user-toggle" aria-pressed={open} aria-expanded={open} onClick={onToggle}>
        <span className="user-toggle-mark">{open ? "−" : "＋"}</span>
        Editar
      </button>
      <button type="button" className="btn ghost small" disabled={busy} onClick={onDelete}>
        Eliminar
      </button>
    </div>
  );
}

/**
 * Fila de edición a todo el ancho de la tabla. Antes el formulario completo
 * vivía apretado dentro de la celda de "Acciones"; ahora ocupa una fila propia
 * bajo el registro, con las mismas etiquetas y agrupación que el resto de la app.
 */
export function CatalogEditRow({ type, record, columns, onDone }: {
  type: "clients" | "materials"; record: Client | Material; columns: number; onDone: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const client = type === "clients" ? (record as Client) : null;
  const material = type === "materials" ? (record as Material) : null;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFeedback(null);
    const data = new FormData(event.currentTarget);
    const values = client
      ? {
          name: sentenceCase(data.get("name")),
          contact_name: sentenceCase(data.get("contact_name")) || null,
          contact_phone: String(data.get("contact_phone") || "") || null,
          email: String(data.get("email") || "") || null,
          address: sentenceCase(data.get("address")) || null,
          is_active: data.get("is_active") === "on",
        }
      : {
          sku: String(data.get("sku")).trim(),
          name: sentenceCase(data.get("name")),
          unit: sentenceCase(data.get("unit")),
          unit_cost: Number(data.get("unit_cost")),
          minimum_quantity: Number(data.get("minimum_quantity")),
          is_active: data.get("is_active") === "on",
        };

    const { error } = await createClient().from(type).update(values).eq("id", record.id);
    setBusy(false);
    if (error) {
      setFeedback({
        tone: "error",
        text: error.code === "23505" ? "Ya existe un registro con ese código." : "No se pudo guardar el registro. Revisa los datos e inténtalo nuevamente.",
      });
      return;
    }
    router.refresh();
    onDone();
  }

  return (
    <tr className="catalog-panel-row">
      <td colSpan={columns} data-label="">
        <div className="catalog-panel">
          <form className="form" onSubmit={save}>
            <div className="form-row">
              {client ? (
                <label className="field">
                  Nombre o razón social
                  <input required name="name" maxLength={160} defaultValue={client.name} />
                </label>
              ) : (
                <label className="field">
                  Código SKU
                  <input required name="sku" data-preserve-case="true" maxLength={60} defaultValue={material!.sku} />
                </label>
              )}
              {client ? (
                <label className="field">
                  Persona de contacto
                  <input name="contact_name" maxLength={120} defaultValue={client.contact_name ?? ""} />
                </label>
              ) : (
                <label className="field">
                  Nombre del material
                  <input required name="name" maxLength={160} defaultValue={material!.name} />
                </label>
              )}
            </div>

            {client ? (
              <>
                <div className="form-row">
                  <label className="field">
                    Teléfono
                    <input name="contact_phone" maxLength={30} inputMode="tel" defaultValue={client.contact_phone ?? ""} />
                  </label>
                  <label className="field">
                    Correo electrónico
                    <input name="email" type="email" maxLength={160} defaultValue={client.email ?? ""} />
                  </label>
                </div>
                <label className="field">
                  Dirección
                  <input name="address" maxLength={300} defaultValue={client.address ?? ""} />
                </label>
              </>
            ) : (
              <div className="form-row">
                <label className="field">
                  Unidad de medida
                  <input required name="unit" maxLength={30} defaultValue={material!.unit} />
                </label>
                <label className="field">
                  Costo por unidad (Q)
                  <input required name="unit_cost" type="number" min="0" step="0.01" inputMode="decimal" defaultValue={material!.unit_cost} />
                </label>
                <label className="field">
                  Cantidad mínima de compra
                  <input required name="minimum_quantity" type="number" min="0.01" step="0.01" inputMode="decimal" defaultValue={material!.minimum_quantity} />
                </label>
              </div>
            )}

            <label className="switch">
              <input name="is_active" type="checkbox" defaultChecked={record.is_active} />
              <span>{client ? "Cliente activo" : "Material activo"}</span>
            </label>

            {feedback && <p className={`msg ${feedback.tone}`} role="status">{feedback.text}</p>}

            <div className="actions">
              <button className="btn small" disabled={busy}>{busy ? "Guardando…" : "Guardar cambios"}</button>
              <button type="button" className="btn ghost small" onClick={onDone} disabled={busy}>Cancelar</button>
            </div>
          </form>
        </div>
      </td>
    </tr>
  );
}

/** Ajustar existencias es una acción del material, no una columna independiente. */
export function StockAdjustmentRow({ material, currentQuantity, columns, onDone }: {
  material: Material; currentQuantity: number; columns: number; onDone: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const quantity = Number(data.get("quantity"));
    if (!Number.isFinite(quantity) || quantity < 0) {
      setFeedback({ tone: "error", text: "Indica una existencia válida, igual o mayor que cero." });
      return;
    }
    setBusy(true); setFeedback(null);
    const { error } = await createClient().rpc("set_material_stock", {
      p_material_id: material.id,
      p_quantity: quantity,
      p_note: sentenceCase(data.get("note")) || null,
    });
    setBusy(false);
    if (error) return setFeedback({ tone: "error", text: "No fue posible actualizar la existencia. Revisa los datos e inténtalo nuevamente." });
    router.refresh(); onDone();
  }

  return (
    <tr className="catalog-panel-row">
      <td colSpan={columns} data-label="">
        <div className="catalog-panel inventory-action-panel">
          <div><strong>Ajustar existencia · {material.name}</strong><p className="help">Saldo actual: {Number(currentQuantity).toFixed(2)} {material.unit}. El nuevo saldo queda registrado en la bitácora de bodega.</p></div>
          <form className="form" onSubmit={save}>
            <div className="form-row">
              <label className="field">Existencia física final ({material.unit})<input required name="quantity" type="number" min="0" step="0.01" defaultValue={currentQuantity} inputMode="decimal" /></label>
              <label className="field">Motivo del ajuste<input name="note" required maxLength={300} placeholder="Ej. Conteo semanal de bodega" /></label>
            </div>
            {feedback && <p className={`msg ${feedback.tone}`} role="status">{feedback.text}</p>}
            <div className="actions"><button className="btn small" disabled={busy}>{busy ? "Guardando…" : "Guardar existencia"}</button><button type="button" className="btn ghost small" disabled={busy} onClick={onDone}>Cancelar</button></div>
          </form>
        </div>
      </td>
    </tr>
  );
}

export async function deleteCatalogRecord(type: "clients" | "materials", id: string, label: string) {
  if (!confirm(`¿Eliminar este ${label}? Solo será posible si no está asociado a órdenes existentes.`)) return { ok: true, deleted: false, message: "" };
  const { error } = await createClient().from(type).delete().eq("id", id);
  if (error) return { ok: false, deleted: false, message: `No se puede eliminar: tiene información relacionada. Desactívalo para conservar el historial.` };
  return { ok: true, deleted: true, message: "" };
}
