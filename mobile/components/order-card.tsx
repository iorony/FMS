import { Pressable, StyleSheet, Text, View } from "react-native";
import { C, STATUS_TONE } from "../theme";
import { formatDateTime, isOverdue, relativeDay } from "../lib/format";
import type { Order } from "../types";
import { Badge, PriorityTag } from "./ui";

export function OrderCard({ order, onPress }: { order: Order; onPress: () => void }) {
  const tone = STATUS_TONE[order.status];
  const late = isOverdue(order.scheduled_at) && ["borrador", "asignada"].includes(order.status);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Orden ${order.code}, ${order.clients?.name ?? "cliente"}, ${order.address}`}
      style={({ pressed }) => [card.wrap, pressed && { opacity: 0.85 }]}
    >
      <View style={[card.rail, { backgroundColor: tone.color }]} />
      <View style={card.body}>
        <View style={card.top}>
          <View style={{ flex: 1 }}>
            <Text style={card.code}>{order.code}</Text>
            <Text style={card.client} numberOfLines={1}>{order.clients?.name ?? "Cliente"}</Text>
          </View>
          <Badge status={order.status} />
        </View>

        <View style={card.addressRow}>
          <Text style={card.pin}>⌖</Text>
          <Text style={card.address} numberOfLines={2}>{order.address}</Text>
        </View>

        <View style={card.foot}>
          <PriorityTag priority={order.priority} />
          <View style={{ flex: 1 }}>
            <Text style={card.date} numberOfLines={1}>{formatDateTime(order.scheduled_at)}</Text>
            {order.scheduled_at ? (
              <Text style={[card.relative, late && { color: C.danger, fontWeight: "800" }]}>
                {late ? `Vencida ${relativeDay(order.scheduled_at)}` : relativeDay(order.scheduled_at)}
              </Text>
            ) : null}
          </View>
          <Text style={card.open}>Abrir ›</Text>
        </View>
      </View>
    </Pressable>
  );
}

const card = StyleSheet.create({
  wrap: { flexDirection: "row", backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 14, overflow: "hidden", shadowColor: C.ink, shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  rail: { width: 4 },
  body: { flex: 1, padding: 15, gap: 11 },
  top: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  code: { color: C.ink, fontSize: 17, fontWeight: "900", letterSpacing: -0.2 },
  client: { color: C.inkSoft, fontSize: 14, fontWeight: "700", marginTop: 2 },
  addressRow: { flexDirection: "row", gap: 7, alignItems: "flex-start" },
  pin: { color: C.orange, fontSize: 16, lineHeight: 19 },
  address: { flex: 1, color: C.muted, fontSize: 13.5, lineHeight: 19 },
  foot: { borderTopWidth: 1, borderTopColor: C.lineSoft, paddingTop: 10, flexDirection: "row", alignItems: "center", gap: 10 },
  date: { color: C.muted, fontSize: 12.5 },
  relative: { color: C.muted, fontSize: 11.5, marginTop: 1 },
  open: { color: C.action, fontSize: 12.5, fontWeight: "800" },
});
