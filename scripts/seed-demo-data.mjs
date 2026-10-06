/**
 * Carga una colección ficticia e idempotente para presentar Plus Service GT.
 *
 * No crea ni modifica cuentas de acceso. Conserva los perfiles existentes,
 * elimina todos los datos operativos y deja una colección ficticia completa.
 *
 * Uso habitual: ejecutar primero supabase/reset_demo.sql en el SQL Editor y
 * después `node scripts/seed-demo-data.mjs --seed-only`.
 * `--reset-with-service-role` se reserva para proyectos que hayan concedido
 * permisos de borrado al rol de servicio en todas las tablas operativas.
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

function environment() {
  const values = {};
  for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator > 0) values[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return values;
}

const env = environment();
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local.");
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAALUlEQVR42mNgGAXUB8QwQ4YGBkYGRjZqGCSYgYGB4T8YGRkZGBgYGP4DAJRQBB7FfxKAAAAAElFTkSuQmCC", "base64");

const ids = {
  clients: [
    "10100000-0000-4000-8000-000000000001", "10100000-0000-4000-8000-000000000002",
    "10100000-0000-4000-8000-000000000003", "10100000-0000-4000-8000-000000000004",
    "10100000-0000-4000-8000-000000000005", "10100000-0000-4000-8000-000000000006",
  ],
  materials: [
    "20100000-0000-4000-8000-000000000001", "20100000-0000-4000-8000-000000000002",
    "20100000-0000-4000-8000-000000000003", "20100000-0000-4000-8000-000000000004",
    "20100000-0000-4000-8000-000000000005", "20100000-0000-4000-8000-000000000006",
    "20100000-0000-4000-8000-000000000007", "20100000-0000-4000-8000-000000000008",
  ],
};

const clients = [
  ["Centro Médico Las Américas", "Ana Lucía Morales", "5551-2048", "ana.morales@demo.plusservice.test", "7a avenida 12-45, zona 9, Ciudad de Guatemala"],
  ["Grupo Educativo Horizonte", "Carlos Méndez", "5551-3092", "carlos.mendez@demo.plusservice.test", "Avenida Petapa 38-12, zona 12, Ciudad de Guatemala"],
  ["Comercial La Estación", "Sofía Ramírez", "5551-4176", "sofia.ramirez@demo.plusservice.test", "Calzada Roosevelt 24-60, zona 7, Ciudad de Guatemala"],
  ["Residenciales Los Pinos", "Jorge Castillo", "5551-5284", "jorge.castillo@demo.plusservice.test", "Boulevard Los Próceres 18-10, zona 10, Ciudad de Guatemala"],
  ["Bodegas del Pacífico", "María José Pérez", "5551-6350", "maria.perez@demo.plusservice.test", "Km 16.5 Carretera al Pacífico, Villa Nueva"],
  ["Oficinas Nova", "Diego Herrera", "5551-7463", "diego.herrera@demo.plusservice.test", "Diagonal 6 10-01, zona 10, Ciudad de Guatemala"],
].map(([name, contact_name, contact_phone, email, address], index) => ({ id: ids.clients[index], name, contact_name, contact_phone, email, address, is_active: true }));

const materials = [
  ["DEMO-CAT6-305", "Cable UTP CAT6", "metro", 4.25, 30],
  ["DEMO-RJ45", "Conector RJ45 CAT6", "unidad", 3.5, 20],
  ["DEMO-KEYSTONE", "Keystone Jack CAT6", "unidad", 18, 10],
  ["DEMO-FACEPLATE", "Placa de pared doble", "unidad", 14, 10],
  ["DEMO-CAN-20", "Canaleta PVC 20 x 12 mm", "metro", 8.75, 12],
  ["DEMO-TUBO-3-4", "Tubo PVC 3/4 pulgada", "metro", 11.5, 6],
  ["DEMO-SW8", "Switch Gigabit de 8 puertos", "unidad", 285, 1],
  ["DEMO-AP", "Punto de acceso Wi-Fi", "unidad", 640, 1],
].map(([sku, name, unit, unit_cost, minimum_quantity], index) => ({ id: ids.materials[index], sku, name, unit, unit_cost, minimum_quantity, is_active: true }));

function guatemalaDate(offsetDays = 0, hour = 9, minute = 0) {
  const local = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Guatemala" }));
  local.setDate(local.getDate() + offsetDays);
  local.setHours(hour, minute, 0, 0);
  const y = local.getFullYear();
  const m = String(local.getMonth() + 1).padStart(2, "0");
  const d = String(local.getDate()).padStart(2, "0");
  const h = String(hour).padStart(2, "0");
  const min = String(minute).padStart(2, "0");
  return `${y}-${m}-${d}T${h}:${min}:00-06:00`;
}

function localDay(offsetDays = 0) {
  return guatemalaDate(offsetDays).slice(0, 10);
}

function orderId(index) {
  return `30100000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

async function assertOk(request, action) {
  const { error } = await request;
  if (error) throw new Error(`${action}: ${error.message}`);
}

async function upload(bucket, path) {
  const { error } = await supabase.storage.from(bucket).upload(path, png, { contentType: "image/png", upsert: true });
  if (error) throw new Error(`No fue posible cargar ${path}: ${error.message}`);
}

async function removeBucketContents(bucket, prefix = "") {
  const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error) throw new Error(`No fue posible listar archivos de ${bucket}: ${error.message}`);

  const files = [];
  for (const entry of data ?? []) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.id) files.push(path);
    else await removeBucketContents(bucket, path);
  }
  if (files.length) await assertOk(supabase.storage.from(bucket).remove(files), `Vaciar archivos de ${bucket}`);
}

async function deleteAll(table, nonNullColumn = "id") {
  await assertOk(
    supabase.from(table).delete().not(nonNullColumn, "is", null),
    `Limpiar ${table}`,
  );
}

async function resetOperationalData() {
  // Primero se eliminan las dependencias para respetar todas las llaves foráneas.
  // La bitácora interna no forma parte de la interfaz y el rol de servicio no
  // dispone de privilegios para vaciarla en este proyecto.
  await deleteAll("material_predictions");
  await deleteAll("work_order_timeline_events");
  await deleteAll("work_order_materials");
  await deleteAll("customer_signatures");
  await deleteAll("evidences");
  await deleteAll("location_records");
  await deleteAll("work_order_status_history");
  await deleteAll("work_order_technicians", "work_order_id");
  await deleteAll("daily_attendance_records");
  await deleteAll("work_orders");
  await deleteAll("material_stock_movements");
  await deleteAll("client_material_assignments");
  await deleteAll("material_inventory", "material_id");
  await deleteAll("materials");
  await deleteAll("clients");

  await removeBucketContents("evidences");
  await removeBucketContents("signatures");
}

async function main() {
  if (process.argv.includes("--storage-only")) {
    await removeBucketContents("evidences");
    await removeBucketContents("signatures");
    console.log("Archivos de evidencias y firmas eliminados.");
    return;
  }

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id,full_name,role,is_active")
    .eq("is_active", true);
  if (profilesError) throw profilesError;

  const admin = profiles.find((profile) => profile.role === "admin");
  const coordinator = profiles.find((profile) => profile.role === "coordinator") ?? admin;
  const technicians = profiles.filter((profile) => profile.role === "technician");
  if (!admin || !coordinator || technicians.length < 2) {
    throw new Error("La demo requiere una cuenta administradora, una coordinadora y dos técnicas activas.");
  }
  const [techOne, techTwo] = technicians;

  if (process.argv.includes("--reset-with-service-role")) await resetOperationalData();
  if (!process.argv.includes("--seed-only") && !process.argv.includes("--reset-with-service-role")) {
    throw new Error("Ejecuta primero supabase/reset_demo.sql y vuelve a intentar con --seed-only.");
  }

  await assertOk(supabase.from("clients").upsert(clients, { onConflict: "id" }), "Cargar clientes demo");
  await assertOk(supabase.from("materials").upsert(materials, { onConflict: "id" }), "Cargar materiales demo");

  const specs = [
    { code: "DEMO-2026-001", client: 0, tech: techOne, status: "cerrada", priority: "alta", day: -21, duration: 180, description: "Instalación de tres puntos de red para consultorios y certificación de conectividad.", complete: true },
    { code: "DEMO-2026-002", client: 1, tech: techTwo, status: "cerrada", priority: "alta", day: -17, duration: 240, description: "Ampliación de cableado estructurado para laboratorio de informática.", complete: true },
    { code: "DEMO-2026-003", client: 2, tech: techOne, status: "cerrada", priority: "alta", day: -12, duration: 210, description: "Reubicación de punto de acceso y ordenamiento de cableado en área de cajas.", complete: true },
    { code: "DEMO-2026-004", client: 3, tech: techTwo, status: "cerrada", priority: "media", day: -9, duration: 150, description: "Instalación de punto de red y canaleta para oficina administrativa.", complete: true },
    { code: "DEMO-2026-005", client: 4, tech: techOne, status: "cerrada", priority: "media", day: -5, duration: 120, description: "Mantenimiento preventivo y cambio de conectores en área de despacho.", complete: true },
    { code: "DEMO-2026-006", client: 5, tech: techTwo, status: "pendiente_de_cierre", priority: "alta", day: -1, duration: 180, description: "Instalación de punto de acceso Wi-Fi para sala de reuniones. Expediente listo para validación.", complete: true },
    { code: "DEMO-2026-007", client: 0, tech: techOne, status: "en_proceso", priority: "critica", day: 0, duration: 180, description: "Atención de intermitencia de red en recepción; técnico actualmente en sitio.", complete: false, started: true },
    { code: "DEMO-2026-008", client: 1, tech: techTwo, status: "asignada", priority: "media", day: 0, hour: 14, duration: 150, description: "Instalación programada de dos salidas de red en aula de capacitación." },
    { code: "DEMO-2026-009", client: 2, tech: techOne, status: "asignada", priority: "alta", day: -2, duration: 120, description: "Revisión de caída de enlace pendiente de atención; sirve para mostrar seguimiento vencido." },
    { code: "DEMO-2026-010", client: 3, tech: null, status: "borrador", priority: "baja", day: 2, duration: 90, description: "Solicitud recibida para evaluar un nuevo punto de red; falta asignar técnico." },
    { code: "DEMO-2026-011", client: 4, tech: techTwo, status: "cancelada", priority: "media", day: -3, duration: 90, description: "Visita cancelada por el cliente debido a remodelación del área." },
  ];

  const inserted = [];
  for (const [index, spec] of specs.entries()) {
    const id = orderId(index + 1);
    const hour = spec.hour ?? 9;
    const scheduledAt = guatemalaDate(spec.day, hour);
    const createdAt = guatemalaDate(spec.day - 2, 10);
    const address = clients[spec.client].address;
    const latitude = 14.6 + index * 0.002;
    const longitude = -90.51 - index * 0.002;
    const row = {
      id,
      code: spec.code,
      client_id: clients[spec.client].id,
      assigned_technician_id: spec.tech?.id ?? null,
      created_by: coordinator.id,
      // El flujo de negocio exige que toda orden sea creada como borrador.
      // Al finalizar la carga se aplican los estados previstos para la demo.
      status: "borrador",
      priority: spec.priority,
      address,
      description: spec.description,
      scheduled_at: scheduledAt,
      started_at: spec.status === "en_proceso" || spec.status === "pendiente_de_cierre" || spec.status === "cerrada" ? guatemalaDate(spec.day, hour, 10) : null,
      closed_at: spec.status === "cerrada" ? guatemalaDate(spec.day, hour + 3, 15) : null,
      planned_duration_minutes: spec.duration,
      site_latitude: latitude,
      site_longitude: longitude,
      created_at: createdAt,
      updated_at: createdAt,
    };
    await assertOk(supabase.from("work_orders").insert(row), `Crear ${spec.code}`);
    // La inserción genera un evento inicial con el estado final; se sustituye
    // por una secuencia realista para que la bitácora sea útil durante la demo.
    await assertOk(supabase.from("work_order_timeline_events").delete().eq("work_order_id", id), `Limpiar bitácora inicial de ${spec.code}`);
    await assertOk(supabase.from("work_order_status_history").delete().eq("work_order_id", id), `Limpiar estado inicial de ${spec.code}`);

    const history = [{ from_status: null, to_status: "borrador", changed_by: coordinator.id, note: "Orden creada para demostración.", created_at: createdAt }];
    if (spec.status !== "borrador") history.push({ from_status: "borrador", to_status: "asignada", changed_by: coordinator.id, note: "Técnico asignado para la visita.", created_at: guatemalaDate(spec.day - 1, 16) });
    if (["en_proceso", "pendiente_de_cierre", "cerrada"].includes(spec.status)) history.push({ from_status: "asignada", to_status: "en_proceso", changed_by: spec.tech.id, note: "Llegada confirmada en sitio.", created_at: guatemalaDate(spec.day, hour, 10) });
    if (["pendiente_de_cierre", "cerrada"].includes(spec.status)) history.push({ from_status: "en_proceso", to_status: "pendiente_de_cierre", changed_by: spec.tech.id, note: "Trabajo de campo finalizado.", created_at: guatemalaDate(spec.day, hour + 2, 30) });
    if (spec.status === "cerrada") history.push({ from_status: "pendiente_de_cierre", to_status: "cerrada", changed_by: coordinator.id, note: "Cierre formal validado.", created_at: guatemalaDate(spec.day, hour + 3, 15) });
    if (spec.status === "cancelada") history.push({ from_status: "asignada", to_status: "cancelada", changed_by: coordinator.id, note: "Cancelada por solicitud del cliente.", created_at: guatemalaDate(spec.day - 1, 15) });
    await assertOk(supabase.from("work_order_status_history").insert(history.map((event) => ({ ...event, work_order_id: id }))), `Crear historial de ${spec.code}`);

    if (spec.tech && spec.status !== "borrador") {
      await assertOk(supabase.from("work_order_technicians").upsert({ work_order_id: id, technician_id: spec.tech.id, participation_role: "responsable" }), `Asignar responsable en ${spec.code}`);
      const helper = spec.tech.id === techOne.id ? techTwo : techOne;
      if (["cerrada", "pendiente_de_cierre", "en_proceso"].includes(spec.status)) {
        await assertOk(supabase.from("work_order_technicians").upsert({ work_order_id: id, technician_id: helper.id, participation_role: "ayudante" }), `Asignar ayudante en ${spec.code}`);
      }
    }

    if (spec.complete || spec.started) {
      const startAt = guatemalaDate(spec.day, hour, 10);
      await assertOk(supabase.from("location_records").insert({ work_order_id: id, record_type: "inicio", latitude, longitude, accuracy_meters: 7.5, captured_at: startAt, captured_by: spec.tech.id }), `Registrar GPS inicial en ${spec.code}`);
      const evidencePath = `demo/${id}/evidencia-instalacion.png`;
      await upload("evidences", evidencePath);
      await assertOk(supabase.from("evidences").insert({ work_order_id: id, storage_path: evidencePath, suggested_category: "instalacion_cableado", confidence: 0.94, final_category: "instalacion_cableado", review_status: "confirmed", reviewed_by: coordinator.id, reviewed_at: guatemalaDate(spec.day, hour + 1, 15), review_note: "Evidencia verificada para demostración.", model_version: "demo-vision-v1", created_by: spec.tech.id, created_at: guatemalaDate(spec.day, hour + 1) }), `Registrar evidencia en ${spec.code}`);
      await assertOk(supabase.from("work_order_materials").insert([
        { work_order_id: id, material_id: ids.materials[0], quantity: spec.priority === "alta" ? 45 : 25, unit: "metro", unit_cost: 4.25, note: "Tendido para instalación demo.", created_by: spec.tech.id, created_at: guatemalaDate(spec.day, hour + 1) },
        { work_order_id: id, material_id: ids.materials[1], quantity: spec.priority === "alta" ? 8 : 4, unit: "unidad", unit_cost: 3.5, note: "Terminación de puntos de red.", created_by: spec.tech.id, created_at: guatemalaDate(spec.day, hour + 1, 5) },
      ]), `Registrar materiales en ${spec.code}`);
    }
    if (spec.complete) {
      const endAt = guatemalaDate(spec.day, hour + 2, 30);
      await assertOk(supabase.from("location_records").insert({ work_order_id: id, record_type: "cierre", latitude: latitude + 0.0001, longitude: longitude + 0.0001, accuracy_meters: 6.2, captured_at: endAt, captured_by: spec.tech.id }), `Registrar GPS final en ${spec.code}`);
      const signaturePath = `demo/${id}/firma-conformidad.png`;
      await upload("signatures", signaturePath);
      await assertOk(supabase.from("customer_signatures").insert({ work_order_id: id, signer_name: clients[spec.client].contact_name, storage_path: signaturePath, signed_at: guatemalaDate(spec.day, hour + 2, 35), captured_by: spec.tech.id, consent_text: "Conforme con el servicio realizado." }), `Registrar firma en ${spec.code}`);
    }
    inserted.push(spec.code);
  }

  const attendance = [
    { technician_id: techOne.id, work_date: localDay(-1), clock_in_at: guatemalaDate(-1, 8), clock_out_at: guatemalaDate(-1, 17, 30), clock_in_latitude: 14.61, clock_in_longitude: -90.51, clock_in_accuracy_meters: 8, clock_out_latitude: 14.61, clock_out_longitude: -90.51, clock_out_accuracy_meters: 7 },
    { technician_id: techTwo.id, work_date: localDay(-2), clock_in_at: guatemalaDate(-2, 7, 45), clock_out_at: guatemalaDate(-2, 16, 45), clock_in_latitude: 14.62, clock_in_longitude: -90.52, clock_in_accuracy_meters: 8, clock_out_latitude: 14.62, clock_out_longitude: -90.52, clock_out_accuracy_meters: 7 },
    { technician_id: techOne.id, work_date: localDay(0), clock_in_at: guatemalaDate(0, 8), clock_out_at: null, clock_in_latitude: 14.63, clock_in_longitude: -90.53, clock_in_accuracy_meters: 6, clock_out_latitude: null, clock_out_longitude: null, clock_out_accuracy_meters: null },
  ];
  await assertOk(supabase.from("daily_attendance_records").upsert(attendance, { onConflict: "technician_id,work_date" }), "Cargar asistencia demo");

  console.log(`Demo cargada: ${clients.length} clientes, ${materials.length} materiales y ${inserted.length} órdenes (${inserted.join(", ")}).`);
}

main().catch((error) => {
  console.error(`No se cargó la demo: ${error.message}`);
  process.exit(1);
});
