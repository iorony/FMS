# Auditoría UI/UX — Plus Service GT

Fecha: 24 de septiembre de 2026  
Alcance: panel Next.js y aplicación Expo/React Native. La revisión se hizo sobre rutas, componentes compartidos, `app/globals.css`, flujos de órdenes y pantallas móviles existentes.

## Resultado ejecutivo

La base del producto ya resuelve los riesgos principales de un FSM: navegación por rol, ejecución de campo separada, bitácora, estado semántico, checklist de cierre, controles táctiles y vistas móviles en ficha. No se detectó un P0 estático que justifique alterar permisos, datos o la máquina de estados.

Los cambios de este ciclo atacan P1 de priorización: vistas rápidas y progreso documental en listados, junto con un siguiente paso contextual en el detalle web y móvil. No se modificaron RLS, RPC, contratos ni transiciones de estado.

## Hallazgos y decisiones

| Problema | Impacto | Severidad | Solución propuesta / aplicada | Beneficio operativo | Componentes reutilizables |
| --- | --- | --- | --- | --- | --- |
| El listado web exigía combinar filtros manualmente para encontrar trabajo de hoy, atrasado, sin asignar o por cerrar. | Se pierde tiempo de coordinación y se elevan omisiones. | P1 / Alto | Aplicadas vistas rápidas URL-driven: Hoy, Atrasadas, Sin asignar, En proceso, Por cerrar y Cerradas. | Priorización en un toque y enlaces compartibles. | `AutoFilterForm`, `AppShell`, filtros existentes. |
| El listado no mostraba evidencia suficiente del avance del expediente ni su actualización. | Gestión debía abrir varias órdenes para conocer bloqueos. | P1 / Alto | Aplicadas columnas de ubicación, progreso documental, requisitos faltantes y última actualización. | Menos navegación y mejor triaje. | `StatusBadge`, `PriorityTag`, `order-health`, tabla apilada. |
| En móvil solo había filtros por estado; no había una vista inmediata de hoy, atrasos o borradores sin responsable. | La supervisión móvil no tenía la misma capacidad de priorización que la web. | P1 / Alto | Aplicadas vistas rápidas equivalentes en los chips nativos. | Seguimiento fuera del escritorio sin cambiar el formato de fichas. | `OrderFilters`, `OrderCard`, `Input`. |
| El detalle muestra datos y checklist, pero el siguiente paso requería interpretarlos. | Aumenta la carga cognitiva bajo presión, especialmente en campo. | P1 / Alto | Aplicado bloque “Siguiente paso” derivado de estado, rol y requisitos reales, en web y app nativa. | Una acción evidente para desbloquear la orden. | `StatusFlow`, `Check`, `Card`, tokens semánticos. |
| Los colores de estado anteriores no coincidían con la semántica acordada. | Riesgo de interpretación errónea al escanear estados. | P1 / Alto | Aplicados tokens azul/asignada, naranja/en proceso, café/pendiente y verde/cerrada en ambas plataformas. | Reconocimiento consistente sin depender solo del texto. | `globals.css`, `mobile/theme.ts`, `StatusBadge`, `Badge`. |
| La tabla de órdenes aún no incorpora ordenamiento explícito ni paginación. | Puede dificultar gestión de un volumen alto de órdenes. | P2 / Medio | Diseñar paginación y ordenamiento respaldados por consulta, después de medir volumen y casos de uso. | Escalabilidad del listado sin cargar registros innecesarios. | Ruta `/ordenes`, `AutoFilterForm`. |
| Los KPI del dashboard informan pero no enlazan hoy a vistas filtradas. | Se obliga a repetir filtros al pasar de resumen a operación. | P2 / Medio | Convertir métricas con destino claro en enlaces a las vistas rápidas del listado. | Menos pasos de navegación. | `AppShell`, `/ordenes?view=…`, `stats`. |
| El formulario es claro y agrupado, pero los datos avanzados podrían plegarse cuando el equipo crezca. | Ruido visual potencial en órdenes simples. | P2 / Bajo | Validar con usuarios si ayudantes y ubicación deben iniciar plegados; no modificar antes de observar uso. | Menor carga cognitiva sin ocultar capacidad. | `OrderForm`, `EditOrderForm`, `SiteLocationPicker`. |

## Mejoras por área y rol

### Coordinación y administración

- El listado web ahora concentra planificación, atrasos, asignación y progreso de cierre.
- El detalle expresa el siguiente paso antes de los datos de contexto; la timeline y la bitácora continúan siendo la fuente de trazabilidad.
- Reportes ya distinguen cumplimiento y órdenes que requieren seguimiento; la siguiente mejora viable es enlazar KPI a filtros, no crear gráficas decorativas.

### Técnico

- La app conserva fichas en vez de tablas, controles de al menos 48 px y el flujo secuencial de campo.
- Las vistas rápidas móviles permiten ir a lo programado hoy o a una visita atrasada sin teclear una búsqueda.
- El detalle muestra la acción que desbloquea la visita antes del checklist: GPS, materiales, evidencia, salida o firma.

### Componentes y design system

- Se mantienen tokens centralizados web/móvil y la escala actual de espaciado.
- `Badge`/`StatusBadge` comunican estado con texto y color; el nuevo bloque contextual reutiliza las mismas intenciones semánticas.
- Cargas de pantalla, acciones puntuales, errores y estados vacíos ya usan `Loading`, botones ocupados, mensajes inline y `EmptyState`; no se agregaron dependencias.

## Roadmap incremental

1. **P0 — Continuo:** preservar pruebas de roles, RLS, RPC y transiciones; no hay cambio P0 de UI pendiente identificado de forma estática.
2. **P1 — Completado en este ciclo:** consolidar tokens, siguiente paso contextual, vistas rápidas y progreso de órdenes en web/móvil.
3. **P1 — Validación operativa:** probar con coordinación y técnicos si las etiquetas de bloqueo coinciden con el lenguaje de operación real; ajustar microcopy, no reglas de negocio.
4. **P2 — Productividad:** enlazar KPI del dashboard con vistas filtradas, incorporar ordenamiento/paginación cuando el volumen lo requiera y medir su uso.
5. **P2 — Refinamiento:** evaluar progressive disclosure para ayudantes y localización avanzada; reforzar pruebas manuales con teclado, zoom 200 % y lectores de pantalla.

## Criterios de regresión

- Una vista rápida no cambia permisos: la seguridad continúa en RLS.
- El progreso documental es informativo; el cierre continúa validándose en la base de datos.
- El CTA contextual no ejecuta acciones ni permite saltar estados.
- En móvil las órdenes se mantienen como fichas y no se introduce desplazamiento horizontal.
