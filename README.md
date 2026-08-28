# Plus Service GT — Field Service Management

MVP de gestión trazable de órdenes de instalación, desarrollado por fases conforme al trabajo de graduación.

## Arquitectura adoptada

- **Next.js + TypeScript**: panel web y BFF desplegable en Vercel.
- **Supabase**: PostgreSQL, Auth, Row Level Security y Storage privado de evidencias/firmas.
- **Flutter** (Fase II): aplicación móvil para técnicos que consumirá el mismo esquema de Supabase y funciones seguras.
- **IA** (Fases II–III): servicios desacoplados para clasificación de evidencias y predicción, sin falsear métricas ni resultados.

Esta decisión reemplaza el backend Django previsto inicialmente porque Vercel + Supabase proporciona una arquitectura serverless coherente con el despliegue solicitado. Las reglas de negocio críticas se mantienen en PostgreSQL/RPC y RLS, no solo en la interfaz.

## Fases

| Fase | Entregables | Alcance |
|---|---:|---|
| I | 1–2 / Cap. IV | Base de proyecto, Supabase Auth/RLS, roles, catálogo de clientes/materiales y CRUD web de órdenes. |
| II | 3–4 / Cap. V | App Flutter, inicio/cierre GPS, materiales, evidencias y clasificación IA. |
| III | 5–6 / Cap. VI | Predicción, firma, cierre formal, validación, respaldos y despliegue final. |

## Puesta en marcha local

1. Crea un proyecto de Supabase.
2. Ejecuta `supabase/migrations/20260828_000001_initial_fsm.sql` en el SQL Editor o mediante Supabase CLI.
3. Crea al menos un usuario en **Authentication > Users**. Su perfil se genera automáticamente. Actualiza su rol a `admin` para el primer administrador:

   ```sql
   update public.profiles set role = 'admin', full_name = 'Administrador Plus Service' where email = 'tu-correo@empresa.com';
   ```

4. Copia `.env.example` a `.env.local`, e ingresa URL y Publishable Key del proyecto Supabase.
5. Ejecuta `npm run dev` y abre `http://localhost:3000`.

## Despliegue en Vercel

1. Sube este repositorio a GitHub/GitLab/Bitbucket e impórtalo en Vercel.
2. Define `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` para Preview y Production. No subas claves ni secretos al repositorio.
3. En Supabase Auth, configura la URL del sitio de Vercel y las URL de redirección autorizadas.
4. Ejecuta el build de Vercel. El framework se detecta automáticamente como Next.js.

## Validaciones esenciales de la base

- RLS limita las órdenes de un técnico a las que tiene asignadas.
- La función `transition_work_order` impide saltos de estado y el cierre sin GPS de inicio/cierre, evidencia, material y firma.
- Los archivos se almacenan en buckets privados con tamaño y tipos MIME restringidos.

## Pendiente de Fase II

- Crear usuarios con flujo de invitación administrativo.
- Edición/archivado de catálogos y órdenes.
- App Flutter, ubicación, cámara, firma, carga segura de archivos y servicios de IA.
