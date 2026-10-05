# Plus Service GT — Field Service Management

MVP de gestión trazable de órdenes de instalación, desarrollado por fases conforme al trabajo de graduación.

## Arquitectura adoptada

- **Next.js + TypeScript**: panel web y BFF desplegable en Vercel.
- **Supabase**: PostgreSQL, Auth, Row Level Security y Storage privado de evidencias/firmas.
- **Expo / React Native** (Fase II): aplicación móvil para técnicos, conectada al mismo esquema seguro de Supabase. Android es la plataforma de entrega inicial; la base se mantendrá compatible con iOS para una publicación posterior.
- **IA** (Fases II–III): servicios desacoplados para clasificación de evidencias y predicción, sin falsear métricas ni resultados.

Esta decisión reemplaza el backend Django previsto inicialmente porque Vercel + Supabase proporciona una arquitectura serverless coherente con el despliegue solicitado. Las reglas de negocio críticas se mantienen en PostgreSQL/RPC y RLS, no solo en la interfaz.

## Fases

| Fase | Entregables | Alcance |
|---|---:|---|
| I | 1–2 / Cap. IV | Administración web: autenticación y RBAC; gestión de usuarios, clientes y materiales; creación, consulta, edición y asignación de órdenes. |
| II | 3–4 / Cap. V | Aplicación Expo para Android, compatible con iOS, para la ejecución de campo por el técnico asignado: inicio/cierre GPS, materiales y evidencias privadas. |
| III | 5–6 / Cap. VI | Firma de conformidad, cierre formal validado, reporte operativo, bitácora y preparación de despliegue. Las capacidades de IA quedan diseñadas para registrar versiones y métricas reales, sin inventar resultados. |

## Puesta en marcha local

1. Crea un proyecto de Supabase.
2. Aplica las migraciones mediante Supabase CLI: `supabase link --project-ref TU_PROJECT_REF` y `supabase db push`. Consulta [supabase/README.md](supabase/README.md) para distinguir una instalación nueva de una existente y validar las tablas resultantes.
3. Crea al menos un usuario en **Authentication > Users**. Su perfil se genera automáticamente. Actualiza su rol a `admin` para el primer administrador:

   ```sql
   update public.profiles set role = 'admin', full_name = 'Administrador Plus Service' where email = 'tu-correo@empresa.com';
   ```

4. Copia `.env.example` a `.env.local`, e ingresa URL y Publishable Key del proyecto Supabase. Para invitar usuarios desde el panel, añade también `SUPABASE_SERVICE_ROLE_KEY`; esta clave solo se usa en el servidor y nunca debe publicarse.
   Para habilitar la clasificación asistida de evidencias, configura además `OPENAI_API_KEY` y `OPENAI_VISION_MODEL` exclusivamente en el servidor. La imagen se comparte con el proveedor de IA solo cuando un administrador o coordinador solicita la clasificación; la sugerencia queda pendiente de revisión humana.
5. Ejecuta `npm run dev` y abre `http://localhost:3000`.

## Calidad y contratos

Ejecuta `npm run lint`, `npm run typecheck` y `npm test` antes de integrar cambios. Las pruebas unitarias cubren transiciones, cierre, validación de respuestas de IA y composición segura de la URL que usa la app móvil; las restricciones definitivas continúan aplicándose en las RPC y políticas RLS de la migración consolidada.

El contrato de las rutas seguras del servidor está disponible en [`docs/openapi.yaml`](docs/openapi.yaml). Las operaciones de órdenes, GPS, evidencias, materiales, firma y cierre no exponen una API REST directa: se ejecutan contra Supabase con RPC y RLS para preservar las reglas en PostgreSQL.

La ejecución con usuarios y Supabase de demostración se registra en la [matriz de pruebas operativas](docs/MATRIZ_PRUEBAS_OPERATIVAS.md). La matriz separa lo validable en código de lo que requiere GPS, permisos, almacenamiento, respaldo y cuentas reales.

## Ejecución con contenedores

La entrega principal se puede publicar en Vercel. Para una ejecución autocontenida compatible con otro servidor, copia `.env.example` a `.env`, define las variables requeridas y ejecuta `docker compose up --build`. El contenedor publica el panel en `http://localhost:3000`; Supabase sigue siendo el servicio administrado para autenticación, datos y almacenamiento.

## Aplicación móvil para técnicos

El proyecto Expo se encuentra en `mobile/`. Reutiliza el mismo proyecto de Supabase y no requiere una clave de servicio.

1. Copia `mobile/.env.example` a `mobile/.env` y completa `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` con los valores públicos del proyecto.
2. Desde `mobile/`, ejecuta `npm install` y luego `npm run android` para abrir la app en un emulador Android o mediante Expo Go.
3. Inicia sesión con una cuenta cuyo perfil tenga el rol `technician`. La app solo mostrará las órdenes que le estén asignadas.

La aplicación móvil incluye inicio de sesión, listado de órdenes activas, GPS de inicio y cierre, registro de materiales, captura de evidencias y firma de conformidad dibujada directamente en pantalla. El cierre formal se valida por administración o coordinación.

## Despliegue en Vercel

1. Sube este repositorio a GitHub/GitLab/Bitbucket e impórtalo en Vercel.
2. Define `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` y `SUPABASE_SERVICE_ROLE_KEY` para Preview y Production. La última es secreta y solo se utiliza en la ruta segura de invitación de usuarios; no la expongas ni la subas al repositorio.
3. En Supabase Auth, configura la URL del sitio de Vercel y las URL de redirección autorizadas.
4. Ejecuta el build de Vercel. El framework se detecta automáticamente como Next.js.

## Validaciones esenciales de la base

- RLS limita las órdenes de un técnico a las que tiene asignadas.
- Las funciones `transition_work_order` y `register_field_location` impiden saltos de estado. La segunda guarda GPS y transición como una sola operación para no dejar registros parciales.
- Los archivos se almacenan en buckets privados con tamaño y tipos MIME restringidos.

## Fase II: ejecución en campo

La aplicación móvil se desarrollará con **Expo / React Native**. La primera entrega se distribuirá para **Android**; se preservará compatibilidad con **iOS**, sin comprometer su publicación en esta fase.

Desde el detalle de una orden asignada, el técnico asignado puede:

1. Registrar la ubicación GPS de inicio. Esto cambia la orden a `en_proceso`.
2. Registrar cada material utilizado, con cantidad positiva y observación opcional.
3. Tomar o cargar evidencias JPEG, PNG o WebP de hasta 10 MB; se almacenan en el bucket privado `evidences`.
4. Registrar ubicación GPS de cierre. Esto deja la orden `pendiente_de_cierre` para la firma y cierre formal de la Fase III.

Las políticas RLS restringen esas acciones al técnico asignado y dejan a administración/coordinación únicamente la supervisión. Si se configura el proveedor de IA, administración o coordinación puede solicitar una clasificación asistida de una evidencia: se guarda la versión del modelo y su confianza, y el resultado siempre queda pendiente de revisión humana. Sin configuración o cuando el servicio no responde, no se fabrica ninguna clasificación.

## Administración de la Fase I

Estas capacidades corresponden a la **Fase I**, no a la ejecución de campo:

- El administrador gestiona usuarios, clientes y materiales. La pantalla **Usuarios** permite consultar cuentas e invitar administradores, coordinadores o técnicos mediante Supabase Auth.
- El administrador y el coordinador crean, consultan, editan y asignan órdenes. Al asignar un técnico a un borrador, la orden pasa a `asignada`.
- El técnico visualiza únicamente sus propias órdenes y no puede modificar catálogos, usuarios ni planificación.

## Fase II: separación operativa

- Solo el técnico asignado puede registrar GPS, materiales y evidencias de la orden asignada.
- Administrador y coordinador pueden consultar el detalle, el historial y el avance, pero no registrar actividades de campo en nombre del técnico.

## Cierre final y operación

- El técnico asignado registra la firma de conformidad como PNG privado, con nombre de quien recibe el servicio.
- Un administrador o coordinador realiza el cierre formal solo cuando la orden tiene GPS de inicio/cierre, al menos un material, una evidencia y una firma. La validación ocurre en PostgreSQL, no solo en la pantalla.
- **Reportes** muestra el consolidado por orden (materiales, evidencias, firma y estado) para roles administrativos.
- Se registra una bitácora de altas, cambios y cierres de órdenes y firmas en `audit_logs`.
- Las tablas `material_predictions` y `evidences` conservan modelo, versión, confianza y revisión. Administración y coordinación pueden solicitar la clasificación asistida y confirmar o corregir su resultado; se conserva responsable, fecha y nota de revisión. La estimación de materiales usa una línea base explicable (promedio histórico por prioridad) y exige al menos tres órdenes cerradas comparables; nunca se incorpora como consumo sin aceptación explícita. Las vistas de calidad calculan acuerdo de clasificaciones y error absoluto medio de estimaciones con resultados reales.

## Respaldo y publicación

Programa respaldos diarios desde Supabase (Database Backups o `pg_dump` en una tarea segura) y verifica periódicamente la restauración en un entorno no productivo. Antes de publicar, aplica todas las migraciones en el proyecto de Supabase, configura las variables de entorno indicadas y ejecuta `npm run build`. Para la aplicación móvil, publica una compilación Android desde Expo/EAS después de completar las mismas variables públicas.

La restauración de respaldo, el piloto operativo con usuarios y la publicación de una compilación Android son actividades de despliegue que deben dejar evidencia de ejecución; no se consideran comprobadas únicamente por existir en el código.

## Interfaz y experiencia de uso

La capa de presentación se rediseñó para dos perfiles con necesidades distintas: coordinación frente a un escritorio y técnicos con el teléfono en el sitio de instalación.

**Sistema de diseño.** `app/globals.css` define los tokens (color, tipografía, radios, sombras, espaciados). La paleta de estados toma el código de pares T568B del cableado estructurado: azul para *asignada*, naranja de alta visibilidad para *en proceso*, café para *pendiente de cierre* y verde para *cerrada*. El naranja se reserva para el trabajo activo y para el botón principal del técnico, de modo que la acción de campo sea el elemento más visible de la pantalla.

**Navegación.** `AppShell` recibe título, descripción y acciones de cada pantalla, en lugar del encabezado fijo anterior. El menú lateral agrupa Operación, Catálogos y Administración, marca la sección activa con `aria-current` y muestra nombre, rol y salida de sesión. En pantallas menores a 880 px el menú se sustituye por una barra inferior de pestañas con blancos táctiles de 52 px.

**Separación de Inicio y Reportes.** *Inicio* responde a "¿qué requiere una decisión hoy?": agenda del día y lista de órdenes detenidas por una asignación, una firma o una validación pendiente. *Reportes y cumplimiento* responde a "¿cómo se comportó la operación?": histórico por periodo, porcentaje de cierre formal, completitud del expediente documental, duración promedio y descarga en CSV. Ninguna de las dos pantallas repite el propósito de la otra ni el del listado de órdenes, que sirve para buscar.

**Órdenes.** El detalle abre con una línea de estado que fecha cada etapa alcanzada usando la bitácora real. Las tablas se reorganizan como fichas en móvil mediante `data-label`, sin desplazamiento horizontal.

**Ejecución en campo.** Los tres pasos indican siempre por qué una acción está bloqueada en lugar de solo deshabilitar el botón. Las evidencias se muestran como miniaturas con URL firmada temporal, sin exponer el bucket privado. Administración y coordinación ven la misma información en modo consulta.

**Cierre.** La pantalla replica en una lista de verificación las cinco condiciones que valida `close_work_order`, de modo que el usuario sepa qué falta antes de intentar el cierre y no reciba un error de PostgreSQL. La firma de conformidad se captura con el dedo sobre un lienzo y se exporta como PNG al bucket privado `signatures`.

**Accesibilidad y calidad.** Foco visible en todos los controles, enlace para saltar al contenido, campos con etiqueta asociada, mensajes con `role="status"` o `role="alert"`, respeto a `prefers-reduced-motion` y hoja de impresión para los reportes.
