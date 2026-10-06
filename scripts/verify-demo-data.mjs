import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const environment = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.trimStart().startsWith("#"))
    .map((line) => {
      const separator = line.indexOf("=");
      return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
    }),
);
const supabase = createClient(environment.NEXT_PUBLIC_SUPABASE_URL, environment.SUPABASE_SERVICE_ROLE_KEY);

const [clients, materials, orders] = await Promise.all([
  supabase.from("clients").select("id", { count: "exact", head: true }),
  supabase.from("materials").select("id", { count: "exact", head: true }),
  supabase.from("work_orders").select("status"),
]);
if (clients.error || materials.error || orders.error) throw clients.error ?? materials.error ?? orders.error;

const statuses = Object.fromEntries(
  (orders.data ?? []).reduce((counts, order) => counts.set(order.status, (counts.get(order.status) ?? 0) + 1), new Map()),
);
console.log(JSON.stringify({
  clients: clients.count,
  materials: materials.count,
  orders: orders.data?.length ?? 0,
  statuses,
}));
