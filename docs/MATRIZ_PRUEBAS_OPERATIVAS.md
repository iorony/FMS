# Matriz de pruebas operativas

Usa datos de demostración y una cuenta distinta para cada rol. Registra fecha, responsable, resultado observado y una captura sin datos personales para cada caso.

| ID | Rol y canal | Caso | Resultado esperado |
| --- | --- | --- | --- |
| OP-01 | Administrador · web | Crear cliente, material y técnico; asignar tarifa y jornada. | Solo administración puede administrar catálogos y cuentas. |
| OP-02 | Coordinación · web | Crear una orden, definir ubicación, fecha y técnico; asignarla. | La orden inicia en borrador y cambia a asignada con bitácora. |
| OP-03 | Técnico · app | Abrir su orden asignada, registrar llegada GPS y revisar el estado. | Se registra coordenada y precisión; la orden pasa a en proceso. |
| OP-04 | Técnico · app | Añadir material positivo y evidencia desde cámara o galería. | El consumo y la imagen privada se vinculan a la orden. |
| OP-05 | Técnico · app | Registrar salida GPS, capturar firma y volver a abrir el expediente. | La orden pasa a pendiente de cierre y muestra los cinco requisitos cumplidos. |
| OP-06 | Coordinación · web o app | Solicitar clasificación asistida y confirmar/corregir categoría. | La sugerencia conserva confianza, versión y revisión humana. Si falta configuración, se informa sin inventar resultado. |
| OP-07 | Administración · web o app | Cerrar una orden completa y consultar su reporte. | El cierre formal queda en historial; el reporte refleja GPS, material, evidencia y firma. |
| OP-08 | Técnico · app | Intentar abrir una orden no asignada o cerrar una orden incompleta. | RLS y RPC rechazan la operación; la interfaz muestra un mensaje comprensible. |
| OP-09 | Técnico · app | Registrar entrada y salida de jornada; exportar su reporte. | Se calcula tiempo regular, extra y pago estimado según la configuración. |
| OP-10 | Administrador · Supabase | Restaurar una copia de respaldo en un entorno de prueba. | Se recuperan esquema, políticas y datos de demostración sin afectar producción. |
| OP-11 | Administrador · web | Registrar existencia, asignar material a un cliente y revisar el saldo. | La asignación disminuye exactamente el saldo de bodega y crea un saldo independiente para el cliente. |
| OP-12 | Técnico · web o app | Consumir material en una orden de un cliente con saldo asignado. | Solo puede elegir asignaciones de ese cliente; el consumo reduce el saldo asignado y queda vinculado a la orden. |
| OP-13 | Técnico · web o app | Intentar consumir más de lo asignado o usar material de otro cliente. | La operación se rechaza sin crear consumo ni modificar saldos. |
| OP-14 | Administrador · web | Registrar devolución parcial de material entregado a un cliente. | Se reduce el saldo del cliente y la cantidad devuelta regresa a bodega con trazabilidad. |

## Criterios de salida

La validación operativa se considera aprobada cuando OP-01 a OP-09 y OP-11 a OP-14 cuentan con evidencia y no hay fallos críticos de permisos, transiciones, inventario, carga de archivos ni cierre. OP-10 debe realizarse antes de producción y repetirse conforme a la política de respaldo definida por la organización.
