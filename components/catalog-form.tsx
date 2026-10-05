"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { sentenceCase } from "@/lib/text";

type Feedback = { tone: "success" | "error"; text: string } | null;

export function CatalogForm({ type }: { type: "clients" | "materials" }) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [saving, setSaving] = useState(false);
  const isClient = type === "clients";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setSaving(true);
    setFeedback(null);
    const supabase = createClient();

    const { error } = isClient
      ? await supabase.from("clients").insert({
          name: sentenceCase(data.get("name")),
          contact_name: sentenceCase(data.get("contact_name")) || null,
          contact_phone: String(data.get("contact_phone") || "") || null,
          email: String(data.get("email") || "") || null,
          address: sentenceCase(data.get("address")) || null,
        })
      : await supabase.from("materials").insert({
          sku: String(data.get("sku")).trim(),
          name: sentenceCase(data.get("name")),
          unit: sentenceCase(data.get("unit")),
          unit_cost: Number(data.get("unit_cost")),
          minimum_quantity: Number(data.get("minimum_quantity")),
          is_active: true,
        });

    setSaving(false);
    if (error) {
      setFeedback({
        tone: "error",
        text: error.code === "23505"
          ? "Ya existe un registro con ese código. Usa uno distinto."
          : "No se pudo guardar el registro. Revisa los campos y tus permisos.",
      });
      return;
    }

    form.reset();
    setFeedback({ tone: "success", text: isClient ? "Cliente registrado." : "Material agregado al catálogo." });
    router.refresh();
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="form-row">
        <label className="field">
          {isClient ? "Nombre o razón social" : "Código SKU"}
          <input name={isClient ? "name" : "sku"} data-preserve-case={!isClient ? "true" : undefined} required maxLength={isClient ? 160 : 60} placeholder={isClient ? "Empresa o persona" : "Ej. CAB-UTP6"} />
        </label>
        {isClient ? (
          <label className="field">
            Persona de contacto
            <input name="contact_name" maxLength={120} placeholder="Quién recibe al técnico" />
          </label>
        ) : (
          <label className="field">
            Unidad de medida
            <input name="unit" required maxLength={30} placeholder="Unidad, metro o caja" />
          </label>
        )}
      </div>

      {isClient ? (
        <>
          <div className="form-row">
            <label className="field">
              Teléfono
              <input name="contact_phone" maxLength={30} inputMode="tel" placeholder="+502 0000 0000" />
            </label>
            <label className="field">
              Correo electrónico
              <input name="email" type="email" maxLength={160} placeholder="contacto@empresa.com" />
            </label>
          </div>
          <label className="field">
            Dirección
            <input name="address" maxLength={300} placeholder="Dirección fiscal o principal" />
          </label>
        </>
      ) : (
        <>
          <label className="field">
            Nombre del material
            <input name="name" required maxLength={160} placeholder="Descripción corta del insumo" />
          </label>
          <div className="form-row">
            <label className="field">
              Costo por unidad (Q)
              <input name="unit_cost" required type="number" min="0" step="0.01" defaultValue="0" inputMode="decimal" />
              <span className="help">Costo de una unidad de medida. Se guarda en cada consumo para conservar el historial.</span>
            </label>
            <label className="field">
              Cantidad mínima de compra
              <input name="minimum_quantity" required type="number" min="0.01" step="0.01" defaultValue="1" inputMode="decimal" />
              <span className="help">La estimación redondea la recomendación a este múltiplo.</span>
            </label>
          </div>
        </>
      )}

      {feedback && <p className={`msg ${feedback.tone}`} role="status">{feedback.text}</p>}

      <div className="actions">
        <button className="btn" disabled={saving}>{saving ? "Guardando…" : isClient ? "Registrar cliente" : "Agregar material"}</button>
      </div>
    </form>
  );
}
