-- Fase II: ejecución de órdenes en campo (GPS, materiales y evidencias).
-- Ejecute esta migración después de 20260828_000001_initial_fsm.sql.

create or replace function public.can_access_work_order(target_work_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_manager()
    or exists (
      select 1 from public.work_orders
      where id = target_work_order_id
        and assigned_technician_id = auth.uid()
    )
$$;

create or replace function public.transition_work_order(
  order_id uuid,
  next_status public.work_order_status,
  transition_note text default null
)
returns public.work_orders
language plpgsql
security definer
set search_path = public
as $$
declare current_order public.work_orders; prior_status public.work_order_status;
begin
  select * into current_order from public.work_orders where id = order_id for update;
  if not found then raise exception 'Orden no encontrada'; end if;
  if not public.is_manager() and current_order.assigned_technician_id <> auth.uid() then raise exception 'No autorizado'; end if;
  prior_status := current_order.status;
  if not ((prior_status = 'borrador' and next_status in ('asignada','cancelada'))
    or (prior_status = 'asignada' and next_status in ('en_proceso','cancelada'))
    or (prior_status = 'en_proceso' and next_status in ('pendiente_de_cierre','cancelada'))
    or (prior_status = 'pendiente_de_cierre' and next_status in ('cerrada','en_proceso'))) then
    raise exception 'Transición de estado inválida';
  end if;
  if next_status = 'cerrada' and (
    not exists(select 1 from public.location_records where work_order_id = order_id and record_type = 'inicio')
    or not exists(select 1 from public.location_records where work_order_id = order_id and record_type = 'cierre')
    or not exists(select 1 from public.evidences where work_order_id = order_id)
    or not exists(select 1 from public.work_order_materials where work_order_id = order_id)
    or not exists(select 1 from public.customer_signatures where work_order_id = order_id)
  ) then raise exception 'No se puede cerrar una orden incompleta'; end if;
  update public.work_orders
  set status = next_status,
      started_at = case when next_status = 'en_proceso' then now() else started_at end,
      closed_at = case when next_status = 'cerrada' then now() else closed_at end
  where id = order_id returning * into current_order;
  insert into public.work_order_status_history(work_order_id, from_status, to_status, changed_by, note)
  values(order_id, prior_status, next_status, auth.uid(), transition_note);
  return current_order;
end $$;

grant execute on function public.can_access_work_order(uuid) to authenticated;
grant execute on function public.transition_work_order(uuid, public.work_order_status, text) to authenticated;

create policy "field staff add locations"
on public.location_records for insert to authenticated
with check (captured_by = auth.uid() and public.can_access_work_order(work_order_id));

create policy "field staff add materials"
on public.work_order_materials for insert to authenticated
with check (created_by = auth.uid() and public.can_access_work_order(work_order_id));

create policy "field staff add evidences"
on public.evidences for insert to authenticated
with check (created_by = auth.uid() and public.can_access_work_order(work_order_id));

create policy "managers manage field data"
on public.location_records for all to authenticated
using (public.is_manager()) with check (public.is_manager());
create policy "managers manage order materials"
on public.work_order_materials for all to authenticated
using (public.is_manager()) with check (public.is_manager());
create policy "managers manage evidences"
on public.evidences for all to authenticated
using (public.is_manager()) with check (public.is_manager());

create policy "authenticated upload own evidence"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'evidences'
  and (storage.foldername(name))[1] = auth.uid()::text
);
create policy "authenticated read accessible evidence"
on storage.objects for select to authenticated
using (
  bucket_id = 'evidences'
  and exists (
    select 1 from public.evidences e
    where e.storage_path = name
      and public.can_access_work_order(e.work_order_id)
  )
);
