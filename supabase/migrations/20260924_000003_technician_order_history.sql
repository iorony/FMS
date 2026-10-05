-- Conserva el historial completo para técnicos sin ampliar permisos de escritura.

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
