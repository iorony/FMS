-- Ejecutar después de reset_demo.sql y de scripts/seed-demo-data.mjs --seed-only.
-- Completa el inventario de la demostración con existencias, ingresos,
-- asignaciones a clientes y consumos vinculados a las órdenes demo.

begin;

with manager as (
  select id from public.profiles where role = 'admin' and is_active limit 1
), consumption as (
  select o.client_id, wom.material_id, sum(wom.quantity) as consumed_quantity
  from public.work_order_materials wom
  join public.work_orders o on o.id = wom.work_order_id
  where o.code like 'DEMO-2026-%'
  group by o.client_id, wom.material_id
)
insert into public.client_material_assignments (
  client_id, material_id, assigned_quantity, consumed_quantity, note, assigned_by
)
select c.client_id, c.material_id,
  c.consumed_quantity + case when m.unit = 'metro' then 20 else 4 end,
  c.consumed_quantity,
  'Reserva operativa para demostración.', manager.id
from consumption c
join public.materials m on m.id = c.material_id
cross join manager;

update public.work_order_materials wom
set client_material_assignment_id = cma.id
from public.work_orders o, public.client_material_assignments cma
where o.id = wom.work_order_id
  and o.code like 'DEMO-2026-%'
  and cma.client_id = o.client_id
  and cma.material_id = wom.material_id
  and cma.note = 'Reserva operativa para demostración.';

with manager as (
  select id from public.profiles where role = 'admin' and is_active limit 1
), stock(sku, opening_quantity, available_quantity) as (
  values
    ('DEMO-CAT6-305', 600::numeric, 225::numeric),
    ('DEMO-RJ45', 200::numeric, 132::numeric),
    ('DEMO-KEYSTONE', 80::numeric, 80::numeric),
    ('DEMO-FACEPLATE', 80::numeric, 80::numeric),
    ('DEMO-CAN-20', 240::numeric, 240::numeric),
    ('DEMO-TUBO-3-4', 120::numeric, 120::numeric),
    ('DEMO-SW8', 12::numeric, 12::numeric),
    ('DEMO-AP', 10::numeric, 10::numeric)
)
update public.material_inventory inventory
set on_hand_quantity = stock.available_quantity,
    updated_at = now(),
    updated_by = manager.id
from stock
join public.materials material on material.sku = stock.sku
cross join manager
where inventory.material_id = material.id;

with manager as (
  select id from public.profiles where role = 'admin' and is_active limit 1
), stock(sku, opening_quantity, available_quantity) as (
  values
    ('DEMO-CAT6-305', 600::numeric, 225::numeric), ('DEMO-RJ45', 200::numeric, 132::numeric),
    ('DEMO-KEYSTONE', 80::numeric, 80::numeric), ('DEMO-FACEPLATE', 80::numeric, 80::numeric),
    ('DEMO-CAN-20', 240::numeric, 240::numeric), ('DEMO-TUBO-3-4', 120::numeric, 120::numeric),
    ('DEMO-SW8', 12::numeric, 12::numeric), ('DEMO-AP', 10::numeric, 10::numeric)
)
insert into public.material_stock_movements (material_id, movement_type, quantity_delta, note, created_by)
select material.id, 'entrada', stock.opening_quantity, 'Inventario inicial para demostración.', manager.id
from stock join public.materials material on material.sku = stock.sku cross join manager;

with manager as (
  select id from public.profiles where role = 'admin' and is_active limit 1
)
insert into public.material_stock_movements (material_id, movement_type, quantity_delta, note, created_by)
select material_id, 'asignacion_cliente', -sum(assigned_quantity), 'Material reservado para clientes de demostración.', manager.id
from public.client_material_assignments cross join manager
where note = 'Reserva operativa para demostración.'
group by material_id, manager.id;

commit;
