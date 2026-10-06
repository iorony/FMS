import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from "react-native";
import { C, PRIORITY_COLOR, PRIORITY_LABEL, STATUS_ICON, STATUS_LABEL, STATUS_TONE, Status } from "../theme";
import { sentenceCase } from "../lib/format";

/* ------------------------------------------------------------------ Iconos */
/** Iconos dibujados con vistas: evita glifos que no existen en todas las fuentes. */
export function Icon({ name, color, size = 20 }: { name: "home" | "list" | "plus" | "chart" | "users" | "building" | "box"; color: string; size?: number }) {
  const bar = (height: number, width: number) => ({ width, height, backgroundColor: color, borderRadius: 1.5 });
  if (name === "home") {
    return (
      <View style={{ width: size, height: size, flexDirection: "row", flexWrap: "wrap", gap: 2.5 }}>
        {[0, 1, 2, 3].map((index) => (
          <View key={index} style={{ width: (size - 2.5) / 2, height: (size - 2.5) / 2, borderRadius: 2, backgroundColor: color, opacity: index === 1 ? 0.55 : 1 }} />
        ))}
      </View>
    );
  }
  if (name === "list") {
    return (
      <View style={{ width: size, height: size, justifyContent: "space-between", paddingVertical: 2 }}>
        {[0, 1, 2].map((index) => <View key={index} style={bar(2.5, size)} />)}
      </View>
    );
  }
  if (name === "plus") {
    return (
      <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
        <View style={[bar(2.5, size), { position: "absolute" }]} />
        <View style={[bar(size, 2.5), { position: "absolute" }]} />
      </View>
    );
  }
  if (name === "chart") {
    return (
      <View style={{ width: size, height: size, flexDirection: "row", alignItems: "flex-end", gap: 3 }}>
        <View style={bar(size * 0.5, 3.5)} />
        <View style={bar(size, 3.5)} />
        <View style={bar(size * 0.72, 3.5)} />
      </View>
    );
  }
  if (name === "users") {
    return (
      <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
        <View style={{ width: size * 0.42, height: size * 0.42, borderRadius: size, backgroundColor: color, marginBottom: 1 }} />
        <View style={{ width: size * 0.82, height: size * 0.34, borderTopLeftRadius: size, borderTopRightRadius: size, backgroundColor: color }} />
      </View>
    );
  }
  if (name === "building") {
    return (
      <View style={{ width: size * 0.72, height: size, borderWidth: 2, borderColor: color, borderRadius: 2, flexDirection: "row", flexWrap: "wrap", padding: 2, gap: 2 }}>
        {[0, 1, 2, 3].map((index) => <View key={index} style={{ width: "38%", height: "38%", backgroundColor: color }} />)}
      </View>
    );
  }
  return (
    <View style={{ width: size, height: size * 0.78, borderWidth: 2, borderColor: color, borderRadius: 2, justifyContent: "flex-start" }}>
      <View style={{ height: 2, backgroundColor: color, marginTop: size * 0.22 }} />
    </View>
  );
}

/* ------------------------------------------------------------------ Avisos */

export type Toast = { tone: "success" | "error" | "info"; text: string } | null;

/** Aviso en línea. Sustituye a Alert.alert para confirmaciones de guardado. */
export function useToast() {
  const [toast, setToast] = useState<Toast>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((tone: "success" | "error" | "info", text: string, options?: { persist?: boolean }) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ tone, text });
    timer.current = options?.persist ? null : setTimeout(() => setToast(null), tone === "error" ? 7000 : 4000);
  }, []);
  return { toast, show, hide: () => setToast(null) };
}

export function ToastBar({ toast, onHide }: { toast: Toast; onHide: () => void }) {
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fade.setValue(0);
    if (toast) Animated.timing(fade, { toValue: 1, duration: 160, useNativeDriver: true }).start();
  }, [toast, fade]);

  if (!toast) return null;
  const tone = toast.tone === "error"
    ? { bg: C.dangerSoft, border: "#f4cfcd", color: "#8e1b18" }
    : toast.tone === "success"
      ? { bg: C.okSoft, border: "#c7e8d7", color: "#0a5c38" }
      : { bg: C.actionSoft, border: "#c8daf0", color: "#174f8d" };
  return (
    <Animated.View style={{ opacity: fade }}>
      <Pressable
        onPress={onHide}
        accessibilityRole="alert"
        style={[u.toast, { backgroundColor: tone.bg, borderColor: tone.border }]}
      >
        <View style={[u.toastDot, { backgroundColor: tone.color }]} />
        <Text style={[u.toastText, { color: tone.color }]}>{toast.text}</Text>
      </Pressable>
    </Animated.View>
  );
}

/* --------------------------------------------------------------- Elementos */

export function Button({ title, onPress, busy, disabled, variant = "primary" }: {
  title: string; onPress: () => void; busy?: boolean; disabled?: boolean; variant?: "primary" | "secondary" | "field";
}) {
  const inactive = busy || disabled;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!busy }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        u.button,
        variant === "secondary" && u.buttonSecondary,
        variant === "field" && u.buttonField,
        inactive && u.buttonInactive,
        pressed && !inactive && u.pressed,
      ]}
    >
      {busy
        ? <ActivityIndicator color={variant === "secondary" ? C.action : "#fff"} />
        : <Text style={[u.buttonText, variant === "secondary" && u.buttonTextSecondary]}>{title}</Text>}
    </Pressable>
  );
}

export function Badge({ status }: { status: Status }) {
  const tone = STATUS_TONE[status];
  return (
      <View style={[u.badge, { backgroundColor: tone.bg }]}>
        <View style={[u.badgeDot, { backgroundColor: tone.color }]} />
        <Text accessibilityElementsHidden style={[u.badgeIcon, { color: tone.color }]}>{STATUS_ICON[status]}</Text>
        <Text style={[u.badgeText, { color: tone.color }]}>{STATUS_LABEL[status]}</Text>
    </View>
  );
}

export function PriorityTag({ priority }: { priority: string }) {
  const color = PRIORITY_COLOR[priority] ?? "#c9cdc3";
  const strong = priority === "alta" || priority === "critica";
  return (
    <View style={u.priority}>
      <View style={{ width: 3.5, height: 13, borderRadius: 2, backgroundColor: color }} />
      <Text style={[u.priorityText, strong && { color, fontWeight: "800" }]}>{PRIORITY_LABEL[priority] ?? priority}</Text>
    </View>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <View style={u.field}>
      <Text style={u.fieldLabel}>{label}</Text>
      {children}
      {hint ? <Text style={u.hint}>{hint}</Text> : null}
    </View>
  );
}

export function Input(props: TextInputProps & { invalid?: boolean; preserveCase?: boolean }) {
  const { invalid, preserveCase, style, onEndEditing, onChangeText, ...rest } = props;
  return (
    <TextInput
      placeholderTextColor={C.muted}
      {...rest}
      autoCapitalize={preserveCase || rest.keyboardType === "email-address" ? "none" : rest.autoCapitalize ?? "sentences"}
      onEndEditing={(event) => {
        if (!preserveCase && rest.keyboardType !== "email-address" && !rest.secureTextEntry) {
          const normalized = sentenceCase(event.nativeEvent.text);
          if (normalized !== event.nativeEvent.text) onChangeText?.(normalized);
        }
        onEndEditing?.(event);
      }}
      onChangeText={onChangeText}
      style={[u.input, invalid && { borderColor: C.danger }, !rest.editable && rest.editable !== undefined && u.inputDisabled, style]}
    />
  );
}

export function Card({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[u.card, style]}>{children}</View>;
}

export function Metric({ label, value, note, tone }: { label: string; value: number | string; note: string; tone?: "work" | "due" | "done" }) {
  const accent = tone === "work" ? C.orange : tone === "due" ? C.brown : tone === "done" ? C.ok : null;
  return (
    <View style={[u.metric, accent ? { borderLeftWidth: 3, borderLeftColor: accent } : null]}>
      <Text style={u.metricLabel}>{label}</Text>
      <Text style={u.metricValue}>{value}</Text>
      <Text style={u.metricNote}>{note}</Text>
    </View>
  );
}

export function Check({ done, label }: { done: boolean; label: string }) {
  return (
    <View style={u.check} accessibilityRole="text" accessibilityLabel={`${label}: ${done ? "completo" : "pendiente"}`}>
      <View style={[u.checkIcon, done && u.checkIconDone]}>
        <Text style={u.checkMark}>{done ? "✓" : ""}</Text>
      </View>
      <Text style={[u.checkText, done && u.checkTextDone]}>{label}</Text>
    </View>
  );
}

export function SectionTitle({ title, lead }: { title: string; lead?: string }) {
  return (
    <View style={{ gap: 3 }}>
      <Text style={u.sectionTitle}>{title}</Text>
      {lead ? <Text style={u.sectionLead}>{lead}</Text> : null}
    </View>
  );
}

export function EmptyState({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <View style={u.empty}>
      <View style={u.emptyIcon}><Text style={u.emptyMark}>✓</Text></View>
      <Text style={u.emptyTitle}>{title}</Text>
      <Text style={u.emptyText}>{text}</Text>
      {action ? <View style={{ alignSelf: "stretch", marginTop: 6 }}>{action}</View> : null}
    </View>
  );
}

/** Estado de error con reintento: antes un Alert dejaba la pantalla vacía sin salida. */
export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={u.empty}>
      <Text style={u.emptyTitle}>No se pudo cargar la información</Text>
      <Text style={u.emptyText}>{message}</Text>
      <View style={{ alignSelf: "stretch", marginTop: 6 }}>
        <Button title="Reintentar" variant="secondary" onPress={onRetry} />
      </View>
    </View>
  );
}

export function Loading({ label = "Cargando…", dark = false }: { label?: string; dark?: boolean }) {
  return (
    <View style={[u.loading, dark && { backgroundColor: C.graphite }]}>
      <ActivityIndicator size="large" color={dark ? C.orange : C.action} />
      <Text style={[u.loadingText, dark && { color: C.onDark2 }]}>{label}</Text>
    </View>
  );
}

export const u = StyleSheet.create({
  toast: { flexDirection: "row", gap: 9, alignItems: "flex-start", borderWidth: 1, borderRadius: 10, padding: 12 },
  toastDot: { width: 8, height: 8, borderRadius: 8, marginTop: 5 },
  toastText: { flex: 1, fontSize: 13.5, lineHeight: 19, fontWeight: "600" },

  button: { minHeight: 50, borderRadius: 9, backgroundColor: C.action, justifyContent: "center", alignItems: "center", paddingHorizontal: 16 },
  buttonSecondary: { backgroundColor: C.actionSoft, borderWidth: 1, borderColor: "#c8daf0" },
  buttonField: { backgroundColor: C.orange, minHeight: 54 },
  buttonInactive: { opacity: 0.45 },
  pressed: { opacity: 0.85 },
  buttonText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  buttonTextSecondary: { color: C.action },

  badge: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 99, paddingHorizontal: 9, paddingVertical: 5, alignSelf: "flex-start" },
  badgeDot: { width: 6, height: 6, borderRadius: 99 },
  badgeIcon: { fontSize: 14, fontWeight: "900", lineHeight: 16 },
  badgeText: { fontSize: 11.5, fontWeight: "800" },

  priority: { flexDirection: "row", alignItems: "center", gap: 6 },
  priorityText: { color: C.inkSoft, fontSize: 12.5, fontWeight: "600" },

  field: { gap: 7 },
  fieldLabel: { color: C.inkSoft, fontSize: 12.5, fontWeight: "800" },
  hint: { color: C.muted, fontSize: 12, lineHeight: 17 },
  input: { backgroundColor: C.surface, borderColor: "#c8d3dd", borderWidth: 1, borderRadius: 9, paddingHorizontal: 13, minHeight: 48, fontSize: 15, color: C.ink },
  inputDisabled: { opacity: 0.55, backgroundColor: C.surface2 },

  card: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 14, padding: 15, gap: 12 },

  metric: { width: "48.4%", minHeight: 112, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 13 },
  metricLabel: { color: C.muted, fontSize: 11.5, lineHeight: 15 },
  metricValue: { color: C.ink, fontSize: 28, fontWeight: "800", marginTop: 4 },
  metricNote: { color: C.muted, fontSize: 11.5, lineHeight: 15, marginTop: 2 },

  check: { flexDirection: "row", alignItems: "center", gap: 10 },
  checkIcon: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderColor: "#b6c2cf", alignItems: "center", justifyContent: "center" },
  checkIconDone: { backgroundColor: C.ok, borderColor: C.ok },
  checkMark: { color: "#fff", fontSize: 12, fontWeight: "900" },
  checkText: { flex: 1, color: C.muted, fontSize: 14 },
  checkTextDone: { color: C.ink, fontWeight: "600" },

  sectionTitle: { color: C.ink, fontSize: 17, fontWeight: "800" },
  sectionLead: { color: C.muted, fontSize: 12.5, lineHeight: 18 },

  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 42, paddingHorizontal: 28, gap: 5 },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: C.okSoft, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  emptyMark: { color: C.ok, fontSize: 26, fontWeight: "900" },
  emptyTitle: { color: C.ink, fontSize: 17, fontWeight: "800", textAlign: "center" },
  emptyText: { color: C.muted, fontSize: 14, lineHeight: 20, textAlign: "center" },

  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14 },
  loadingText: { color: C.muted, fontSize: 14, fontWeight: "600" },
});
