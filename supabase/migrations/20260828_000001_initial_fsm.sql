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
