-- Cancelación administrativa reversible para órdenes que aún no iniciaron.
-- Conserva expediente, responsables y bitácora; restaurar devuelve la orden a Borrador.
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
    if not (
      (prior_status = 'borrador' and next_status in ('asignada', 'cancelada'))
      or (prior_status = 'asignada' and next_status = 'cancelada')
      or (prior_status = 'cancelada' and next_status = 'borrador')
    ) then raise exception 'Solo se pueden cancelar órdenes en borrador o asignadas, o restaurar una orden cancelada a borrador'; end if;
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

create or replace function public.timeline_from_status_history()
returns trigger language plpgsql security definer set search_path = public as $$
declare assigned_name text;
begin
  perform public.record_work_order_timeline_event(
    new.work_order_id, 'status_history', new.id, 'estado',
    case
      when new.from_status is null then 'Orden creada'
      when new.to_status = 'cancelada' then 'Orden cancelada'
      when new.from_status = 'cancelada' and new.to_status = 'borrador' then 'Orden restaurada como borrador'
      else 'Estado: ' || replace(new.from_status::text, '_', ' ') || ' → ' || replace(new.to_status::text, '_', ' ')
    end,
    new.changed_by, new.created_at
  );
  if new.to_status = 'asignada' then
    select nullif(trim(p.full_name), '') into assigned_name
    from public.work_orders w left join public.profiles p on p.id = w.assigned_technician_id
    where w.id = new.work_order_id;
    perform public.record_work_order_timeline_event(
      new.work_order_id, 'asignacion', gen_random_uuid(), 'asignacion',
      'Técnico asignado: ' || coalesce(assigned_name, 'Sin asignar'), new.changed_by, new.created_at
    );
  end if;
  return new;
end;
$$;
