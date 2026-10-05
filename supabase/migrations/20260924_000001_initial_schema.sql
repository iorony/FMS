-- Esquema inicial consolidado de Plus Service GT.
-- Ejecutar únicamente en proyectos Supabase nuevos; contiene el estado final del esquema.
-- Generado al consolidar las 21 migraciones incrementales previas.

-- ===== Origen consolidado: 20260828_000001_initial_fsm.sql =====
create extension if not exists pgcrypto;

create type public.app_role as enum ('admin', 'coordinator', 'technician');
create type public.work_order_status as enum ('borrador', 'asignada', 'en_proceso', 'pendiente_de_cierre', 'cerrada', 'cancelada');
create type public.work_order_priority as enum ('baja', 'media', 'alta', 'critica');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '', email text not null default '',
  role public.app_role not null default 'technician', is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.clients (
  id uuid primary key default gen_random_uuid(), name text not null, contact_name text, contact_phone text, email text, address text,
  is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.materials (
  id uuid primary key default gen_random_uuid(), sku text not null unique, name text not null, unit text not null,
  is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create sequence public.work_order_code_seq;
create table public.work_orders (
  id uuid primary key default gen_random_uuid(), code text not null unique,
  client_id uuid not null references public.clients(id), assigned_technician_id uuid references public.profiles(id), created_by uuid not null references public.profiles(id),
  status public.work_order_status not null default 'borrador', priority public.work_order_priority not null default 'media',
  address text not null check (char_length(address) <= 300), description text not null check (char_length(description) <= 2000),
  scheduled_at timestamptz, started_at timestamptz, closed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check ((status = 'borrador') or assigned_technician_id is not null)
);
create table public.work_order_status_history (
  id uuid primary key default gen_random_uuid(), work_order_id uuid not null references public.work_orders(id) on delete cascade,
  from_status public.work_order_status, to_status public.work_order_status not null, changed_by uuid references public.profiles(id), note text,
  created_at timestamptz not null default now()
);
create table public.location_records (
  id uuid primary key default gen_random_uuid(), work_order_id uuid not null references public.work_orders(id) on delete cascade,
  record_type text not null check (record_type in ('inicio','cierre')), latitude numeric(9,6) not null check (latitude between -90 and 90), longitude numeric(9,6) not null check (longitude between -180 and 180),
  accuracy_meters numeric(8,2), captured_at timestamptz not null default now(), captured_by uuid references public.profiles(id), unique(work_order_id, record_type)
);
create table public.evidences (
  id uuid primary key default gen_random_uuid(), work_order_id uuid not null references public.work_orders(id) on delete cascade, storage_path text not null,
  suggested_category text, confidence numeric(5,4) check (confidence between 0 and 1), final_category text, review_status text not null default 'pending' check (review_status in ('pending','confirmed','corrected')),
  created_by uuid references public.profiles(id), created_at timestamptz not null default now()
);
create table public.work_order_materials (
  id uuid primary key default gen_random_uuid(), work_order_id uuid not null references public.work_orders(id) on delete cascade, material_id uuid not null references public.materials(id),
  quantity numeric(12,2) not null check (quantity > 0), unit text not null, note text, created_by uuid references public.profiles(id), created_at timestamptz not null default now()
);
create table public.customer_signatures (
  id uuid primary key default gen_random_uuid(), work_order_id uuid not null unique references public.work_orders(id) on delete cascade,
  signer_name text not null, storage_path text not null, signed_at timestamptz not null default now(), captured_by uuid references public.profiles(id)
);
create table public.material_predictions (
  id uuid primary key default gen_random_uuid(), work_order_id uuid not null references public.work_orders(id) on delete cascade, model_version text not null,
  prediction jsonb not null, accepted_prediction jsonb, created_at timestamptz not null default now(), accepted_at timestamptz, accepted_by uuid references public.profiles(id)
);
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(), entity_type text not null, entity_id uuid not null, action text not null, actor_id uuid references public.profiles(id), details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);

create or replace function public.current_app_role() returns public.app_role language sql stable security definer set search_path=public as $$ select role from public.profiles where id = auth.uid() $$;
create or replace function public.is_manager() returns boolean language sql stable security definer set search_path=public as $$ select public.current_app_role() in ('admin','coordinator') $$;
create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$ begin insert into public.profiles(id,full_name,email) values(new.id,coalesce(new.raw_user_meta_data->>'full_name',''),coalesce(new.email,'')); return new; end $$;
create or replace function public.assign_order_code() returns trigger language plpgsql as $$ begin if new.code is null or new.code='' then new.code:='PSG-'||to_char(current_date,'YYYY')||'-'||lpad(nextval('public.work_order_code_seq')::text,5,'0'); end if; return new; end $$;
create or replace function public.record_initial_status() returns trigger language plpgsql security definer set search_path=public as $$ begin insert into public.work_order_status_history(work_order_id,to_status,changed_by,note) values(new.id,new.status,auth.uid(),'Orden creada'); return new; end $$;
create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
create trigger clients_updated before update on public.clients for each row execute function public.set_updated_at();
create trigger materials_updated before update on public.materials for each row execute function public.set_updated_at();
create trigger work_orders_updated before update on public.work_orders for each row execute function public.set_updated_at();
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
create trigger work_order_code before insert on public.work_orders for each row execute function public.assign_order_code();
create trigger work_order_initial_status after insert on public.work_orders for each row execute function public.record_initial_status();

create or replace function public.transition_work_order(order_id uuid, next_status public.work_order_status, transition_note text default null) returns public.work_orders language plpgsql security definer set search_path=public as $$
declare current_order public.work_orders; actor_role public.app_role; prior_status public.work_order_status;
begin
  select * into current_order from public.work_orders where id=order_id for update; if not found then raise exception 'Orden no encontrada'; end if;
  prior_status := current_order.status;
  select public.current_app_role() into actor_role;
  if actor_role='technician' and current_order.assigned_technician_id<>auth.uid() then raise exception 'No autorizado'; end if;
  if not ((current_order.status='borrador' and next_status in ('asignada','cancelada')) or (current_order.status='asignada' and next_status in ('en_proceso','cancelada')) or (current_order.status='en_proceso' and next_status in ('pendiente_de_cierre','cancelada')) or (current_order.status='pendiente_de_cierre' and next_status in ('cerrada','en_proceso'))) then raise exception 'Transición de estado inválida'; end if;
  if next_status='cerrada' and (not exists(select 1 from public.location_records where work_order_id=order_id and record_type='inicio') or not exists(select 1 from public.location_records where work_order_id=order_id and record_type='cierre') or not exists(select 1 from public.evidences where work_order_id=order_id) or not exists(select 1 from public.work_order_materials where work_order_id=order_id) or not exists(select 1 from public.customer_signatures where work_order_id=order_id)) then raise exception 'No se puede cerrar una orden incompleta'; end if;
  update public.work_orders set status=next_status, started_at=case when next_status='en_proceso' then now() else started_at end, closed_at=case when next_status='cerrada' then now() else closed_at end where id=order_id returning * into current_order;
  insert into public.work_order_status_history(work_order_id,from_status,to_status,changed_by,note) values(order_id,prior_status,next_status,auth.uid(),transition_note);
  return current_order;
end $$;

alter table public.profiles enable row level security; alter table public.clients enable row level security; alter table public.materials enable row level security; alter table public.work_orders enable row level security; alter table public.work_order_status_history enable row level security; alter table public.location_records enable row level security; alter table public.evidences enable row level security; alter table public.work_order_materials enable row level security; alter table public.customer_signatures enable row level security; alter table public.material_predictions enable row level security; alter table public.audit_logs enable row level security;
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profiles, public.clients, public.materials, public.work_orders, public.work_order_status_history, public.location_records, public.evidences, public.work_order_materials, public.customer_signatures, public.material_predictions, public.audit_logs to authenticated;
grant usage, select on sequence public.work_order_code_seq to authenticated;
create policy "profiles readable by authenticated" on public.profiles for select to authenticated using (true);
create policy "managers manage profiles" on public.profiles for all to authenticated using (public.is_manager()) with check (public.is_manager());
create policy "managers manage clients" on public.clients for all to authenticated using (public.is_manager()) with check (public.is_manager());
create policy "authenticated read clients" on public.clients for select to authenticated using (true);
create policy "managers manage materials" on public.materials for all to authenticated using (public.is_manager()) with check (public.is_manager());
create policy "authenticated read materials" on public.materials for select to authenticated using (true);
create policy "orders visible by role" on public.work_orders for select to authenticated using (public.is_manager() or assigned_technician_id=auth.uid());
create policy "managers create orders" on public.work_orders for insert to authenticated with check (public.is_manager() and created_by=auth.uid());
create policy "managers update orders" on public.work_orders for update to authenticated using (public.is_manager()) with check (public.is_manager());
create policy "related data readable" on public.work_order_status_history for select to authenticated using (exists(select 1 from public.work_orders w where w.id=work_order_id and (public.is_manager() or w.assigned_technician_id=auth.uid())));
create policy "field data readable" on public.location_records for select to authenticated using (exists(select 1 from public.work_orders w where w.id=work_order_id and (public.is_manager() or w.assigned_technician_id=auth.uid())));
create policy "evidence readable" on public.evidences for select to authenticated using (exists(select 1 from public.work_orders w where w.id=work_order_id and (public.is_manager() or w.assigned_technician_id=auth.uid())));
create policy "materials readable" on public.work_order_materials for select to authenticated using (exists(select 1 from public.work_orders w where w.id=work_order_id and (public.is_manager() or w.assigned_technician_id=auth.uid())));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values ('evidences','evidences',false,10485760,array['image/jpeg','image/png','image/webp']) on conflict (id) do nothing;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values ('signatures','signatures',false,5242880,array['image/png']) on conflict (id) do nothing;


-- ===== Origen consolidado: 20260828_000002_field_execution.sql =====
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


-- ===== Origen consolidado: 20260828_000003_admin_user_management.sql =====
-- Permite que la ruta de servidor, autenticada con la Service Role Key,
-- complete el perfil y el rol después de enviar una invitación por Supabase Auth.
grant usage on schema public to service_role;
grant select, insert, update, delete on public.profiles to service_role;


-- ===== Origen consolidado: 20260828_000004_phase_scope_and_rbac.sql =====
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
    if not ((prior_status = 'borrador' and next_status in ('asignada', 'cancelada')) or (prior_status = 'asignada' and next_status = 'cancelada') or (prior_status = 'cancelada' and next_status = 'borrador')) then raise exception 'Solo se pueden cancelar órdenes en borrador o asignadas, o restaurar una orden cancelada a borrador'; end if;
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


-- ===== Origen consolidado: 20260903_000005_atomic_field_location.sql =====
-- Registra GPS y transición de estado en una sola transacción.
-- Evita dejar una ubicación huérfana cuando no se logra cambiar el estado.

create or replace function public.register_field_location(
  order_id uuid,
  record_type text,
  latitude numeric,
  longitude numeric,
  accuracy_meters numeric default null
)
returns public.work_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  current_order public.work_orders;
  previous_status public.work_order_status;
  next_status public.work_order_status;
begin
  if record_type not in ('inicio', 'cierre') then
    raise exception 'Tipo de ubicación inválido';
  end if;

  select * into current_order
  from public.work_orders
  where id = order_id
  for update;

  if not found then
    raise exception 'Orden no encontrada';
  end if;

  if public.current_app_role() <> 'technician'
    or current_order.assigned_technician_id <> auth.uid()
    or not exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'technician' and is_active
    ) then
    raise exception 'No autorizado';
  end if;

  if record_type = 'inicio' and current_order.status = 'asignada' then
    next_status := 'en_proceso';
  elsif record_type = 'cierre' and current_order.status = 'en_proceso' then
    next_status := 'pendiente_de_cierre';
  else
    raise exception 'La orden no se encuentra en un estado válido para este registro GPS';
  end if;

  previous_status := current_order.status;

  insert into public.location_records (
    work_order_id, record_type, latitude, longitude, accuracy_meters, captured_by
  ) values (
    order_id, record_type, latitude, longitude, accuracy_meters, auth.uid()
  );

  update public.work_orders
  set status = next_status,
      started_at = case when next_status = 'en_proceso' then now() else started_at end
  where id = order_id
  returning * into current_order;

  insert into public.work_order_status_history (
    work_order_id, from_status, to_status, changed_by, note
  ) values (
    order_id, previous_status, next_status, auth.uid(),
    'Ubicación de ' || record_type || ' registrada desde campo.'
  );

  return current_order;
end;
$$;

grant execute on function public.register_field_location(uuid, text, numeric, numeric, numeric) to authenticated;


-- ===== Origen consolidado: 20260914_000006_final_closure_reporting.sql =====
-- Fase III: firma de conformidad, cierre formal, bitácora y reporte operativo.
-- Esta migración no genera predicciones ni clasificaciones ficticias: esos
-- procesos requieren un modelo evaluado y se registran con su versión.

alter table public.customer_signatures
  add column if not exists consent_text text not null default 'Conforme con el servicio realizado.',
  add column if not exists signer_document text,
  add column if not exists signer_ip inet;

create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_logs(entity_type, entity_id, action, actor_id, details)
  values (
    tg_table_name,
    coalesce(new.id, old.id),
    lower(tg_op),
    auth.uid(),
    '{}'::jsonb
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists audit_work_orders on public.work_orders;
create trigger audit_work_orders after insert or update or delete on public.work_orders
for each row execute function public.write_audit_log();
drop trigger if exists audit_customer_signatures on public.customer_signatures;
create trigger audit_customer_signatures after insert or update or delete on public.customer_signatures
for each row execute function public.write_audit_log();

create policy "assigned technicians add customer signature"
on public.customer_signatures for insert to authenticated
with check (
  captured_by = auth.uid()
  and exists (
    select 1 from public.work_orders w join public.profiles p on p.id = w.assigned_technician_id
    where w.id = work_order_id
      and w.assigned_technician_id = auth.uid()
      and p.role = 'technician' and p.is_active
      and w.status = 'pendiente_de_cierre'
  )
);
create policy "order participants read customer signatures"
on public.customer_signatures for select to authenticated
using (public.can_access_work_order(work_order_id));
create policy "managers manage customer signatures"
on public.customer_signatures for all to authenticated
using (public.is_manager()) with check (public.is_manager());

create policy "assigned technicians upload signature"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'signatures'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1 from public.work_orders w
    where w.id::text = (storage.foldername(name))[2]
      and w.assigned_technician_id = auth.uid()
      and w.status = 'pendiente_de_cierre'
  )
);
create policy "participants read signature"
on storage.objects for select to authenticated
using (
  bucket_id = 'signatures'
  and exists (
    select 1 from public.customer_signatures s
    where s.storage_path = name and public.can_access_work_order(s.work_order_id)
  )
);

create or replace function public.close_work_order(order_id uuid, closure_note text default null)
returns public.work_orders
language plpgsql
security definer
set search_path = public
as $$
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
  update public.work_orders set status = 'cerrada', closed_at = now() where id = order_id returning * into current_order;
  insert into public.work_order_status_history(work_order_id, from_status, to_status, changed_by, note)
  values(order_id, 'pendiente_de_cierre', 'cerrada', auth.uid(), coalesce(nullif(trim(closure_note), ''), 'Cierre formal validado.'));
  return current_order;
end;
$$;
grant execute on function public.close_work_order(uuid, text) to authenticated;

create or replace view public.operational_order_report
with (security_invoker = true) as
select w.id, w.code, w.status, w.priority, w.scheduled_at, w.started_at, w.closed_at,
  c.name as client_name, p.full_name as technician_name,
  count(distinct e.id) as evidence_count, count(distinct m.id) as material_entries,
  (s.id is not null) as has_customer_signature
from public.work_orders w
join public.clients c on c.id = w.client_id
left join public.profiles p on p.id = w.assigned_technician_id
left join public.evidences e on e.work_order_id = w.id
left join public.work_order_materials m on m.work_order_id = w.id
left join public.customer_signatures s on s.work_order_id = w.id
group by w.id, c.name, p.full_name, s.id;
grant select on public.operational_order_report to authenticated;


-- ===== Origen consolidado: 20260916_000007_ai_data_governance.sql =====
-- Preparación auditable de datos para IA. No ejecuta inferencias ni declara métricas.
alter table public.evidences
  add column if not exists reviewed_by uuid references public.profiles(id),
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text check (char_length(review_note) <= 500),
  add column if not exists model_version text;

create policy "managers review evidences"
on public.evidences for update to authenticated
using (public.is_manager())
with check (public.is_manager());

create or replace function public.review_evidence(
  evidence_id uuid,
  category text,
  note text default null
) returns public.evidences
language plpgsql
security definer
set search_path = public
as $$
declare updated_evidence public.evidences;
begin
  if not public.is_manager() then
    raise exception 'Solo administración o coordinación puede revisar evidencias';
  end if;
  if nullif(trim(category), '') is null then
    raise exception 'La categoría de revisión es obligatoria';
  end if;

  update public.evidences
  set final_category = trim(category),
      review_status = case when suggested_category is null then 'confirmed' else 'corrected' end,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_note = nullif(trim(note), '')
  where id = evidence_id
  returning * into updated_evidence;

  if not found then
    raise exception 'Evidencia no encontrada';
  end if;
  return updated_evidence;
end;
$$;

grant execute on function public.review_evidence(uuid, text, text) to authenticated;


-- ===== Origen consolidado: 20260916_000008_ai_services.sql =====
-- Servicios de IA y predicción con resultados siempre sujetos a revisión humana.
create or replace function public.record_evidence_classification(
  evidence_id uuid,
  category text,
  confidence_value numeric,
  version text
) returns public.evidences
language plpgsql security definer set search_path = public as $$
declare result public.evidences;
begin
  if not public.is_manager() then raise exception 'Solo administración o coordinación puede ejecutar clasificación'; end if;
  if nullif(trim(category), '') is null or confidence_value < 0 or confidence_value > 1 or nullif(trim(version), '') is null then
    raise exception 'Resultado de clasificación inválido';
  end if;
  update public.evidences set suggested_category=trim(category), confidence=confidence_value,
    model_version=trim(version), review_status='pending', reviewed_by=null, reviewed_at=null, review_note=null
  where id=evidence_id returning * into result;
  if not found then raise exception 'Evidencia no encontrada'; end if;
  return result;
end $$;
grant execute on function public.record_evidence_classification(uuid, text, numeric, text) to authenticated;

create or replace function public.create_material_prediction(order_id uuid)
returns public.material_predictions
language plpgsql security definer set search_path = public as $$
declare target public.work_orders; prediction_row public.material_predictions; result jsonb; samples integer;
begin
  if not public.is_manager() then raise exception 'Solo administración o coordinación puede generar predicciones'; end if;
  select * into target from public.work_orders where id=order_id;
  if not found then raise exception 'Orden no encontrada'; end if;
  select count(*) into samples from public.work_orders where status='cerrada' and priority=target.priority;
  if samples < 3 then raise exception 'Se requieren al menos 3 órdenes cerradas con la misma prioridad para generar una estimación'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('material_id', material_id, 'quantity', estimated_quantity, 'unit', unit, 'sample_size', sample_size) order by material_id), '[]'::jsonb)
  into result from (
    select wom.material_id, round(avg(wom.quantity), 2) as estimated_quantity, max(wom.unit) as unit, count(*) as sample_size
    from public.work_order_materials wom join public.work_orders w on w.id=wom.work_order_id
    where w.status='cerrada' and w.priority=target.priority
    group by wom.material_id
  ) estimates;
  if result='[]'::jsonb then raise exception 'No hay consumos históricos para la prioridad de la orden'; end if;
  insert into public.material_predictions(work_order_id, model_version, prediction)
  values(order_id, 'historical-mean-v1', jsonb_build_object('method','mean_by_priority','training_orders',samples,'materials',result))
  returning * into prediction_row;
  return prediction_row;
end $$;
grant execute on function public.create_material_prediction(uuid) to authenticated;


-- ===== Origen consolidado: 20260916_000009_ai_evaluation.sql =====
-- Cierre del ciclo de IA: aceptación explícita y métricas calculadas con resultados reales.
create or replace function public.accept_material_prediction(prediction_id uuid, accepted jsonb default null)
returns public.material_predictions
language plpgsql security definer set search_path = public as $$
declare result public.material_predictions;
begin
  if not public.is_manager() then raise exception 'Solo administración o coordinación puede aceptar una estimación'; end if;
  update public.material_predictions
  set accepted_prediction = coalesce(accepted, prediction), accepted_at = now(), accepted_by = auth.uid()
  where id = prediction_id returning * into result;
  if not found then raise exception 'Estimación no encontrada'; end if;
  return result;
end $$;
grant execute on function public.accept_material_prediction(uuid, jsonb) to authenticated;

create or replace view public.evidence_classification_quality
with (security_invoker = true) as
select model_version,
  count(*) filter (where suggested_category is not null and final_category is not null) as reviewed_samples,
  count(*) filter (where suggested_category = final_category) as matching_reviews,
  case when count(*) filter (where suggested_category is not null and final_category is not null) = 0 then null
       else round(100.0 * count(*) filter (where suggested_category = final_category) /
         count(*) filter (where suggested_category is not null and final_category is not null), 2) end as agreement_percent,
  round(avg(confidence) filter (where suggested_category is not null and final_category is not null), 4) as average_confidence
from public.evidences
group by model_version;
grant select on public.evidence_classification_quality to authenticated;

create or replace view public.material_prediction_quality
with (security_invoker = true) as
select mp.model_version,
  count(*) as compared_materials,
  round(avg(abs((entry->>'quantity')::numeric - actual.quantity)), 2) as mean_absolute_error
from public.material_predictions mp
join public.work_orders w on w.id = mp.work_order_id and w.status = 'cerrada'
cross join lateral jsonb_array_elements(mp.prediction->'materials') as entry
join lateral (
  select sum(quantity) as quantity from public.work_order_materials
  where work_order_id = mp.work_order_id and material_id = (entry->>'material_id')::uuid
) actual on actual.quantity is not null
group by mp.model_version;
grant select on public.material_prediction_quality to authenticated;


-- ===== Origen consolidado: 20260918_000010_time_attendance_payroll.sql =====
-- Reporte de asistencia y preliquidación.
-- La hora trabajada se toma exclusivamente entre los registros GPS de llegada
-- y salida; el valor calculado es una estimación hasta la revisión administrativa.

alter table public.profiles
  add column if not exists hourly_rate numeric(12,2)
  check (hourly_rate is null or hourly_rate >= 0);

alter table public.work_orders
  add column if not exists planned_duration_minutes integer not null default 60
  check (planned_duration_minutes between 15 and 1440);

create or replace view public.operational_order_report
with (security_invoker = true) as
select
  w.id, w.code, w.status, w.priority, w.scheduled_at, w.started_at, w.closed_at,
  c.name as client_name,
  p.full_name as technician_name,
  count(distinct e.id) as evidence_count,
  count(distinct m.id) as material_entries,
  (s.id is not null) as has_customer_signature,
  -- Las columnas nuevas se agregan al final para conservar la compatibilidad
  -- posicional de CREATE OR REPLACE VIEW con la vista ya existente.
  w.planned_duration_minutes,
  p.id as technician_id,
  p.hourly_rate,
  start_location.captured_at as gps_start_at,
  end_location.captured_at as gps_end_at,
  (start_location.id is not null) as has_gps_start,
  (end_location.id is not null) as has_gps_end,
  case
    when start_location.captured_at is not null and end_location.captured_at is not null
      then greatest(0, round(extract(epoch from (end_location.captured_at - start_location.captured_at)) / 60))::integer
    else null
  end as worked_minutes,
  case
    when start_location.captured_at is not null and w.scheduled_at is not null
      then round(extract(epoch from (start_location.captured_at - w.scheduled_at)) / 60)::integer
    else null
  end as arrival_delta_minutes,
  case
    when start_location.captured_at is not null and end_location.captured_at is not null and p.hourly_rate is not null
      then round((extract(epoch from (end_location.captured_at - start_location.captured_at)) / 3600) * p.hourly_rate, 2)
    else null
  end as estimated_payment
from public.work_orders w
join public.clients c on c.id = w.client_id
left join public.profiles p on p.id = w.assigned_technician_id
left join public.location_records start_location on start_location.work_order_id = w.id and start_location.record_type = 'inicio'
left join public.location_records end_location on end_location.work_order_id = w.id and end_location.record_type = 'cierre'
left join public.evidences e on e.work_order_id = w.id
left join public.work_order_materials m on m.work_order_id = w.id
left join public.customer_signatures s on s.work_order_id = w.id
group by w.id, c.name, p.id, p.full_name, p.hourly_rate, start_location.id, end_location.id, s.id;

grant select on public.operational_order_report to authenticated;


-- ===== Origen consolidado: 20260918_000011_daily_attendance_and_helpers.sql =====
-- Jornada individual y equipo de una orden.
-- La geolocalización de la orden prueba el inicio/entrega del proyecto;
-- la nómina se liquida con la entrada y salida diaria de cada persona.

alter table public.profiles
  add column if not exists regular_daily_minutes integer not null default 480
  check (regular_daily_minutes between 60 and 1440),
  add column if not exists overtime_multiplier numeric(4,2) not null default 1.50
  check (overtime_multiplier between 1 and 5);

create table if not exists public.work_order_technicians (
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  technician_id uuid not null references public.profiles(id) on delete restrict,
  participation_role text not null check (participation_role in ('responsable', 'ayudante')),
  assigned_at timestamptz not null default now(),
  primary key (work_order_id, technician_id)
);

insert into public.work_order_technicians (work_order_id, technician_id, participation_role)
select id, assigned_technician_id, 'responsable'
from public.work_orders where assigned_technician_id is not null
on conflict (work_order_id, technician_id) do nothing;

create or replace function public.sync_responsible_technician()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.assigned_technician_id is not null and old.assigned_technician_id is distinct from new.assigned_technician_id then
    delete from public.work_order_technicians where work_order_id = new.id and technician_id = old.assigned_technician_id and participation_role = 'responsable';
  end if;
  if new.assigned_technician_id is not null then
    insert into public.work_order_technicians(work_order_id, technician_id, participation_role)
    values(new.id, new.assigned_technician_id, 'responsable')
    on conflict (work_order_id, technician_id) do update set participation_role = 'responsable';
  end if;
  return new;
end; $$;
drop trigger if exists work_order_responsible_sync on public.work_orders;
create trigger work_order_responsible_sync after insert or update of assigned_technician_id on public.work_orders
for each row execute function public.sync_responsible_technician();

create table if not exists public.daily_attendance_records (
  id uuid primary key default gen_random_uuid(),
  technician_id uuid not null references public.profiles(id) on delete cascade,
  work_date date not null default current_date,
  clock_in_at timestamptz,
  clock_in_latitude numeric(9,6), clock_in_longitude numeric(9,6), clock_in_accuracy_meters numeric(8,2),
  clock_out_at timestamptz,
  clock_out_latitude numeric(9,6), clock_out_longitude numeric(9,6), clock_out_accuracy_meters numeric(8,2),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (technician_id, work_date),
  check ((clock_in_at is null and clock_out_at is null) or clock_in_at is not null)
);
create trigger daily_attendance_updated before update on public.daily_attendance_records for each row execute function public.set_updated_at();

alter table public.work_order_technicians enable row level security;
alter table public.daily_attendance_records enable row level security;
grant select, insert, update, delete on public.work_order_technicians, public.daily_attendance_records to authenticated;

create policy "order team readable by participants" on public.work_order_technicians for select to authenticated
using (public.is_manager() or technician_id = auth.uid());
create policy "managers manage order team" on public.work_order_technicians for all to authenticated
using (public.is_manager()) with check (public.is_manager());

-- Los ayudantes pueden consultar la misma orden y sus evidencias, sin alterar
-- quién es el técnico responsable ni el GPS de inicio/entrega del proyecto.
drop policy if exists "orders visible by role" on public.work_orders;
create policy "orders visible by role" on public.work_orders for select to authenticated
using (public.is_manager() or assigned_technician_id = auth.uid() or exists (select 1 from public.work_order_technicians t where t.work_order_id = id and t.technician_id = auth.uid()));
create or replace function public.can_access_work_order(target_work_order_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_manager() or exists (select 1 from public.work_orders w where w.id = target_work_order_id and w.assigned_technician_id = auth.uid()) or exists (select 1 from public.work_order_technicians t where t.work_order_id = target_work_order_id and t.technician_id = auth.uid())
$$;
create policy "technicians read own attendance" on public.daily_attendance_records for select to authenticated
using (public.is_manager() or technician_id = auth.uid());
create policy "technicians register own attendance" on public.daily_attendance_records for insert to authenticated
with check (technician_id = auth.uid() and public.current_app_role() = 'technician');
create policy "technicians update own attendance" on public.daily_attendance_records for update to authenticated
using (technician_id = auth.uid() and public.current_app_role() = 'technician')
with check (technician_id = auth.uid() and public.current_app_role() = 'technician');

create or replace function public.register_daily_attendance(
  attendance_type text, latitude numeric, longitude numeric, accuracy_meters numeric default null
) returns public.daily_attendance_records language plpgsql security definer set search_path = public as $$
declare record public.daily_attendance_records;
begin
  if attendance_type not in ('entrada', 'salida') or public.current_app_role() <> 'technician' then raise exception 'No autorizado'; end if;
  insert into public.daily_attendance_records (technician_id, work_date, clock_in_at, clock_in_latitude, clock_in_longitude, clock_in_accuracy_meters)
  values (auth.uid(), current_date, case when attendance_type = 'entrada' then now() end, case when attendance_type = 'entrada' then latitude end, case when attendance_type = 'entrada' then longitude end, case when attendance_type = 'entrada' then accuracy_meters end)
  on conflict (technician_id, work_date) do update set
    clock_out_at = case when attendance_type = 'salida' and daily_attendance_records.clock_in_at is not null and daily_attendance_records.clock_out_at is null then now() else daily_attendance_records.clock_out_at end,
    clock_out_latitude = case when attendance_type = 'salida' and daily_attendance_records.clock_out_at is null then latitude else daily_attendance_records.clock_out_latitude end,
    clock_out_longitude = case when attendance_type = 'salida' and daily_attendance_records.clock_out_at is null then longitude else daily_attendance_records.clock_out_longitude end,
    clock_out_accuracy_meters = case when attendance_type = 'salida' and daily_attendance_records.clock_out_at is null then accuracy_meters else daily_attendance_records.clock_out_accuracy_meters end
  returning * into record;
  if attendance_type = 'salida' and record.clock_out_at is null then raise exception 'Primero registra la entrada o la salida ya fue registrada'; end if;
  return record;
end; $$;
grant execute on function public.register_daily_attendance(text, numeric, numeric, numeric) to authenticated;

create or replace view public.daily_payroll_report with (security_invoker = true) as
select a.id, a.work_date, a.technician_id, p.full_name as technician_name, p.hourly_rate, p.regular_daily_minutes, p.overtime_multiplier,
  a.clock_in_at, a.clock_out_at,
  case when a.clock_in_at is not null and a.clock_out_at is not null then greatest(0, round(extract(epoch from (a.clock_out_at - a.clock_in_at)) / 60))::integer end as worked_minutes,
  case when a.clock_in_at is not null and a.clock_out_at is not null then least(greatest(0, round(extract(epoch from (a.clock_out_at - a.clock_in_at)) / 60))::integer, p.regular_daily_minutes) end as regular_minutes,
  case when a.clock_in_at is not null and a.clock_out_at is not null then greatest(0, round(extract(epoch from (a.clock_out_at - a.clock_in_at)) / 60)::integer - p.regular_daily_minutes) end as overtime_minutes,
  case when a.clock_in_at is not null and a.clock_out_at is not null and p.hourly_rate is not null then round((least(greatest(0, round(extract(epoch from (a.clock_out_at - a.clock_in_at)) / 60))::integer, p.regular_daily_minutes) / 60.0) * p.hourly_rate + (greatest(0, round(extract(epoch from (a.clock_out_at - a.clock_in_at)) / 60)::integer - p.regular_daily_minutes) / 60.0) * p.hourly_rate * p.overtime_multiplier, 2) end as estimated_payment
from public.daily_attendance_records a join public.profiles p on p.id = a.technician_id;
grant select on public.daily_payroll_report to authenticated;


-- ===== Origen consolidado: 20260918_000012_fix_team_policy_recursion.sql =====
-- Corrige la dependencia circular entre las políticas de órdenes y equipo.
-- La orden consulta integrantes; la política de integrantes no debe volver a
-- consultar órdenes, porque PostgreSQL detecta una recursión RLS infinita.

drop policy if exists "order team readable by participants" on public.work_order_technicians;
create policy "order team readable by participants"
on public.work_order_technicians for select to authenticated
using (public.is_manager() or technician_id = auth.uid());

drop policy if exists "orders visible by role" on public.work_orders;
create policy "orders visible by role" on public.work_orders for select to authenticated
using (
  public.is_manager()
  or assigned_technician_id = auth.uid()
  or exists (
    select 1 from public.work_order_technicians t
    where t.work_order_id = work_orders.id and t.technician_id = auth.uid()
  )
);


-- ===== Origen consolidado: 20260919_000013_limit_field_staff_to_active_orders.sql =====
-- Técnicos responsables y ayudantes solo pueden consultar expedientes activos.
-- Administración y coordinación conservan el acceso al histórico completo.

drop policy if exists "orders visible by role" on public.work_orders;
create policy "orders visible by role" on public.work_orders for select to authenticated
using (
  public.is_manager()
  or (
    status in ('asignada', 'en_proceso', 'pendiente_de_cierre')
    and (
      assigned_technician_id = auth.uid()
      or exists (
        select 1 from public.work_order_technicians t
        where t.work_order_id = work_orders.id and t.technician_id = auth.uid()
      )
    )
  )
);

create or replace function public.can_access_work_order(target_work_order_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_manager()
    or exists (
      select 1 from public.work_orders w
      where w.id = target_work_order_id
        and w.status in ('asignada', 'en_proceso', 'pendiente_de_cierre')
        and (w.assigned_technician_id = auth.uid() or exists (
          select 1 from public.work_order_technicians t
          where t.work_order_id = w.id and t.technician_id = auth.uid()
        ))
    )
$$;


-- ===== Origen consolidado: 20260919_000014_field_staff_work_history.sql =====
-- El equipo de campo ve sus órdenes activas y el historial de las cerradas
-- en las que participó. Las órdenes cerradas permanecen estrictamente de solo lectura.

drop policy if exists "orders visible by role" on public.work_orders;
create policy "orders visible by role" on public.work_orders for select to authenticated
using (
  public.is_manager()
  or (
    status in ('asignada', 'en_proceso', 'pendiente_de_cierre', 'cerrada')
    and (
      assigned_technician_id = auth.uid()
      or exists (
        select 1 from public.work_order_technicians t
        where t.work_order_id = work_orders.id and t.technician_id = auth.uid()
      )
    )
  )
);

-- Acceso de lectura al expediente, incluso después del cierre.
create or replace function public.can_access_work_order(target_work_order_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_manager()
    or exists (
      select 1 from public.work_orders w
      where w.id = target_work_order_id
        and w.status in ('asignada', 'en_proceso', 'pendiente_de_cierre', 'cerrada')
        and (w.assigned_technician_id = auth.uid() or exists (
          select 1 from public.work_order_technicians t
          where t.work_order_id = w.id and t.technician_id = auth.uid()
        ))
    )
$$;

-- Acciones de campo solamente sobre órdenes activas.
create or replace function public.can_execute_active_work_order(target_work_order_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.work_orders w
    where w.id = target_work_order_id
      and w.status in ('asignada', 'en_proceso', 'pendiente_de_cierre')
      and (w.assigned_technician_id = auth.uid() or exists (
        select 1 from public.work_order_technicians t
        where t.work_order_id = w.id and t.technician_id = auth.uid()
      ))
  )
$$;

-- El historial del técnico incluye todas las órdenes en las que participa,
-- incluidas las canceladas. La escritura de campo continúa limitada por
-- can_execute_active_work_order a órdenes en proceso.
drop policy if exists "orders visible by role" on public.work_orders;
create policy "orders visible by role" on public.work_orders for select to authenticated
using (
  public.is_manager()
  or assigned_technician_id = auth.uid()
  or exists (
    select 1 from public.work_order_technicians t
    where t.work_order_id = work_orders.id and t.technician_id = auth.uid()
  )
);

create or replace function public.can_access_work_order(target_work_order_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_manager()
    or exists (
      select 1 from public.work_orders w
      where w.id = target_work_order_id
        and (w.assigned_technician_id = auth.uid() or exists (
          select 1 from public.work_order_technicians t
          where t.work_order_id = w.id and t.technician_id = auth.uid()
        ))
    )
$$;
grant execute on function public.can_execute_active_work_order(uuid) to authenticated;

drop policy if exists "field staff add locations" on public.location_records;
create policy "field staff add locations" on public.location_records for insert to authenticated
with check (captured_by = auth.uid() and public.can_execute_active_work_order(work_order_id));
drop policy if exists "field staff add materials" on public.work_order_materials;
create policy "field staff add materials" on public.work_order_materials for insert to authenticated
with check (created_by = auth.uid() and public.can_execute_active_work_order(work_order_id));
drop policy if exists "field staff add evidences" on public.evidences;
create policy "field staff add evidences" on public.evidences for insert to authenticated
with check (created_by = auth.uid() and public.can_execute_active_work_order(work_order_id));


-- ===== Origen consolidado: 20260919_000015_attendance_local_work_date.sql =====
-- La jornada se determina por el calendario laboral de Guatemala, no por UTC.
drop function if exists public.register_daily_attendance(text, numeric, numeric, numeric);
create function public.register_daily_attendance(
  attendance_type text, latitude numeric, longitude numeric, accuracy_meters numeric default null,
  attendance_work_date date default (now() at time zone 'America/Guatemala')::date
) returns public.daily_attendance_records language plpgsql security definer set search_path = public as $$
declare record public.daily_attendance_records;
begin
  if attendance_type not in ('entrada', 'salida') or public.current_app_role() <> 'technician' then raise exception 'No autorizado'; end if;
  if attendance_work_date <> (now() at time zone 'America/Guatemala')::date then raise exception 'La jornada debe registrarse para la fecha laboral actual'; end if;
  insert into public.daily_attendance_records (technician_id, work_date, clock_in_at, clock_in_latitude, clock_in_longitude, clock_in_accuracy_meters)
  values (auth.uid(), attendance_work_date, case when attendance_type = 'entrada' then now() end, case when attendance_type = 'entrada' then latitude end, case when attendance_type = 'entrada' then longitude end, case when attendance_type = 'entrada' then accuracy_meters end)
  on conflict (technician_id, work_date) do update set
    clock_out_at = case when attendance_type = 'salida' and daily_attendance_records.clock_in_at is not null and daily_attendance_records.clock_out_at is null then now() else daily_attendance_records.clock_out_at end,
    clock_out_latitude = case when attendance_type = 'salida' and daily_attendance_records.clock_out_at is null then latitude else daily_attendance_records.clock_out_latitude end,
    clock_out_longitude = case when attendance_type = 'salida' and daily_attendance_records.clock_out_at is null then longitude else daily_attendance_records.clock_out_longitude end,
    clock_out_accuracy_meters = case when attendance_type = 'salida' and daily_attendance_records.clock_out_at is null then accuracy_meters else daily_attendance_records.clock_out_accuracy_meters end
  returning * into record;
  if attendance_type = 'salida' and record.clock_out_at is null then raise exception 'Primero registra la entrada o la salida ya fue registrada'; end if;
  return record;
end; $$;
grant execute on function public.register_daily_attendance(text, numeric, numeric, numeric, date) to authenticated;


-- ===== Origen consolidado: 20260923_000016_order_site_location.sql =====
-- Punto planificado por coordinación; es distinto de las marcas GPS reales
-- que el equipo captura al iniciar y finalizar una orden.
alter table public.work_orders
  add column if not exists site_latitude numeric(9,6),
  add column if not exists site_longitude numeric(9,6);

alter table public.work_orders
  drop constraint if exists work_orders_site_location_pair;

alter table public.work_orders
  add constraint work_orders_site_location_pair check (
    (site_latitude is null and site_longitude is null)
    or (
      site_latitude between -90 and 90
      and site_longitude between -180 and 180
    )
  );


-- ===== Origen consolidado: 20260923_000017_allow_signature_correction.sql =====
-- El técnico responsable puede corregir una firma tomada por error mientras
-- la orden sigue pendiente de cierre. La auditoría existente registra el delete.
create policy "assigned technicians delete pending customer signature"
on public.customer_signatures for delete to authenticated
using (
  captured_by = auth.uid()
  and exists (
    select 1 from public.work_orders w
    where w.id = work_order_id
      and w.assigned_technician_id = auth.uid()
      and w.status = 'pendiente_de_cierre'
  )
);

create policy "assigned technicians delete pending signature file"
on storage.objects for delete to authenticated
using (
  bucket_id = 'signatures'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1 from public.work_orders w
    where w.id::text = (storage.foldername(name))[2]
      and w.assigned_technician_id = auth.uid()
      and w.status = 'pendiente_de_cierre'
  )
);


-- ===== Origen consolidado: 20260923_000018_revoke_signature_correction.sql =====
-- Revierte el permiso temporal de eliminar firmas: una vez guardada, la firma
-- forma parte del expediente. El botón "Borrar" solo limpia el lienzo antes
-- de guardar una nueva firma.
drop policy if exists "assigned technicians delete pending customer signature" on public.customer_signatures;
drop policy if exists "assigned technicians delete pending signature file" on storage.objects;


-- ===== Origen consolidado: 20260923_000019_deduct_lunch_from_payroll.sql =====
-- La jornada se mide con GPS de entrada/salida. Se descuenta, como máximo,
-- una hora de almuerzo dentro de la ventana local de 12:00 a 14:00.
-- No se agregan columnas a la vista para mantener compatibilidad con clientes ya desplegados.
create or replace view public.daily_payroll_report with (security_invoker = true) as
with attendance as (
  select
    a.id, a.work_date, a.technician_id, p.full_name as technician_name,
    p.hourly_rate, p.regular_daily_minutes, p.overtime_multiplier,
    a.clock_in_at, a.clock_out_at,
    case when a.clock_in_at is not null and a.clock_out_at is not null then
      greatest(0, round(extract(epoch from (a.clock_out_at - a.clock_in_at)) / 60))::integer
    end as gross_minutes,
    case when a.clock_in_at is not null and a.clock_out_at is not null then
      least(
        60,
        greatest(
          0,
          floor(extract(epoch from (
            least(a.clock_out_at at time zone 'America/Guatemala', a.work_date + time '14:00')
            - greatest(a.clock_in_at at time zone 'America/Guatemala', a.work_date + time '12:00')
          )) / 60)::integer
        )
      )
    end as lunch_minutes
  from public.daily_attendance_records a
  join public.profiles p on p.id = a.technician_id
), payable as (
  select *, case when gross_minutes is not null then greatest(0, gross_minutes - coalesce(lunch_minutes, 0)) end as worked_minutes
  from attendance
)
select
  id, work_date, technician_id, technician_name, hourly_rate, regular_daily_minutes, overtime_multiplier,
  clock_in_at, clock_out_at, worked_minutes,
  case when worked_minutes is not null then least(worked_minutes, regular_daily_minutes) end as regular_minutes,
  case when worked_minutes is not null then greatest(0, worked_minutes - regular_daily_minutes) end as overtime_minutes,
  case when worked_minutes is not null and hourly_rate is not null then
    round(
      (least(worked_minutes, regular_daily_minutes) / 60.0) * hourly_rate
      + (greatest(0, worked_minutes - regular_daily_minutes) / 60.0) * hourly_rate * overtime_multiplier,
      2
    )
  end as estimated_payment
from payable;

grant select on public.daily_payroll_report to authenticated;


-- ===== Origen consolidado: 20260923_000020_material_costing_and_estimates.sql =====
-- Datos de compra que necesita la estimación: el costo es por la unidad registrada
-- y la cantidad mínima representa el múltiplo mínimo que se puede pedir.
alter table public.materials
  add column if not exists unit_cost numeric(12,2) not null default 0 check (unit_cost >= 0),
  add column if not exists minimum_quantity numeric(12,2) not null default 1 check (minimum_quantity > 0);

-- Conserva el precio vigente al momento de registrar el consumo; el catálogo puede
-- cambiar después sin reescribir el costo histórico de una orden cerrada.
alter table public.work_order_materials
  add column if not exists unit_cost numeric(12,2) not null default 0 check (unit_cost >= 0),
  add column if not exists total_cost numeric(14,2) generated always as (round(quantity * unit_cost, 2)) stored;

create or replace function public.create_material_prediction(order_id uuid)
returns public.material_predictions
language plpgsql security definer set search_path = public as $$
declare target public.work_orders; prediction_row public.material_predictions; result jsonb; samples integer;
begin
  if not public.is_manager() then raise exception 'Solo administración o coordinación puede generar estimaciones'; end if;
  select * into target from public.work_orders where id = order_id;
  if not found then raise exception 'Orden no encontrada'; end if;
  select count(*) into samples from public.work_orders where status = 'cerrada' and priority = target.priority;
  if samples < 3 then raise exception 'Se requieren al menos 3 órdenes cerradas con la misma prioridad para generar una estimación'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'material_id', material_id,
    'estimated_quantity', estimated_quantity,
    'recommended_quantity', recommended_quantity,
    'minimum_quantity', minimum_quantity,
    'unit', unit,
    'unit_cost', unit_cost,
    'estimated_cost', estimated_cost,
    'sample_size', sample_size
  ) order by material_id), '[]'::jsonb)
  into result
  from (
    select historical.material_id,
      round(historical.estimated_quantity, 2) as estimated_quantity,
      round(ceil(historical.estimated_quantity / m.minimum_quantity) * m.minimum_quantity, 2) as recommended_quantity,
      m.minimum_quantity, historical.unit, m.unit_cost,
      round(ceil(historical.estimated_quantity / m.minimum_quantity) * m.minimum_quantity * m.unit_cost, 2) as estimated_cost,
      historical.sample_size
    from (
      select wom.material_id,
        percentile_cont(0.5) within group (order by wom.quantity)::numeric as estimated_quantity,
        max(wom.unit) as unit,
        count(*) as sample_size
      from public.work_order_materials wom
      join public.work_orders w on w.id = wom.work_order_id
      where w.status = 'cerrada' and w.priority = target.priority
      group by wom.material_id
    ) historical
    join public.materials m on m.id = historical.material_id and m.is_active
  ) estimates;

  if result = '[]'::jsonb then raise exception 'No hay consumos históricos para la prioridad de la orden'; end if;
  insert into public.material_predictions(work_order_id, model_version, prediction)
  values (order_id, 'historical-median-cost-v2', jsonb_build_object(
    'method', 'median_by_priority_with_purchase_minimums',
    'training_orders', samples,
    'materials', result,
    'total_estimated_cost', (select coalesce(sum((entry->>'estimated_cost')::numeric), 0) from jsonb_array_elements(result) entry)
  )) returning * into prediction_row;
  return prediction_row;
end $$;
grant execute on function public.create_material_prediction(uuid) to authenticated;

-- Mantiene la métrica compatible con estimaciones anteriores y con el nuevo
-- esquema que separa consumo previsto, compra sugerida y costo.
create or replace view public.material_prediction_quality
with (security_invoker = true) as
select mp.model_version,
  count(*) as compared_materials,
  round(avg(abs(coalesce((entry->>'estimated_quantity')::numeric, (entry->>'quantity')::numeric) - actual.quantity)), 2) as mean_absolute_error,
  round(avg(abs((entry->>'estimated_cost')::numeric - actual.total_cost)) filter (where entry ? 'estimated_cost'), 2) as mean_absolute_cost_error
from public.material_predictions mp
join public.work_orders w on w.id = mp.work_order_id and w.status = 'cerrada'
cross join lateral jsonb_array_elements(mp.prediction->'materials') as entry
join lateral (
  select sum(quantity) as quantity, sum(total_cost) as total_cost
  from public.work_order_materials
  where work_order_id = mp.work_order_id and material_id = (entry->>'material_id')::uuid
) actual on actual.quantity is not null
group by mp.model_version;
grant select on public.material_prediction_quality to authenticated;


-- ===== Origen consolidado: 20260923_000021_material_consumption_by_client.sql =====
-- Un consumo pertenece a una orden y la orden a un cliente. Esta vista ofrece
-- el historial consolidado sin duplicar una asignación manual de materiales.
create or replace view public.material_client_consumption_summary
with (security_invoker = true) as
select
  wom.material_id,
  wo.client_id,
  c.name as client_name,
  wom.unit,
  round(sum(wom.quantity), 2) as consumed_quantity,
  round(sum(wom.total_cost), 2) as consumed_cost,
  max(wom.created_at) as last_consumed_at
from public.work_order_materials wom
join public.work_orders wo on wo.id = wom.work_order_id
join public.clients c on c.id = wo.client_id
group by wom.material_id, wo.client_id, c.name, wom.unit;

grant select on public.material_client_consumption_summary to authenticated;


-- ===== Seguridad de estados y GPS =====
-- Las políticas RLS autorizan quién puede editar una orden, pero PostgreSQL no
-- puede limitar una política UPDATE a una columna. Este trigger evita que una
-- actualización directa cambie el estado; solo las RPC transaccionales pueden
-- habilitar el cambio dentro de su propia transacción.
create or replace function public.guard_work_order_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status
    and current_setting('app.allow_work_order_status_transition', true) is distinct from 'on' then
    raise exception 'El estado de la orden solo puede cambiar mediante una transición autorizada';
  end if;
  return new;
end;
$$;

drop trigger if exists work_order_status_guard on public.work_orders;
create trigger work_order_status_guard
before update of status on public.work_orders
for each row execute function public.guard_work_order_status_change();

-- Una orden siempre nace en Borrador. El cambio a Asignada ocurre después por
-- transition_work_order, por lo que una inserción directa no puede saltar el flujo.
create or replace function public.guard_work_order_initial_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'borrador' then
    raise exception 'Las órdenes nuevas deben crearse en Borrador';
  end if;
  return new;
end;
$$;

drop trigger if exists work_order_initial_status_guard on public.work_orders;
create trigger work_order_initial_status_guard
before insert on public.work_orders
for each row execute function public.guard_work_order_initial_status();

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
    if not ((prior_status = 'borrador' and next_status in ('asignada', 'cancelada')) or (prior_status = 'asignada' and next_status = 'cancelada') or (prior_status = 'cancelada' and next_status = 'borrador')) then raise exception 'Solo se pueden cancelar órdenes en borrador o asignadas, o restaurar una orden cancelada a borrador'; end if;
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

-- El GPS solo se registra a través de register_field_location: la política
-- permite la inserción durante la misma transacción de esa RPC, no desde la API.
drop policy if exists "field staff add locations" on public.location_records;
create policy "authorized field location RPC insert" on public.location_records for insert to authenticated
with check (
  captured_by = auth.uid()
  and current_setting('app.allow_field_location_insert', true) = 'on'
);

-- Materiales y evidencias se mantienen disponibles para participantes del
-- equipo, pero exclusivamente mientras la orden está en ejecución.
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


