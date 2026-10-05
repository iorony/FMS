import { useMemo, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { C } from "../theme";
import { Input } from "./ui";

export type Option = { id: string; label: string; sub?: string };

/**
 * Selector en hoja inferior con búsqueda.
 * Reemplaza el uso de Alert.alert como lista: en Android un Alert solo
 * muestra tres botones, así que los catálogos largos quedaban inaccesibles.
 */
export function SelectSheet({ visible, title, options, selectedId, onSelect, onClose, emptyText = "No hay opciones disponibles." }: {
  visible: boolean;
  title: string;
  options: Option[];
  selectedId?: string | null;
  onSelect: (option: Option) => void;
  onClose: () => void;
  emptyText?: string;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return options;
    return options.filter((option) => `${option.label} ${option.sub ?? ""}`.toLowerCase().includes(term));
  }, [options, query]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={sheet.backdrop} onPress={onClose} accessibilityLabel="Cerrar selector" />
      <SafeAreaView style={sheet.container} edges={["bottom"]}>
        <View style={sheet.grip} />
        <View style={sheet.head}>
          <Text style={sheet.title}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
            <Text style={sheet.close}>Cerrar</Text>
          </Pressable>
        </View>

        {options.length > 6 && (
          <View style={sheet.search}>
            <Input placeholder="Buscar…" value={query} onChangeText={setQuery} autoCorrect={false} />
          </View>
        )}

        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          style={{ maxHeight: 420 }}
          ListEmptyComponent={<Text style={sheet.empty}>{query ? "Ningún resultado coincide con la búsqueda." : emptyText}</Text>}
          renderItem={({ item }) => {
            const active = item.id === selectedId;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => { setQuery(""); onSelect(item); }}
                style={({ pressed }) => [sheet.option, pressed && { backgroundColor: C.surface2 }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[sheet.optionText, active && { color: C.action, fontWeight: "800" }]}>{item.label}</Text>
                  {item.sub ? <Text style={sheet.optionSub}>{item.sub}</Text> : null}
                </View>
                {active ? <Text style={sheet.tick}>✓</Text> : null}
              </Pressable>
            );
          }}
        />
      </SafeAreaView>
    </Modal>
  );
}

/** Campo que abre el selector; se ve y se toca como un input. */
export function SelectField({ value, placeholder, onPress, disabled, invalid }: {
  value?: string | null; placeholder: string; onPress: () => void; disabled?: boolean; invalid?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      accessibilityHint={invalid ? "Campo obligatorio pendiente." : undefined}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [sheet.selector, invalid && sheet.selectorInvalid, disabled && { opacity: 0.5, backgroundColor: C.surface2 }, pressed && !disabled && { borderColor: C.action }]}
    >
      <Text style={[sheet.selectorText, !value && { color: C.muted }]} numberOfLines={1}>{value || placeholder}</Text>
      <Text style={sheet.chevron}>⌄</Text>
    </Pressable>
  );
}

const sheet = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(16,26,36,0.45)" },
  container: { backgroundColor: C.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingTop: 8 },
  grip: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: C.line, marginBottom: 8 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingBottom: 10 },
  title: { color: C.ink, fontSize: 17, fontWeight: "800" },
  close: { color: C.action, fontSize: 14, fontWeight: "800", padding: 6 },
  search: { paddingHorizontal: 18, paddingBottom: 10 },
  option: { minHeight: 54, paddingHorizontal: 18, paddingVertical: 12, borderTopWidth: 1, borderTopColor: C.lineSoft, flexDirection: "row", alignItems: "center", gap: 10 },
  optionText: { color: C.ink, fontSize: 15, fontWeight: "600" },
  optionSub: { color: C.muted, fontSize: 12.5, marginTop: 2 },
  tick: { color: C.action, fontSize: 16, fontWeight: "900" },
  empty: { color: C.muted, fontSize: 14, padding: 22, textAlign: "center" },
  selector: { minHeight: 48, borderWidth: 1, borderColor: "#c8d3dd", borderRadius: 9, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, backgroundColor: C.surface },
  selectorInvalid: { borderColor: C.danger, borderWidth: 1.5 },
  selectorText: { flex: 1, color: C.ink, fontSize: 15 },
  chevron: { color: C.action, fontSize: 18 },
});
