import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as Location from "expo-location";
import { supabase } from "../lib/supabase";
import { C, Role } from "../theme";
import { errorMessage, isToday } from "../lib/format";
import type { Order } from "../types";
import { Badge, Button, Metric, SectionTitle } from "../components/ui";
import { OrderCard } from "../components/order-card";

type Task = { order: Order; reason: string; urgent: boolean };
const localWorkDate = () => { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10); };

function DailyAttendanceCard() {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [clockedIn, setClockedIn] = useState(false);
  const [clockedOut, setClockedOut] = useState(false);

  useEffect(() => {
    supabase
      .from("daily_attendance_records")
      .select("clock_in_at,clock_out_at")
      .eq("work_date", localWorkDate())
      .maybeSingle()
      .then(({ data }) => {
        setClockedIn(Boolean(data?.clock_in_at));
        setClockedOut(Boolean(data?.clock_out_at));
      });
  }, []);

  async function register(type: "entrada" | "salida") {
    setBusy(true);
    setFeedback(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) throw new Error("Autoriza la ubicación para registrar tu jornada.");
      const point = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { error } = await supabase.rpc("register_daily_attendance", {
        attendance_type: type,
        latitude: point.coords.latitude,
        longitude: point.coords.longitude,
        accuracy_meters: point.coords.accuracy,
        attendance_work_date: localWorkDate(),
      });
      if (error) throw error;
      setClockedIn(true);
      if (type === "salida") setClockedOut(true);
      setFeedback({
        tone: "success",
        text: type === "entrada" ? "Entrada laboral registrada con GPS." : "Salida laboral registrada. Jornada lista para cálculo.",
      });
    } catch (error) {
      setFeedback({ tone: "error", text: errorMessage(error, "No fue posible registrar la jornada.") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={home.panel}>
      <View style={{ padding: 15, gap: 10 }}>
        <SectionTitle title="Mi jornada de hoy" lead="Tu entrada y salida GPS determinan horas normales y extras." />
        <View style={home.attendanceActions}>
          <Button title={clockedIn ? "Entrada registrada" : "Registrar entrada"} busy={busy} disabled={clockedIn} onPress={() => register("entrada")} />
          <Button title={clockedOut ? "Salida registrada" : "Registrar salida"} variant="secondary" busy={busy} disabled={!clockedIn || clockedOut} onPress={() => register("salida")} />
        </View>
        {feedback ? <Text style={[home.attendanceMessage, feedback.tone === "error" && home.attendanceMessageError]}>{feedback.text}</Text> : null}
      </View>
    </View>
  );
}

/**
 * Inicio responde "¿qué tengo que hacer hoy?".
 * El histórico y el cumplimiento documental viven en Reportes.
 */
function buildTasks(orders: Order[], manager: boolean): Task[] {
  const tasks: Task[] = [];
  for (const order of orders) {
    const signed = (order.customer_signatures?.length ?? 0) > 0;
    const late = order.scheduled_at ? new Date(order.scheduled_at).getTime() < Date.now() : false;

    if (order.status === "borrador" && manager) {
      tasks.push({ order, reason: "Sin técnico asignado", urgent: late });
    } else if (order.status === "asignada" && late) {
      tasks.push({ order, reason: "Programada antes de hoy y aún no inicia", urgent: true });
    } else if (order.status === "asignada" && isToday(order.scheduled_at)) {
      tasks.push({ order, reason: manager ? `Hoy con ${order.profiles?.full_name ?? "el técnico asignado"}` : "Te toca hoy", urgent: false });
    } else if (order.status === "pendiente_de_cierre" && !signed) {
      tasks.push({ order, reason: manager ? "Esperando la firma del cliente en sitio" : "Falta la firma de conformidad del cliente", urgent: true });
    } else if (order.status === "pendiente_de_cierre" && signed && manager) {
      tasks.push({ order, reason: "Expediente completo, listo para validar y cerrar", urgent: false });
    }
  }
  return tasks.sort((a, b) => Number(b.urgent) - Number(a.urgent)).slice(0, 5);
}

export function HomeSummary({ orders, role, onOpen, onCreate }: { orders: Order[]; role: Role; onOpen: (order: Order) => void; onCreate: () => void }) {
  const manager = role !== "technician";
  const openStatuses = ["borrador", "asignada", "en_proceso"];
  const today = orders.filter((order) => isToday(order.scheduled_at) && openStatuses.includes(order.status));
  const active = orders.filter((order) => order.status === "en_proceso");
  const pending = orders.filter((order) => order.status === "pendiente_de_cierre");
  const open = orders.filter((order) => ["borrador", "asignada", "en_proceso", "pendiente_de_cierre"].includes(order.status));
  const overdue = orders.filter((order) => order.scheduled_at && new Date(order.scheduled_at).getTime() < Date.now() && ["borrador", "asignada"].includes(order.status));
  const tasks = buildTasks(orders, manager);
  const upcoming = orders.filter((order) => openStatuses.includes(order.status) && !!order.scheduled_at && new Date(order.scheduled_at).getTime() > Date.now()).slice(0, 6);
  const agenda = today.length ? today : upcoming;

  return (
    <View style={{ gap: 14 }}>
      <View style={home.grid}>
        <Metric label="Programadas para hoy" value={today.length} note={overdue.length ? `${overdue.length} vencida${overdue.length === 1 ? "" : "s"} sin iniciar` : "Sin atrasos de planificación"} />
        <Metric label="En proceso ahora" value={active.length} note="Técnico en sitio con GPS" tone="work" />
        <Metric label={manager ? "Esperan validación" : "Por firmar"} value={pending.length} note={manager ? "Cierre formal por autorizar" : "Conformidad del cliente"} tone="due" />
        <Metric label="Abiertas en total" value={open.length} note={`De ${orders.length} órdenes visibles`} />
      </View>
      {!manager && <DailyAttendanceCard />}

      <View style={home.panel}>
        <View style={{ padding: 15, paddingBottom: 11 }}>
          <SectionTitle title="Requiere tu atención" lead="Órdenes detenidas por una acción tuya o de tu equipo." />
        </View>

        {tasks.length ? tasks.map(({ order, reason, urgent }) => (
          <Pressable
            key={order.id}
            onPress={() => onOpen(order)}
            accessibilityRole="button"
            accessibilityLabel={`${order.code}. ${reason}`}
            style={({ pressed }) => [home.task, pressed && { backgroundColor: C.surface2 }]}
          >
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={home.taskCode} numberOfLines={1}>{order.code} · {order.clients?.name ?? "Sin cliente"}</Text>
              <Text style={[home.taskReason, urgent && { color: C.orange, fontWeight: "700" }]}>{reason}</Text>
              <Badge status={order.status} />
            </View>
            <Text style={home.taskOpen}>›</Text>
          </Pressable>
        )) : (
          <Text style={home.noTasks}>
            {manager
              ? "Ninguna orden está detenida esperando una asignación, una firma o una validación."
              : "Nada pendiente por ahora. Cuando te asignen una instalación, aparecerá aquí."}
          </Text>
        )}
      </View>

      <View style={home.panel}>
        <View style={home.agendaHead}>
          <SectionTitle
            title={today.length ? "Agenda de hoy" : "Próximas programadas"}
            lead={today.length ? "Instalaciones con fecha para hoy." : "Las siguientes instalaciones en el calendario."}
          />
        </View>
        {agenda.length ? (
          <View style={home.agendaList}>
            {agenda.map((order) => <OrderCard key={order.id} order={order} onPress={() => onOpen(order)} />)}
          </View>
        ) : (
          <View style={home.agendaEmpty}>
            <Text style={home.emptyTitle}>No hay instalaciones programadas</Text>
            <Text style={home.emptyText}>
              {manager ? "Crea una orden para empezar a planificar la semana." : "Coordinación aún no te ha asignado trabajo próximo."}
            </Text>
            {manager ? <View style={home.createAction}><Button title="Crear orden" onPress={onCreate} /></View> : null}
          </View>
        )}
      </View>
    </View>
  );
}

const home = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  panel: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 14, overflow: "hidden" },
  task: { borderTopWidth: 1, borderTopColor: C.lineSoft, paddingHorizontal: 15, paddingVertical: 13, flexDirection: "row", alignItems: "center", gap: 10, minHeight: 64 },
  taskCode: { color: C.ink, fontSize: 13.5, fontWeight: "800" },
  taskReason: { color: C.muted, fontSize: 12.5, lineHeight: 17 },
  taskOpen: { color: C.action, fontSize: 24, fontWeight: "700" },
  noTasks: { borderTopWidth: 1, borderTopColor: C.lineSoft, padding: 15, color: C.muted, fontSize: 13.5, lineHeight: 19 },
  agendaHead: { padding: 15, borderBottomWidth: 1, borderBottomColor: C.lineSoft },
  agendaList: { padding: 12, gap: 10 },
  agendaEmpty: { alignItems: "center", paddingHorizontal: 24, paddingVertical: 34, gap: 6 },
  attendanceActions: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  attendanceMessage: { color: C.muted, fontSize: 12.5, lineHeight: 18 },
  attendanceMessageError: { color: C.danger },
  emptyTitle: { color: C.ink, fontSize: 15, fontWeight: "800", textAlign: "center" },
  emptyText: { color: C.muted, fontSize: 13.5, lineHeight: 19, textAlign: "center", maxWidth: 280 },
  createAction: { width: 150, marginTop: 10 },
});
