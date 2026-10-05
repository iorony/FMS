-- Registra la asignación inicial y las reasignaciones como eventos propios de
-- la bitácora. No modifica permisos ni el flujo de estados.
create or replace function public.timeline_from_status_history()
returns trigger language plpgsql security definer set search_path = public as $$
declare assigned_name text;
begin
  perform public.record_work_order_timeline_event(
    new.work_order_id, 'status_history', new.id, 'estado',
    case when new.from_status is null then 'Orden creada'
      else 'Estado: ' || replace(new.from_status::text, '_', ' ') || ' → ' || replace(new.to_status::text, '_', ' ') end,
    new.changed_by, new.created_at
  );

  if new.to_status = 'asignada' then
    select nullif(trim(p.full_name), '') into assigned_name
    from public.work_orders w
    left join public.profiles p on p.id = w.assigned_technician_id
    where w.id = new.work_order_id;
    perform public.record_work_order_timeline_event(
      new.work_order_id, 'asignacion', gen_random_uuid(), 'asignacion',
      'Técnico asignado: ' || coalesce(assigned_name, 'Sin asignar'),
      new.changed_by, new.created_at
    );
  end if;
  return new;
end;
$$;

create or replace function public.timeline_from_reassignment()
returns trigger language plpgsql security definer set search_path = public as $$
declare assigned_name text;
begin
  -- En Borrador, la asignación se documenta al transicionar a Asignada para
  -- evitar duplicar el mismo evento durante la creación o edición inicial.
  if old.status = 'borrador' or new.assigned_technician_id is not distinct from old.assigned_technician_id then
    return new;
  end if;
  select nullif(trim(full_name), '') into assigned_name
  from public.profiles where id = new.assigned_technician_id;
  perform public.record_work_order_timeline_event(
    new.id, 'reasignacion', gen_random_uuid(), 'reasignacion',
    case when new.assigned_technician_id is null then 'Técnico desasignado'
      else 'Técnico reasignado: ' || coalesce(assigned_name, 'Sin nombre') end,
    auth.uid(), now()
  );
  return new;
end;
$$;

drop trigger if exists timeline_reassignment on public.work_orders;
create trigger timeline_reassignment
after update of assigned_technician_id on public.work_orders
for each row execute function public.timeline_from_reassignment();
