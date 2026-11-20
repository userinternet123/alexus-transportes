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
npx prisma migrate deploy         # crea o actualiza las tablas con las migraciones del repositorio
SEED_ADMIN_PASSWORD='CambiarAhora2026' npm run db:seed   # permisos, roles, sede, planes de mantenimiento
npm run db:demo                   # (opcional) 5 cabezales, 5 pilotos, viajes y taller ficticios
npm run dev                       # http://localhost:3000/api/docs

# Portal
cd .. && cp env.example .env       # VITE_API_URL
npm install && npm run dev
```

Entre con `admin` y la contraseña del seed (pide cambiarla). El API trae la clave pública de licencias de ALEXUS, así que necesita una licencia emitida desde Central (o con `npm run licencia:emitir`, que requiere la llave privada). Solo si `CLAVE_PUBLICA_LICENCIAS` queda vacía el API corre en **modo abierto** (todos los módulos), y eso no debe subirse al repositorio.

> Si ya había creado las tablas con `prisma migrate dev --name inicial` antes de que existieran las migraciones del repositorio, vacíe la base de desarrollo y corra `migrate deploy`, o marque la inicial como aplicada: `npx prisma migrate resolve --applied 20261120000000_inicial`.

## Módulos (licencia)

| Módulo | Qué incluye | Fase |
|---|---|---|
| Núcleo (siempre) | Seguridad, sedes, clientes, proveedores, talleres, flota (cabezales, remolques, documentos con vencimiento), inspección pre viaje, casos y requerimientos | 0-1 |
| `viajes` | Programación, anticipos, costos por viaje, km vacíos, liquidación, cotizador por condiciones de ruta, cotizaciones, tarifas por cliente | 1 |
| `combustible` | Cargas con foto, rendimiento km/gal, alertas de consumo | 1 |
| `pilotos` | Licencias con vencimiento, pago por viaje, viáticos, scorecard | 1 |
| `mantenimiento` | Planes por km o fecha, órdenes de trabajo, servicios mayores, repuestos por marca, alertas | 2 |
| `llantas` | Vida por posición, rotaciones, reencauches, costo por km por marca | 3 |
| `finanzas` | Gastos de operación, costo por km, rentabilidad por viaje, cliente, ruta, cabezal y piloto | 1-2 |
| `reportes` · `tablero` | Centro de reportes y tablero de gerencia | 0-3 |
| `rrhh` · `multisede` · `sinmarca` | Planilla, varias sedes, marca blanca | |

## Estado del proyecto

- **Fase 0:** plataforma limpia, esquema de datos de transporte, permisos y roles (gerente, despachador, piloto, taller, contador, RRHH), 17 catálogos, 10 reportes SQL, gastos de operación, datos de prueba y migración inicial.
- **Fase 1 (esta versión):**
  - **Viajes**: programar (tarifa automática), iniciar con inspección, finalizar con km y km vacíos, anticipos, costos con recibo, liquidación con saldo del piloto y ganancia real; cancelar con motivo.
  - **Cotizador**: precio por distancia, ida y vuelta, terreno, subida, tráfico, esperas y extras, con el costo por km del historial; cotizaciones guardadas con vigencia que se convierten en viaje.
  - **Combustible**: cargas con rendimiento tanque a tanque, alerta de consumo, rendimiento por cabezal.
  - **Inspección pre viaje**: 24 puntos (8 críticos) más hallazgos libres; cada falla abre un **caso** con prioridad y plazo, y las mecánicas una orden de taller. Una falla crítica deja la unidad fuera de servicio.
  - **Casos y requerimientos** con prioridad, responsable, seguimiento y avisos de vencidos en la campana.
  - **Rentabilidad**: viajes, clientes, rutas, cabezales y pilotos que mejor pagan y más ganan.
  - **Reporte en vivo**: bitácora del viaje (salida, colas, aduana, entrega, incidentes) con hora, ubicación y fotos; un incidente abre un caso. Panel «En ruta ahora» con el último reporte de cada unidad. Fotos de evidencia también en casos e inspecciones. Preparado para el móvil sin señal: cada reporte lleva su hora y un identificador, y al reenviarse no se duplica.
  - **Cargas laborales opcionales**: IGSS patronal, IRTRA, INTECAP y prestaciones, cada una con «se paga hoy» (planilla) e «incluir en costos» (costo por km, cotizador y ganancia). Sin planillas, los sueldos se estiman con los empleados activos.
- **Siguiente, fase 2:** órdenes de taller y servicios mayores, repuestos por marca, alertas de mantenimiento, **cuentas por cobrar con recordatorios a 30/60/90 días** (o los días de crédito de cada cliente), incidentes y multas.
- **App del piloto (Android):** reportar en vivo con cámara y GPS, inspección pre viaje, cargas de combustible y gastos con foto del recibo, todo funcionando sin señal y sincronizando al reconectar. El API ya está listo.
- **Fase 3:** llantas con **km por cada vida** (nueva y cada reencauche), scorecard del piloto, presupuesto de mantenimiento, costo total por cabezal, tablero de gerencia y app del piloto.

## Agregar un catálogo nuevo
1. Modelo en `api/prisma/schema.prisma` con campo `activo` → `npx prisma migrate dev`.
2. Una entrada en `api/src/modules/catalogos/catalogos.definiciones.ts` (CRUD genérico).
3. Una entrada en `scripts/generar-configs.mjs` → `node scripts/generar-configs.mjs` (genera lista y formulario).
4. Una línea en el menú `src/components/layout/sidebar/config/sidebarMenu.js`.
