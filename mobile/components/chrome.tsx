import { Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useState } from "react";
import { C } from "../theme";
import { Icon } from "./ui";

export function Brand({ light = false }: { light?: boolean }) {
  return (
    <View style={chrome.brand}>
      <View style={chrome.mark}>
        <Image source={require("../assets/plus-service-mark.png")} style={chrome.markImage} resizeMode="contain" />
      </View>
      <View>
        <Text style={[chrome.brandName, light && { color: "#fff" }]}>Plus Service</Text>
        <Text style={[chrome.brandSub, light && { color: C.onDark2 }]}>Gestión de campo</Text>
      </View>
    </View>
  );
}

export function TopBar({ onSignOut }: { onSignOut: () => void }) {
  return (
    <View style={chrome.topbar}>
      <Brand light />
      <Pressable onPress={onSignOut} hitSlop={12} accessibilityRole="button" accessibilityLabel="Cerrar sesión">
        <Text style={chrome.logout}>Salir</Text>
      </Pressable>
    </View>
  );
}

export function PageHead({ eyebrow, title, lead }: { eyebrow: string; title: string; lead: string }) {
  return (
    <View style={chrome.pageHead}>
      <Text style={chrome.eyebrow}>{eyebrow}</Text>
      <Text style={chrome.pageTitle} accessibilityRole="header">{title}</Text>
      <Text style={chrome.pageLead}>{lead}</Text>
    </View>
  );
}

export type TabKey = "home" | "orders" | "create" | "reports" | "orderReports" | "clients" | "materials" | "users";

export function TabBar({ tabs, active, onChange }: {
  tabs: { key: TabKey; label: string; icon: "home" | "list" | "plus" | "chart" | "users" | "building" | "box" }[];
  active: TabKey;
  onChange: (key: TabKey) => void;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  // Cuatro accesos más "Más" mantienen iconos y textos legibles, incluso en
  // teléfonos angostos. Las demás secciones siguen disponibles en el menú.
  const primaryTabs = tabs.slice(0, 4);
  const moreTabs = tabs.slice(4);
  const choose = (key: TabKey) => { setMoreOpen(false); onChange(key); };

  return (
    <>
      {moreTabs.length > 0 && <Modal visible={moreOpen} transparent animationType="fade" onRequestClose={() => setMoreOpen(false)}>
        <View style={chrome.moreOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setMoreOpen(false)} accessibilityLabel="Cerrar más secciones" />
          <View style={chrome.moreMenu} accessibilityRole="menu">
            <Text style={chrome.moreTitle}>Más secciones</Text>
            {moreTabs.map((tab) => {
              const selected = tab.key === active;
              return <Pressable key={tab.key} onPress={() => choose(tab.key)} accessibilityRole="menuitem" accessibilityState={{ selected }} style={({ pressed }) => [chrome.moreItem, selected && chrome.moreItemActive, pressed && { opacity: 0.7 }]}>
                <Icon name={tab.icon} size={20} color={selected ? C.action : C.muted} />
                <Text style={[chrome.moreItemText, selected && chrome.moreItemTextActive]}>{tab.label}</Text>
              </Pressable>;
            })}
          </View>
        </View>
      </Modal>}
      <View style={chrome.tabbar} accessibilityRole="tablist">
      {primaryTabs.map((tab) => {
        const selected = tab.key === active;
        return (
          <Pressable
            key={tab.key}
            onPress={() => onChange(tab.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={tab.label}
            style={({ pressed }) => [chrome.tab, selected && chrome.tabActive, pressed && { opacity: 0.7 }]}
          >
            <Icon name={tab.icon} size={19} color={selected ? C.action : C.muted} />
            <Text style={[chrome.tabText, selected && chrome.tabTextActive]} numberOfLines={1}>{tab.label}</Text>
          </Pressable>
        );
      })}
      {moreTabs.length > 0 && <Pressable onPress={() => setMoreOpen(true)} accessibilityRole="tab" accessibilityState={{ selected: moreTabs.some((tab) => tab.key === active) }} accessibilityLabel="Más secciones" style={({ pressed }) => [chrome.tab, moreTabs.some((tab) => tab.key === active) && chrome.tabActive, pressed && { opacity: 0.7 }]}>
        <View style={chrome.moreGlyph}><View style={chrome.moreGlyphDot} /><View style={chrome.moreGlyphDot} /><View style={chrome.moreGlyphDot} /></View>
        <Text style={[chrome.tabText, moreTabs.some((tab) => tab.key === active) && chrome.tabTextActive]}>Más</Text>
      </Pressable>}
      </View>
    </>
  );
}

export const chrome = StyleSheet.create({
  brand: { flexDirection: "row", alignItems: "center", gap: 9 },
  mark: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#c8daf0", overflow: "hidden" },
  markImage: { width: 24, height: 24 },
  brandName: { color: C.ink, fontSize: 13, fontWeight: "900", letterSpacing: 0.15 },
  brandSub: { color: C.muted, fontSize: 10.5, marginTop: 1 },

  topbar: { minHeight: 64, backgroundColor: C.graphite, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  logout: { color: C.onDark2, fontWeight: "700", fontSize: 14, padding: 8 },

  pageHead: { backgroundColor: C.surface, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: C.line },
  eyebrow: { color: C.orange, fontSize: 11, letterSpacing: 1, fontWeight: "900" },
  pageTitle: { color: C.ink, fontSize: 26, lineHeight: 32, fontWeight: "800", letterSpacing: -0.6, marginTop: 3 },
  pageLead: { color: C.muted, fontSize: 13.5, lineHeight: 19, marginTop: 3 },

  tabbar: { flexDirection: "row", backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.line, paddingHorizontal: 6, paddingTop: 6, paddingBottom: 8, gap: 2 },
  tab: { flex: 1, minWidth: 0, minHeight: 54, alignItems: "center", justifyContent: "center", gap: 4, borderRadius: 10, paddingHorizontal: 4 },
  tabActive: { backgroundColor: C.actionSoft },
  tabText: { color: C.muted, fontSize: 11, fontWeight: "700" },
  tabTextActive: { color: C.action, fontWeight: "800" },
  moreGlyph: { width: 20, height: 19, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3 },
  moreGlyphDot: { width: 3.5, height: 3.5, borderRadius: 3, backgroundColor: C.muted },
  moreOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(40, 42, 37, 0.28)", padding: 14 },
  moreMenu: { marginBottom: 54, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 14, padding: 8, shadowColor: "#282a25", shadowOpacity: 0.2, shadowRadius: 18, elevation: 8 },
  moreTitle: { color: C.muted, fontSize: 12, fontWeight: "800", paddingHorizontal: 10, paddingTop: 5, paddingBottom: 7 },
  moreItem: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48, borderRadius: 9, paddingHorizontal: 11 },
  moreItemActive: { backgroundColor: C.actionSoft },
  moreItemText: { color: C.ink, fontSize: 14, fontWeight: "700" },
  moreItemTextActive: { color: C.action },
});
