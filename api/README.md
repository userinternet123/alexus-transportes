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
| Viajes, combustible, taller | Fase 1 y 2 (modelos ya en `schema.prisma`: `Viaje`, `CostoViaje`, `CargaCombustible`, `OrdenTrabajo`, `MontajeLlanta`) |
| Reportes | `GET /reportes` · `GET /reportes/:clave` · `GET /reportes/:clave/excel` |
| RRHH | `/rrhh/asistencias` · `/rrhh/ausencias` (+ `aprobar`/`rechazar`) · `POST /rrhh/planillas/generar` · `PUT /rrhh/planillas/:id/empleados/:empleadoId` · `POST /rrhh/planillas/:id/aprobar` |
| Sistema | `GET /health` · `/config/parametros` |

## Agregar un catálogo nuevo
1. Modelo en `schema.prisma` con campo `activo` → `npx prisma migrate dev`.
2. Una entrada en `modules/catalogos/catalogos.definiciones.ts`.
3. Una entrada en `apps/web/scripts/generar-configs.mjs` → `node scripts/generar-configs.mjs`.

## Agregar un reporte nuevo
Una entrada en `modules/reportes/reportes.registro.ts` (parámetros, columnas, SQL parametrizado). Aparece automáticamente en el Centro de Reportes para quien tenga el permiso.
