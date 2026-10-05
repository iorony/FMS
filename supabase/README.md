# Aplicación de migraciones de Supabase

## Instalación nueva

1. Crea un proyecto de Supabase y guarda su referencia, URL y clave publicable.
2. Instala la CLI oficial de Supabase, inicia sesión y ejecuta desde la raíz del repositorio:

   ```powershell
   supabase login
   supabase link --project-ref TU_PROJECT_REF
   supabase db push
   ```

   Las migraciones son repetibles en una instalación nueva: la primera crea el esquema y las posteriores consolidan seguridad, historial de técnicos, bitácora, creación de borradores, reasignaciones y cancelación reversible.
3. En Authentication > Users, crea el primer usuario y asígnale el rol administrativo:

   ```sql
   update public.profiles
   set role = 'admin', full_name = 'Administrador Plus Service'
   where email = 'tu-correo@empresa.com';
   ```
4. En Storage, confirma que existan los buckets privados `evidences` y `signatures`, creados por la migración, y realiza una prueba de carga con una cuenta técnica.

## Instalación existente

1. Haz una copia de respaldo antes de tocar el esquema.
2. Ejecuta `supabase migration list` y compáralo con los archivos de `supabase/migrations`.
3. Si el proyecto ya utilizaba las migraciones antiguas de agosto, enlázalo y ejecuta `supabase db push`; no ejecutes de nuevo manualmente la migración inicial consolidada sobre una base que ya contiene las tablas.
4. Después del despliegue, valida OP-01, OP-05 y OP-08 de `docs/MATRIZ_PRUEBAS_OPERATIVAS.md`.

## Verificación posterior

En el SQL Editor, la consulta siguiente debe devolver las tablas clave: `profiles`, `work_orders`, `location_records`, `evidences`, `customer_signatures`, `work_order_timeline_events`, `daily_attendance_records` y `material_predictions`.

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'profiles', 'work_orders', 'location_records', 'evidences',
    'customer_signatures', 'work_order_timeline_events',
    'daily_attendance_records', 'material_predictions'
  )
order by table_name;
```
