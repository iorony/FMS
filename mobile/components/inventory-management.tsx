import { useCallback, useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { supabase } from "../lib/supabase";
import { errorMessage, formatDateTime, sentenceCase } from "../lib/format";
import { assignmentBalance, inventoryQuantity } from "../lib/inventory";
import { C } from "../theme";
import { Button, Card, EmptyState, Field, Input, Loading, SectionTitle, ToastBar, useToast } from "./ui";
import { SelectField, SelectSheet, Option } from "./select-sheet";

type Material = { id: string; sku: string; name: string; unit: string; is_active?: boolean };
type Relation = { name: string; unit?: string; sku?: string };
type Assignment = { id: string; assigned_quantity: number; consumed_quantity: number; returned_quantity: number; clients: Relation | Relation[] | null; materials: Relation | Relation[] | null };
type Movement = { id: string; movement_type: string; quantity_delta: number; note: string | null; created_at: string; materials: Relation | Relation[] | null };
const one = (relation: Relation | Relation[] | null) => Array.isArray(relation) ? relation[0] : relation;
const label = { entrada: "Entrada", ajuste: "Ajuste", asignacion_cliente: "Asignación a cliente", devolucion_cliente: "Devolución de cliente" } as Record<string, string>;

/** Usa las mismas tablas y operaciones atómicas del portal, sin un inventario paralelo. */
export function InventoryManagement({ materials, onChanged }: { materials: Material[]; onChanged: () => void }) {
  const [data, setData] = useState<{ stock: Record<string, number>; clients: Option[]; assignments: Assignment[]; movements: Movement[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [section, setSection] = useState<"balances" | "assign" | "stock" | "movements">("balances");
  const [sheet, setSheet] = useState<"material" | "client" | null>(null);
  const [materialId, setMaterialId] = useState<string | null>(null);
  const [client, setClient] = useState<Option | null>(null);
  const [returnId, setReturnId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const { toast, show, hide } = useToast();
  const material = materials.find(item => item.id === materialId);
  const load = useCallback(async () => {
    try {
      const [stock, clients, assignments, movements] = await Promise.all([
        supabase.from("material_inventory").select("material_id,on_hand_quantity"),
        supabase.from("clients").select("id,name").eq("is_active", true).order("name"),
        supabase.from("client_material_assignments").select("id,assigned_quantity,consumed_quantity,returned_quantity,clients(name),materials(name,unit,sku)").order("assigned_at", { ascending: false }),
        supabase.from("material_stock_movements").select("id,movement_type,quantity_delta,note,created_at,materials(name,unit)").order("created_at", { ascending: false }).limit(12),
      ]);
      if (stock.error || clients.error || assignments.error || movements.error) throw new Error("load");
      setData({ stock: Object.fromEntries((stock.data ?? []).map(item => [item.material_id, Number(item.on_hand_quantity)])), clients: (clients.data ?? []).map(item => ({ id: item.id, label: item.name })), assignments: (assignments.data ?? []) as unknown as Assignment[], movements: (movements.data ?? []) as unknown as Movement[] });
    } catch { setLoadError(true); } finally { setLoading(false); }
  }, []);
  useEffect(() => {
    let active = true;
    // Inicia después del montaje; omite el primer ciclo descartado por StrictMode.
    void Promise.resolve().then(() => { if (active) return load(); });
    return () => { active = false; };
  }, [load]);
  function resetForm() { setQuantity(""); setNote(""); setReturnId(null); hide(); }
  async function save(mode: "assign" | "stock" | "return") {
    if (pending.current || !data || loading || loadError) return;
    const amount = inventoryQuantity(quantity, mode === "stock");
    if (amount === null) return show("error", mode === "stock" ? "Indica una existencia igual o mayor que cero, con máximo dos decimales." : "Indica una cantidad mayor que cero, con máximo dos decimales.", { persist: true });
    if (mode !== "assign" && !note.trim()) return show("error", "Indica el motivo para conservar la trazabilidad.", { persist: true });
    const assignment = data.assignments.find(item => item.id === returnId);
    if (mode === "return" && (!assignment || amount > assignmentBalance(assignment))) return show("error", "La cantidad supera el saldo disponible del cliente.", { persist: true });
    if (mode !== "return" && (!material || !material.is_active)) return show("error", "Selecciona un material activo.", { persist: true });
    if (mode === "assign" && !client) return show("error", "Selecciona un cliente activo.", { persist: true });
    if (mode === "assign" && amount > (data.stock[material!.id] ?? 0)) return show("error", "La cantidad supera la existencia disponible en bodega.", { persist: true });
    pending.current = true; setBusy(true); hide();
    try {
      const result = mode === "return"
        ? await supabase.rpc("return_client_material", { p_assignment_id: returnId, p_quantity: amount, p_note: sentenceCase(note) })
        : mode === "stock"
          ? await supabase.rpc("set_material_stock", { p_material_id: materialId, p_quantity: amount, p_note: sentenceCase(note) })
          : await supabase.rpc("assign_material_to_client", { p_material_id: materialId, p_client_id: client!.id, p_quantity: amount, p_note: sentenceCase(note) || null });
      if (result.error) throw result.error;
      setQuantity(""); setNote(""); setReturnId(null);
      setLoading(true); setLoadError(false);
      await load(); onChanged();
      show("success", mode === "return" ? "Devolución registrada; el material volvió a bodega." : mode === "stock" ? "Existencia de bodega actualizada." : "Material entregado al cliente; descontado de bodega.", { persist: true });
    } catch (error) { show("error", errorMessage(error, "No fue posible guardar. Actualiza el inventario antes de reintentar."), { persist: true }); }
    finally { pending.current = false; setBusy(false); }
  }
  const fields = (mode: "assign" | "stock" | "return") => <View style={{ gap: 10 }}>
    <Field label={mode === "stock" ? "Existencia final en bodega" : mode === "return" ? "Cantidad a devolver" : "Cantidad a entregar"} hint={mode === "stock" ? "Es el total contado, no una cantidad para sumar. No altera el material ya entregado a clientes." : undefined}><Input value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" /></Field>
    <Field label={mode === "assign" ? "Nota (opcional)" : "Motivo obligatorio"}><Input value={note} onChangeText={setNote} maxLength={300} /></Field>
    <Button title={mode === "stock" ? "Confirmar existencia final" : mode === "return" ? "Confirmar devolución" : "Confirmar entrega al cliente"} busy={busy} onPress={() => { void save(mode); }} />
    <Button title="Cancelar" variant="secondary" disabled={busy} onPress={resetForm} />
  </View>;
  return <Card>
    <SectionTitle title="Inventario y asignaciones" lead="Un solo catálogo. La entrega descuenta de bodega; el consumo usa el saldo del cliente y queda ligado a su orden." />
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {([['balances', 'Saldos de clientes'], ['assign', 'Entregar material'], ['stock', 'Ajustar bodega'], ['movements', 'Movimientos']] as const).map(([key, title]) => <Button key={key} title={`${section === key ? '✓ ' : ''}${title}`} variant="secondary" disabled={busy} onPress={() => { resetForm(); setSection(key); }} />)}
    </View>
    {!returnId && <ToastBar toast={toast} onHide={hide} />}
    {loading ? <Loading label="Consultando inventario…" /> : loadError || !data ? <EmptyState title="Inventario no disponible" text="No se pudieron consultar los saldos. Reintenta antes de registrar movimientos." /> : <>
      {(section === "assign" || section === "stock") && <View style={{ gap: 10 }}>
        <Field label="Material"><SelectField value={material ? `${material.sku} · ${material.name}` : undefined} placeholder="Seleccionar material" onPress={() => setSheet("material")} /></Field>
        {material && <Text style={{ color: C.action }}>Bodega: {(data.stock[material.id] ?? 0).toFixed(2)} {material.unit}</Text>}
        {section === "assign" && <Field label="Cliente"><SelectField value={client?.label} placeholder="Seleccionar cliente" onPress={() => setSheet("client")} /></Field>}
        {fields(section)}
      </View>}
      {section === "balances" && (data.assignments.length ? data.assignments.map(item => {
        const mat = one(item.materials); const balance = assignmentBalance(item);
        return <View key={item.id} style={{ borderTopWidth: 1, borderTopColor: C.line, paddingTop: 12, gap: 8 }}>
          <Text style={{ color: C.ink, fontWeight: "700" }}>{one(item.clients)?.name ?? "Cliente"} · {mat?.name ?? "Material"}</Text>
          <Text style={{ color: C.muted }}>Asignado: {item.assigned_quantity} · Usado: {item.consumed_quantity} · Devuelto: {item.returned_quantity}</Text>
          <Text style={{ color: C.action, fontWeight: "700" }}>Saldo: {balance.toFixed(2)} {mat?.unit}</Text>
          {returnId === item.id ? <><ToastBar toast={toast} onHide={hide} />{fields("return")}</> : balance > 0 && <Button title="Devolver a bodega" variant="secondary" disabled={busy} onPress={() => { resetForm(); setReturnId(item.id); }} />}
        </View>;
      }) : <EmptyState title="Sin asignaciones" text="Entrega material a un cliente para habilitar su consumo en las órdenes." />)}
      {section === "movements" && (data.movements.length ? data.movements.map(item => <View key={item.id} style={{ borderTopWidth: 1, borderTopColor: C.line, paddingTop: 12, gap: 4 }}>
        <Text style={{ fontWeight: "700", color: C.ink }}>{one(item.materials)?.name ?? "Material"} · {label[item.movement_type] ?? item.movement_type.replace(/_/g, ' ')}</Text>
        <Text style={{ color: C.action }}>{Number(item.quantity_delta) > 0 ? '+' : ''}{Number(item.quantity_delta).toFixed(2)} {one(item.materials)?.unit}</Text>
        <Text style={{ color: C.muted }}>{formatDateTime(item.created_at)} · {item.note ?? "Sin nota"}</Text>
      </View>) : <EmptyState title="Sin movimientos" text="Aquí aparecerán los últimos 12 ajustes, entregas y devoluciones." />)}
    </>}
    <Button title="Actualizar inventario" variant="secondary" disabled={busy || loading} onPress={() => { resetForm(); setLoading(true); setLoadError(false); void load(); onChanged(); }} />
    <SelectSheet visible={sheet !== null} title={sheet === "client" ? "Selecciona un cliente" : "Selecciona un material"} options={sheet === "client" ? data?.clients ?? [] : materials.filter(item => item.is_active).map(item => ({ id: item.id, label: `${item.sku} · ${item.name}`, sub: `Disponible: ${(data?.stock[item.id] ?? 0).toFixed(2)} ${item.unit}` }))} onClose={() => setSheet(null)} onSelect={option => { if (sheet === "client") setClient(option); else setMaterialId(option.id); setSheet(null); setQuantity(""); hide(); }} />
  </Card>;
}
