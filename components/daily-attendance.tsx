"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { guatemalaWorkDate } from "@/lib/ui";
import { userErrorMessage } from "@/lib/text";

type Feedback = { tone: "success" | "error" | "info"; text: string } | null;

export function DailyAttendance({ clockedIn, clockedOut }: { clockedIn: boolean; clockedOut: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  async function register(type: "entrada" | "salida") {
    setBusy(true);
    setFeedback(null);
    try {
      if (!navigator.geolocation) throw new Error("Este dispositivo no permite obtener ubicación.");
      const position = await new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 }));
      const { error } = await createClient().rpc("register_daily_attendance", { attendance_type: type, latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy_meters: position.coords.accuracy, attendance_work_date: guatemalaWorkDate() });
      if (error) throw error;
      setFeedback({ tone: "success", text: type === "entrada" ? "Entrada laboral registrada con GPS." : "Salida laboral registrada. Tu jornada queda lista para cálculo." });
      router.refresh();
    } catch (error) {
      setFeedback({ tone: "error", text: userErrorMessage(error, "No fue posible registrar la jornada.") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-head"><div><h2>Mi jornada de hoy</h2><p>Estas marcas GPS determinan tus horas normales y extras; no las marcas de cada orden.</p></div></div>
      <div className="panel-body">
        <div className="actions">
          <button className="btn" disabled={busy || clockedIn} onClick={() => register("entrada")}>{clockedIn ? "Entrada registrada" : busy ? "Obteniendo GPS…" : "Registrar entrada"}</button>
          <button className="btn ghost" disabled={busy || !clockedIn || clockedOut} onClick={() => register("salida")}>{clockedOut ? "Salida registrada" : "Registrar salida"}</button>
        </div>
        {feedback && <p className={`msg ${feedback.tone}`} role={feedback.tone === "error" ? "alert" : "status"}>{feedback.text}</p>}
      </div>
    </section>
  );
}
