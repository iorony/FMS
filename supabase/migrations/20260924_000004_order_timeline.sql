-- Bitácora unificada y retrocompatible para todo el expediente de una orden.
create table if not exists public.work_order_timeline_events (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  source_type text not null,
  source_id uuid not null,
  event_type text not null,
  description text not null,
  actor_id uuid references public.profiles(id),
  actor_name text,
  created_at timestamptz not null default now(),
  unique (source_type, source_id)
);

alter table public.work_order_timeline_events enable row level security;
grant select on public.work_order_timeline_events to authenticated;
drop policy if exists "order timeline readable by participants" on public.work_order_timeline_events;
create policy "order timeline readable by participants" on public.work_order_timeline_events for select to authenticated
using (public.can_access_work_order(work_order_id));

create or replace function public.record_work_order_timeline_event(
  target_order_id uuid, event_source_type text, event_source_id uuid,
  event_kind text, event_description text, event_actor_id uuid, event_at timestamptz
) returns void language plpgsql security definer set search_path = public as $$
declare actor_full_name text;
begin
  select nullif(trim(full_name), '') into actor_full_name from public.profiles where id = event_actor_id;
  insert into public.work_order_timeline_events (
    work_order_id, source_type, source_id, event_type, description, actor_id, actor_name, created_at
  ) values (
    target_order_id, event_source_type, event_source_id, event_kind, event_description, event_actor_id, actor_full_name, event_at
  ) on conflict (source_type, source_id) do nothing;
end;
$$;

create or replace function public.timeline_from_status_history()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.record_work_order_timeline_event(
    new.work_order_id, 'status_history', new.id, 'estado',
    case when new.from_status is null then 'Orden creada'
      else 'Estado: ' || replace(new.from_status::text, '_', ' ') || ' → ' || replace(new.to_status::text, '_', ' ') end,
    new.changed_by, new.created_at
  );
  return new;
end;
$$;

create or replace function public.timeline_from_location()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.record_work_order_timeline_event(
    new.work_order_id, 'location', new.id, 'gps',
    case new.record_type when 'inicio' then 'GPS de llegada registrado' else 'GPS de salida registrado' end,
    new.captured_by, new.captured_at
  );
  return new;
end;
$$;

create or replace function public.timeline_from_material()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.record_work_order_timeline_event(
    new.work_order_id, 'material', new.id, 'material',
    'Material registrado: ' || new.quantity::text || ' ' || new.unit,
    new.created_by, new.created_at
  );
  return new;
end;
$$;

create or replace function public.timeline_from_evidence()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.record_work_order_timeline_event(
    new.work_order_id, 'evidence', new.id, 'evidencia', 'Evidencia agregada al expediente', new.created_by, new.created_at
  );
  return new;
end;
$$;

create or replace function public.timeline_from_signature()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.record_work_order_timeline_event(
    new.work_order_id, 'signature', new.id, 'firma', 'Firma de conformidad registrada', new.captured_by, new.signed_at
  );
  return new;
end;
$$;

drop trigger if exists timeline_status_history on public.work_order_status_history;
create trigger timeline_status_history after insert on public.work_order_status_history
for each row execute function public.timeline_from_status_history();
drop trigger if exists timeline_location on public.location_records;
create trigger timeline_location after insert on public.location_records
for each row execute function public.timeline_from_location();
drop trigger if exists timeline_material on public.work_order_materials;
create trigger timeline_material after insert on public.work_order_materials
for each row execute function public.timeline_from_material();
drop trigger if exists timeline_evidence on public.evidences;
create trigger timeline_evidence after insert on public.evidences
for each row execute function public.timeline_from_evidence();
drop trigger if exists timeline_signature on public.customer_signatures;
create trigger timeline_signature after insert on public.customer_signatures
for each row execute function public.timeline_from_signature();

-- Incluye el expediente ya existente sin duplicar los eventos que generen los triggers en adelante.
insert into public.work_order_timeline_events (work_order_id, source_type, source_id, event_type, description, actor_id, actor_name, created_at)
select h.work_order_id, 'status_history', h.id, 'estado',
  case when h.from_status is null then 'Orden creada' else 'Estado: ' || replace(h.from_status::text, '_', ' ') || ' → ' || replace(h.to_status::text, '_', ' ') end,
  h.changed_by, nullif(trim(p.full_name), ''), h.created_at
from public.work_order_status_history h left join public.profiles p on p.id = h.changed_by
on conflict (source_type, source_id) do nothing;
insert into public.work_order_timeline_events (work_order_id, source_type, source_id, event_type, description, actor_id, actor_name, created_at)
select l.work_order_id, 'location', l.id, 'gps', case l.record_type when 'inicio' then 'GPS de llegada registrado' else 'GPS de salida registrado' end,
  l.captured_by, nullif(trim(p.full_name), ''), l.captured_at
from public.location_records l left join public.profiles p on p.id = l.captured_by
on conflict (source_type, source_id) do nothing;
insert into public.work_order_timeline_events (work_order_id, source_type, source_id, event_type, description, actor_id, actor_name, created_at)
select m.work_order_id, 'material', m.id, 'material', 'Material registrado: ' || m.quantity::text || ' ' || m.unit,
  m.created_by, nullif(trim(p.full_name), ''), m.created_at
from public.work_order_materials m left join public.profiles p on p.id = m.created_by
on conflict (source_type, source_id) do nothing;
insert into public.work_order_timeline_events (work_order_id, source_type, source_id, event_type, description, actor_id, actor_name, created_at)
select e.work_order_id, 'evidence', e.id, 'evidencia', 'Evidencia agregada al expediente',
  e.created_by, nullif(trim(p.full_name), ''), e.created_at
from public.evidences e left join public.profiles p on p.id = e.created_by
on conflict (source_type, source_id) do nothing;
insert into public.work_order_timeline_events (work_order_id, source_type, source_id, event_type, description, actor_id, actor_name, created_at)
select s.work_order_id, 'signature', s.id, 'firma', 'Firma de conformidad registrada',
  s.captured_by, nullif(trim(p.full_name), ''), s.signed_at
from public.customer_signatures s left join public.profiles p on p.id = s.captured_by
on conflict (source_type, source_id) do nothing;
