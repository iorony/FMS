import type { Role, Status } from "./theme";

export type Order = {
  id: string;
  code: string;
  address: string;
  description: string;
  priority: string;
  scheduled_at: string | null;
  planned_duration_minutes: number;
  site_latitude: number | null;
  site_longitude: number | null;
  status: Status;
  client_id: string;
  assigned_technician_id: string | null;
  clients: { name: string } | null;
  profiles: { full_name: string } | null;
  customer_signatures: { id: string }[] | null;
};

export type HistoryEntry = { id: string; created_at: string; from_status: Status | null; to_status: Status; note: string | null };
export type Client = { id: string; name: string; contact_name: string | null; contact_phone: string | null; email: string | null; address: string | null; is_active: boolean };
export type Material = { id: string; sku: string; name: string; unit: string; unit_cost: number; minimum_quantity: number; is_active?: boolean };
export type Profile = { full_name: string; role: Role; is_active: boolean };
export type Person = { id: string; full_name: string; email: string; role: Role; is_active: boolean; hourly_rate: number | null; regular_daily_minutes: number; overtime_multiplier: number; created_at: string };

export const ORDER_SELECT =
  "id,code,address,description,priority,scheduled_at,planned_duration_minutes,site_latitude,site_longitude,status,client_id,assigned_technician_id,clients(name),profiles:assigned_technician_id(full_name),customer_signatures(id)";
