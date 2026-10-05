-- Refuerzo de seguridad para instalaciones existentes.
-- La migración inicial consolidada ya incluye estas reglas para proyectos nuevos.

create or replace function public.guard_work_order_status_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status
    and current_setting('app.allow_work_order_status_transition', true) is distinct from 'on' then
    raise exception 'El estado de la orden solo puede cambiar mediante una transición autorizada';
  end if;
  return new;
end;
$$;

drop trigger if exists work_order_status_guard on public.work_orders;
create trigger work_order_status_guard before update of status on public.work_orders
for each row execute function public.guard_work_order_status_change();

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
  perform set_config('app.allow_work_order_status_transition', 'on', true);
  update public.work_orders set status = next_status,
    started_at = case when next_status = 'en_proceso' then now() else started_at end,
    closed_at = case when next_status = 'cerrada' then now() else closed_at end
  where id = order_id returning * into current_order;
  insert into public.work_order_status_history(work_order_id, from_status, to_status, changed_by, note)
  values(order_id, prior_status, next_status, auth.uid(), transition_note);
  return current_order;
end $$;

create or replace function public.register_field_location(
  order_id uuid, record_type text, latitude numeric, longitude numeric, accuracy_meters numeric default null
) returns public.work_orders language plpgsql security definer set search_path = public as $$
declare current_order public.work_orders; previous_status public.work_order_status; next_status public.work_order_status;
begin
  if record_type not in ('inicio', 'cierre') then raise exception 'Tipo de ubicación inválido'; end if;
  select * into current_order from public.work_orders where id = order_id for update;
  if not found then raise exception 'Orden no encontrada'; end if;
  if public.current_app_role() <> 'technician'
    or current_order.assigned_technician_id <> auth.uid()
    or not exists (select 1 from public.profiles where id = auth.uid() and role = 'technician' and is_active) then
    raise exception 'No autorizado';
  end if;
  if record_type = 'inicio' and current_order.status = 'asignada' then
    next_status := 'en_proceso';
  elsif record_type = 'cierre' and current_order.status = 'en_proceso' then
    next_status := 'pendiente_de_cierre';
  else raise exception 'La orden no se encuentra en un estado válido para este registro GPS'; end if;
  previous_status := current_order.status;
  perform set_config('app.allow_field_location_insert', 'on', true);
  perform set_config('app.allow_work_order_status_transition', 'on', true);
  insert into public.location_records (work_order_id, record_type, latitude, longitude, accuracy_meters, captured_by)
  values (order_id, record_type, latitude, longitude, accuracy_meters, auth.uid());
  update public.work_orders set status = next_status,
    started_at = case when next_status = 'en_proceso' then now() else started_at end
  where id = order_id returning * into current_order;
  insert into public.work_order_status_history (work_order_id, from_status, to_status, changed_by, note)
  values (order_id, previous_status, next_status, auth.uid(), 'Ubicación de ' || record_type || ' registrada desde campo.');
  return current_order;
end;
$$;

create or replace function public.close_work_order(order_id uuid, closure_note text default null)
returns public.work_orders language plpgsql security definer set search_path = public as $$
declare current_order public.work_orders;
begin
  select * into current_order from public.work_orders where id = order_id for update;
  if not found then raise exception 'Orden no encontrada'; end if;
  if not public.is_manager() then raise exception 'Solo administración puede realizar el cierre formal'; end if;
  if current_order.status <> 'pendiente_de_cierre' then raise exception 'La orden no está lista para cierre formal'; end if;
  if not exists (select 1 from public.location_records where work_order_id = order_id and record_type = 'inicio')
     or not exists (select 1 from public.location_records where work_order_id = order_id and record_type = 'cierre')
     or not exists (select 1 from public.evidences where work_order_id = order_id)
     or not exists (select 1 from public.work_order_materials where work_order_id = order_id)
     or not exists (select 1 from public.customer_signatures where work_order_id = order_id) then
    raise exception 'La orden debe incluir GPS de inicio/cierre, materiales, evidencia y firma antes de cerrarse';
  end if;
  perform set_config('app.allow_work_order_status_transition', 'on', true);
  update public.work_orders set status = 'cerrada', closed_at = now() where id = order_id returning * into current_order;
  insert into public.work_order_status_history(work_order_id, from_status, to_status, changed_by, note)
  values(order_id, 'pendiente_de_cierre', 'cerrada', auth.uid(), coalesce(nullif(trim(closure_note), ''), 'Cierre formal validado.'));
  return current_order;
end;
$$;

drop policy if exists "field staff add locations" on public.location_records;
drop policy if exists "authorized field location RPC insert" on public.location_records;
create policy "authorized field location RPC insert" on public.location_records for insert to authenticated
with check (captured_by = auth.uid() and current_setting('app.allow_field_location_insert', true) = 'on');

create or replace function public.can_execute_active_work_order(target_work_order_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.work_orders w
    where w.id = target_work_order_id
      and w.status = 'en_proceso'
      and (w.assigned_technician_id = auth.uid() or exists (
        select 1 from public.work_order_technicians t
        where t.work_order_id = w.id and t.technician_id = auth.uid()
      ))
  )
$$;
