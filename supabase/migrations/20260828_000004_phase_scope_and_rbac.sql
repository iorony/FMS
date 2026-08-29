-- Corrección de alcance y RBAC: Fase I administra; Fase II ejecuta en campo.

drop policy if exists "profiles readable by authenticated" on public.profiles;
drop policy if exists "managers manage profiles" on public.profiles;
create policy "profiles self or managers read" on public.profiles for select to authenticated
using (id = auth.uid() or public.is_manager());
create policy "admins manage profiles" on public.profiles for all to authenticated
using (public.current_app_role() = 'admin') with check (public.current_app_role() = 'admin');

drop policy if exists "managers manage clients" on public.clients;
drop policy if exists "managers manage materials" on public.materials;
create policy "admins manage clients" on public.clients for all to authenticated
using (public.current_app_role() = 'admin') with check (public.current_app_role() = 'admin');
create policy "admins manage materials" on public.materials for all to authenticated
using (public.current_app_role() = 'admin') with check (public.current_app_role() = 'admin');

drop policy if exists "field staff add locations" on public.location_records;
drop policy if exists "field staff add materials" on public.work_order_materials;
drop policy if exists "field staff add evidences" on public.evidences;
drop policy if exists "managers manage field data" on public.location_records;
drop policy if exists "managers manage order materials" on public.work_order_materials;
drop policy if exists "managers manage evidences" on public.evidences;

create policy "assigned technicians add locations" on public.location_records for insert to authenticated
with check (
  captured_by = auth.uid() and exists (
    select 1 from public.work_orders w join public.profiles p on p.id = w.assigned_technician_id
    where w.id = work_order_id and w.assigned_technician_id = auth.uid() and p.role = 'technician' and p.is_active
      and ((record_type = 'inicio' and w.status = 'asignada') or (record_type = 'cierre' and w.status = 'en_proceso'))
  )
);
create policy "assigned technicians add materials" on public.work_order_materials for insert to authenticated
with check (
  created_by = auth.uid() and exists (
    select 1 from public.work_orders w join public.profiles p on p.id = w.assigned_technician_id
    where w.id = work_order_id and w.assigned_technician_id = auth.uid() and p.role = 'technician' and p.is_active and w.status = 'en_proceso'
  )
);
create policy "assigned technicians add evidences" on public.evidences for insert to authenticated
with check (
  created_by = auth.uid() and exists (
    select 1 from public.work_orders w join public.profiles p on p.id = w.assigned_technician_id
    where w.id = work_order_id and w.assigned_technician_id = auth.uid() and p.role = 'technician' and p.is_active and w.status = 'en_proceso'
  )
);

drop policy if exists "authenticated upload own evidence" on storage.objects;
create policy "assigned technicians upload evidence" on storage.objects for insert to authenticated
with check (
  bucket_id = 'evidences' and (storage.foldername(name))[1] = auth.uid()::text and exists (
    select 1 from public.work_orders w join public.profiles p on p.id = w.assigned_technician_id
    where w.id::text = (storage.foldername(name))[2] and w.assigned_technician_id = auth.uid()
      and p.role = 'technician' and p.is_active and w.status = 'en_proceso'
  )
);

create or replace function public.transition_work_order(
  order_id uuid, next_status public.work_order_status, transition_note text default null
) returns public.work_orders language plpgsql security definer set search_path = public as $$
declare current_order public.work_orders; prior_status public.work_order_status; actor_role public.app_role;
begin
  select * into current_order from public.work_orders where id = order_id for update;
  if not found then raise exception 'Orden no encontrada'; end if;
  select public.current_app_role() into actor_role;
  prior_status := current_order.status;
  if actor_role in ('admin', 'coordinator') then
    if not (prior_status = 'borrador' and next_status in ('asignada', 'cancelada')) then raise exception 'El personal administrativo solo puede asignar o cancelar órdenes en borrador'; end if;
  elsif actor_role = 'technician' and current_order.assigned_technician_id = auth.uid() then
    if not ((prior_status = 'asignada' and next_status = 'en_proceso') or (prior_status = 'en_proceso' and next_status = 'pendiente_de_cierre')) then raise exception 'Transición de campo inválida'; end if;
  else raise exception 'No autorizado'; end if;
  update public.work_orders set status = next_status,
    started_at = case when next_status = 'en_proceso' then now() else started_at end,
    closed_at = case when next_status = 'cerrada' then now() else closed_at end
  where id = order_id returning * into current_order;
  insert into public.work_order_status_history(work_order_id, from_status, to_status, changed_by, note)
  values(order_id, prior_status, next_status, auth.uid(), transition_note);
  return current_order;
end $$;
