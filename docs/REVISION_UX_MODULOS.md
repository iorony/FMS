# Revisión de interacción de los módulos

Revisión del código y flujos realizada el 5 de octubre de 2026. No sustituye las pruebas visuales con sesiones reales.

| Módulo | Resultado |
| --- | --- |
| Inicio | Acciones por orden. Asignar abre su edición. Una firma recibida ya no se presenta como garantía de expediente completo. |
| Clientes | Alta desplegable; acciones junto al registro; edición en fila propia con guardar y cancelar. |
| Materiales | Datos y existencia por material; ajuste desplegable y devolución dentro de la asignación. Reinicio de formularios asíncronos corregido. |
| Usuarios | Invitación desplegable; edición y contraseña dentro de cada persona; descarte explícito y resultados visibles al cerrar el panel. |
| Órdenes | Creación y edición con retorno explícito. Descartar cambios se distingue de cancelar la orden. |
| Ejecución | Pasos por actividad. Consumo y fotos bloqueados cuando la orden deja de estar en proceso. |
| Firma y cierre | Firma dentro de su bloque; requisitos y validación dentro del cierre formal. |
| Estimaciones | Generación y aceptación dentro de la estimación de la orden. |
| Reportes | Filtros junto al listado; exportación a nivel de reporte. |
| Acceso y navegación | Etiquetas y mensajes en login; navegación por rol y barra móvil. |
| Aplicación móvil | Altas e invitación desplegables; edición de catálogo y usuarios con descarte/cancelación. |

## Verificación visual web realizada

Inspección con sesión administrativa real en el navegador local, el 5 de octubre de 2026. Se revisaron escritorio (1440 × 900), ancho intermedio y teléfono simulado (390 × 844).

Se comprobaron Inicio, Clientes, Materiales, Usuarios, creación/listado/detalle/edición de Órdenes y reportes de asistencia y órdenes. Se abrieron paneles de edición de clientes, materiales y usuarios, ajuste de existencias y los bloques de conformidad, cierre y estimación de una orden. No se guardaron cambios ni se eliminaron registros durante la inspección.

Correcciones visuales comprobadas después de aplicarlas:

- Tablas con presentación por registro en anchos intermedios, evitando que las acciones de Materiales queden recortadas.
- Formulario de órdenes en una columna en anchos intermedios; campos contenidos sin solapamientos.
- Indicadores en dos columnas en pantallas intermedias.
- Selector deshabilitado con una sola flecha, sin repetición del fondo.
- Flecha de seguimiento correctamente ubicada en teléfono.

## Alcance pendiente

La vista de teléfono corresponde a la web adaptable, no a la aplicación nativa Expo. Faltan la inspección visual con rol técnico, la aplicación nativa y las interacciones de asignación/devolución con datos preparados para prueba. Esta inspección tampoco certifica guardado, validaciones del servidor, foco por teclado ni todos los estados de error; requieren pruebas funcionales separadas. No se volvió a probar el inicio de sesión para preservar la sesión activa.

## Segunda pasada: técnico en Expo web

Se continuó el 5 de octubre de 2026 con la sesión técnica activa en `localhost:8081`, a 390 × 844 y ancho de escritorio. Se revisaron Inicio, listado y filtro de Órdenes, detalle en proceso, detalle pendiente de cierre, selector de materiales, galería de evidencia y Mis horas. Se comprobó de nuevo el formulario administrativo de asignación en el portal, tanto en escritorio como en teléfono. No se alteraron registros, GPS ni firmas.

Hallazgos y ajustes:

- Sin saldo asignado, el formulario de consumo ahora deshabilita los controles, explica que administración debe asignar materiales y permite actualizar. Distingue carga, error con reintento y ausencia de saldo. Después de consumir se vuelve a consultar el saldo; la actualización manual descarta la selección anterior.
- Evidencias sin archivo accesible dejaban un indicador de carga permanente. Se agregó un error visible y reintento, incluidos los errores de descarga de imagen.
- El componente nativo de firma no admite Expo web. En esta vista se muestra una explicación y acceso a la misma orden en el portal web configurado, sin botones de firma inoperantes. **Esto no implementa captura de firma en Expo web ni verifica la captura Android/iOS.**
- La presencia en sitio distingue una visita ya finalizada; salida restringida al técnico responsable.
- Las fechas de jornada SQL se mostraban un día antes al interpretarse como medianoche UTC. Se conserva el día calendario. Una jornada sin salida ya no dice «Sin programación» ni «Tarifa pendiente» cuando tiene tarifa.
- La exportación CSV dispone de descarga para navegador, manteniendo compartir en la aplicación instalada. La interfaz confirmó la preparación de la exportación; no se certificó el contenido descargado.

La base actual no tiene asignaciones a clientes: se verificó el estado vacío, pero no una devolución ni consumo nuevo. Se detectó además una jornada histórica cuya fecha de jornada no coincide con la fecha GPS; requiere revisar el dato de origen, no se modificó para ocultar la discrepancia.

Siguen pendientes: administración en Expo, sesión técnica del portal principal, ejecución nativa Android/iOS (GPS, cámara y firma), y pruebas de asignar/consumir/devolver con registros de prueba autorizados. La segunda pasada amplía el alcance anterior, no lo reemplaza por una certificación funcional completa.

## Tercera pasada: ciclo de inventario con datos QA autorizados

Se creó un cliente, un material y la orden `PSG-2026-00005`, todos identificados como prueba. Se verificaron existencia inicial 20, asignación 8, devolución 2 y consumo 3 por Q7.50. Resultado persistido: bodega 14, saldo en cliente 3 y consumo 3. También se comprobaron los límites de asignación, consumo y devolución. La llegada GPS solo se registró en esa orden con autorización adicional del usuario.

Se corrigieron mensajes alejados del formulario, errores de negocio demasiado genéricos y espera GPS sin límite; se agregó «Devuelto» al resumen. Se volvió a comprobar el resumen y el panel de devolución en escritorio y teléfono simulado. Los registros QA permanecen separados para auditoría, con la orden en proceso y sin cierre.

Detalle de operaciones, alcance y límites: [Prueba operativa de inventario](PRUEBA_INVENTARIO_QA_20261005.md). Las pruebas de asignar/consumir/devolver ya no están pendientes para este caso concreto; los demás pendientes nativos y de roles de la segunda pasada siguen vigentes.

## Cuarta pasada: administración en Expo (6 de octubre)

Sesión administrativa disponible. Se inspeccionaron Inicio, Órdenes, Crear, Asistencia, Reporte de órdenes, Clientes, Materiales y Acceso. Se comprobaron el selector de clientes y el filtro de atrasadas (2 resultados), sin guardar órdenes ni modificar personas o jornadas. Revisión visual de escritorio y teléfono simulado de 390 × 844; Clientes, Materiales y el listado filtrado se verificaron en teléfono.

Ajustes aplicados:

- Materiales consulta `material_inventory`, la misma existencia del portal: el material QA muestra 14 unidades y el consumo existente de 3 por Q7.50. El catálogo ya no oculta la bodega.
- Acceso explícito al inventario y asignaciones del portal, indicando que ajustes, entregas y devoluciones todavía se gestionan allí. No se presenta esto como gestión de inventario íntegramente nativa.
- Eliminación de clientes/materiales dentro de edición, con confirmación explícita y recomendación de desactivar para conservar historial. La confirmación ya no depende de `Alert.alert`, que no ofrece el mismo flujo en navegador.
- Eliminación de cuentas dentro del panel de edición, sin cambiar permisos ni efectuar eliminaciones.
- Botones de catálogo y acceso con área táctil mínima de 44; alta y edición del catálogo no quedan abiertas simultáneamente. La creación se cierra después de guardar.
- Nombre, SKU y unidad obligatorios antes del guardado. Se probó nombre vacío únicamente en el formulario QA: aviso junto al editor, sin petición de actualización; se descartó el formulario.
- Crear orden distingue carga, error y ausencia real de clientes; ya no muestra «sin clientes» durante la carga y dirige al módulo Clientes disponible en Expo.

Las nueve pruebas automatizadas, tipos móviles y revisión de calidad pasaron. No se probaron nuevas eliminaciones, invitaciones, cambios de contraseña, rol ni cierres. Pendientes: gestión de movimientos/asignaciones directamente en Expo, ejecución instalada Android/iOS y verificación de cámara/firma; las comprobaciones visuales en navegador no certifican esos flujos.

## Quinta pasada: gestión de inventario integrada en Expo

Implementado el pendiente de inventario de la cuarta pasada: Materiales permite entregar a clientes, devolver sobrantes y ajustar la existencia final de bodega directamente en Expo. Consulta saldos asignados/usados/devueltos y los últimos 12 movimientos. Usa `material_inventory`, `client_material_assignments` y las mismas funciones atómicas `assign_material_to_client`, `return_client_material` y `set_material_stock` del portal; no crea otro catálogo ni cambia permisos.

Cada operación tiene su apartado y motivo, con selección buscable de materiales/clientes activos, stock visible, validación de cantidades y bloqueo de doble envío. Devolución muestra errores junto a la asignación correspondiente. Una consulta fallida no habilita movimientos con saldos supuestos. Guardar actualiza el inventario y el catálogo.

Verificación visual en Expo navegador a 390 × 844: saldo QA 8 asignadas, 3 consumidas, 2 devueltas, 3 disponibles; selector con bodega 14; rechazo local de entrega 15, devolución 4 y ajuste vacío. Se consultaron movimientos existentes +20, −8 y +2. No se enviaron movimientos válidos nuevos durante esta pasada: el guardado nuevo desde Expo queda pendiente de prueba operativa, aunque utiliza las operaciones de servidor ya verificadas en el portal. Android/iOS instalados, cámara y firma siguen pendientes.

Doce pruebas automatizadas aprobadas, incluyendo cantidades vacías/negativas, coma decimal, límite de dos decimales y saldo sin residuos; comprobación de tipos móviles aprobada. La revisión con la habilidad de control del navegador permitió comprobar controles y mensajes en el contexto real de cada operación.

La revisión de calidad general y la comprobación adicional de los dos archivos móviles nuevos (incluidos explícitamente, porque la configuración general excluye `mobile`) terminaron sin errores.
