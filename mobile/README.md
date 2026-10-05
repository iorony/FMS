# Plus Service FMS · Aplicación de campo (Expo / React Native)

Aplicación móvil del sistema de gestión de servicios de campo. Comparte base de datos,
autenticación y reglas de acceso (RLS) con la aplicación web mediante Supabase, y ahora
replica su alcance funcional completo por rol.

## Puesta en marcha

```bash
npm install
cp .env.example .env.local   # configura URL y llave publicable de Supabase
npm start
```

Antes de una compilación, ejecuta `npm run typecheck` y `npm run doctor`. Para generar una APK de distribución interna usa `npm run build:android:preview`; para el paquete de publicación usa `npm run build:android`. Los comandos descargan la versión actual de EAS CLI, requieren una cuenta de Expo/EAS y las variables públicas configuradas.

`EXPO_PUBLIC_WEB_APP_URL` debe apuntar al servidor web desplegado: además de
usarse para el restablecimiento de contraseñas, ahora también enruta la
invitación, edición y eliminación de cuentas, y la clasificación de
evidencias con IA — funciones que corren en el servidor Next.js.

## Paridad con la versión web

Cada pantalla replica exactamente su equivalente web, para el rol correspondiente:

| Web | Nativa | Alcance |
| --- | --- | --- |
| `/dashboard` | Inicio | Métricas del día, "Requiere tu atención", agenda |
| `/ordenes` | Órdenes | Búsqueda y filtro por estado |
| `/ordenes/nueva` | Crear | Alta de orden, búsqueda de empresa, GPS y punto manual en mapa |
| `/ordenes/[id]` | Detalle de orden | GPS, materiales, evidencias, firma, bitácora, estimación IA de materiales |
| `/ordenes/[id]/editar` | Editar orden | Reasignación, prioridad, fecha/hora, cancelación en borrador |
| `/reportes` | Asistencia y preliquidación | Fechas, técnico, jornada, cálculo de pago y exportación CSV |
| `/reportes/ordenes` | Reporte de órdenes | Módulo independiente de estados, cumplimiento y exportación CSV |
| `/clientes` | Clientes | Alta, edición y eliminación (solo administración) |
| `/materiales` | Materiales | Alta, edición y eliminación (solo administración) |
| `/usuarios` | Acceso | Invitar, editar, eliminar (admin) · restablecer contraseña (admin y coordinación para técnicos) |

La visibilidad de órdenes del técnico ya no se limita a un subconjunto de
estados: igual que en la web, la política de seguridad (RLS) es la que
decide qué filas ve — sus órdenes asignadas en cualquier estado, incluidas
cerradas o canceladas.

## Estructura

| Ruta | Contenido |
| --- | --- |
| `App.tsx` | Sesión, carga de datos, pestañas y modales compartidos |
| `theme.ts` | Tokens de color, estados y prioridades, alineados con la web |
| `types.ts` | Tipos de dominio y selección de columnas de las órdenes |
| `lib/` | Cliente de Supabase, formato de fechas y llamada a la API admin web |
| `components/` | Piezas reutilizables: botones, avisos, tarjetas, selector, pestañas |
| `screens/` | Una pantalla por tarea: ingreso, inicio, detalle, edición, catálogos, reportes, acceso |

## Decisiones de interfaz

**Selector propio en lugar de `Alert`.** Los catálogos (clientes, técnicos, materiales,
roles) se eligen con una hoja inferior con búsqueda (`components/select-sheet.tsx`),
no con `Alert.alert`, que en Android admite como máximo tres botones.

**Avisos en línea en lugar de diálogos.** Guardar un cambio no interrumpe con un
diálogo modal; la confirmación aparece como aviso en la misma pantalla. `Alert` se
reserva para lo irreversible: cerrar, cancelar o eliminar.

**El expediente manda.** El detalle de la orden lee del servidor los registros de GPS,
materiales, evidencias, firma y bitácora de estados. La lista de verificación replica
las cinco condiciones que valida `close_work_order`, de modo que el cierre no falle
con un error de base de datos.

**Galería de evidencias con revisión.** El técnico puede tomar una fotografía o adjuntarla desde la galería y ve sus fotografías en una carpeta con
vista previa y visor a pantalla completa. Administración y coordinación, además, pueden
asignar categoría final, dejar una nota y pedir una sugerencia de clasificación por IA
(mismo endpoint que usa la web) antes de confirmarla.

**Nunca bloquear sin explicar.** Cada acción deshabilitada indica el motivo
("Primero registra tu llegada al sitio") en vez de mostrar solo un botón apagado.

**Trabajo con una mano.** Blancos táctiles de 48 px o más, botones de campo de 54 px,
barra de pestañas desplazable con iconos dibujados con vistas (sin depender de
glifos tipográficos) y `KeyboardAvoidingView` en los formularios.

**Estados de error con salida.** Si falla la carga, la pantalla ofrece reintentar en
lugar de quedar vacía detrás de un diálogo.
