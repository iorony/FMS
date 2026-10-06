-- Reinicio completo para preparar la demostración.
-- Conserva auth.users y public.profiles; elimina todos los registros operativos.

begin;

truncate table
  public.audit_logs,
  public.material_predictions,
  public.work_order_timeline_events,
  public.work_order_materials,
  public.customer_signatures,
  public.evidences,
  public.location_records,
  public.work_order_status_history,
  public.work_order_technicians,
  public.daily_attendance_records,
  public.work_orders,
  public.material_stock_movements,
  public.client_material_assignments,
  public.material_inventory,
  public.materials,
  public.clients
restart identity cascade;

-- La secuencia de códigos no pertenece a una columna identity.
alter sequence public.work_order_code_seq restart with 1;

-- Archivos que ya no corresponden a ninguna orden de trabajo.
delete from storage.objects
where bucket_id in ('evidences', 'signatures');

commit;
