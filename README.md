# ALEXUS Transportes

Sistema de control para empresas de transporte pesado: **cabezales, remolques, pilotos, viajes, combustible, llantas, mantenimiento y finanzas**. Derivado de la plataforma SPVI 2.0 de ALEXUS: conserva su seguridad (usuarios, roles, permisos, auditoría), la **licencia emitida desde ALEXUS Central**, los reportes con exportación a Excel, RRHH con planilla y el instalador para Windows; cambia el dominio de punto de venta por el de una flota.

| Carpeta | Qué es | Stack |
|---|---|---|
| `api/` | API REST | NestJS 11 · Prisma 6 · PostgreSQL · Zod · Argon2 |
| `src/` (raíz) | Portal web | React 19 · Vite · Tailwind · pantallas por JSON |
| `movil/` | App del piloto (Android) | Expo · React Native (pendiente de adaptar, fase 3) |
| `instalador/` | Instalador de Windows con servicio | Inno Setup · PowerShell (pendiente de renombrar) |
| `docs/base-spvi/` | Documentación heredada de SPVI, solo como referencia | |

**Central** (panel del proveedor, licencias, soporte, versiones) es compartida entre SPVI y Transportes y vive en el repositorio `alexus-SPVI` (`central/`). Allí hay que agregar el producto `TRANSPORTES` con su catálogo de módulos (`api/src/modules/licencia/modulos.ts`) y límites por **cabezales, pilotos y usuarios**.

## Correr en desarrollo

```bash
# API
cd api && cp .env.example .env     # DATABASE_URL, JWT_ACCESS_SECRET…
npm install
npx prisma migrate dev --name inicial   # primera vez: crea las tablas
SEED_ADMIN_PASSWORD='CambiarAhora2026' npm run db:seed   # permisos, roles, sede, planes de mantenimiento
npm run db:demo                   # (opcional) 5 cabezales, 5 pilotos, viajes y taller ficticios
npm run dev                       # http://localhost:3000/api/docs

# Portal
cd .. && cp env.example .env       # VITE_API_URL
npm install && npm run dev
```

Entre con `admin` y la contraseña del seed (pide cambiarla). Sin `CLAVE_PUBLICA_LICENCIAS` el API corre en **modo abierto** (todos los módulos) para desarrollo.

## Módulos (licencia)

| Módulo | Qué incluye | Fase |
|---|---|---|
| Núcleo (siempre) | Seguridad, sedes, clientes, proveedores, talleres, flota (cabezales, remolques, documentos con vencimiento) | 0 |
| `viajes` | Programación, costos por viaje, km vacíos, liquidación, cotizador, tarifas por cliente | 1 |
| `combustible` | Cargas con foto, rendimiento km/gal, alertas de consumo | 1 |
| `pilotos` | Licencias con vencimiento, pago por viaje, viáticos, scorecard | 1 |
| `mantenimiento` | Planes por km o fecha, órdenes de trabajo, servicios mayores, repuestos por marca, alertas | 2 |
| `llantas` | Vida por posición, rotaciones, reencauches, costo por km por marca | 3 |
| `finanzas` | Gastos de operación, costo por km, rentabilidad por viaje, cabezal, piloto y cliente | 1-2 |
| `reportes` · `tablero` | Centro de reportes y tablero de gerencia | 0-3 |
| `rrhh` · `multisede` · `sinmarca` | Planilla, varias sedes, marca blanca | |

## Estado del proyecto

- **Fase 0:** plataforma limpia, esquema de datos completo de transporte, permisos y roles (gerente, despachador, piloto, taller, contador, RRHH), 17 catálogos en el portal, 10 reportes SQL, gastos de operación, datos de prueba.
- **Fase 1 (esta versión):** **viajes** (programar → en ruta → finalizar → liquidar, con costos, foto del recibo, saldo del piloto y utilidad), **cotizador** (costo real por km desde el historial o parámetros, precio sugerido con margen objetivo, comparación con la tarifa del cliente y con viajes anteriores de la ruta), **combustible** (cargas con vale, rendimiento km/gal tanque lleno a tanque lleno, alerta de consumo, costo automático en el viaje) e **inspección pre viaje** (checklist de 32 puntos tipo DOT; una falla crítica no deja salir y abre sola la orden de taller). Alertas: entrega atrasada, km vacíos sobre la meta, margen bajo, servicio por km próximo.
- **Siguiente, fase 2:** órdenes de trabajo en pantalla, alertas de mantenimiento en el inicio, cuentas por cobrar, incidentes y multas. Fase 3: llantas por posición, scorecard del piloto, tablero de gerencia, app del piloto.

## Agregar un catálogo nuevo
1. Modelo en `api/prisma/schema.prisma` con campo `activo` → `npx prisma migrate dev`.
2. Una entrada en `api/src/modules/catalogos/catalogos.definiciones.ts` (CRUD genérico).
3. Una entrada en `scripts/generar-configs.mjs` → `node scripts/generar-configs.mjs` (genera lista y formulario).
4. Una línea en el menú `src/components/layout/sidebar/config/sidebarMenu.js`.
