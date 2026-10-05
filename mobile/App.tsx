import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, RefreshControl, StatusBar, StyleSheet, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import { C, ROLE_LABEL } from "./theme";
import { ORDER_SELECT, type Order, type Profile } from "./types";
import { PageHead, TabBar, TopBar, type TabKey } from "./components/chrome";
import { OrderCard } from "./components/order-card";
import { OrderFilters, type OrderFilter } from "./components/order-filters";
import { errorMessage, isOverdue, isToday } from "./lib/format";
import { EmptyState, ErrorState, Loading, ToastBar, useToast } from "./components/ui";
import { LoginScreen } from "./screens/login";
import { HomeSummary } from "./screens/home";
import { OrderDetail } from "./screens/order-detail";
import { EditOrderScreen } from "./screens/edit-order";
import { CreateOrderScreen } from "./screens/create-order";
import { CatalogScreen } from "./screens/catalog";
import { OrderReportsScreen, ReportsScreen } from "./screens/reports";
import { UsersScreen } from "./screens/users";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setChecking(false); });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={C.graphite} />
      {checking
        ? <View style={{ flex: 1, backgroundColor: C.graphite }}><Loading label="Abriendo sesión…" dark /></View>
        : session ? <Workspace session={session} /> : <LoginScreen />}
    </SafeAreaProvider>
  );
}

function Workspace({ session }: { session: Session }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [selected, setSelected] = useState<Order | null>(null);
  const [editing, setEditing] = useState<Order | null>(null);
  const [tab, setTab] = useState<TabKey>("home");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<OrderFilter>("todas");
  const { toast, show, hide } = useToast();

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setLoadError(null);

    const { data: profileData, error: profileError } = await supabase
      .from("profiles").select("full_name,role,is_active").eq("id", session.user.id).single();

    if (profileError || !profileData) {
      setLoadError(errorMessage(profileError, "No se pudo leer tu perfil."));
      setLoading(false); setRefreshing(false);
      return;
    }
    if (!profileData.is_active) {
      show("error", "Tu cuenta está inactiva. Contacta a administración.");
      await supabase.auth.signOut();
      return;
    }

    const current = profileData as Profile;
    setProfile(current);

    // Sin filtro adicional por estado: igual que en la web, la política de
    // seguridad (RLS) ya limita al técnico a sus propias órdenes asignadas,
    // en cualquier estado — incluidas cerradas o canceladas.
    // RLS ya limita a técnicos y ayudantes a sus órdenes activas asignadas.
    // No se filtra por responsable para que los ayudantes también las reciban.
    const request = supabase.from("work_orders").select(ORDER_SELECT).order("scheduled_at", { ascending: true });
    const { data, error } = await request;
    if (error) setLoadError(errorMessage(error, "No fue posible cargar las órdenes. Inténtalo nuevamente."));
    else setOrders((data ?? []) as unknown as Order[]);

    setLoading(false);
    setRefreshing(false);
  }, [session.user.id, show]);

  useEffect(() => { load(); }, [load]);

  const manager = profile?.role === "admin" || profile?.role === "coordinator";
  const counts = useMemo(() => {
    const result: Record<string, number> = {};
    for (const order of orders) result[order.status] = (result[order.status] ?? 0) + 1;
    result.hoy = orders.filter((order) => isToday(order.scheduled_at)).length;
    result.atrasadas = orders.filter((order) => isOverdue(order.scheduled_at) && ["borrador", "asignada"].includes(order.status)).length;
    result.sin_asignar = orders.filter((order) => !order.assigned_technician_id && order.status === "borrador").length;
    return result;
  }, [orders]);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return orders.filter((order) => {
      if (filter === "hoy" && !isToday(order.scheduled_at)) return false;
      if (filter === "atrasadas" && !(isOverdue(order.scheduled_at) && ["borrador", "asignada"].includes(order.status))) return false;
      if (filter === "sin_asignar" && (order.assigned_technician_id || order.status !== "borrador")) return false;
      if (!["todas", "hoy", "atrasadas", "sin_asignar"].includes(filter) && order.status !== filter) return false;
      if (!term) return true;
      return `${order.code} ${order.clients?.name ?? ""} ${order.address}`.toLowerCase().includes(term);
    });
  }, [orders, query, filter]);

  const isAdmin = profile?.role === "admin";
  const tabs = manager
    ? ([
        { key: "home", label: "Inicio", icon: "home" },
        { key: "orders", label: "Órdenes", icon: "list" },
        { key: "create", label: "Crear", icon: "plus" },
        { key: "reports", label: "Asistencia", icon: "chart" },
        { key: "orderReports", label: "Rep. órdenes", icon: "list" },
        ...(isAdmin ? ([
          { key: "clients", label: "Clientes", icon: "building" },
          { key: "materials", label: "Materiales", icon: "box" },
        ] as const) : []),
        { key: "users", label: "Acceso", icon: "users" },
      ] as const)
    : ([
        { key: "home", label: "Inicio", icon: "home" },
        { key: "orders", label: "Órdenes", icon: "list" },
        { key: "reports", label: "Mis horas", icon: "chart" },
      ] as const);

  const heads: Record<TabKey, { title: string; lead: string }> = {
    home: {
      title: manager ? "Inicio" : "Mis órdenes de hoy",
      lead: manager
        ? "Lo que necesita una decisión o un seguimiento hoy."
        : "Tus instalaciones y los pasos que faltan por completar.",
    },
    orders: {
      title: manager ? "Todas las órdenes" : "Mis órdenes",
      lead: `${visible.length} de ${orders.length} orden${orders.length === 1 ? "" : "es"} visible${visible.length === 1 ? "" : "s"} con los filtros actuales.`,
    },
    create: { title: "Crear orden", lead: "Registra y asigna una nueva orden de instalación." },
    reports: { title: manager ? "Asistencia y preliquidación" : "Mis horas y pago estimado", lead: manager ? "Horarios, GPS y cálculo estimado de pagos." : "Tus horas se validan con GPS de llegada y salida." },
    orderReports: { title: "Reporte de órdenes", lead: "Estados, seguimiento y cumplimiento documental por orden." },
    clients: { title: "Clientes", lead: "Empresas y personas para las que se ejecutan instalaciones." },
    materials: { title: "Materiales", lead: "Insumos, costos y mínimos de compra para consumos y estimaciones." },
    users: { title: isAdmin ? "Personas con acceso" : "Acceso de técnicos", lead: isAdmin ? "Invita, edita, elimina o restablece el acceso de cada cuenta." : "Restablece contraseñas cuando un técnico pierda el acceso." },
  };

  function body() {
    if (loading) return <Loading label="Cargando operación…" />;
    if (loadError) return <ErrorState message={loadError} onRetry={() => load()} />;
    if (tab === "create" && manager) return <CreateOrderScreen onCreated={() => { setTab("orders"); load(true); }} />;
    if (tab === "reports") return <ReportsScreen technician={!manager} />;
    if (tab === "orderReports" && manager) return <OrderReportsScreen onOpenOrder={(id) => { const order = orders.find((item) => item.id === id); if (order) setSelected(order); }} />;
    if (tab === "clients" && isAdmin) return <CatalogScreen type="clients" />;
    if (tab === "materials" && isAdmin) return <CatalogScreen type="materials" />;
    if (tab === "users" && manager) return <UsersScreen role={profile!.role} />;

    return (
      <FlatList
        data={tab === "home" ? [] : visible}
        keyExtractor={(item) => item.id}
        contentContainerStyle={shell.list}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[C.action]} tintColor={C.action} />}
        ListHeaderComponent={
          <View style={{ gap: 14 }}>
            <ToastBar toast={toast} onHide={hide} />
            {tab === "home"
              ? <HomeSummary orders={orders} role={profile?.role ?? "technician"} onOpen={setSelected} onCreate={() => setTab("create")} />
              : <OrderFilters query={query} setQuery={setQuery} filter={filter} setFilter={setFilter} counts={counts} />}
          </View>
        }
        ListEmptyComponent={
          tab !== "orders" ? null : query || filter !== "todas"
            ? <EmptyState title="Ninguna orden coincide" text="Prueba con otro código, cliente o dirección, o quita el filtro de estado." />
            : <EmptyState
                title={manager ? "No hay órdenes para mostrar" : "No tienes órdenes activas"}
                text={manager ? "Las órdenes registradas aparecerán aquí para su seguimiento." : "Cuando coordinación te asigne una orden, aparecerá aquí."} />
        }
        renderItem={({ item }) => <OrderCard order={item} onPress={() => setSelected(item)} />}
      />
    );
  }

  return (
    <SafeAreaView style={shell.safe} edges={["top"]}>
      <TopBar onSignOut={() => supabase.auth.signOut()} />
      <PageHead
        eyebrow={profile ? ROLE_LABEL[profile.role] : "CARGANDO"}
        title={heads[tab].title}
        lead={heads[tab].lead}
      />

      <View style={{ flex: 1 }}>{body()}</View>

      <TabBar tabs={[...tabs]} active={tab} onChange={setTab} />

      {selected && profile && (
        <OrderDetail
          order={selected}
          role={profile.role}
          onClose={() => setSelected(null)}
          onChanged={() => load(true)}
          onEdit={() => setEditing(selected)}
        />
      )}

      {editing && (
        <EditOrderScreen
          order={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); setSelected(null); load(true); }}
        />
      )}
    </SafeAreaView>
  );
}

const shell = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.paper },
  list: { padding: 16, paddingBottom: 28, gap: 12, flexGrow: 1 },
});
