"use client";

import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { formatDateTime } from "@/lib/ui";
import { sentenceCase, userErrorMessage } from "@/lib/text";

type Requirements = { inicio: boolean; cierre: boolean; materiales: boolean; evidencias: boolean; firma: boolean };
type Feedback = { tone: "success" | "error"; text: string } | null;

type Props = {
  orderId: string;
  status: string;
  canSign: boolean;
  canClose: boolean;
  signature: { signer_name: string; signed_at: string } | null;
  requirements: Requirements;
};

const CHECKLIST: { key: keyof Requirements; label: string }[] = [
  { key: "inicio", label: "GPS de llegada al sitio" },
  { key: "cierre", label: "GPS de salida del sitio" },
  { key: "materiales", label: "Al menos un material registrado" },
  { key: "evidencias", label: "Al menos una evidencia fotográfica" },
  { key: "firma", label: "Firma de conformidad del cliente" },
];

/** Panel de firma: el técnico captura la conformidad con el dedo en el celular. */
function SignaturePad({ onSave, busy }: { onSave: (blob: Blob, signerName: string) => void; busy: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasStrokes, setHasStrokes] = useState(false);
  const [signerName, setSignerName] = useState("");

  function context() {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    if (canvas.width !== canvas.offsetWidth * 2) {
      canvas.width = canvas.offsetWidth * 2;
      canvas.height = canvas.offsetHeight * 2;
    }
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#17222e";
    }
    return ctx;
  }

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * 2, y: (event.clientY - rect.top) * 2 };
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    const ctx = context();
    if (!ctx) return;
    const { x, y } = point(event);
    ctx.beginPath();
    ctx.moveTo(x, y);
    drawing.current = true;
    setHasStrokes(true);
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    event.preventDefault();
    const ctx = context();
    if (!ctx) return;
    const { x, y } = point(event);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function stop() { drawing.current = false; }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasStrokes(false);
  }

  function save() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Fondo blanco: el PNG se archiva como comprobante impreso.
    const flattened = document.createElement("canvas");
    flattened.width = canvas.width;
    flattened.height = canvas.height;
    const ctx = flattened.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, flattened.width, flattened.height);
    ctx.drawImage(canvas, 0, 0);
    flattened.toBlob((blob) => { if (blob) onSave(blob, sentenceCase(signerName)); }, "image/png");
  }

  return (
    <div className="inline-form">
      <input
        maxLength={120}
        placeholder="Nombre de quien recibe el servicio"
        value={signerName}
        onChange={(event) => setSignerName(event.target.value)}
        aria-label="Nombre de quien recibe el servicio"
      />
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: 168, border: "1.5px dashed #c8d3dd", borderRadius: 10, background: "#fff", touchAction: "none" }}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={stop}
        onPointerLeave={stop}
        aria-label="Área de firma"
      />
      <span className="help">Pide al cliente que firme con el dedo dentro del recuadro.</span>
      <div className="actions">
        <button type="button" className="btn" onClick={save} disabled={busy || !hasStrokes || !signerName.trim()}>
          {busy ? "Guardando…" : "Guardar firma"}
        </button>
        <button type="button" className="btn ghost" onClick={clear} disabled={busy || !hasStrokes}>Borrar</button>
      </div>
    </div>
  );
}

export function OrderFinalization({ orderId, status, canSign, canClose, signature, requirements }: Props) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState(false);

  const notify = (tone: "success" | "error", text: string) => {
    setFeedback({ tone, text });
    window.setTimeout(() => setFeedback(null), 7000);
  };

  const missing = CHECKLIST.filter((item) => !requirements[item.key]);

  async function saveSignature(blob: Blob, signerName: string) {
    if (!signerName) return notify("error", "Escribe el nombre de quien recibe el servicio.");
    setBusy(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Tu sesión expiró. Inicia sesión nuevamente.");
      const path = `${user.id}/${orderId}/${crypto.randomUUID()}.png`;
      const { error: uploadError } = await supabase.storage.from("signatures").upload(path, blob, { contentType: "image/png", upsert: false });
      if (uploadError) throw uploadError;
      const { error } = await supabase.from("customer_signatures").insert({
        work_order_id: orderId, signer_name: signerName, storage_path: path, captured_by: user.id,
      });
      if (error) {
        await supabase.storage.from("signatures").remove([path]);
        throw error;
      }
      notify("success", "Firma de conformidad registrada.");
      router.refresh();
    } catch (error) {
      notify("error", userErrorMessage(error, "No se pudo guardar la firma."));
    } finally {
      setBusy(false);
    }
  }

  async function closeOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const note = sentenceCase(new FormData(event.currentTarget).get("closure_note"));
      const { error } = await createClient().rpc("close_work_order", { order_id: orderId, closure_note: note || null });
      if (error) throw error;
      notify("success", "Orden cerrada formalmente.");
      router.refresh();
    } catch (error) {
      notify("error", userErrorMessage(error, "No se pudo cerrar la orden."));
    } finally {
      setBusy(false);
    }
  }

  if (status !== "pendiente_de_cierre" && status !== "cerrada") return null;

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Conformidad y cierre</h2>
          <p>La orden se cierra cuando el expediente está completo y administración lo valida.</p>
        </div>
      </div>

      {feedback && (
        <div className="panel-body" style={{ paddingBottom: 0 }}>
          <p className={`msg ${feedback.tone}`} role="status">{feedback.text}</p>
        </div>
      )}

      <div className="panel-body grid-2">
        <div className="field-card">
          <header>
            <span className="step-tag">4</span>
            <h3>Conformidad del cliente</h3>
          </header>
          {signature ? (
            <p className="msg success">
              {signature.signer_name} aceptó el servicio el {formatDateTime(signature.signed_at)}.
            </p>
          ) : canSign ? (
            <SignaturePad onSave={saveSignature} busy={busy} />
          ) : (
            <p className="help">La firma la captura el técnico asignado desde el sitio, con el cliente presente.</p>
          )}
        </div>

        <div className="field-card">
          <header>
            <span className="step-tag">5</span>
            <h3>Cierre formal</h3>
          </header>

          {status === "cerrada" ? (
            <p className="msg success">Esta orden ya fue validada y cerrada formalmente.</p>
          ) : (
            <>
              <div className="checklist">
                {CHECKLIST.map((item) => (
                  <span className="check" key={item.key} data-done={requirements[item.key]}>{item.label}</span>
                ))}
              </div>

              {canClose ? (
                <form className="inline-form" onSubmit={closeOrder}>
                  <textarea name="closure_note" maxLength={500} placeholder="Observación de validación (opcional)" aria-label="Observación de validación" />
                  <button className="btn" disabled={busy || missing.length > 0}>Validar y cerrar orden</button>
                  {missing.length > 0 && (
                    <span className="help">Falta{missing.length === 1 ? "" : "n"} {missing.length} requisito{missing.length === 1 ? "" : "s"} del expediente.</span>
                  )}
                </form>
              ) : (
                <p className="help">El cierre lo autoriza administración o coordinación una vez completo el expediente.</p>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
