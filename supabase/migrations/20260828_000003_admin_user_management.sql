-- Permite que la ruta de servidor, autenticada con la Service Role Key,
-- complete el perfil y el rol después de enviar una invitación por Supabase Auth.
grant usage on schema public to service_role;
grant select, insert, update, delete on public.profiles to service_role;
