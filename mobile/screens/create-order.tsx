import { useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { supabase } from "../lib/supabase";
import { C, PRIORITY_LABEL } from "../theme";
import { errorMessage, formatDate, sentenceCase } from "../lib/format";
import { Button, Field, Input, SectionTitle, ToastBar, useToast } from "../components/ui";
import { SelectField, SelectSheet, type Option } from "../components/select-sheet";
import { SiteLocationField } from "../components/site-location-field";

const PRIORITIES = ["baja", "media", "alta", "critica"] as const;
const HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];

function dayOption(offset: number) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function CreateOrderScreen({ onCreated }: { onCreated: () => void }) {
  const [clients, setClients] = useState<Option[]>([]);
  const [technicians, setTechnicians] = useState<Option[]>([]);
  const [client, setClient] = useState<Option | null>(null);
  const [technician, setTechnician] = useState<Option | null>(null);
  const [helpers, setHelpers] = useState<Option[]>([]);
  const [priority, setPriority] = useState<string>("media");
  const [dayOffset, setDayOffset] = useState(0);
  const [hour, setHour] = useState(8);
  const [plannedDuration, setPlannedDuration] = useState("60");
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [siteLatitude, setSiteLatitude] = useState<number | null>(null);
  const [siteLongitude, setSiteLongitude] = useState<number | null>(null);
  const [sheet, setSheet] = useState<"client" | "technician" | "helper" | "hour" | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const { toast, show, hide } = useToast();

  useEffect(() => {
    Promise.all([
      supabase.from("clients").select("id,name").eq("is_active", true).order("name"),
      supabase.from("profiles").select("id,full_name").eq("role", "technician").eq("is_active", true).order("full_name"),
    ]).then(([clientsResult, techniciansResult]) => {
      setClients((clientsResult.data ?? []).map((item) => ({ id: item.id, label: item.name })));
      setTechnicians((techniciansResult.data ?? []).map((item) => ({ id: item.id, label: item.full_name })));
    });
  }, []);

  const scheduledAt = useMemo(() => {
    const date = dayOption(dayOffset);
    date.setHours(hour, 0, 0, 0);
    return date;
  }, [dayOffset, hour]);

  async function create() {
    setSubmitted(true);
    if (!client || !address.trim() || !description.trim()) {
      return show("error", "Selecciona un cliente e ingresa dirección y descripción.");
    }
    const duration = Number(plannedDuration);
    if (!Number.isInteger(duration) || duration < 15 || duration > 1440) return show("error", "La duración debe estar entre 15 y 1,440 minutos.");
    setBusy(true);
    try {
      const { data } = await supabase.auth.getUser();
      const { data: order, error } = await supabase.from("work_orders").insert({
        client_id: client.id,
        assigned_technician_id: technician?.id ?? null,
        address: sentenceCase(address),
        description: sentenceCase(description),
        priority,
        scheduled_at: scheduledAt.toISOString(),
        planned_duration_minutes: duration,
        site_latitude: siteLatitude,
        site_longitude: siteLongitude,
        created_by: data.user?.id,
        status: "borrador",
      }).select("id").single();
      if (error) throw error;
      if (order && helpers.length) {
        const { error: helperError } = await supabase.from("work_order_technicians").insert(helpers.filter((item) => item.id !== technician?.id).map((item) => ({ work_order_id: order.id, technician_id: item.id, participation_role: "ayudante" })));
        if (helperError) throw helperError;
      }
      if (order && technician) {
        const { error: transitionError } = await supabase.rpc("transition_work_order", {
          order_id: order.id,
          next_status: "asignada",
          transition_note: "Técnico asignado al crear la orden.",
        });
        if (transitionError) throw new Error("La orden fue creada como borrador, pero no se pudo asignar al técnico.");
      }
      show("success", technician ? "Orden creada y asignada al técnico." : "Orden creada como borrador.");
      setClient(null); setTechnician(null); setAddress(""); setDescription(""); setPriority("media"); setSiteLatitude(null); setSiteLongitude(null);
      onCreated();
    } catch (error) {
      show("error", errorMessage(error, "No fue posible crear la orden."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <ScrollView contentContainerStyle={create$.body} keyboardShouldPersistTaps="handled">
        <Field label="Cliente *">
          <SelectField value={client?.label} placeholder="Seleccionar cliente" invalid={submitted && !client} onPress={() => setSheet("client")} />
          {submitted && !client ? <Text style={create$.fieldError}>Selecciona el cliente de la orden.</Text> : null}
        </Field>

        <Field label="Técnico asignado" hint={technician ? "La orden quedará asignada y visible en la app del técnico." : "Sin técnico, la orden se guarda como borrador."}>
          <SelectField value={technician?.label} placeholder="Dejar sin asignar" onPress={() => setSheet("technician")} />
          {technician ? (
            <Pressable onPress={() => setTechnician(null)} hitSlop={8} accessibilityRole="button">
              <Text style={create$.clear}>Quitar asignación</Text>
            </Pressable>
          ) : null}
        </Field>

        <Field label="Ayudantes técnicos" hint={technician ? "Trabajan en la misma orden; el técnico asignado es responsable del proyecto." : "Primero selecciona al técnico responsable para agregar ayudantes."}>
          <SelectField value={helpers.length ? `${helpers.length} ayudante${helpers.length === 1 ? "" : "s"}` : undefined} placeholder="Agregar ayudante" disabled={!technician} onPress={() => setSheet("helper")} />
          {helpers.map((item) => <Pressable key={item.id} onPress={() => setHelpers((current) => current.filter((helper) => helper.id !== item.id))}><Text style={create$.clear}>Quitar {item.label}</Text></Pressable>)}
        </Field>

        <Field label="Prioridad">
          <View style={create$.chips}>
            {PRIORITIES.map((item) => {
              const active = item === priority;
              return (
                <Pressable
                  key={item}
                  onPress={() => setPriority(item)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={[create$.chip, active && create$.chipActive]}
                >
                  <Text style={[create$.chipText, active && create$.chipTextActive]}>{PRIORITY_LABEL[item]}</Text>
                </Pressable>
              );
            })}
          </View>
        </Field>

        <Field label="Programación" hint={`Se agendará para el ${formatDate(scheduledAt.toISOString())} a las ${String(hour).padStart(2, "0")}:00.`}>
          <View style={create$.chips}>
            {[
              { offset: 0, label: "Hoy" },
              { offset: 1, label: "Mañana" },
              { offset: 2, label: "En 2 días" },
              { offset: 7, label: "En una semana" },
            ].map((item) => {
              const active = item.offset === dayOffset;
              return (
                <Pressable
                  key={item.offset}
                  onPress={() => setDayOffset(item.offset)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={[create$.chip, active && create$.chipActive]}
                >
                  <Text style={[create$.chipText, active && create$.chipTextActive]}>{item.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <SelectField value={`${String(hour).padStart(2, "0")}:00`} placeholder="Hora" onPress={() => setSheet("hour")} />
        </Field>
        <Field label="Duración programada (minutos) *" hint="Se compara con las horas registradas por GPS.">
          <Input value={plannedDuration} onChangeText={setPlannedDuration} invalid={submitted && (!Number.isInteger(Number(plannedDuration)) || Number(plannedDuration) < 15 || Number(plannedDuration) > 1440)} keyboardType="number-pad" placeholder="60" />
          {submitted && (!Number.isInteger(Number(plannedDuration)) || Number(plannedDuration) < 15 || Number(plannedDuration) > 1440) ? <Text style={create$.fieldError}>Ingresa una duración entre 15 y 1,440 minutos.</Text> : null}
        </Field>

        <Field label="Dirección de instalación *">
          <Input placeholder="Zona, calle y referencias del sitio" value={address} onChangeText={setAddress} invalid={submitted && !address.trim()} />
          {submitted && !address.trim() ? <Text style={create$.fieldError}>Ingresa la dirección de instalación.</Text> : null}
        </Field>

        <Field label="Punto de ubicación">
          <SiteLocationField address={address} latitude={siteLatitude} longitude={siteLongitude} onChange={(latitude, longitude) => { setSiteLatitude(latitude); setSiteLongitude(longitude); }} onError={(message) => show("error", message)} />
        </Field>

        <Field label="Descripción del trabajo *">
          <Input
            placeholder="Alcance, materiales previstos y condiciones del sitio"
            value={description}
            onChangeText={setDescription}
            invalid={submitted && !description.trim()}
            multiline
            style={{ minHeight: 112, textAlignVertical: "top", paddingTop: 12 }}
          />
          {submitted && !description.trim() ? <Text style={create$.fieldError}>Describe el trabajo a realizar.</Text> : null}
        </Field>

        <ToastBar toast={toast} onHide={hide} />
        <Button title={technician ? "Crear y asignar orden" : "Guardar borrador"} busy={busy} onPress={create} />

        {!clients.length ? (
          <View style={create$.warn}>
            <SectionTitle title="Sin clientes en el catálogo" lead="Registra un cliente desde la versión web antes de crear órdenes." />
          </View>
        ) : null}
      </ScrollView>

      <SelectSheet
        visible={sheet === "client"} title="Selecciona un cliente" options={clients} selectedId={client?.id}
        emptyText="No hay clientes activos."
        onSelect={(option) => { setClient(option); setSheet(null); }} onClose={() => setSheet(null)}
      />
      <SelectSheet
        visible={sheet === "technician"} title="Asignar técnico" options={technicians} selectedId={technician?.id}
        emptyText="No hay técnicos activos."
        onSelect={(option) => { setTechnician(option); setHelpers((current) => current.filter((helper) => helper.id !== option.id)); setSheet(null); }} onClose={() => setSheet(null)}
      />
      <SelectSheet visible={sheet === "helper"} title="Agregar ayudante" options={technicians.filter((item) => item.id !== technician?.id && !helpers.some((helper) => helper.id === item.id))}
        emptyText="No hay más técnicos disponibles."
        onSelect={(option) => { setHelpers((current) => [...current, option]); setSheet(null); }} onClose={() => setSheet(null)} />
      <SelectSheet
        visible={sheet === "hour"} title="Hora programada"
        options={HOURS.map((item) => ({ id: String(item), label: `${String(item).padStart(2, "0")}:00` }))}
        selectedId={String(hour)}
        onSelect={(option) => { setHour(Number(option.id)); setSheet(null); }} onClose={() => setSheet(null)}
      />
    </KeyboardAvoidingView>
  );
}

const create$ = StyleSheet.create({
  body: { padding: 16, paddingBottom: 40, gap: 16 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: 42, paddingHorizontal: 14, justifyContent: "center", borderRadius: 99, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  chipActive: { backgroundColor: C.actionSoft, borderColor: "#c8daf0" },
  chipText: { color: C.muted, fontSize: 13.5, fontWeight: "700" },
  chipTextActive: { color: C.action, fontWeight: "800" },
  clear: { color: C.action, fontSize: 13, fontWeight: "700", paddingVertical: 4 },
  fieldError: { color: C.danger, fontSize: 12.5, fontWeight: "700", marginTop: 5 },
  warn: { backgroundColor: C.brownSoft, borderWidth: 1, borderColor: "#ecd9c3", borderRadius: 12, padding: 14 },
});
