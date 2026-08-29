# Plus Service GT — Field Service Management

MVP de gestión trazable de órdenes de instalación, desarrollado por fases conforme al trabajo de graduación.

## Arquitectura adoptada

- **Next.js + TypeScript**: panel web y BFF desplegable en Vercel.
- **Supabase**: PostgreSQL, Auth, Row Level Security y Storage privado de evidencias/firmas.
- **Interfaz responsiva de campo** (Fase II): ejecución desde el navegador, diseñada para móvil y conectada al mismo esquema seguro de Supabase.
- **IA** (Fases II–III): servicios desacoplados para clasificación de evidencias y predicción, sin falsear métricas ni resultados.

Esta decisión reemplaza el backend Django previsto inicialmente porque Vercel + Supabase proporciona una arquitectura serverless coherente con el despliegue solicitado. Las reglas de negocio críticas se mantienen en PostgreSQL/RPC y RLS, no solo en la interfaz.

## Fases

| Fase | Entregables | Alcance |
|---|---:|---|
| I | 1–2 / Cap. IV | Administración web: autenticación y RBAC; gestión de usuarios, clientes y materiales; creación, consulta, edición y asignación de órdenes. |
| II | 3–4 / Cap. V | Ejecución de campo por el técnico asignado: inicio/cierre GPS, materiales y evidencias privadas. No incluye firma, cierre ni IA validada. |
| III | 5–6 / Cap. VI | Predicción, firma, cierre formal, validación, respaldos y despliegue final. |

## Puesta en marcha local

1. Crea un proyecto de Supabase.
2. Ejecuta las migraciones, en este orden, en el SQL Editor o mediante Supabase CLI:

   - `supabase/migrations/20260828_000001_initial_fsm.sql`
   - `supabase/migrations/20260828_000002_field_execution.sql`
   - `supabase/migrations/20260828_000003_admin_user_management.sql`
   - `supabase/migrations/20260828_000004_phase_scope_and_rbac.sql`
3. Crea al menos un usuario en **Authentication > Users**. Su perfil se genera automáticamente. Actualiza su rol a `admin` para el primer administrador:

   ```sql
   update public.profiles set role = 'admin', full_name = 'Administrador Plus Service' where email = 'tu-correo@empresa.com';
   ```

4. Copia `.env.example` a `.env.local`, e ingresa URL y Publishable Key del proyecto Supabase. Para invitar usuarios desde el panel, añade también `SUPABASE_SERVICE_ROLE_KEY`; esta clave solo se usa en el servidor y nunca debe publicarse.
5. Ejecuta `npm run dev` y abre `http://localhost:3000`.

## Despliegue en Vercel

1. Sube este repositorio a GitHub/GitLab/Bitbucket e impórtalo en Vercel.
2. Define `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` y `SUPABASE_SERVICE_ROLE_KEY` para Preview y Production. La última es secreta y solo se utiliza en la ruta segura de invitación de usuarios; no la expongas ni la subas al repositorio.
3. En Supabase Auth, configura la URL del sitio de Vercel y las URL de redirección autorizadas.
4. Ejecuta el build de Vercel. El framework se detecta automáticamente como Next.js.

## Validaciones esenciales de la base

- RLS limita las órdenes de un técnico a las que tiene asignadas.
- La función `transition_work_order` impide saltos de estado y el cierre sin GPS de inicio/cierre, evidencia, material y firma.
- Los archivos se almacenan en buckets privados con tamaño y tipos MIME restringidos.

## Fase II: ejecución en campo

Desde el detalle de una orden asignada, el técnico o coordinador puede:

1. Registrar la ubicación GPS de inicio. Esto cambia la orden a `en_proceso`.
2. Registrar cada material utilizado, con cantidad positiva y observación opcional.
3. Tomar o cargar evidencias JPEG, PNG o WebP de hasta 10 MB; se almacenan en el bucket privado `evidences`.
4. Registrar ubicación GPS de cierre. Esto deja la orden `pendiente_de_cierre` para la firma y cierre formal de la Fase III.

La segunda migración aplica políticas RLS que restringen esas acciones a coordinadores/administradores o al técnico asignado. La clasificación se muestra como pendiente hasta que exista un modelo de IA entrenado y evaluado; no se fabrican resultados de clasificación.

## Administración de la Fase I

Estas capacidades corresponden a la **Fase I**, no a la ejecución de campo:

- El administrador gestiona usuarios, clientes y materiales. La pantalla **Usuarios** permite consultar cuentas e invitar administradores, coordinadores o técnicos mediante Supabase Auth.
- El administrador y el coordinador crean, consultan, editan y asignan órdenes. Al asignar un técnico a un borrador, la orden pasa a `asignada`.
- El técnico visualiza únicamente sus propias órdenes y no puede modificar catálogos, usuarios ni planificación.

## Fase II: separación operativa

- Solo el técnico asignado puede registrar GPS, materiales y evidencias de la orden asignada.
- Administrador y coordinador pueden consultar el detalle, el historial y el avance, pero no registrar actividades de campo en nombre del técnico.

## Pendiente de Fase III

- Firma digital del cliente y cierre formal validado.
- Predicción de materiales con datos históricos y métricas reales.
- Clasificador de evidencias con modelo entrenado, versión y evaluación documentada.
- Reportes operativos y automatización de respaldo/reentrenamiento.
