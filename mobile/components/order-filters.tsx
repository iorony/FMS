import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { C, STATUS_LABEL, Status } from "../theme";
import { Input } from "./ui";

export type OrderFilter = Status | "todas" | "hoy" | "atrasadas" | "sin_asignar";

export const FILTERS: { key: OrderFilter; label: string }[] = [
  { key: "todas", label: "Todas" },
  { key: "hoy", label: "Hoy" },
  { key: "atrasadas", label: "Atrasadas" },
  { key: "sin_asignar", label: "Sin asignar" },
  { key: "asignada", label: STATUS_LABEL.asignada },
  { key: "en_proceso", label: STATUS_LABEL.en_proceso },
  { key: "pendiente_de_cierre", label: "Por cerrar" },
  { key: "borrador", label: STATUS_LABEL.borrador },
  { key: "cerrada", label: STATUS_LABEL.cerrada },
];

/** Búsqueda y filtro por estado: antes solo existía el listado completo. */
export function OrderFilters({ query, setQuery, filter, setFilter, counts }: {
  query: string;
  setQuery: (value: string) => void;
  filter: OrderFilter;
  setFilter: (value: OrderFilter) => void;
  counts: Record<string, number>;
}) {
  return (
    <View style={{ gap: 10 }}>
      <Input
        placeholder="Buscar por código, cliente o dirección"
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
        accessibilityLabel="Buscar órdenes"
        returnKeyType="search"
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
        {FILTERS.filter((item) => item.key === "todas" || (counts[item.key] ?? 0) > 0).map((item) => {
          const active = item.key === filter;
          return (
            <Pressable
              key={item.key}
              onPress={() => setFilter(item.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[filters.chip, active && filters.chipActive]}
            >
              <Text style={[filters.chipText, active && filters.chipTextActive]}>
                {item.label}
                {item.key !== "todas" ? ` ${counts[item.key] ?? 0}` : ""}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const filters = StyleSheet.create({
  chip: { minHeight: 36, paddingHorizontal: 13, justifyContent: "center", borderRadius: 99, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  chipActive: { backgroundColor: C.actionSoft, borderColor: "#c8daf0" },
  chipText: { color: C.muted, fontSize: 13, fontWeight: "700" },
  chipTextActive: { color: C.action, fontWeight: "800" },
});
