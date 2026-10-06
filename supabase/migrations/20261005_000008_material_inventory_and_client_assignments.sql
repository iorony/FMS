-- Inventario operativo: el catálogo describe el material; estas tablas
-- registran las existencias físicas y lo que se entrega a cada cliente.
create table public.material_inventory (
  material_id uuid primary key references public.materials(id) on delete restrict,
  on_hand_quantity numeric(12,2) not null default 0 check (on_hand_quantity >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

create table public.material_stock_movements (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.materials(id) on delete restrict,
  movement_type text not null check (movement_type in ('entrada', 'ajuste', 'asignacion_cliente', 'devolucion_cliente')),
  quantity_delta numeric(12,2) not null check (quantity_delta <> 0),
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.client_material_assignments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  material_id uuid not null references public.materials(id) on delete restrict,
  assigned_quantity numeric(12,2) not null check (assigned_quantity > 0),
  consumed_quantity numeric(12,2) not null default 0 check (consumed_quantity >= 0),
  returned_quantity numeric(12,2) not null default 0 check (returned_quantity >= 0),
  note text,
  assigned_by uuid references public.profiles(id),
  assigned_at timestamptz not null default now(),
  constraint client_material_assignment_balance check (consumed_quantity + returned_quantity <= assigned_quantity)
);

alter table public.work_order_materials
  add column if not exists client_material_assignment_id uuid references public.client_material_assignments(id) on delete restrict;

create index client_material_assignments_available_idx on public.client_material_assignments(client_id, material_id)
  where consumed_quantity + returned_quantity < assigned_quantity;
create index material_stock_movements_material_created_idx on public.material_stock_movements(material_id, created_at desc);

insert into public.material_inventory(material_id)
select id from public.materials on conflict (material_id) do nothing;

create or replace function public.ensure_material_inventory()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.material_inventory(material_id) values (new.id) on conflict (material_id) do nothing;
  return new;
end;
$$;
drop trigger if exists ensure_material_inventory_after_insert on public.materials;
create trigger ensure_material_inventory_after_insert after insert on public.materials
for each row execute function public.ensure_material_inventory();

create or replace function public.set_material_stock(
  p_material_id uuid, p_quantity numeric, p_note text default null
) returns public.material_inventory
language plpgsql security definer set search_path = public as $$
declare stock public.material_inventory; delta numeric;
begin
  if not public.is_manager() then raise exception 'Solo administración o coordinación puede ajustar existencias'; end if;
  if p_quantity < 0 then raise exception 'La existencia no puede ser negativa'; end if;
  if not exists (select 1 from public.materials where id = p_material_id) then raise exception 'Material no encontrado'; end if;
  insert into public.material_inventory(material_id) values (p_material_id) on conflict (material_id) do nothing;
  select * into stock from public.material_inventory where material_id = p_material_id for update;
  delta := p_quantity - stock.on_hand_quantity;
  if delta = 0 then return stock; end if;
  update public.material_inventory set on_hand_quantity = p_quantity, updated_at = now(), updated_by = auth.uid()
  where material_id = p_material_id returning * into stock;
  insert into public.material_stock_movements(material_id, movement_type, quantity_delta, note, created_by)
  values (p_material_id, case when delta > 0 then 'entrada' else 'ajuste' end, delta, nullif(trim(coalesce(p_note, '')), ''), auth.uid());
  return stock;
end;
$$;

create or replace function public.assign_material_to_client(
  p_client_id uuid, p_material_id uuid, p_quantity numeric, p_note text default null
) returns public.client_material_assignments
language plpgsql security definer set search_path = public as $$
declare stock public.material_inventory; assignment public.client_material_assignments; material_unit text;
begin
  if not public.is_manager() then raise exception 'Solo administración o coordinación puede asignar materiales'; end if;
  if p_quantity <= 0 then raise exception 'La cantidad debe ser mayor que cero'; end if;
  if not exists (select 1 from public.clients where id = p_client_id and is_active) then raise exception 'El cliente no está activo'; end if;
  select unit into material_unit from public.materials where id = p_material_id and is_active;
  if material_unit is null then raise exception 'El material no está activo'; end if;
  insert into public.material_inventory(material_id) values (p_material_id) on conflict (material_id) do nothing;
  select * into stock from public.material_inventory where material_id = p_material_id for update;
  if stock.on_hand_quantity < p_quantity then
    raise exception 'Existencia insuficiente: disponible % %', stock.on_hand_quantity, material_unit;
  end if;
  update public.material_inventory set on_hand_quantity = on_hand_quantity - p_quantity, updated_at = now(), updated_by = auth.uid()
  where material_id = p_material_id;
  insert into public.client_material_assignments(client_id, material_id, assigned_quantity, note, assigned_by)
  values (p_client_id, p_material_id, p_quantity, nullif(trim(coalesce(p_note, '')), ''), auth.uid()) returning * into assignment;
  insert into public.material_stock_movements(material_id, movement_type, quantity_delta, note, created_by)
  values (p_material_id, 'asignacion_cliente', -p_quantity, 'Asignado a cliente: ' || (select name from public.clients where id = p_client_id), auth.uid());
  return assignment;
end;
$$;

create or replace function public.consume_client_material(
  p_work_order_id uuid, p_assignment_id uuid, p_quantity numeric, p_note text default null
) returns public.work_order_materials
language plpgsql security definer set search_path = public as $$
declare target public.work_orders; assignment public.client_material_assignments; material public.materials; result public.work_order_materials;
begin
  if p_quantity <= 0 then raise exception 'La cantidad debe ser mayor que cero'; end if;
  select * into target from public.work_orders where id = p_work_order_id for update;
  if not found then raise exception 'Orden no encontrada'; end if;
  if not public.can_execute_active_work_order(p_work_order_id) then raise exception 'Solo el equipo asignado puede registrar consumo durante la ejecución'; end if;
  select * into assignment from public.client_material_assignments where id = p_assignment_id for update;
  if not found or assignment.client_id <> target.client_id then raise exception 'El material no está asignado a este cliente'; end if;
  if assignment.assigned_quantity - assignment.consumed_quantity - assignment.returned_quantity < p_quantity then raise exception 'La cantidad supera el saldo asignado al cliente'; end if;
  select * into material from public.materials where id = assignment.material_id;
  if not found then raise exception 'Material no encontrado'; end if;
  update public.client_material_assignments set consumed_quantity = consumed_quantity + p_quantity where id = assignment.id;
  insert into public.work_order_materials(work_order_id, material_id, client_material_assignment_id, quantity, unit, unit_cost, note, created_by)
  values (p_work_order_id, material.id, assignment.id, p_quantity, material.unit, material.unit_cost, nullif(trim(coalesce(p_note, '')), ''), auth.uid())
  returning * into result;
  return result;
end;
$$;

create or replace function public.return_client_material(
  p_assignment_id uuid, p_quantity numeric, p_note text default null
) returns public.client_material_assignments
language plpgsql security definer set search_path = public as $$
declare assignment public.client_material_assignments; stock public.material_inventory; result public.client_material_assignments;
begin
  if not public.is_manager() then raise exception 'Solo administración o coordinación puede registrar devoluciones'; end if;
  if p_quantity <= 0 then raise exception 'La cantidad debe ser mayor que cero'; end if;
  select * into assignment from public.client_material_assignments where id = p_assignment_id for update;
  if not found then raise exception 'Asignación no encontrada'; end if;
  if assignment.assigned_quantity - assignment.consumed_quantity - assignment.returned_quantity < p_quantity then
    raise exception 'La devolución supera el saldo pendiente del cliente';
  end if;
  insert into public.material_inventory(material_id) values (assignment.material_id) on conflict (material_id) do nothing;
  select * into stock from public.material_inventory where material_id = assignment.material_id for update;
  update public.client_material_assignments set returned_quantity = returned_quantity + p_quantity where id = assignment.id returning * into result;
  update public.material_inventory set on_hand_quantity = on_hand_quantity + p_quantity, updated_at = now(), updated_by = auth.uid()
  where material_id = assignment.material_id;
  insert into public.material_stock_movements(material_id, movement_type, quantity_delta, note, created_by)
  values (assignment.material_id, 'devolucion_cliente', p_quantity, coalesce(nullif(trim(coalesce(p_note, '')), ''), 'Devolución de cliente'), auth.uid());
  return result;
end;
$$;

alter table public.material_inventory enable row level security;
alter table public.material_stock_movements enable row level security;
alter table public.client_material_assignments enable row level security;
grant select on public.material_inventory, public.material_stock_movements, public.client_material_assignments to authenticated;
grant execute on function public.set_material_stock(uuid, numeric, text), public.assign_material_to_client(uuid, uuid, numeric, text), public.consume_client_material(uuid, uuid, numeric, text), public.return_client_material(uuid, numeric, text) to authenticated;

create policy "inventory readable by authenticated" on public.material_inventory for select to authenticated using (true);
create policy "stock movements readable by managers" on public.material_stock_movements for select to authenticated using (public.is_manager());
create policy "client material assignments visible to relevant users" on public.client_material_assignments for select to authenticated using (
  public.is_manager() or exists (
    select 1 from public.work_orders w where w.client_id = client_material_assignments.client_id
      and (w.assigned_technician_id = auth.uid() or exists (
        select 1 from public.work_order_technicians wt where wt.work_order_id = w.id and wt.technician_id = auth.uid()
      ))
  )
);
