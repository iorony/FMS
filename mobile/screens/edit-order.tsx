import { useEffect, useMemo, useState } from "react";
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { C, PRIORITY_LABEL } from "../theme";
import { errorMessage, formatDate, sentenceCase } from "../lib/format";
import type { Order } from "../types";
import { Button, Field, Input, ToastBar, useToast } from "../components/ui";
import { SelectField, SelectSheet, type Option } from "../components/select-sheet";
import { SiteLocationField } from "../components/site-location-field";

const PRIORITIES = ["baja", "media", "alta", "critica"] as const;
const HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
const ASSIGNMENT_LOCKED: Order["status"][] = ["en_proceso", "pendiente_de_cierre", "cerrada", "cancelada"];

/** datetime-local necesita hora local, no UTC. */
function toParts(value: string | null) {
  const date = value ? new Date(value) : new Date();
  return { date, hour: date.getHours() };
}

/** Espejo de EditOrderForm de la web: mismos campos, mismo bloqueo de asignación y cancelación en borrador. */
export function EditOrderScreen({ order, onClose, onSaved }: { order: Order; onClose: () => void; onSaved: () => void }) {
  const [clients, setClients] = useState<Option[]>([]);
  const [technicians, setTechnicians] = useState<Option[]>([]);
  const [client, setClient] = useState<Option | null>(null);
  const [technician, setTechnician] = useState<Option | null>(null);
  const [helpers, setHelpers] = useState<Option[]>([]);
  const [priority, setPriority] = useState(order.priority);
  const [date, setDate] = useState(toParts(order.scheduled_at).date);
  const [hour, setHour] = useState(toParts(order.scheduled_at).hour);
  const [plannedDuration, setPlannedDuration] = useState(String(order.planned_duration_minutes ?? 60));
  const [address, setAddress] = useState(order.address);
  const [description, setDescription] = useState(order.description);
  const [siteLatitude, setSiteLatitude] = useState<number | null>(order.site_latitude === null ? null : Number(order.site_latitude));
  const [siteLongitude, setSiteLongitude] = useState<number | null>(order.site_longitude === null ? null : Number(order.site_longitude));
  const [sheet, setSheet] = useState<"client" | "technician" | "helper" | "hour" | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const { toast, show, hide } = useToast();

  const assignmentLocked = ASSIGNMENT_LOCKED.includes(order.status);
  const scheduledAt = useMemo(() => {
    const value = new Date(date);
    value.setHours(hour, 0, 0, 0);
    return value;
  }, [date, hour]);

  useEffect(() => {
    Promise.all([
      supabase.from("clients").select("id,name").eq("is_active", true).order("name"),
      supabase.from("profiles").select("id,full_name").eq("role", "technician").eq("is_active", true).order("full_name"),
      supabase.from("work_order_technicians").select("technician_id,participation_role,profiles:technician_id(id,full_name)").eq("work_order_id", order.id).eq("participation_role", "ayudante"),
    ]).then(([clientsResult, techniciansResult, helpersResult]) => {
      const clientOptions = (clientsResult.data ?? []).map((item) => ({ id: item.id, label: item.name }));
      const technicianOptions = (techniciansResult.data ?? []).map((item) => ({ id: item.id, label: item.full_name }));
      setClients(clientOptions);
      setTechnicians(technicianOptions);
      setClient(clientOptions.find((item) => item.id === order.client_id) ?? null);
      setTechnician(technicianOptions.find((item) => item.id === order.assigned_technician_id) ?? null);
      setHelpers((helpersResult.data ?? []).map((item) => {
        const profile = Array.isArray(item.profiles) ? item.profiles[0] : item.profiles;
        return profile ? { id: profile.id, label: profile.full_name } : null;
      }).filter((item): item is Option => Boolean(item)));
    });
  }, [order.client_id, order.assigned_technician_id]);

  async function save() {
    setSubmitted(true);
    if (!client || !address.trim() || !description.trim()) return show("error", "Completa cliente, dirección y descripción.");
    const duration = Number(plannedDuration);
    if (!Number.isInteger(duration) || duration < 15 || duration > 1440) return show("error", "La duración debe estar entre 15 y 1,440 minutos.");
    setBusy(true);
    try {
      const { error } = await supabase.from("work_orders").update({
        client_id: client.id,
        // Una orden en marcha conserva su responsable aunque el selector esté bloqueado.
        assigned_technician_id: assignmentLocked ? order.assigned_technician_id : technician?.id ?? null,
        priority,
        scheduled_at: scheduledAt.toISOString(),
        planned_duration_minutes: duration,
        address: sentenceCase(address),
        description: sentenceCase(description),
        site_latitude: siteLatitude,
        site_longitude: siteLongitude,
      }).eq("id", order.id);
      if (error) throw error;

      if (!assignmentLocked) {
        const selectedHelpers = helpers.filter((item) => item.id !== technician?.id);
        const { error: clearHelpersError } = await supabase.from("work_order_technicians").delete().eq("work_order_id", order.id).eq("participation_role", "ayudante");
        if (clearHelpersError) throw clearHelpersError;
        if (selectedHelpers.length) {
          const { error: saveHelpersError } = await supabase.from("work_order_technicians").insert(selectedHelpers.map((item) => ({ work_order_id: order.id, technician_id: item.id, participation_role: "ayudante" })));
          if (saveHelpersError) throw saveHelpersError;
        }
      }

      if (order.status === "borrador" && technician) {
        const { error: transitionError } = await supabase.rpc("transition_work_order", {
          order_id: order.id, next_status: "asignada", transition_note: "Técnico asignado desde edición administrativa.",
        });
        if (transitionError) throw new Error("Los cambios se guardaron, pero la orden no pudo asignarse. Vuelve a intentarlo.");
      }
      show("success", "Cambios guardados.");
      onSaved();
    } catch (error) {
      show("error", errorMessage(error, "No fue posible guardar los cambios."));
    } finally {
      setBusy(false);
    }
  }

  function confirmCancel() {
    Alert.alert(
      "Cancelar la orden",
      "La bitácora se conserva y podrás restaurar la orden después como borrador. ¿Deseas continuar?",
      [{ text: "Volver", style: "cancel" }, { text: "Cancelar orden", style: "destructive", onPress: cancelOrder }],
    );
  }

  async function cancelOrder() {
    setBusy(true);
    try {
      const { error } = await supabase.rpc("transition_work_order", {
        order_id: order.id, next_status: "cancelada", transition_note: "Orden cancelada por administración.",
      });
      if (error) throw error;
      show("success", "Orden cancelada.");
      onSaved();
    } catch (error) {
      show("error", errorMessage(error, "No fue posible cancelar la orden."));
    } finally {
      setBusy(false);
    }
  }

  function confirmRestore() {
    Alert.alert(
      "Restaurar la orden",
      "La orden volverá a Borrador y conservará todo su historial. ¿Deseas continuar?",
      [{ text: "Volver", style: "cancel" }, { text: "Restaurar", onPress: restoreOrder }],
    );
  }

  async function restoreOrder() {
    setBusy(true);
    try {
      const { error } = await supabase.rpc("transition_work_order", {
        order_id: order.id, next_status: "borrador", transition_note: "Orden restaurada como borrador por administración.",
      });
      if (error) throw error;
      show("success", "Orden restaurada como borrador.");
      onSaved();
    } catch (error) {
      show("error", errorMessage(error, "No fue posible restaurar la orden."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal animationType="slide" visible onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.paper }} edges={["top", "bottom"]}>
        <StatusBar barStyle="light-content" backgroundColor={C.graphite} />
        <View style={edit.top}>
          <Pressable onPress={onClose} style={edit.back} accessibilityRole="button" accessibilityLabel="Cerrar">
            <Text style={edit.backArrow}>‹</Text>
            <Text style={edit.backText}>Cancelar edición</Text>
          </Pressable>
          <Text style={edit.title}>{order.code}</Text>
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={60}>
          <ScrollView contentContainerStyle={edit.body} keyboardShouldPersistTaps="handled">
            <Field label="Cliente *">
              <SelectField value={client?.label} placeholder="Seleccionar cliente" invalid={submitted && !client} onPress={() => setSheet("client")} />
              {submitted && !client ? <Text style={edit.fieldError}>Selecciona el cliente de la orden.</Text> : null}
            </Field>

            <Field label="Técnico asignado" hint={assignmentLocked ? "La asignación se bloquea cuando la orden ya está en ejecución o finalizada." : undefined}>
              <SelectField value={technician?.label} placeholder="Dejar sin asignar" disabled={assignmentLocked} onPress={() => setSheet("technician")} />
              {!assignmentLocked && technician ? (
                <Pressable onPress={() => setTechnician(null)} hitSlop={8} accessibilityRole="button">
                  <Text style={edit.clear}>Quitar asignación</Text>
                </Pressable>
              ) : null}
            </Field>

            <Field label="Ayudantes técnicos" hint={assignmentLocked ? "El equipo se bloquea cuando la orden ya está en ejecución o finalizada." : technician ? "Participan en la orden sin sustituir al técnico responsable." : "Primero selecciona al técnico responsable para agregar ayudantes."}>
              <SelectField value={helpers.length ? `${helpers.length} ayudante${helpers.length === 1 ? "" : "s"}` : undefined} placeholder="Agregar ayudante" disabled={assignmentLocked || !technician} onPress={() => setSheet("helper")} />
              {!assignmentLocked && helpers.map((item) => <Pressable key={item.id} onPress={() => setHelpers((current) => current.filter((helper) => helper.id !== item.id))}><Text style={edit.clear}>Quitar {item.label}</Text></Pressable>)}
            </Field>

            <Field label="Prioridad">
              <View style={edit.chips}>
                {PRIORITIES.map((item) => {
                  const active = item === priority;
                  return (
                    <Pressable key={item} onPress={() => setPriority(item)} accessibilityRole="button" accessibilityState={{ selected: active }} style={[edit.chip, active && edit.chipActive]}>
                      <Text style={[edit.chipText, active && edit.chipTextActive]}>{PRIORITY_LABEL[item]}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </Field>

            <Field label="Fecha programada">
              <View style={edit.dateRow}>
                <Pressable
                  onPress={() => setDate((current) => { const next = new Date(current); next.setDate(next.getDate() - 1); return next; })}
                  style={edit.dateStep}
                  accessibilityRole="button"
                  accessibilityLabel="Un día antes"
                >
                  <Text style={edit.dateStepText}>‹</Text>
                </Pressable>
                <Text style={edit.dateValue}>{formatDate(date.toISOString())}</Text>
                <Pressable
                  onPress={() => setDate((current) => { const next = new Date(current); next.setDate(next.getDate() + 1); return next; })}
                  style={edit.dateStep}
                  accessibilityRole="button"
                  accessibilityLabel="Un día después"
                >
                  <Text style={edit.dateStepText}>›</Text>
                </Pressable>
              </View>
              <View style={edit.chips}>
                {[
                  { label: "Hoy", offset: 0 },
                  { label: "Mañana", offset: 1 },
                ].map((item) => (
                  <Pressable
                    key={item.label}
                    onPress={() => { const next = new Date(); next.setDate(next.getDate() + item.offset); setDate(next); }}
                    style={edit.chip}
                    accessibilityRole="button"
                  >
                    <Text style={edit.chipText}>{item.label}</Text>
                  </Pressable>
                ))}
              </View>
            </Field>

            <Field label="Hora programada">
              <SelectField value={`${String(hour).padStart(2, "0")}:00`} placeholder="Hora" onPress={() => setSheet("hour")} />
            </Field>

            <Field label="Duración programada (minutos) *" hint="Se compara con las horas registradas por GPS.">
              <Input value={plannedDuration} onChangeText={setPlannedDuration} invalid={submitted && (!Number.isInteger(Number(plannedDuration)) || Number(plannedDuration) < 15 || Number(plannedDuration) > 1440)} keyboardType="number-pad" />
              {submitted && (!Number.isInteger(Number(plannedDuration)) || Number(plannedDuration) < 15 || Number(plannedDuration) > 1440) ? <Text style={edit.fieldError}>Ingresa una duración entre 15 y 1,440 minutos.</Text> : null}
            </Field>

            <Field label="Dirección de instalación *">
              <Input value={address} onChangeText={setAddress} maxLength={300} invalid={submitted && !address.trim()} />
              {submitted && !address.trim() ? <Text style={edit.fieldError}>Ingresa la dirección de instalación.</Text> : null}
            </Field>

            <Field label="Punto de ubicación">
              <SiteLocationField address={address} latitude={siteLatitude} longitude={siteLongitude} onChange={(latitude, longitude) => { setSiteLatitude(latitude); setSiteLongitude(longitude); }} onError={(message) => show("error", message)} />
            </Field>

            <Field label="Descripción del trabajo *">
              <Input value={description} onChangeText={setDescription} multiline invalid={submitted && !description.trim()} style={{ minHeight: 112, textAlignVertical: "top", paddingTop: 12 }} />
              {submitted && !description.trim() ? <Text style={edit.fieldError}>Describe el trabajo a realizar.</Text> : null}
            </Field>

            <ToastBar toast={toast} onHide={hide} />
            <Button title="Guardar cambios" busy={busy} onPress={save} />
            {["borrador", "asignada"].includes(order.status) ? <Button title="Cancelar orden" variant="secondary" busy={busy} onPress={confirmCancel} /> : null}
            {order.status === "cancelada" ? <Button title="Restaurar como borrador" variant="secondary" busy={busy} onPress={confirmRestore} /> : null}
          </ScrollView>
        </KeyboardAvoidingView>

        <SelectSheet visible={sheet === "client"} title="Selecciona un cliente" options={clients} selectedId={client?.id}
          onSelect={(option) => { setClient(option); setSheet(null); }} onClose={() => setSheet(null)} />
        <SelectSheet visible={sheet === "technician"} title="Asignar técnico" options={technicians} selectedId={technician?.id}
        onSelect={(option) => { setTechnician(option); setHelpers((current) => current.filter((helper) => helper.id !== option.id)); setSheet(null); }} onClose={() => setSheet(null)} />
        <SelectSheet visible={sheet === "helper"} title="Agregar ayudante" options={technicians.filter((item) => item.id !== technician?.id && !helpers.some((helper) => helper.id === item.id))}
          emptyText="No hay más técnicos disponibles."
          onSelect={(option) => { setHelpers((current) => [...current, option]); setSheet(null); }} onClose={() => setSheet(null)} />
        <SelectSheet visible={sheet === "hour"} title="Hora programada"
          options={HOURS.map((item) => ({ id: String(item), label: `${String(item).padStart(2, "0")}:00` }))} selectedId={String(hour)}
          onSelect={(option) => { setHour(Number(option.id)); setSheet(null); }} onClose={() => setSheet(null)} />
      </SafeAreaView>
    </Modal>
  );
}

const edit = StyleSheet.create({
  top: { minHeight: 56, backgroundColor: C.graphite, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14 },
  back: { flexDirection: "row", alignItems: "center", paddingVertical: 8 },
  backArrow: { color: "#fff", fontSize: 30, lineHeight: 28, marginRight: 4 },
  backText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  title: { color: "#fff", fontSize: 14, fontWeight: "800" },
  body: { padding: 16, paddingBottom: 40, gap: 16 },
  clear: { color: C.action, fontSize: 13, fontWeight: "700", paddingVertical: 4 },
  fieldError: { color: C.danger, fontSize: 12.5, fontWeight: "700", marginTop: 5 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: 42, paddingHorizontal: 14, justifyContent: "center", borderRadius: 99, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  chipActive: { backgroundColor: C.actionSoft, borderColor: "#c8daf0" },
  chipText: { color: C.muted, fontSize: 13.5, fontWeight: "700" },
  chipTextActive: { color: C.action, fontWeight: "800" },
  dateRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8 },
  dateStep: { width: 40, height: 40, borderRadius: 10, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, alignItems: "center", justifyContent: "center" },
  dateStepText: { color: C.action, fontSize: 20, fontWeight: "800" },
  dateValue: { flex: 1, textAlign: "center", color: C.ink, fontSize: 15, fontWeight: "700" },
});
