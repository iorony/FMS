import { useEffect, useMemo, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { supabase } from "../lib/supabase";
import { callAdminApi } from "../lib/web-api";
import { C, ROLE_LABEL, Role } from "../theme";
import { errorMessage, formatDate, sentenceCase } from "../lib/format";
import type { Person } from "../types";
import { Button, Card, EmptyState, Field, Input, Loading, SectionTitle, ToastBar, useToast } from "../components/ui";
import { SelectField, SelectSheet } from "../components/select-sheet";

const ROLE_OPTIONS: { id: Role; label: string }[] = [
  { id: "technician", label: "Técnico" },
  { id: "coordinator", label: "Coordinador" },
  { id: "admin", label: "Administrador" },
];

type Panel = "edit" | "password" | null;

/**
 * Espejo del panel "Personas con acceso" de la web: invitar, editar rol y
 * estado, restablecer contraseña y eliminar cuenta. Coordinación solo ve la
 * lista de técnicos y solo puede restablecer contraseñas.
 */
export function UsersScreen({ role }: { role: Role }) {
  const isAdmin = role === "admin";
  const [people, setPeople] = useState<Person[] | null>(null);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [busy, setBusy] = useState(false);
  const [inviting, setInviting] = useState(false);
  const { toast, show, hide } = useToast();

  // Formulario de invitación
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("technician");
  const [inviteRolePicker, setInviteRolePicker] = useState(false);

  // Formulario de edición
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState<Role>("technician");
  const [editRolePicker, setEditRolePicker] = useState(false);
  const [editActive, setEditActive] = useState(true);
  const [editHourlyRate, setEditHourlyRate] = useState("");
  const [editRegularMinutes, setEditRegularMinutes] = useState("480");
  const [editOvertimeMultiplier, setEditOvertimeMultiplier] = useState("1.5");
  const [password, setPassword] = useState("");

  const load = () => {
    let request = supabase.from("profiles").select("id,full_name,email,role,is_active,created_at").order("created_at", { ascending: false });
    if (!isAdmin) request = request.eq("role", "technician");
    request.then(async ({ data, error }) => {
      if (error) show("error", errorMessage(error, "No se pudo cargar el directorio. Inténtalo nuevamente."));
      const base = (data ?? []).map((person) => ({ ...person, hourly_rate: null, regular_daily_minutes: 480, overtime_multiplier: 1.5 })) as Person[];
      const { data: rates } = await supabase.from("profiles").select("id,hourly_rate,regular_daily_minutes,overtime_multiplier");
      const byId = new Map((rates ?? []).map((item) => [item.id, item]));
      setPeople(base.map((person) => ({ ...person, hourly_rate: byId.get(person.id)?.hourly_rate ?? null, regular_daily_minutes: byId.get(person.id)?.regular_daily_minutes ?? 480, overtime_multiplier: byId.get(person.id)?.overtime_multiplier ?? 1.5 })));
    });
  };

  useEffect(load, [isAdmin]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!people) return [];
    if (!term) return people;
    return people.filter((person) => `${person.full_name} ${person.email}`.toLowerCase().includes(term));
  }, [people, query]);

  function openPanel(person: Person, target: Panel) {
    if (openId === person.id && panel === target) {
      setOpenId(null);
      setPanel(null);
      return;
    }
    setOpenId(person.id);
    setPanel(target);
    setEditName(person.full_name);
    setEditRole(person.role);
    setEditActive(person.is_active);
    setEditHourlyRate(person.hourly_rate === null ? "" : String(person.hourly_rate));
    setEditRegularMinutes(String(person.regular_daily_minutes));
    setEditOvertimeMultiplier(String(person.overtime_multiplier));
    setPassword("");
  }

  async function invite() {
    if (!inviteName.trim() || !inviteEmail.trim()) return show("error", "Ingresa nombre y correo para enviar la invitación.");
    setBusy(true);
    const result = await callAdminApi("invite", { email: inviteEmail.trim(), fullName: sentenceCase(inviteName), role: inviteRole });
    setBusy(false);
    show(result.ok ? "success" : "error", result.message);
    if (result.ok) { setInviteName(""); setInviteEmail(""); setInviteRole("technician"); load(); }
  }

  async function saveEdit(person: Person) {
    if (!editName.trim()) return show("error", "El nombre no puede quedar vacío.");
    setBusy(true);
    const result = await callAdminApi("edit", { id: person.id, fullName: sentenceCase(editName), role: editRole, isActive: editActive, hourlyRate: editRole === "technician" ? editHourlyRate.trim() : "", regularDailyMinutes: editRole === "technician" ? editRegularMinutes.trim() : "480", overtimeMultiplier: editRole === "technician" ? editOvertimeMultiplier.trim() : "1.5" });
    setBusy(false);
    show(result.ok ? "success" : "error", result.message);
    if (result.ok) { setOpenId(null); setPanel(null); load(); }
  }

  async function saveResetPassword(person: Person) {
    if (password.length < 8) return show("error", "La contraseña temporal debe tener al menos 8 caracteres.");
    setBusy(true);
    const result = await callAdminApi("resetPassword", { id: person.id, password });
    setBusy(false);
    show(result.ok ? "success" : "error", result.message);
    if (result.ok) { setPassword(""); setOpenId(null); setPanel(null); }
  }

  function confirmDelete(person: Person) {
    Alert.alert("Eliminar cuenta", `¿Eliminar el acceso de ${person.full_name || person.email}? Esta acción revoca su acceso de inmediato.`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: () => deletePerson(person) },
    ]);
  }

  async function deletePerson(person: Person) {
    setBusy(true);
    const result = await callAdminApi("delete", { id: person.id });
    setBusy(false);
    show(result.ok ? "success" : "error", result.message);
    if (result.ok) load();
  }

  if (!people) return <Loading label="Cargando directorio…" />;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <ScrollView contentContainerStyle={users.body} keyboardShouldPersistTaps="handled">
        <ToastBar toast={toast} onHide={hide} />

        {isAdmin && (
          <Card>
            <Button title={inviting ? "Cerrar invitación" : "Invitar a una persona"} variant="secondary" disabled={busy} onPress={() => setInviting((value) => !value)} />
            {inviting && <>
            <Text style={users.help}>Recibirá un correo para crear su contraseña y entrar con el rol asignado.</Text>
            <Field label="Nombre completo">
              <Input value={inviteName} onChangeText={setInviteName} placeholder="Nombre y apellido" />
            </Field>
            <Field label="Correo electrónico">
              <Input value={inviteEmail} onChangeText={setInviteEmail} preserveCase autoCapitalize="none" keyboardType="email-address" placeholder="correo@empresa.com" />
            </Field>
            <Field label="Rol">
              <SelectField value={ROLE_LABEL[inviteRole]} placeholder="Rol" onPress={() => setInviteRolePicker(true)} />
            </Field>
            <Button title="Enviar invitación" busy={busy} onPress={invite} />
            </>}
          </Card>
        )}

        <Input placeholder="Buscar por nombre o correo" value={query} onChangeText={setQuery} autoCorrect={false} accessibilityLabel="Buscar personas" />

        {filtered.map((person) => {
          const expanded = openId === person.id;
          const canResetThis = isAdmin || person.role === "technician";
          return (
            <Card key={person.id}>
              <View style={users.row}>
                <View style={{ flex: 1 }}>
                  <Text style={users.name}>{person.full_name || "Sin nombre"}</Text>
                  <Text style={users.meta} numberOfLines={1}>{person.email} · {ROLE_LABEL[person.role]} · alta {formatDate(person.created_at)}</Text>
                  {person.role === "technician" && <Text style={users.payroll}>{person.hourly_rate === null ? "Tarifa pendiente" : `Q ${Number(person.hourly_rate).toFixed(2)} / hora`} · jornada {person.regular_daily_minutes / 60} h · extra ×{person.overtime_multiplier}</Text>}
                </View>
                <View style={[users.status, !person.is_active && users.statusOff]}>
                  <Text style={[users.statusText, !person.is_active && users.statusTextOff]}>{person.is_active ? "Activo" : "Inactivo"}</Text>
                </View>
              </View>

              <View style={users.actions}>
                {isAdmin && (
                  <Pressable onPress={() => openPanel(person, "edit")} style={users.pill} accessibilityRole="button">
                    <Text style={users.pillText}>{expanded && panel === "edit" ? "− Editar" : person.role === "technician" ? "＋ Pago y acceso" : "＋ Editar"}</Text>
                  </Pressable>
                )}
                {canResetThis && (
                  <Pressable onPress={() => openPanel(person, "password")} style={users.pill} accessibilityRole="button">
                    <Text style={users.pillText}>{expanded && panel === "password" ? "− Contraseña" : "＋ Contraseña"}</Text>
                  </Pressable>
                )}
              </View>

              {expanded && panel === "edit" && (
                <View style={users.panel}>
                  <Field label="Nombre completo"><Input value={editName} onChangeText={setEditName} /></Field>
                  <Field label="Rol"><SelectField value={ROLE_LABEL[editRole]} placeholder="Rol" onPress={() => setEditRolePicker(true)} /></Field>
                  {editRole === "technician" && <><Field label="Tarifa por hora (Q)" hint="Se utiliza para estimar el pago con las horas GPS."><Input value={editHourlyRate} onChangeText={setEditHourlyRate} keyboardType="decimal-pad" placeholder="Ej.: 45.00" /></Field><Field label="Jornada normal (minutos)" hint="El excedente se calcula como hora extra."><Input value={editRegularMinutes} onChangeText={setEditRegularMinutes} keyboardType="number-pad" /></Field><Field label="Multiplicador de hora extra"><Input value={editOvertimeMultiplier} onChangeText={setEditOvertimeMultiplier} keyboardType="decimal-pad" /></Field></>}
                  <Pressable onPress={() => setEditActive((value) => !value)} style={users.switchRow} accessibilityRole="checkbox" accessibilityState={{ checked: editActive }}>
                    <View style={[users.checkbox, editActive && users.checkboxOn]}>{editActive ? <Text style={users.checkboxMark}>✓</Text> : null}</View>
                    <Text style={users.switchLabel}>Cuenta activa</Text>
                  </Pressable>
                  <Text style={users.help}>Una cuenta inactiva no puede iniciar sesión ni recibir órdenes.</Text>
                  <Button title="Guardar cambios" busy={busy} onPress={() => saveEdit(person)} />
                  <Button title="Descartar cambios" variant="secondary" disabled={busy} onPress={() => { setOpenId(null); setPanel(null); }} />
                  {isAdmin && <Pressable disabled={busy} onPress={() => confirmDelete(person)} style={[users.pill, users.pillDanger]} accessibilityRole="button"><Text style={[users.pillText, users.pillDangerText]}>Eliminar cuenta…</Text></Pressable>}
                </View>
              )}

              {expanded && panel === "password" && (
                <View style={users.panel}>
                  <Field label="Contraseña temporal">
                    <Input value={password} onChangeText={setPassword} preserveCase secureTextEntry autoCapitalize="none" placeholder="Mínimo 8 caracteres" />
                  </Field>
                  <Text style={users.help}>Comunícala de forma segura; no se muestra de nuevo.</Text>
                  <Button title="Cambiar contraseña" variant="secondary" busy={busy} onPress={() => saveResetPassword(person)} />
                  <Button title="Cancelar" variant="secondary" disabled={busy} onPress={() => { setOpenId(null); setPanel(null); setPassword(""); }} />
                </View>
              )}
            </Card>
          );
        })}

        {!filtered.length ? <EmptyState title="Ninguna persona coincide" text="Prueba con otro nombre o correo." /> : null}
      </ScrollView>

      <SelectSheet
        visible={inviteRolePicker} title="Rol de la invitación"
        options={ROLE_OPTIONS.map((item) => ({ id: item.id, label: item.label }))} selectedId={inviteRole}
        onSelect={(option) => { setInviteRole(option.id as Role); setInviteRolePicker(false); }} onClose={() => setInviteRolePicker(false)}
      />
      <SelectSheet
        visible={editRolePicker} title="Cambiar rol"
        options={ROLE_OPTIONS.map((item) => ({ id: item.id, label: item.label }))} selectedId={editRole}
        onSelect={(option) => { setEditRole(option.id as Role); setEditRolePicker(false); }} onClose={() => setEditRolePicker(false)}
      />
    </KeyboardAvoidingView>
  );
}

const users = StyleSheet.create({
  body: { padding: 16, paddingBottom: 40, gap: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  name: { color: C.ink, fontSize: 15, fontWeight: "800" },
  meta: { color: C.muted, fontSize: 12.5, marginTop: 3 },
  payroll: { color: C.ok, fontSize: 12, fontWeight: "700", marginTop: 4 },
  status: { borderRadius: 99, paddingHorizontal: 9, paddingVertical: 4, backgroundColor: C.okSoft },
  statusOff: { backgroundColor: "#eef1f4" },
  statusText: { color: C.ok, fontSize: 11.5, fontWeight: "800" },
  statusTextOff: { color: "#52627a" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  pill: { minHeight: 44, paddingHorizontal: 12, justifyContent: "center", borderRadius: 99, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.line },
  pillText: { color: C.action, fontSize: 12.5, fontWeight: "700" },
  pillDanger: { backgroundColor: C.dangerSoft, borderColor: "#f4cfcd" },
  pillDangerText: { color: C.danger },
  panel: { marginTop: 12, borderTopWidth: 1, borderTopColor: C.lineSoft, paddingTop: 12, gap: 10 },
  help: { color: C.muted, fontSize: 12, lineHeight: 17 },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: "#c8d3dd", alignItems: "center", justifyContent: "center" },
  checkboxOn: { backgroundColor: C.action, borderColor: C.action },
  checkboxMark: { color: "#fff", fontWeight: "900", fontSize: 13 },
  switchLabel: { color: C.ink, fontSize: 14, fontWeight: "600" },
});
