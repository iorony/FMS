import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(url && key);

// No se interrumpe el arranque de Android si faltan variables en una compilación.
// App.tsx muestra una explicación y evita cualquier operación de red hasta que se
// genere una APK con la configuración correcta.
const clientUrl = url ?? "https://configuration-required.invalid";
const clientKey = key ?? "configuration-required";

export const supabase = createClient(clientUrl, clientKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
