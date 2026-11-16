# SPVI 2.0 — API

NestJS 11 · Prisma 6 · PostgreSQL 16 · Zod · Argon2 · Pino.  Prefijo: `/api/v1` · Swagger: `/api/docs` (fuera de producción).

## Convenciones
- **Autenticación**: `Authorization: Bearer <accessToken>`; sucursal de trabajo en `X-Sucursal-Id`.
- **Respuestas**: `{ data, meta? , message? }`. **Errores**: `{ ok:false, codigo, error, message, detalle?, requestId }` con `codigo` estable (`CAJA_CERRADA`, `STOCK_INSUFICIENTE`, `PERIODO_CERRADO`, `DESCUENTO_NO_AUTORIZADO`…).
- **Listas**: `?page=1&limit=25&q=texto&activo=true|false|todos` (`limit=0` = todo, tope 5000).
- **Dinero**: siempre `decimal.js` (`common/money.ts`); jamás `number` para cálculos.
- **Transacciones**: `prisma.enTransaccion(tx => …)`; inventario solo vía `KardexService`.

## Endpoints principales
| Módulo | Endpoints |
|---|---|
| Auth | `POST /auth/login` · `/auth/refresh` · `/auth/logout` · `GET /auth/me` · `POST /auth/cambiar-password` |
| Seguridad | `/seguridad/usuarios` · `/seguridad/roles` · `PUT /seguridad/roles/:id/permisos` · `/seguridad/permisos` · `/seguridad/auditoria` |
| Catálogos (CRUD genérico) | `/catalogos/{paises,departamentos,municipios,categorias,grupos,subgrupos,marcas,presentaciones,sucursales,bodegas,cajas,politicas-descuento}` · `/terceros/{clientes,proveedores}` · `/rrhh/{departamentos,puestos,empleados}` |
| Productos | `/productos` · `GET /productos/pos/buscar?q=` · `GET /productos/:id/precios` |
| Inventario | `GET /inventario/existencias` · `GET /inventario/kardex/:productoId` · `POST /inventario/{ajustes,inicial,traslados}` · `POST /inventario/traslados/:id/recibir` |
| Compras | `/compras` · `POST /compras/:id/anular` |
| Ventas | `POST /ventas` · `GET /ventas` · `POST /ventas/:id/{convertir,anular,devoluciones,fel/reintentar}` |
| Caja | `GET /caja/mi-sesion` · `POST /caja/abrir` · `POST /caja/sesiones/:id/{movimientos,cerrar}` · `GET /caja/sesiones` |
| Cierre | `GET /cierres/:fecha/preview` · `POST /cierres/:fecha` · `POST /cierres/:fecha/reabrir` |
| Reportes | `GET /reportes` · `GET /reportes/:clave` · `GET /reportes/:clave/excel` |
| RRHH | `/rrhh/asistencias` · `/rrhh/ausencias` (+ `aprobar`/`rechazar`) · `POST /rrhh/planillas/generar` · `PUT /rrhh/planillas/:id/empleados/:empleadoId` · `POST /rrhh/planillas/:id/aprobar` |
| Sistema | `GET /health` · `/config/parametros` |

## Agregar un catálogo nuevo
1. Modelo en `schema.prisma` con campo `activo` → `npx prisma migrate dev`.
2. Una entrada en `modules/catalogos/catalogos.definiciones.ts`.
3. Una entrada en `apps/web/scripts/generar-configs.mjs` → `node scripts/generar-configs.mjs`.

## Agregar un reporte nuevo
Una entrada en `modules/reportes/reportes.registro.ts` (parámetros, columnas, SQL parametrizado). Aparece automáticamente en el Centro de Reportes para quien tenga el permiso.
