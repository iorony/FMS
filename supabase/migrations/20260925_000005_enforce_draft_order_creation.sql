-- Una orden siempre nace en Borrador. Las transiciones posteriores se hacen
-- únicamente mediante las RPC autorizadas.
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
