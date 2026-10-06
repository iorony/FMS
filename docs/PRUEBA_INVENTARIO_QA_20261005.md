# Prueba operativa de inventario y asignaciones

Realizada el 5 de octubre de 2026 en la base conectada, con autorización del usuario para crear registros QA y autorización adicional para guardar la ubicación del dispositivo únicamente en la orden QA. No se modificaron registros previos ni la asistencia del técnico.

## Registros creados

- Cliente: `Qa inventario 20261005 - no usar`.
- Material: `QA-INV-20261005`, nombre `Qa material inventario 20261005 - no usar`, unidad `Unidad`, costo Q2.50.
- Orden: `PSG-2026-00005`, identificador `46eb5f96-959a-43eb-84ca-7f77d06043a6`, técnico existente `El Tecnito`. Dirección y descripción advierten que no es una instalación real.

Los registros se conservaron para auditoría. La orden permanece **En proceso**, con una llegada GPS autorizada y un consumo; no tiene salida GPS, evidencia, firma ni cierre. No utilizar estos registros en operación real.

## Resultados observados

| Operación | Resultado | Bodega | Disponible en cliente | Consumido |
| --- | --- | ---: | ---: | ---: |
| Crear material y establecer existencia ficticia | Guardado | 20 | 0 | 0 |
| Intentar asignar 21 | Rechazo del servidor por existencia insuficiente; no crea asignación | 20 | 0 | 0 |
| Asignar 8 | Guardado; movimiento de bodega −8 | 12 | 8 | 0 |
| Intentar devolver 9 | Bloqueo del formulario por máximo 8; no se envía devolución | 12 | 8 | 0 |
| Devolver 2 | Guardado; movimiento de bodega +2 | 14 | 6 | 0 |
| Registrar llegada en orden QA | GPS autorizado guardado; cambia a En proceso | 14 | 6 | 0 |
| Intentar consumir 7 | Bloqueo en la app por saldo 6; no guarda consumo | 14 | 6 | 0 |
| Consumir 3 | Guardado en la orden; costo total Q7.50 | 14 | 3 | 3 |
| Intentar devolver 4 después del consumo | Bloqueo del formulario por máximo 3; no se envía devolución | 14 | 3 | 3 |

Conservación de existencias: **14 en bodega + 3 disponibles en cliente + 3 consumidas = 20 iniciales**. El consumo no descuenta otra vez de bodega: la salida ya ocurrió al asignar. La asignación muestra 8 entregadas, 3 usadas y 2 devueltas, con saldo 3.

La persistencia se comprobó recargando el portal administrativo, donde catálogo, asignación y movimientos mostraron los valores finales. El selector del técnico se actualizó automáticamente a saldo 3 después de consumir. Se revisó el resumen y el panel de devolución en web de escritorio y teléfono simulado de 390 × 844.

## Ajustes UX derivados de la prueba

- Errores de asignación junto al formulario, en vez de lejos del control que los produjo.
- Mensajes de negocio de Supabase reconocidos sin exponer detalles técnicos; existencia insuficiente muestra el saldo disponible.
- Columna «Devuelto» en las asignaciones para hacer visible el cálculo del saldo.
- Mensajes de GPS y consumo junto a su bloque en la app técnica.
- Espera GPS limitada a 20 segundos por operación de permiso/ubicación, con aviso persistente de error. El primer intento quedó esperando; el segundo recuperó los controles al agotar el plazo; el último obtuvo y guardó la ubicación. No se simularon coordenadas ni se saltó la validación de estados.
- Aviso de orden atrasada referido al horario vencido, sin afirmar incorrectamente que fue programada antes de hoy.

## Verificaciones y límites

Nueve pruebas automatizadas aprobadas: fechas de calendario, cambio de día en Guatemala, mensajes de inventario y límite de espera. Comprobaciones de tipos web/móvil y revisión de calidad del código sin errores.

Seguimiento del 6 de octubre: se corrigió el contador y filtro «Hoy», que conservaban datos del día anterior por una caché dependiente únicamente de las órdenes. Ahora se recalculan con el reloj y usan el día de Guatemala, independientemente de la zona del dispositivo. Verificación visual tras recargar: inicio muestra 0 programadas para hoy; el listado ya no muestra «Hoy 2» y las órdenes del 5 de octubre dicen «ayer».

Los rechazos de devolución y consumo descritos arriba son comprobaciones de interfaz, no intentos de evadir la validación para probar directamente las funciones del servidor. La asignación inválida sí llegó al servidor. No se probaron concurrencia, otros permisos de usuario ni cierre de la orden.

Una consulta auxiliar de solo lectura con la credencial de servicio recibió permiso insuficiente (`42501`) en las tablas nuevas; no se ampliaron permisos para resolverlo. Los resultados persistidos se verificaron mediante las interfaces autenticadas de administración y técnico.

Esta prueba cubre el ciclo inventario → asignación → devolución/consumo. No certifica cámara, firma ni ejecución de Android/iOS nativos, que siguen pendientes de revisión independiente.
