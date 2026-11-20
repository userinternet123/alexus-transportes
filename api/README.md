# ALEXUS Transportes — API

NestJS 11 · Prisma 6 · PostgreSQL 16 · Zod · Argon2 · Pino.  Prefijo: `/api/v1` · Swagger: `/api/docs` (fuera de producción).

## Convenciones
- **Autenticación**: `Authorization: Bearer <accessToken>`; sede de trabajo en `X-Sucursal-Id`.
- **Respuestas**: `{ data, meta? , message? }`. **Errores**: `{ ok:false, codigo, error, message, detalle?, requestId }` con `codigo` estable (`LIMITE_SUCURSALES`, `LICENCIA_REQUERIDA`, `VALIDACION`…).
- **Listas**: `?page=1&limit=25&q=texto&activo=true|false|todos` (`limit=0` = todo, tope 5000).
- **Dinero**: siempre `decimal.js` (`common/money.ts`); jamás `number` para cálculos.
- **Transacciones**: `prisma.enTransaccion(tx => …)`.

## Endpoints principales
| Módulo | Endpoints |
|---|---|
| Auth | `POST /auth/login` · `/auth/refresh` · `/auth/logout` · `GET /auth/me` · `POST /auth/cambiar-password` |
| Seguridad | `/seguridad/usuarios` · `/seguridad/roles` · `PUT /seguridad/roles/:id/permisos` · `/seguridad/permisos` · `/seguridad/auditoria` |
| Catálogos (CRUD genérico) | `/catalogos/{paises,departamentos,municipios,marcas,sucursales,rutas}` · `/terceros/{clientes,proveedores,talleres}` · `/tarifas` · `/flota/{cabezales,remolques,documentos}` · `/pilotos` · `/llantas` · `/mantenimiento/{planes,repuestos}` · `/rrhh/{departamentos,puestos,empleados}` |
| Gastos | `GET /gastos` · `POST /gastos` · `POST /gastos/:id/anular` · `/gastos/categorias` |
| Viajes | `GET/POST /viajes` · `GET/PUT /viajes/:id` · `POST /viajes/:id/{iniciar,finalizar,liquidar,cancelar}` · `POST/DELETE /viajes/:id/costos[/:costoId]` · `POST/DELETE /viajes/:id/anticipos[/:anticipoId]` · `POST /viajes/cotizar` · `GET /viajes/costo-km` · `GET /viajes/rentabilidad` |
| Cotizaciones | `GET/POST /cotizaciones` · `GET /cotizaciones/:id` · `PUT /cotizaciones/:id/estado` · `POST /cotizaciones/:id/convertir` |
| Combustible | `GET /combustible` · `GET /combustible/mias` · `GET /combustible/rendimiento` · `POST /combustible` · `PUT /combustible/:id/anular` |
| Inspección pre viaje | `GET /inspecciones/puntos` · `GET/POST /inspecciones` · `GET /inspecciones/:id` |
| Casos | `GET/POST /casos` · `GET/PUT /casos/:id` · `PUT /casos/:id/estado` · `GET /casos/responsables` |
| Taller | Fase 2 (modelos ya en `schema.prisma`: `OrdenTrabajo`, `MontajeLlanta`) |
| Reportes | `GET /reportes` · `GET /reportes/:clave` · `GET /reportes/:clave/excel` |
| RRHH | `/rrhh/asistencias` · `/rrhh/ausencias` (+ `aprobar`/`rechazar`) · `POST /rrhh/planillas/generar` · `PUT /rrhh/planillas/:id/empleados/:empleadoId` · `POST /rrhh/planillas/:id/aprobar` |
| Sistema | `GET /health` · `/config/parametros` |

## Agregar un catálogo nuevo
1. Modelo en `schema.prisma` con campo `activo` → `npx prisma migrate dev --name <cambio>` (la migración se sube al repositorio: el instalador corre `migrate deploy`).
2. Una entrada en `modules/catalogos/catalogos.definiciones.ts`.
3. Una entrada en `apps/web/scripts/generar-configs.mjs` → `node scripts/generar-configs.mjs`.

## Agregar un reporte nuevo
Una entrada en `modules/reportes/reportes.registro.ts` (parámetros, columnas, SQL parametrizado). Aparece automáticamente en el Centro de Reportes para quien tenga el permiso.

## Reglas de la fase 1 (resumen)
- **Viaje**: `PROGRAMADO → EN_RUTA → FINALIZADO → LIQUIDADO` (o `CANCELADO`). Al programar se valida cabezal activo y no en taller, licencia del piloto vigente y seguro/tarjeta de circulación sin vencer. El cobro sale de la tarifa vigente del cliente (por viaje, km o tonelada) si no se escribe.
- **Inicio**: exige la inspección pre viaje de las últimas 24 h (parámetro `viajes.exigir_inspeccion`) y que no haya casos abiertos que «impidan salir». Un supervisor (`viajes.liquidar`) puede autorizar la salida sin inspección; queda en bitácora.
- **Liquidación**: ganancia = cobrado − costos directos − pago al piloto − km × costo indirecto por km. El saldo con el piloto es anticipos − lo que él pagó. La foto (costo/km, prorrateo, ganancia) queda guardada.
- **Costo indirecto por km** (`costo-km.service.ts`): (taller + llantas compradas + planillas − pago por viaje + gastos de operación + combustible fuera de viaje) ÷ km de los últimos 90 días. Con menos de 2,000 km usa el parámetro `cotizador.costo_km_indirecto`.
- **Combustible**: rendimiento de tanque lleno a tanque lleno; alerta si cae más del 15 % del esperado. Una carga de un viaje entra como su costo.
- **Cotizador**: ida y vuelta (vacío, con carga o solo ida), terreno, subida, tráfico, esperas y extras; factores en los parámetros `cotizador.*`. El rendimiento usa el histórico de la ruta si hay 3 viajes o más.
- **Casos**: prioridad `URGENTE · ALTA · MODERADA · BAJA` con plazo en horas (`casos.horas_*`). Los mecánicos y de llantas abren orden de taller; un punto de la inspección que vuelve a salir bien resuelve su caso.
- **Visibilidad**: sin `finanzas.costos` el API quita ganancia, margen, prorrateo y costo por km de todas las respuestas. Un piloto sin permiso de programar solo ve sus viajes.
- **Pruebas**: `npm test` (lógica pura) y `npm run humo -- --password …` (flujo completo contra el API en marcha, con `npm run db:demo`).
