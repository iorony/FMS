import { useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { supabase } from "../lib/supabase";
import { C } from "../theme";
import { errorMessage, sentenceCase } from "../lib/format";
import type { Client, Material } from "../types";
import { Button, Card, EmptyState, Field, Input, Loading, SectionTitle, ToastBar, useToast } from "../components/ui";

type CatalogRecord = Client | Material;
type Props = { type: "clients" | "materials" };
type MaterialUsage = { material_id: string; client_id: string; client_name: string; unit: string; consumed_quantity: number; consumed_cost: number; last_consumed_at: string };

const isClient = (record: CatalogRecord): record is Client => "name" in record && "contact_name" in record;

/** Espejo de las páginas Clientes/Materiales de la web: alta y edición completas. Solo administración. */
export function CatalogScreen({ type }: Props) {
  const [records, setRecords] = useState<CatalogRecord[] | null>(null);
  const [materialUsage, setMaterialUsage] = useState<MaterialUsage[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { toast, show, hide } = useToast();

  // Alta
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [unit, setUnit] = useState("");
  const [unitCost, setUnitCost] = useState("0");
  const [minimumQuantity, setMinimumQuantity] = useState("1");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");

  // Edición
  const [editName, setEditName] = useState("");
  const [editSku, setEditSku] = useState("");
  const [editUnit, setEditUnit] = useState("");
  const [editUnitCost, setEditUnitCost] = useState("0");
  const [editMinimumQuantity, setEditMinimumQuantity] = useState("1");
  const [editContactName, setEditContactName] = useState("");
  const [editContactPhone, setEditContactPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editActive, setEditActive] = useState(true);

  const load = () => {
    const table = type === "clients"
      ? supabase.from("clients").select("id,name,contact_name,contact_phone,email,address,is_active").order("name")
      : supabase.from("materials").select("id,sku,name,unit,unit_cost,minimum_quantity,is_active").order("name");
    table.then(({ data, error }) => {
      if (error) show("error", errorMessage(error, "No se pudo cargar el catálogo. Inténtalo nuevamente."));
      setRecords((data ?? []) as unknown as CatalogRecord[]);
    });
    if (type === "materials") {
      supabase.from("material_client_consumption_summary").select("material_id,client_id,client_name,unit,consumed_quantity,consumed_cost,last_consumed_at").order("last_consumed_at", { ascending: false })
        .then(({ data, error }) => {
          if (error) show("error", errorMessage(error, "No se pudo cargar el consumo por cliente. Inténtalo nuevamente."));
          setMaterialUsage((data ?? []) as MaterialUsage[]);
        });
    } else setMaterialUsage([]);
  };

  useEffect(load, [type]);

  function resetCreateForm() {
    setName(""); setSku(""); setUnit(""); setUnitCost("0"); setMinimumQuantity("1"); setContactName(""); setContactPhone(""); setEmail(""); setAddress("");
  }

  async function create() {
    if (type === "materials" && (!Number.isFinite(Number(unitCost.replace(",", "."))) || Number(unitCost.replace(",", ".")) < 0 || !Number.isFinite(Number(minimumQuantity.replace(",", "."))) || Number(minimumQuantity.replace(",", ".")) <= 0)) {
      return show("error", "Ingresa un costo válido y una cantidad mínima mayor que cero.");
    }
    setBusy(true);
    const table = supabase.from(type);
    const { error } = type === "clients"
      ? await table.insert({ name: sentenceCase(name), contact_name: sentenceCase(contactName) || null, contact_phone: contactPhone.trim() || null, email: email.trim() || null, address: sentenceCase(address) || null })
      : await table.insert({ sku: sku.trim(), name: sentenceCase(name), unit: sentenceCase(unit), unit_cost: Number(unitCost.replace(",", ".")), minimum_quantity: Number(minimumQuantity.replace(",", ".")), is_active: true });
    setBusy(false);
    if (error) return show("error", error.code === "23505" ? "Ya existe un registro con ese código." : "No se pudo guardar el registro. Revisa los datos e inténtalo nuevamente.");
    resetCreateForm();
    show("success", type === "clients" ? "Cliente registrado." : "Material agregado.");
    load();
  }

  function openEdit(record: CatalogRecord) {
    setEditingId(record.id);
    if (isClient(record)) {
      setEditName(record.name); setEditContactName(record.contact_name ?? ""); setEditContactPhone(record.contact_phone ?? "");
      setEditEmail(record.email ?? ""); setEditAddress(record.address ?? ""); setEditActive(record.is_active);
    } else {
      setEditName(record.name); setEditSku(record.sku); setEditUnit(record.unit); setEditUnitCost(String(record.unit_cost)); setEditMinimumQuantity(String(record.minimum_quantity)); setEditActive(record.is_active ?? true);
    }
  }

  async function saveEdit(id: string) {
    if (type === "materials" && (!Number.isFinite(Number(editUnitCost.replace(",", "."))) || Number(editUnitCost.replace(",", ".")) < 0 || !Number.isFinite(Number(editMinimumQuantity.replace(",", "."))) || Number(editMinimumQuantity.replace(",", ".")) <= 0)) {
      return show("error", "Ingresa un costo válido y una cantidad mínima mayor que cero.");
    }
    setBusy(true);
    const values = type === "clients"
      ? { name: sentenceCase(editName), contact_name: sentenceCase(editContactName) || null, contact_phone: editContactPhone.trim() || null, email: editEmail.trim() || null, address: sentenceCase(editAddress) || null, is_active: editActive }
      : { sku: editSku.trim(), name: sentenceCase(editName), unit: sentenceCase(editUnit), unit_cost: Number(editUnitCost.replace(",", ".")), minimum_quantity: Number(editMinimumQuantity.replace(",", ".")), is_active: editActive };
    const { error } = await supabase.from(type).update(values).eq("id", id);
    setBusy(false);
    if (error) return show("error", error.code === "23505" ? "Ya existe un registro con ese código." : "No se pudo guardar el registro. Revisa los datos e inténtalo nuevamente.");
    setEditingId(null);
    show("success", "Cambios guardados.");
    load();
  }

  function confirmDelete(record: CatalogRecord) {
    Alert.alert(
      "Eliminar registro",
      `¿Eliminar este ${type === "clients" ? "cliente" : "material"}? Solo será posible si no está asociado a órdenes existentes.`,
      [{ text: "Cancelar", style: "cancel" }, { text: "Eliminar", style: "destructive", onPress: () => remove(record.id) }],
    );
  }

  async function remove(id: string) {
    setBusy(true);
    const { error } = await supabase.from(type).delete().eq("id", id);
    setBusy(false);
    if (error) return show("error", "No se puede eliminar: tiene información relacionada. Desactívalo para conservar el historial.");
    show("success", "Registro eliminado.");
    load();
  }

  if (!records) return <Loading label="Cargando catálogo…" />;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <ScrollView contentContainerStyle={cat.body} keyboardShouldPersistTaps="handled">
        <ToastBar toast={toast} onHide={hide} />

        <Card>
          <SectionTitle title={type === "clients" ? "Registrar cliente" : "Agregar material"} />
          {type === "clients" ? (
            <>
              <Field label="Nombre o razón social"><Input value={name} onChangeText={setName} placeholder="Empresa o persona" /></Field>
              <Field label="Persona de contacto"><Input value={contactName} onChangeText={setContactName} /></Field>
              <Field label="Teléfono"><Input value={contactPhone} onChangeText={setContactPhone} keyboardType="phone-pad" /></Field>
              <Field label="Correo electrónico"><Input value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" /></Field>
              <Field label="Dirección"><Input value={address} onChangeText={setAddress} /></Field>
            </>
          ) : (
            <>
              <Field label="Código SKU"><Input value={sku} onChangeText={setSku} preserveCase autoCapitalize="characters" placeholder="Ej. CAB-UTP6" /></Field>
              <Field label="Nombre del material"><Input value={name} onChangeText={setName} /></Field>
              <Field label="Unidad de medida"><Input value={unit} onChangeText={setUnit} placeholder="Unidad, metro o caja" /></Field>
              <Field label="Costo por unidad (Q)" hint="Se conserva en cada consumo para mantener el historial."><Input value={unitCost} onChangeText={setUnitCost} keyboardType="decimal-pad" /></Field>
              <Field label="Cantidad mínima de compra" hint="La estimación redondea la recomendación a este múltiplo."><Input value={minimumQuantity} onChangeText={setMinimumQuantity} keyboardType="decimal-pad" /></Field>
            </>
          )}
          <Button title={type === "clients" ? "Registrar cliente" : "Agregar material"} busy={busy} onPress={create} />
        </Card>

        <SectionTitle title={type === "clients" ? "Catálogo de clientes" : "Catálogo de materiales"} lead={`${records.length} registro${records.length === 1 ? "" : "s"}.`} />

        {records.length ? records.map((record) => {
          const editing = editingId === record.id;
          const usage = !isClient(record) ? materialUsage.filter((item) => item.material_id === record.id) : [];
          return (
            <Card key={record.id}>
              <View style={cat.row}>
                <View style={{ flex: 1 }}>
                  <Text style={cat.name}>{isClient(record) ? record.name : `${(record as Material).sku} · ${record.name}`}</Text>
                  <Text style={cat.meta} numberOfLines={1}>
                    {isClient(record)
                      ? [record.contact_name, record.contact_phone].filter(Boolean).join(" · ") || "Sin contacto registrado"
                      : `Unidad: ${(record as Material).unit}`}
                  </Text>
                  {!isClient(record) && (usage.length
                    ? <Text style={cat.usage}>Consumido por {usage.length} cliente{usage.length === 1 ? "" : "s"}: {usage.map((item) => `${item.client_name} · ${item.consumed_quantity} ${item.unit} · Q ${Number(item.consumed_cost).toFixed(2)}`).join("  |  ")}</Text>
                    : <Text style={cat.usage}>Sin consumo registrado por cliente.</Text>)}
                </View>
                <View style={[cat.status, !record.is_active && cat.statusOff]}>
                  <Text style={[cat.statusText, !record.is_active && cat.statusTextOff]}>{record.is_active ? "Activo" : "Inactivo"}</Text>
                </View>
              </View>

              <View style={cat.actions}>
                <Pressable onPress={() => (editing ? setEditingId(null) : openEdit(record))} style={cat.pill} accessibilityRole="button">
                  <Text style={cat.pillText}>{editing ? "− Editar" : "＋ Editar"}</Text>
                </Pressable>
                <Pressable onPress={() => confirmDelete(record)} style={[cat.pill, cat.pillDanger]} accessibilityRole="button">
                  <Text style={[cat.pillText, cat.pillDangerText]}>Eliminar</Text>
                </Pressable>
              </View>

              {editing && (
                <View style={cat.panel}>
                  {type === "clients" ? (
                    <>
                      <Field label="Nombre o razón social"><Input value={editName} onChangeText={setEditName} /></Field>
                      <Field label="Persona de contacto"><Input value={editContactName} onChangeText={setEditContactName} /></Field>
                      <Field label="Teléfono"><Input value={editContactPhone} onChangeText={setEditContactPhone} keyboardType="phone-pad" /></Field>
                      <Field label="Correo electrónico"><Input value={editEmail} onChangeText={setEditEmail} autoCapitalize="none" keyboardType="email-address" /></Field>
                      <Field label="Dirección"><Input value={editAddress} onChangeText={setEditAddress} /></Field>
                    </>
                  ) : (
                    <>
                      <Field label="Código SKU"><Input value={editSku} onChangeText={setEditSku} preserveCase autoCapitalize="characters" /></Field>
                      <Field label="Nombre del material"><Input value={editName} onChangeText={setEditName} /></Field>
                      <Field label="Unidad de medida"><Input value={editUnit} onChangeText={setEditUnit} /></Field>
                      <Field label="Costo por unidad (Q)"><Input value={editUnitCost} onChangeText={setEditUnitCost} keyboardType="decimal-pad" /></Field>
                      <Field label="Cantidad mínima de compra"><Input value={editMinimumQuantity} onChangeText={setEditMinimumQuantity} keyboardType="decimal-pad" /></Field>
                    </>
                  )}
                  <Pressable onPress={() => setEditActive((value) => !value)} style={cat.switchRow} accessibilityRole="checkbox" accessibilityState={{ checked: editActive }}>
                    <View style={[cat.checkbox, editActive && cat.checkboxOn]}>{editActive ? <Text style={cat.checkboxMark}>✓</Text> : null}</View>
                    <Text style={cat.switchLabel}>{type === "clients" ? "Cliente activo" : "Material activo"}</Text>
                  </Pressable>
                  <Button title="Guardar cambios" busy={busy} onPress={() => saveEdit(record.id)} />
                </View>
              )}
            </Card>
          );
        }) : (
          <EmptyState title={type === "clients" ? "Sin clientes registrados" : "Sin materiales en el catálogo"} text="Agrega el primero con el formulario de arriba." />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const cat = StyleSheet.create({
  body: { padding: 16, paddingBottom: 40, gap: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  name: { color: C.ink, fontSize: 15, fontWeight: "800" },
  meta: { color: C.muted, fontSize: 12.5, marginTop: 3 },
  usage: { color: C.action, fontSize: 12, lineHeight: 17, marginTop: 5 },
  status: { borderRadius: 99, paddingHorizontal: 9, paddingVertical: 4, backgroundColor: C.okSoft },
  statusOff: { backgroundColor: "#eef1f4" },
  statusText: { color: C.ok, fontSize: 11.5, fontWeight: "800" },
  statusTextOff: { color: "#52627a" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  pill: { minHeight: 34, paddingHorizontal: 12, justifyContent: "center", borderRadius: 99, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.line },
  pillText: { color: C.action, fontSize: 12.5, fontWeight: "700" },
  pillDanger: { backgroundColor: C.dangerSoft, borderColor: "#f4cfcd" },
  pillDangerText: { color: C.danger },
  panel: { marginTop: 12, borderTopWidth: 1, borderTopColor: C.lineSoft, paddingTop: 12, gap: 10 },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: "#c8d3dd", alignItems: "center", justifyContent: "center" },
  checkboxOn: { backgroundColor: C.action, borderColor: C.action },
  checkboxMark: { color: "#fff", fontWeight: "900", fontSize: 13 },
  switchLabel: { color: C.ink, fontSize: 14, fontWeight: "600" },
});
