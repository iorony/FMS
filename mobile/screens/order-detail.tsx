import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, FlatList, Image, Linking, Modal, Platform, Pressable, RefreshControl, ScrollView, StatusBar, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import SignatureCanvas, { type SignatureViewRef } from "react-native-signature-canvas";
import { supabase } from "../lib/supabase";
import { C, Role, STATUS_LABEL, Status } from "../theme";
import { errorMessage, formatDateTime, sentenceCase } from "../lib/format";
import { withTimeout } from "../lib/with-timeout";
import type { Material, Order } from "../types";
import { Badge, Button, Card, Check, Input, Loading, PriorityTag, SectionTitle, ToastBar, useToast } from "../components/ui";
import { SelectField, SelectSheet } from "../components/select-sheet";

type LocationRecord = { id: string; record_type: "inicio" | "cierre"; latitude: number; longitude: number; accuracy_meters: number | null; captured_at: string };
type Consumption = { id: string; quantity: number; unit: string; unit_cost: number; total_cost: number; note: string | null; materials: { name: string; sku: string } | null };
type Evidence = { id: string; storage_path: string; created_at: string; suggested_category: string | null; final_category: string | null; review_note: string | null; confidence: number | null };
type Signature = { signer_name: string; signed_at: string };
type HistoryEntry = { id: string; created_at: string; from_status: Status | null; to_status: Status; note: string | null };
type TimelineEvent = { id: string; created_at: string; event_type: string; description: string; actor_name: string | null };
type PredictionEstimate = { material_id: string; estimated_quantity: number; recommended_quantity: number; minimum_quantity: number; unit: string; unit_cost: number; estimated_cost: number; sample_size: number };
type ClientMaterialAssignment = { id: string; assigned_quantity: number; consumed_quantity: number; returned_quantity: number; materials: Material | null };

type Expediente = {
  locations: LocationRecord[];
  consumptions: Consumption[];
  evidences: Evidence[];
  signature: Signature | null;
};

const EMPTY: Expediente = { locations: [], consumptions: [], evidences: [], signature: null };
const EVIDENCE_SELECT = "id,storage_path,created_at,suggested_category,final_category,review_note,confidence";

export function OrderDetail({ order, role, onClose, onChanged, onEdit }: {
  order: Order; role: Role; onClose: () => void; onChanged: () => void; onEdit: () => void;
}) {
  const technician = role === "technician";
  const manager = !technician;
  const [status, setStatus] = useState<Status>(order.status);
  const [file, setFile] = useState<Expediente>(EMPTY);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [clientAssignments, setClientAssignments] = useState<ClientMaterialAssignment[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(true);
  const [assignmentsError, setAssignmentsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [isResponsible, setIsResponsible] = useState(false);

  const [material, setMaterial] = useState<ClientMaterialAssignment | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [signer, setSigner] = useState("");
  const signature = useRef<SignatureViewRef>(null);
  const { toast, show, hide } = useToast();
  const [feedbackStep, setFeedbackStep] = useState<"gps" | "materials" | null>(null);

  /** El expediente se lee del servidor: los pasos ya no se infieren solo del estado. */
  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    const [locations, consumptions, evidences, signatures, current, historyResult, timelineResult] = await Promise.all([
      supabase.from("location_records").select("id,record_type,latitude,longitude,accuracy_meters,captured_at").eq("work_order_id", order.id).order("captured_at"),
      supabase.from("work_order_materials").select("id,quantity,unit,unit_cost,total_cost,note,materials(name,sku)").eq("work_order_id", order.id),
      supabase.from("evidences").select(EVIDENCE_SELECT).eq("work_order_id", order.id).order("created_at"),
      supabase.from("customer_signatures").select("signer_name,signed_at").eq("work_order_id", order.id).limit(1),
      supabase.from("work_orders").select("status").eq("id", order.id).single(),
      supabase.from("work_order_status_history").select("id,created_at,from_status,to_status,note").eq("work_order_id", order.id).order("created_at", { ascending: false }),
      supabase.from("work_order_timeline_events").select("id,created_at,event_type,description,actor_name").eq("work_order_id", order.id).order("created_at", { ascending: false }),
    ]);

    setFile({
      locations: (locations.data ?? []) as LocationRecord[],
      consumptions: (consumptions.data ?? []) as unknown as Consumption[],
      evidences: (evidences.data ?? []) as unknown as Evidence[],
      signature: (signatures.data?.[0] as Signature | undefined) ?? null,
    });
    setHistory((historyResult.data ?? []) as HistoryEntry[]);
    setTimeline((timelineResult.data ?? []) as TimelineEvent[]);
    if (current.data?.status) setStatus(current.data.status as Status);
    setLoading(false);
    setRefreshing(false);
  }, [order.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setIsResponsible(data.user?.id === order.assigned_technician_id)); }, [order.assigned_technician_id]);

  const loadAssignments = useCallback(async () => {
    if (!technician) return;
    setAssignmentsLoading(true);
    setAssignmentsError(null);
    setMaterial(null);
    const { data, error } = await supabase.from("client_material_assignments")
      .select("id,assigned_quantity,consumed_quantity,returned_quantity,materials(id,sku,name,unit,unit_cost,minimum_quantity)")
      .eq("client_id", order.client_id).order("assigned_at");
    if (error) setAssignmentsError(errorMessage(error, "No se cargaron los materiales asignados al cliente."));
    else setClientAssignments((data ?? []) as unknown as ClientMaterialAssignment[]);
    setAssignmentsLoading(false);
  }, [technician, order.client_id]);
  useEffect(() => { void loadAssignments(); }, [loadAssignments]);

  const hasStart = file.locations.some((item) => item.record_type === "inicio");
  const hasEnd = file.locations.some((item) => item.record_type === "cierre");
  const requirements = {
    inicio: hasStart,
    cierre: hasEnd,
    materiales: file.consumptions.length > 0,
    evidencias: file.evidences.length > 0,
    firma: Boolean(file.signature),
  };
  const missing = Object.values(requirements).filter((value) => !value).length;
  const nextAction = describeNextAction(status, manager, requirements);

  async function currentUser() {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw new Error("Tu sesión expiró. Inicia sesión nuevamente.");
    return data.user;
  }

  function openNavigation() {
    const latitude = Number(order.site_latitude); const longitude = Number(order.site_longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      show("error", "Esta orden aún no tiene un punto de ubicación. Coordinación puede agregarlo desde la web.");
      return;
    }
    const coordinates = `${latitude},${longitude}`;
    Alert.alert("Cómo llegar al sitio", order.address, [
      { text: "Cancelar", style: "cancel" },
      { text: "Waze", onPress: () => Linking.openURL(`https://www.waze.com/ul?ll=${encodeURIComponent(coordinates)}&navigate=yes`) },
      { text: "Google Maps", onPress: () => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(coordinates)}`) },
    ]);
  }

  async function registerLocation(type: "inicio" | "cierre") {
    setFeedbackStep("gps");
    setBusy(true);
    try {
      const permission = await withTimeout(Location.requestForegroundPermissionsAsync(), 20000, "Autoriza el acceso a la ubicación y vuelve a intentarlo.");
      if (permission.status !== "granted") throw new Error("Autoriza el acceso a la ubicación para registrar tu presencia en el sitio.");
      const point = await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }), 20000, "El GPS no respondió en 20 segundos. Revisa la ubicación del dispositivo y vuelve a intentarlo; no se registró ninguna llegada o salida.");
      const { error } = await supabase.rpc("register_field_location", {
        order_id: order.id,
        record_type: type,
        latitude: point.coords.latitude,
        longitude: point.coords.longitude,
        accuracy_meters: point.coords.accuracy,
      });
      if (error) throw error;
      show("success", type === "inicio"
        ? "Llegada registrada. La orden pasó a en proceso."
        : "Salida registrada. La orden quedó pendiente de firma y validación.");
      await load(true);
      onChanged();
    } catch (error) {
      show("error", errorMessage(error, "No se pudo obtener la ubicación. Revisa que el GPS esté encendido."), { persist: true });
    } finally {
      setBusy(false);
    }
  }

  async function addMaterial() {
    setFeedbackStep("materials");
    const value = Number(quantity.replace(",", "."));
    if (!material?.materials || !Number.isFinite(value) || value <= 0) {
      return show("error", "Elige un material e ingresa una cantidad mayor que cero.");
    }
    const available = Number(material.assigned_quantity) - Number(material.consumed_quantity) - Number(material.returned_quantity);
    if (value > available) return show("error", `La cantidad supera el saldo asignado al cliente (${available.toFixed(2)} ${material.materials.unit}).`);
    setBusy(true);
    try {
      const { error } = await supabase.rpc("consume_client_material", {
        p_work_order_id: order.id,
        p_assignment_id: material.id,
        p_quantity: value,
        p_note: sentenceCase(note) || null,
      });
      if (error) throw error;
      show("success", `${material.materials.name} agregado al consumo de la orden.`);
      setMaterial(null); setQuantity(""); setNote("");
      await Promise.all([load(true), loadAssignments()]);
    } catch (error) {
      show("error", errorMessage(error, "No fue posible guardar el material."));
    } finally {
      setBusy(false);
    }
  }

  function chooseEvidenceSource() {
    setFeedbackStep(null);
    Alert.alert("Agregar evidencia", "Elige cómo deseas adjuntar la fotografía.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Galería", onPress: () => addEvidence("library") },
      { text: "Cámara", onPress: () => addEvidence("camera") },
    ]);
  }

  async function addEvidence(source: "camera" | "library") {
    const permission = source === "camera"
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      return show("error", source === "camera"
        ? "Autoriza el uso de la cámara para capturar evidencia."
        : "Autoriza el acceso a la galería para adjuntar evidencia.");
    }
    const result = source === "camera"
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8, selectionLimit: 1 });
    if (result.canceled) return;
    setBusy(true);
    try {
      const asset = result.assets[0];
      if ((asset.fileSize ?? 0) > 10 * 1024 * 1024) throw new Error("La imagen supera el límite de 10 MB.");
      const actor = await currentUser();
      const extension = asset.mimeType === "image/png" ? "png" : asset.mimeType === "image/webp" ? "webp" : "jpg";
      const path = `${actor.id}/${order.id}/${Date.now()}.${extension}`;
      const body = await (await fetch(asset.uri)).arrayBuffer();
      const { error: uploadError } = await supabase.storage.from("evidences").upload(path, body, { contentType: asset.mimeType ?? "image/jpeg", upsert: false });
      if (uploadError) throw uploadError;
      const { error } = await supabase.from("evidences").insert({ work_order_id: order.id, storage_path: path, review_status: "pending", created_by: actor.id });
      if (error) {
        await supabase.storage.from("evidences").remove([path]);
        throw error;
      }
      show("success", "Evidencia agregada al expediente.");
      await load(true);
    } catch (error) {
      show("error", errorMessage(error, "No fue posible cargar la evidencia."));
    } finally {
      setBusy(false);
    }
  }

  async function saveSignature(dataUrl: string) {
    setFeedbackStep(null);
    if (!signer.trim()) return show("error", "Escribe el nombre de quien recibe el servicio.");
    setBusy(true);
    try {
      const actor = await currentUser();
      const path = `${actor.id}/${order.id}/${Date.now()}.png`;
      const body = await (await fetch(dataUrl)).arrayBuffer();
      if (body.byteLength > 5 * 1024 * 1024) throw new Error("La firma supera el límite de 5 MB.");
      const { error: uploadError } = await supabase.storage.from("signatures").upload(path, body, { contentType: "image/png", upsert: false });
      if (uploadError) throw uploadError;
      const { error } = await supabase.from("customer_signatures").insert({
        work_order_id: order.id, signer_name: sentenceCase(signer), storage_path: path, captured_by: actor.id,
      });
      if (error) {
        await supabase.storage.from("signatures").remove([path]);
        throw error;
      }
      setSigner("");
      signature.current?.clearSignature();
      show("success", "Conformidad registrada.");
      await load(true);
      onChanged();
    } catch (error) {
      show("error", errorMessage(error, "No fue posible guardar la firma."));
    } finally {
      setBusy(false);
    }
  }

  function requestSaveSignature() {
    if (!signer.trim()) return show("error", "Escribe el nombre de quien recibe el servicio.");
    signature.current?.readSignature();
  }

  /** El cierre es irreversible: se confirma antes de ejecutarlo. */
  function confirmClose() {
    Alert.alert(
      "Cerrar la orden",
      `El cierre de ${order.code} es definitivo y queda registrado en la bitácora. ¿Deseas continuar?`,
      [{ text: "Cancelar", style: "cancel" }, { text: "Validar y cerrar", style: "destructive", onPress: closeOrder }],
    );
  }

  async function closeOrder() {
    setFeedbackStep(null);
    setBusy(true);
    try {
      const { error } = await supabase.rpc("close_work_order", { order_id: order.id, closure_note: null });
      if (error) throw error;
      setStatus("cerrada");
      show("success", "Orden cerrada formalmente.");
      await load(true);
      onChanged();
    } catch (error) {
      show("error", errorMessage(error, "Verifica que el expediente esté completo."));
    } finally {
      setBusy(false);
    }
  }

  const canStart = technician && isResponsible && status === "asignada" && !hasStart;
  const canWork = technician && status === "en_proceso" && hasStart;
  const availableAssignments = clientAssignments.filter((item) => item.materials && Number(item.assigned_quantity) > Number(item.consumed_quantity) + Number(item.returned_quantity));
  const canSelectMaterial = canWork && !busy && !assignmentsLoading && !assignmentsError && availableAssignments.length > 0;
  const canSign = technician && isResponsible && status === "pendiente_de_cierre" && !file.signature;
  const canClose = manager && status === "pendiente_de_cierre";
  const canEditOrder = manager && status !== "cerrada";

  return (
    <Modal animationType="slide" visible onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.paper }} edges={["top", "bottom"]}>
        <StatusBar barStyle="light-content" backgroundColor={C.graphite} />

        <View style={detail.top}>
          <Pressable onPress={onClose} style={detail.back} accessibilityRole="button" accessibilityLabel="Volver">
            <Text style={detail.backArrow}>‹</Text>
            <Text style={detail.backText}>{technician ? "Mis órdenes" : "Operación"}</Text>
          </Pressable>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            {canEditOrder ? (
              <Pressable onPress={onEdit} accessibilityRole="button" hitSlop={8}>
                <Text style={detail.editLink}>Editar</Text>
              </Pressable>
            ) : null}
            <Badge status={status} />
          </View>
        </View>

        <ScrollView
          contentContainerStyle={detail.body}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void load(true); void loadAssignments(); }} colors={[C.action]} tintColor={C.action} />}
        >
          <View style={detail.hero}>
            <Text style={detail.eyebrow}>{technician ? "ORDEN DE SERVICIO" : "SEGUIMIENTO DE ORDEN"}</Text>
            <Text style={detail.code}>{order.code}</Text>
            <Text style={detail.client}>{order.clients?.name ?? "Cliente"}</Text>
            <View style={detail.heroMeta}>
              <Text style={detail.address}>⌖  {order.address}</Text>
              <Pressable onPress={openNavigation} style={detail.navigationButton} accessibilityRole="button" accessibilityLabel="Cómo llegar a la ubicación de la orden">
                <Text style={detail.navigationButtonText}>⌖  Cómo llegar</Text>
              </Pressable>
              <Text style={detail.schedule}>◷  {formatDateTime(order.scheduled_at)}</Text>
            </View>
          </View>

          <View style={{ paddingHorizontal: 16, gap: 12, paddingTop: 14 }}>
            <View style={detail.priorityRow}>
              <PriorityTag priority={order.priority} />
              {order.profiles?.full_name ? <Text style={detail.assigned}>Técnico: {order.profiles.full_name}</Text> : null}
            </View>

            <Text style={detail.description}>{order.description}</Text>

            {!feedbackStep && <ToastBar toast={toast} onHide={hide} />}

            {loading ? <Loading label="Cargando expediente…" /> : (
              <>
                <View style={[detail.nextAction, { backgroundColor: nextAction.background, borderColor: nextAction.border }]}>
                  <Text style={[detail.nextActionLabel, { color: nextAction.color }]}>SIGUIENTE PASO</Text>
                  <Text style={detail.nextActionTitle}>{nextAction.title}</Text>
                  <Text style={detail.nextActionText}>{nextAction.description}</Text>
                </View>
                <Card>
                  <SectionTitle title="Expediente de campo" lead={missing ? `Faltan ${missing} requisito${missing === 1 ? "" : "s"} para poder cerrar.` : "Expediente completo."} />
                  <View style={{ gap: 11 }}>
                    <Check done={requirements.inicio} label="GPS de llegada al sitio" />
                    <Check done={requirements.cierre} label="GPS de salida del sitio" />
                    <Check done={requirements.materiales} label={`Materiales registrados (${file.consumptions.length})`} />
                    <Check done={requirements.evidencias} label={`Evidencia fotográfica (${file.evidences.length})`} />
                    <Check done={requirements.firma} label="Firma de conformidad" />
                  </View>
                </Card>

                {technician && (
                  <>
                    <Step number={hasStart ? "✓" : "1"} done={hasStart} title="Presencia en sitio"
                      caption={hasEnd ? "Visita finalizada. Llegada y salida registradas." : hasStart ? "Llegada registrada. Marca la salida al terminar el trabajo." : "Registra tu llegada con la ubicación del dispositivo."}>
                      {feedbackStep === "gps" && <ToastBar toast={toast} onHide={hide} />}
                      <Button title="Registrar llegada" variant="field" busy={busy} disabled={!canStart} onPress={() => registerLocation("inicio")} />
                      {!isResponsible ? <Note text="El técnico responsable registra el GPS de inicio y entrega del proyecto. Tu jornada se registra arriba." /> : null}
                      {!canStart && !hasStart ? <Note text="Se habilita cuando coordinación te asigne la orden." /> : null}
                      {hasStart && !hasEnd ? (
                        <Button title="Registrar salida" variant="secondary" busy={busy} disabled={!isResponsible || status !== "en_proceso"} onPress={() => registerLocation("cierre")} />
                      ) : null}
                      {file.locations.map((item) => (
                        <Record key={item.id}
                          title={`${item.record_type === "inicio" ? "Llegada" : "Salida"} · ${formatDateTime(item.captured_at)}`}
                          sub={`${Number(item.latitude).toFixed(6)}, ${Number(item.longitude).toFixed(6)} · ±${Math.round(Number(item.accuracy_meters ?? 0))} m`} />
                      ))}
                    </Step>

                    <Step number={requirements.materiales ? "✓" : "2"} done={requirements.materiales} title="Materiales utilizados"
                      caption={canWork ? "Registra el consumo real, un renglón por material." : "Se habilita mientras la orden está en proceso."}>
                      {feedbackStep === "materials" && <ToastBar toast={toast} onHide={hide} />}
                      <SelectField
                        value={material?.materials ? `${material.materials.sku} · ${material.materials.name}` : null}
                        placeholder="Seleccionar material"
                        disabled={!canSelectMaterial}
                        onPress={() => setPickerOpen(true)}
                      />
                      <Input editable={Boolean(canSelectMaterial && material)} keyboardType="decimal-pad" placeholder={material?.materials ? `Cantidad en ${material.materials.unit}` : "Cantidad"} value={quantity} onChangeText={setQuantity} accessibilityLabel="Cantidad" />
                      <Input editable={Boolean(canSelectMaterial && material)} placeholder="Observación (opcional)" value={note} onChangeText={setNote} accessibilityLabel="Observación" />
                      {material?.materials ? <Note text={`Saldo asignado: ${(Number(material.assigned_quantity) - Number(material.consumed_quantity) - Number(material.returned_quantity)).toFixed(2)} ${material.materials.unit} · Q ${Number(material.materials.unit_cost).toFixed(2)} por ${material.materials.unit}`} /> : null}
                      <Button title="Agregar material" busy={busy} disabled={!canSelectMaterial || !material || !quantity.trim()} onPress={addMaterial} />
                      {canWork && (assignmentsLoading ? <Note text="Cargando materiales asignados…" /> : assignmentsError ? <><Note text={assignmentsError} /><Button title="Reintentar carga de materiales" variant="secondary" onPress={() => { void loadAssignments(); }} /></> : !availableAssignments.length ? <><Note text="No hay materiales asignados con saldo para este cliente. Solicita la asignación a administración antes de registrar consumo." /><Button title="Actualizar materiales asignados" variant="secondary" disabled={busy} onPress={() => { setMaterial(null); void loadAssignments(); }} /></> : null)}
                      {!canWork && !hasStart ? <Note text="Primero registra tu llegada al sitio." /> : null}
                      {file.consumptions.map((item) => (
                        <Record key={item.id}
                          title={`${item.materials?.name ?? "Material"} — ${item.quantity} ${item.unit}`}
                          sub={[item.materials?.sku ? `SKU ${item.materials.sku}` : "", `Q ${Number(item.total_cost).toFixed(2)}`, item.note ?? ""].filter(Boolean).join(" · ")} />
                      ))}
                    </Step>

                    <Step number={requirements.evidencias ? "✓" : "3"} done={requirements.evidencias} title="Evidencia fotográfica"
                      caption={canWork ? "Toma una fotografía o adjúntala desde la galería." : "Se habilita mientras la orden está en proceso."}>
                      <Button title="Agregar evidencia" variant="field" busy={busy} disabled={!canWork} onPress={chooseEvidenceSource} />
                      <EvidenceGallery evidences={file.evidences} canReview={false} onChanged={() => load(true)} />
                    </Step>

                    {(canSign || file.signature) && (
                      <Step number={file.signature ? "✓" : "4"} done={Boolean(file.signature)} title="Conformidad del cliente"
                        caption={file.signature ? "La conformidad ya fue registrada." : Platform.OS === "web" ? "Captura la firma desde la aplicación instalada o el portal web." : "Pide al cliente que firme con el dedo dentro del recuadro."}>
                        {file.signature ? (
                          <Record title={file.signature.signer_name} sub={`Firmó el ${formatDateTime(file.signature.signed_at)}`} />
                        ) : Platform.OS === "web" ? (
                          <>
                            <Note text="La vista de Expo en navegador no admite el componente nativo de firma. Usa la aplicación Android/iOS o abre esta orden en el portal web; no se ha registrado ninguna firma." />
                            {process.env.EXPO_PUBLIC_WEB_APP_URL ? <Button title="Abrir orden en el portal web" variant="secondary" onPress={() => { void Linking.openURL(`${process.env.EXPO_PUBLIC_WEB_APP_URL!.replace(/\/$/, "")}/ordenes/${order.id}`).catch(() => show("error", "No se pudo abrir el portal web.")); }} /> : null}
                          </>
                        ) : (
                          <>
                            <Input maxLength={120} placeholder="Nombre de quien recibe el servicio" value={signer} onChangeText={setSigner} accessibilityLabel="Nombre de quien recibe" />
                            <View style={detail.signature}>
                              <SignatureCanvas
                                ref={signature}
                                onOK={saveSignature}
                                onEmpty={() => show("error", "Pide al cliente que firme dentro del recuadro.")}
                                onError={(error) => show("error", errorMessage(error, "No fue posible guardar la firma."))}
                                descriptionText="Firme dentro del recuadro"
                                penColor={C.ink}
                                backgroundColor="#ffffff"
                                webStyle={signatureStyle}
                                webviewProps={{ androidLayerType: "hardware" }}
                              />
                            </View>
                            <View style={detail.signatureActions}>
                              <View style={{ flex: 1 }}><Button title="Guardar firma" busy={busy} onPress={requestSaveSignature} /></View>
                              <View style={{ flex: 0.7 }}><Button title="Borrar" variant="secondary" disabled={busy} onPress={() => signature.current?.clearSignature()} /></View>
                            </View>
                          </>
                        )}
                      </Step>
                    )}

                    {status === "pendiente_de_cierre" && (
                      <View style={detail.notice}>
                        <Text style={detail.noticeTitle}>Siguiente paso</Text>
                        <Text style={detail.noticeText}>Administración o coordinación validará el expediente y cerrará la orden formalmente.</Text>
                      </View>
                    )}
                  </>
                )}

                {manager && (
                  <>
                    {file.locations.length || file.consumptions.length || file.evidences.length ? (
                      <Card>
                        <SectionTitle title="Registros del técnico" lead="Lo documentado durante la visita." />
                        {file.locations.map((item) => (
                          <Record key={item.id}
                            title={`${item.record_type === "inicio" ? "Llegada" : "Salida"} · ${formatDateTime(item.captured_at)}`}
                            sub={`${Number(item.latitude).toFixed(6)}, ${Number(item.longitude).toFixed(6)} · ±${Math.round(Number(item.accuracy_meters ?? 0))} m`} />
                        ))}
                        {file.consumptions.map((item) => (
                          <Record key={item.id} title={`${item.materials?.name ?? "Material"} — ${item.quantity} ${item.unit}`} sub={[`Q ${Number(item.total_cost).toFixed(2)}`, item.note ?? ""].filter(Boolean).join(" · ")} />
                        ))}
                        <EvidenceGallery evidences={file.evidences} canReview onChanged={() => load(true)} />
                      </Card>
                    ) : (
                      <Card><Text style={detail.plain}>El técnico aún no ha registrado actividad en el sitio.</Text></Card>
                    )}

                    <MaterialPrediction orderId={order.id} />

                    {canClose && (
                      <Card style={{ backgroundColor: C.actionSoft, borderColor: "#c8daf0" }}>
                        <SectionTitle title="Cierre formal" lead={missing ? "El cierre se habilita cuando el expediente esté completo." : "El expediente está completo y puede validarse."} />
                        <Button title="Validar y cerrar orden" busy={busy} disabled={missing > 0} onPress={confirmClose} />
                      </Card>
                    )}

                    {status === "cerrada" && (
                      <Card style={{ backgroundColor: C.okSoft, borderColor: "#bfe4d2" }}>
                        <Text style={detail.successTitle}>Orden cerrada formalmente</Text>
                        <Text style={detail.successText}>El expediente fue validado por administración o coordinación.</Text>
                      </Card>
                    )}
                  </>
                )}

                <Card>
                  <SectionTitle title="Bitácora de la orden" lead="Eventos del expediente con fecha, hora y responsable." />
                  {timeline.length ? timeline.map((entry) => (
                    <View key={entry.id} style={detail.historyRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={detail.historyChange}>
                          {entry.description}
                        </Text>
                        <Text style={detail.historyNote}>{entry.actor_name ?? "Responsable no disponible"}</Text>
                      </View>
                      <Text style={detail.historyDate}>{formatDateTime(entry.created_at)}</Text>
                    </View>
                  )) : <Text style={detail.plain}>Sin eventos registrados.</Text>}
                </Card>
              </>
            )}
          </View>
        </ScrollView>

        <SelectSheet
          visible={pickerOpen}
          title="Selecciona un material"
          options={availableAssignments.map((item) => ({ id: item.id, label: item.materials!.name, sub: `${item.materials!.sku} · saldo ${(Number(item.assigned_quantity) - Number(item.consumed_quantity) - Number(item.returned_quantity)).toFixed(2)} ${item.materials!.unit}` }))}
          selectedId={material?.id ?? null}
          emptyText="Este cliente no tiene material asignado con saldo disponible."
          onSelect={(option) => { setMaterial(clientAssignments.find((item) => item.id === option.id) ?? null); setPickerOpen(false); }}
          onClose={() => setPickerOpen(false)}
        />
      </SafeAreaView>
    </Modal>
  );
}

/** Carpeta de evidencias con visor a pantalla completa; el técnico ve fotos, gestión puede revisar y clasificar con IA. */
function EvidenceGallery({ evidences, canReview, onChanged }: { evidences: Evidence[]; canReview: boolean; onChanged: () => void }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [previewLoading, setPreviewLoading] = useState(true);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [category, setCategory] = useState("");
  const [noteText, setNoteText] = useState("");
  const [saving, setSaving] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  useEffect(() => {
    if (!evidences.length) return setUrls({});
    let active = true;
    setPreviewLoading(true);
    setFailedImages({});
    supabase.storage.from("evidences").createSignedUrls(evidences.map((item) => item.storage_path), 600).then(({ data }) => {
      if (!active) return;
      const map: Record<string, string> = {};
      for (const item of data ?? []) if (item.path && item.signedUrl) map[item.path] = item.signedUrl;
      setUrls(map);
      setPreviewLoading(false);
    }).catch(() => {
      if (!active) return;
      setUrls({});
      setPreviewLoading(false);
    });
    return () => { active = false; };
  }, [evidences, previewAttempt]);

  if (!evidences.length) return null;

  const selected = evidences[index];

  function openAt(nextIndex: number) {
    setIndex(nextIndex);
    setCategory(evidences[nextIndex]?.final_category ?? "");
    setNoteText(evidences[nextIndex]?.review_note ?? "");
    setReviewError(null);
    setOpen(true);
  }

  async function saveReview() {
    const finalCategory = sentenceCase(category);
    const finalNote = sentenceCase(noteText);
    if (!finalCategory) return setReviewError("Indica una categoría antes de guardar la revisión.");
    setSaving(true);
    setReviewError(null);
    const { error } = await supabase.rpc("review_evidence", { evidence_id: selected.id, category: finalCategory, note: finalNote || null });
    setSaving(false);
    if (error) return setReviewError(errorMessage(error, "No fue posible guardar la revisión de evidencia."));
    onChanged();
  }

  async function classify() {
    setClassifying(true);
    setReviewError(null);
    try {
      const url = process.env.EXPO_PUBLIC_WEB_APP_URL;
      if (!url) throw new Error("Falta configurar EXPO_PUBLIC_WEB_APP_URL en el archivo .env.local.");
      const { data } = await supabase.auth.getSession();
      const response = await fetch(`${url}/api/ai/classify-evidence`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
        body: JSON.stringify({ evidenceId: selected.id }),
      });
      const payload = await response.json() as { category?: string; confidence?: number; error?: string };
      if (!response.ok || !payload.category) throw new Error(payload.error || "No fue posible clasificar la evidencia.");
      setCategory(payload.category);
      setReviewError(`Sugerencia IA: ${payload.category} (${Math.round((payload.confidence ?? 0) * 100)}%). Revísala antes de confirmarla.`);
      onChanged();
    } catch (error) {
      setReviewError(errorMessage(error, "No fue posible clasificar la evidencia."));
    } finally {
      setClassifying(false);
    }
  }

  return (
    <>
      <Pressable onPress={() => openAt(0)} style={gallery.folder} accessibilityRole="button" accessibilityLabel={`Abrir ${evidences.length} evidencias fotográficas`}>
        <View style={gallery.folderPreview}>
          {evidences.slice(0, 3).map((item, previewIndex) => (
            urls[item.storage_path] ? (
              <Image key={item.id} source={{ uri: urls[item.storage_path] }} resizeMode="cover" style={[gallery.folderThumb, { left: previewIndex * 10, zIndex: 3 - previewIndex }]} />
            ) : null
          ))}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={gallery.folderTitle}>Carpeta de evidencias</Text>
          <Text style={gallery.folderMeta}>{evidences.length} {evidences.length === 1 ? "fotografía" : "fotografías"} · Ver vista previa</Text>
        </View>
        <Text style={gallery.folderOpen}>›</Text>
      </Pressable>

      <Modal visible={open} animationType="fade" onRequestClose={() => setOpen(false)} transparent>
        <View style={gallery.backdrop}>
          <View style={gallery.head}>
            <Text style={gallery.headTitle}>{index + 1} de {evidences.length}</Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={10} accessibilityRole="button">
              <Text style={gallery.close}>Cerrar</Text>
            </Pressable>
          </View>

          <View style={gallery.preview}>
            {urls[selected.storage_path] && !failedImages[selected.storage_path] ? (
              <Image source={{ uri: urls[selected.storage_path] }} style={{ width: "100%", height: "100%" }} resizeMode="contain" onError={() => setFailedImages((current) => ({ ...current, [selected.storage_path]: true }))} />
            ) : <View style={{ padding: 20, gap: 16 }}><Text style={gallery.previewLoading}>{previewLoading ? "Cargando vista previa…" : "No se pudo cargar esta fotografía. El archivo puede no estar disponible o tu sesión no tiene acceso."}</Text>{!previewLoading && <Button title="Reintentar vista previa" variant="secondary" onPress={() => setPreviewAttempt((value) => value + 1)} />}</View>}
          </View>

          <Text style={gallery.meta}>{selected.final_category ?? selected.suggested_category ?? "Sin clasificar"} · {formatDateTime(selected.created_at)}</Text>

          {canReview && (
            <ScrollView style={gallery.reviewBox} keyboardShouldPersistTaps="handled">
              <Text style={gallery.reviewLabel}>Categoría final</Text>
              <Input value={category} onChangeText={setCategory} maxLength={120} placeholder="Ej.: instalación terminada" />
              <Text style={[gallery.reviewLabel, { marginTop: 8 }]}>Nota de revisión</Text>
              <Input value={noteText} onChangeText={setNoteText} maxLength={500} placeholder="Opcional" />
              {reviewError ? <Text style={gallery.reviewError}>{reviewError}</Text> : null}
              <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                <View style={{ flex: 1 }}><Button title={classifying ? "Clasificando…" : "Clasificar con IA"} variant="secondary" busy={classifying} disabled={saving} onPress={classify} /></View>
                <View style={{ flex: 1 }}><Button title="Guardar revisión" busy={saving} disabled={classifying} onPress={saveReview} /></View>
              </View>
            </ScrollView>
          )}

          <FlatList
            horizontal
            data={evidences}
            keyExtractor={(item) => item.id}
            showsHorizontalScrollIndicator={false}
            style={gallery.strip}
            contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}
            renderItem={({ item, index: thumbIndex }) => (
              <Pressable onPress={() => openAt(thumbIndex)} style={[gallery.stripThumb, thumbIndex === index && gallery.stripThumbActive]}>
                {urls[item.storage_path] ? <Image source={{ uri: urls[item.storage_path] }} style={{ width: "100%", height: "100%" }} resizeMode="cover" /> : null}
              </Pressable>
            )}
          />
        </View>
      </Modal>
    </>
  );
}

/** Referencia histórica de compra por prioridad; requiere aceptación explícita antes de usarse en planificación. */
function MaterialPrediction({ orderId, materials }: { orderId: string; materials?: Material[] }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [estimates, setEstimates] = useState<PredictionEstimate[] | null>(null);
  const [predictionId, setPredictionId] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [names, setNames] = useState<Record<string, string>>(Object.fromEntries((materials ?? []).map((item) => [item.id, item.name])));
  const totalCost = estimates?.reduce((total, item) => total + Number(item.estimated_cost || 0), 0) ?? 0;

  async function generate() {
    setBusy(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("create_material_prediction", { order_id: orderId });
    setBusy(false);
    if (rpcError) return setError(errorMessage(rpcError, "No fue posible actualizar el estado de la orden."));
    const list = data?.prediction?.materials;
    setPredictionId(data?.id ?? null);
    setAccepted(Boolean(data?.accepted_at));
    setEstimates(Array.isArray(list) ? list : []);
    if (Object.keys(names).length === 0 && Array.isArray(list) && list.length) {
      const ids: string[] = list.map((item: PredictionEstimate) => item.material_id);
      const { data: materialsData } = await supabase.from("materials").select("id,name").in("id", ids);
      setNames(Object.fromEntries((materialsData ?? []).map((item) => [item.id, item.name])));
    }
  }

  async function accept() {
    if (!predictionId) return;
    setBusy(true);
    const { error: rpcError } = await supabase.rpc("accept_material_prediction", { prediction_id: predictionId, accepted: null });
    setBusy(false);
    if (rpcError) return setError(errorMessage(rpcError, "No fue posible actualizar el estado de la orden."));
    setAccepted(true);
  }

  return (
    <Card>
      <SectionTitle title="Estimación de materiales" lead="Compra sugerida con mínimos y costo, basada en órdenes cerradas de la misma prioridad." />
      <Button title={estimates ? "Recalcular estimación" : "Generar estimación"} variant="secondary" busy={busy && !estimates} onPress={generate} />
      {error ? <Text style={detail.plain}>{error}</Text> : null}
      {estimates ? (
        estimates.length ? (
          <>
            {estimates.map((item) => (
              <Record key={item.material_id} title={`${names[item.material_id] ?? "Material"} · comprar ${item.recommended_quantity} ${item.unit}`} sub={`Consumo estimado: ${item.estimated_quantity} ${item.unit} · mínimo: ${item.minimum_quantity} ${item.unit} · Q ${Number(item.estimated_cost).toFixed(2)} · muestra: ${item.sample_size} registro${item.sample_size === 1 ? "" : "s"}`} />
            ))}
            <Text style={detail.plain}>Costo estimado de materiales: Q {totalCost.toFixed(2)}</Text>
            <Button title={accepted ? "Estimación aceptada" : "Aceptar estimación para planificación"} busy={busy && Boolean(estimates)} disabled={accepted} onPress={accept} />
          </>
        ) : <Text style={detail.plain}>No se encontraron consumos históricos aplicables a esta orden.</Text>
      ) : null}
    </Card>
  );
}

function Step({ number, title, caption, done, children }: { number: string; title: string; caption: string; done?: boolean; children: React.ReactNode }) {
  return (
    <View style={detail.step}>
      <View style={detail.stepHead}>
        <View style={[detail.stepNo, done && { backgroundColor: C.ok }]}>
          <Text style={detail.stepNoText}>{number}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={detail.stepTitle}>{title}</Text>
          <Text style={detail.stepCaption}>{caption}</Text>
        </View>
      </View>
      <View style={{ gap: 10, marginTop: 12 }}>{children}</View>
    </View>
  );
}

type RequirementState = { inicio: boolean; cierre: boolean; materiales: boolean; evidencias: boolean; firma: boolean };

/** Resume el bloqueo real sin obligar a leer los cinco controles del expediente. */
function describeNextAction(status: Status, manager: boolean, requirements: RequirementState) {
  if (status === "cerrada") return { title: "Orden cerrada formalmente", description: "El expediente fue validado y ya no requiere acciones.", color: C.ok, background: C.okSoft, border: "#bfe4d2" };
  if (status === "borrador") return manager
    ? { title: "Asigna un técnico", description: "La orden necesita una persona responsable y una fecha para iniciar su ejecución.", color: C.action, background: C.actionSoft, border: "#c8daf0" }
    : { title: "Esperando asignación", description: "Coordinación debe asignar esta orden antes de que pueda ejecutarse.", color: C.action, background: C.actionSoft, border: "#c8daf0" };
  if (status === "asignada") return manager
    ? { title: "Esperar llegada al sitio", description: "El técnico asignado debe registrar su llegada con GPS para comenzar.", color: C.action, background: C.actionSoft, border: "#c8daf0" }
    : { title: "Registrar llegada", description: "Al llegar al sitio, registra tu ubicación GPS para iniciar la orden.", color: C.orange, background: C.orangeSoft, border: "#f0c49f" };
  if (status === "en_proceso") {
    if (!requirements.materiales) return { title: "Registrar materiales utilizados", description: "Documenta al menos un material consumido durante la visita.", color: C.orange, background: C.orangeSoft, border: "#f0c49f" };
    if (!requirements.evidencias) return { title: "Tomar evidencia fotográfica", description: "Agrega una fotografía que respalde el trabajo realizado.", color: C.orange, background: C.orangeSoft, border: "#f0c49f" };
    return { title: "Registrar salida del sitio", description: "Finaliza la visita registrando tu ubicación GPS de salida.", color: C.orange, background: C.orangeSoft, border: "#f0c49f" };
  }
  if (!requirements.firma) return manager
    ? { title: "Pendiente de firma del cliente", description: "El técnico debe capturar la conformidad del cliente en el sitio.", color: C.brown, background: C.brownSoft, border: "#ecd9c3" }
    : { title: "Capturar firma de conformidad", description: "Pide al cliente que firme para completar el expediente.", color: C.brown, background: C.brownSoft, border: "#ecd9c3" };
  return manager
    ? { title: "Validar y cerrar la orden", description: "El expediente está completo y puede recibir el cierre formal.", color: C.brown, background: C.brownSoft, border: "#ecd9c3" }
    : { title: "Esperar validación administrativa", description: "El expediente está completo; coordinación realizará el cierre formal.", color: C.brown, background: C.brownSoft, border: "#ecd9c3" };
}

function Record({ title, sub }: { title: string; sub?: string }) {
  return (
    <View style={detail.record}>
      <Text style={detail.recordTitle}>{title}</Text>
      {sub ? <Text style={detail.recordSub}>{sub}</Text> : null}
    </View>
  );
}

/** Explica por qué una acción está bloqueada, en lugar de solo deshabilitarla. */
function Note({ text }: { text: string }) {
  return <Text style={detail.note}>{text}</Text>;
}

const signatureStyle = ".m-signature-pad{box-shadow:none;border:0}.m-signature-pad--body{border:1px dashed #c8d3dd;border-radius:10px}.m-signature-pad--footer{display:none}.description{color:#5e7084}";

const detail = StyleSheet.create({
  top: { minHeight: 56, backgroundColor: C.graphite, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14 },
  back: { flexDirection: "row", alignItems: "center", paddingVertical: 8, paddingRight: 12 },
  backArrow: { color: "#fff", fontSize: 30, lineHeight: 28, marginRight: 4 },
  backText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  editLink: { color: "#fdd9ba", fontSize: 13.5, fontWeight: "800" },
  body: { paddingBottom: 36 },
  hero: { backgroundColor: C.graphite, padding: 20, paddingTop: 16 },
  eyebrow: { color: "#c7d8ee", fontSize: 11, letterSpacing: 1.1, fontWeight: "900" },
  code: { color: "#fff", fontSize: 28, fontWeight: "900", marginTop: 4, letterSpacing: -0.7 },
  client: { color: C.onDark, fontSize: 16, fontWeight: "700", marginTop: 2 },
  heroMeta: { marginTop: 13, borderTopWidth: 1, borderTopColor: C.graphite3, paddingTop: 12, gap: 5 },
  address: { color: "#c2d1e2", fontSize: 13.5, lineHeight: 19 },
  navigationButton: { alignSelf: "flex-start", borderWidth: 1, borderColor: "#4d6985", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, marginTop: 3 },
  navigationButtonText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  schedule: { color: "#c2d1e2", fontSize: 13 },
  priorityRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  assigned: { color: C.muted, fontSize: 12.5 },
  description: { color: C.inkSoft, fontSize: 14, lineHeight: 21, backgroundColor: C.surface2, borderRadius: 10, padding: 13 },
  nextAction: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 3 },
  nextActionLabel: { fontSize: 10.5, letterSpacing: 0.9, fontWeight: "900" },
  nextActionTitle: { color: C.ink, fontSize: 15, fontWeight: "900" },
  nextActionText: { color: C.inkSoft, fontSize: 13, lineHeight: 18 },
  plain: { color: C.muted, fontSize: 14, lineHeight: 20 },
  step: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 14, padding: 15 },
  stepHead: { flexDirection: "row", gap: 11, alignItems: "flex-start" },
  stepNo: { width: 27, height: 27, borderRadius: 14, backgroundColor: C.graphite, alignItems: "center", justifyContent: "center", marginTop: 1 },
  stepNoText: { color: "#fff", fontSize: 12, fontWeight: "900" },
  stepTitle: { color: C.ink, fontSize: 16, fontWeight: "800" },
  stepCaption: { color: C.muted, fontSize: 13, lineHeight: 18, marginTop: 2 },
  note: { color: C.muted, fontSize: 12.5, lineHeight: 17 },
  record: { backgroundColor: C.surface2, borderWidth: 1, borderColor: C.lineSoft, borderRadius: 9, padding: 11, gap: 2 },
  recordTitle: { color: C.ink, fontSize: 13.5, fontWeight: "700" },
  recordSub: { color: C.muted, fontSize: 12.5 },
  signature: { height: 250, overflow: "hidden", borderRadius: 10, backgroundColor: "#fff" },
  signatureActions: { flexDirection: "row", gap: 10, marginTop: 10 },
  notice: { backgroundColor: C.brownSoft, borderWidth: 1, borderColor: "#ecd9c3", borderRadius: 11, padding: 14 },
  noticeTitle: { color: "#6d4520", fontSize: 14, fontWeight: "800" },
  noticeText: { color: "#6d4520", fontSize: 13, lineHeight: 19, marginTop: 2 },
  successTitle: { color: "#0a5c38", fontSize: 16, fontWeight: "800" },
  successText: { color: "#0a5c38", fontSize: 13.5, lineHeight: 19, marginTop: 3 },
  historyRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderTopWidth: 1, borderTopColor: C.lineSoft, paddingTop: 10, marginTop: 10 },
  historyChange: { color: C.ink, fontSize: 13.5, fontWeight: "700" },
  historyNote: { color: C.muted, fontSize: 12.5, marginTop: 2 },
  historyDate: { color: C.muted, fontSize: 11.5 },
});

const gallery = StyleSheet.create({
  folder: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.orangeSoft, borderWidth: 1, borderColor: "#f0c49f", borderRadius: 10, padding: 12 },
  folderPreview: { width: 64, height: 44 },
  folderThumb: { position: "absolute", width: 34, height: 34, borderRadius: 6, borderWidth: 2, borderColor: "#fff", top: 5 },
  folderTitle: { color: C.orange, fontSize: 13.5, fontWeight: "800" },
  folderMeta: { color: "#8a4b16", fontSize: 12, marginTop: 2 },
  folderOpen: { color: C.orange, fontSize: 22, fontWeight: "700" },
  backdrop: { flex: 1, backgroundColor: C.graphite },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 54, paddingBottom: 10 },
  headTitle: { color: "#fff", fontSize: 14, fontWeight: "800" },
  close: { color: "#c2d1e2", fontSize: 14, fontWeight: "800" },
  preview: { flex: 1, marginHorizontal: 12, marginBottom: 8, borderRadius: 10, overflow: "hidden", backgroundColor: "#0b131b" },
  previewLoading: { color: "#c2d1e2", textAlign: "center", marginTop: 40 },
  meta: { color: "#c2d1e2", fontSize: 12.5, textAlign: "center", marginBottom: 10 },
  reviewBox: { maxHeight: 210, backgroundColor: C.surface, borderRadius: 12, marginHorizontal: 12, padding: 12, marginBottom: 10 },
  reviewLabel: { color: C.inkSoft, fontSize: 12, fontWeight: "800" },
  reviewError: { color: "#f4b8ae", fontSize: 12, marginTop: 6, lineHeight: 17 },
  strip: { marginBottom: 20 },
  stripThumb: { width: 60, height: 60, borderRadius: 8, overflow: "hidden", backgroundColor: "#0b131b", borderWidth: 2, borderColor: "transparent" },
  stripThumbActive: { borderColor: C.orange },
});
