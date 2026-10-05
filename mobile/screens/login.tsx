import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { C } from "../theme";
import { Brand } from "../components/chrome";
import { Button, Field, Input, ToastBar, useToast } from "../components/ui";

export function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const { toast, show, hide } = useToast();

  async function signIn() {
    if (!email.trim() || !password) {
      return show("error", "Ingresa tu correo y tu contraseña.");
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) {
      const connectionFailed = error.name === "AuthRetryableFetchError" || /network request failed|failed to fetch/i.test(error.message);
      show(
        "error",
        connectionFailed
          ? "No fue posible conectar con el servicio de acceso. Verifica Internet, VPN o DNS y vuelve a intentarlo."
          : "El correo o la contraseña no coinciden. Verifica los datos e inténtalo de nuevo.",
      );
    }
  }

  return (
    <SafeAreaView style={login.safe} edges={["top", "bottom"]}>
      <View style={login.accent} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={login.body} keyboardShouldPersistTaps="handled">
          <Brand light />

          <View style={login.card}>
            <Text style={login.eyebrow}>ACCESO DE CAMPO</Text>
            <Text style={login.title} accessibilityRole="header">FMS Técnico</Text>
            <Text style={login.lead}>Consulta y documenta las órdenes que tienes asignadas.</Text>

            <View style={{ gap: 14 }}>
              <Field label="Correo electrónico">
                <Input
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  placeholder="nombre@empresa.com"
                  value={email}
                  onChangeText={setEmail}
                  returnKeyType="next"
                />
              </Field>

              <Field label="Contraseña">
                <View>
                  <Input
                    autoComplete="current-password"
                    secureTextEntry={!visible}
                    placeholder="Tu contraseña"
                    value={password}
                    onChangeText={setPassword}
                    onSubmitEditing={signIn}
                    returnKeyType="go"
                    style={{ paddingRight: 84 }}
                  />
                  <Pressable
                    onPress={() => setVisible((current) => !current)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
                    style={login.reveal}
                  >
                    <Text style={login.revealText}>{visible ? "Ocultar" : "Mostrar"}</Text>
                  </Pressable>
                </View>
              </Field>

              <ToastBar toast={toast} onHide={hide} />
              <Button title="Ingresar" busy={busy} onPress={signIn} />
            </View>
          </View>

          <Text style={login.foot}>Plus Service · Gestión de trabajo en campo</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const login = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.graphite },
  accent: { height: 6, backgroundColor: C.action },
  body: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 22, paddingVertical: 28, gap: 24 },
  card: { backgroundColor: C.surface, borderRadius: 16, padding: 22, gap: 4, shadowColor: "#000", shadowOpacity: 0.22, shadowRadius: 22, shadowOffset: { width: 0, height: 12 }, elevation: 8 },
  eyebrow: { color: C.orange, fontSize: 11, letterSpacing: 1, fontWeight: "900" },
  title: { color: C.ink, fontSize: 27, fontWeight: "800", letterSpacing: -0.6, marginTop: 4 },
  lead: { color: C.muted, fontSize: 14, lineHeight: 20, marginTop: 6, marginBottom: 14 },
  reveal: { position: "absolute", right: 6, top: 0, bottom: 0, justifyContent: "center", paddingHorizontal: 10 },
  revealText: { color: C.action, fontSize: 13, fontWeight: "800" },
  foot: { color: C.onDark2, textAlign: "center", fontSize: 12 },
});
