import { Prisma } from '@prisma/client';
import { z, ZodObject, ZodRawShape } from 'zod';
import type { Ctx } from '../../common/auth/tipos';
import { tienePermiso } from '../../common/auth/tipos';
import { env } from '../../config/env';
import { aYmd, fechaContable, parseFecha, sumarDias } from '../../common/fecha';
import { zFecha } from '../../common/pipes/zod';
import type { PrismaService } from '../../common/prisma/prisma.service';

type Fila = Record<string, unknown>;

export type TipoColumna = 'texto' | 'numero' | 'moneda' | 'porcentaje' | 'fecha';

export interface Columna {
  accessorKey: string; // mismo nombre que usa ListBase/TanStack en el portal
  header: string;
  tipo: TipoColumna;
  total?: boolean; // sumar en pie de reporte / Excel
}

export interface DefinicionReporte {
  clave: string;
  titulo: string;
  categoria: 'Ventas' | 'Inventario' | 'Caja' | 'Financiero' | 'RRHH' | 'Compras' | 'Análisis';
  permiso: string;
  descripcion: string;
  parametros: ZodObject<ZodRawShape>;
  /** Cómo pintar cada parámetro en el portal (etiqueta, tipo y valor por defecto). */
  parametrosUI?: Record<string, { etiqueta: string; tipo: 'fecha' | 'numero' | 'bool'; defecto?: string | number }>;
  columnas: Columna[];
  /** filtroSucursal: fragmento listo (alias su/v/c); sucursalId: null = consolidado */
  ejecutar: (db: PrismaService, p: Record<string, unknown>, filtroSucursal: Prisma.Sql, sucursalId: number | null) => Promise<Fila[]>;
}

/** Fragmento "AND <columna> = <sucursal>" o vacío si es consolidado. */
const sucF = (columna: string, sucursalId: number | null) =>
  sucursalId == null ? Prisma.empty : Prisma.sql`AND ${Prisma.raw(columna)} = ${sucursalId}`;
const n = (p: Record<string, unknown>, k: string) => Number(p[k]);
const UI_RANGO = {
  desde: { etiqueta: 'Desde', tipo: 'fecha' as const },
  hasta: { etiqueta: 'Hasta', tipo: 'fecha' as const },
  consolidado: { etiqueta: 'Todas las sucursales', tipo: 'bool' as const },
};

/**
 * REPORTERÍA DECLARATIVA (metadata-driven):
 * cada reporte declara parámetros + columnas + consulta. El portal obtiene
 * GET /reportes (catálogo) y renderiza filtros y tabla con su motor de
 * configuración — un reporte nuevo NO requiere pantalla nueva.
 * Las consultas son SQL parametrizado (tagged templates => sin inyección SQL).
 */
const rango = z.object({
  desde: zFecha.default(() => aYmd(fechaContable())),
  hasta: zFecha.default(() => aYmd(fechaContable())),
  consolidado: z.enum(['true', 'false']).optional(), // todas las sucursales (requiere sucursales.todas)
});

/** Fecha validada 'YYYY-MM-DD' (se castea a ::date en SQL). */
const d = (p: Record<string, unknown>, k: string): string => {
  parseFecha(String(p[k])); // valida
  return String(p[k]);
};

export const REPORTES: DefinicionReporte[] = [
  {
    clave: 'ventas-por-dia',
    titulo: 'Ventas por día',
    categoria: 'Ventas',
    permiso: 'reportes.ventas',
    descripcion: 'Total vendido, costo, utilidad y margen por día',
    parametros: rango,
    parametrosUI: UI_RANGO,
    columnas: [
      { accessorKey: 'fecha', header: 'Fecha', tipo: 'fecha' },
      { accessorKey: 'ventas', header: '# Ventas', tipo: 'numero', total: true },
      { accessorKey: 'total', header: 'Total', tipo: 'moneda', total: true },
      { accessorKey: 'costo', header: 'Costo', tipo: 'moneda', total: true },
      { accessorKey: 'utilidad', header: 'Utilidad', tipo: 'moneda', total: true },
      { accessorKey: 'margen', header: 'Margen %', tipo: 'porcentaje' },
      { accessorKey: 'ticketPromedio', header: 'Ticket prom.', tipo: 'moneda' },
    ],
    ejecutar: (db, p, fs) => db.$queryRaw<Fila[]>`
      SELECT v.fecha_contable AS fecha, COUNT(*)::int AS ventas, SUM(v.total) AS total, SUM(v.costo_total) AS costo,
             SUM(v.total - v.costo_total) AS utilidad,
             ROUND(CASE WHEN SUM(v.total) > 0 THEN SUM(v.total - v.costo_total) / SUM(v.total) * 100 ELSE 0 END, 2) AS margen,
             ROUND(AVG(v.total), 2) AS "ticketPromedio"
      FROM ventas v
      WHERE v.tipo = 'VENTA' AND v.estado = 'CONFIRMADA'
        AND v.fecha_contable BETWEEN ${d(p, 'desde')}::date AND ${d(p, 'hasta')}::date ${fs}
      GROUP BY v.fecha_contable ORDER BY v.fecha_contable`,
  },
  {
    clave: 'ventas-por-producto',
    titulo: 'Ventas por producto (ranking)',
    categoria: 'Ventas',
    permiso: 'reportes.ventas',
    descripcion: 'Productos más vendidos con utilidad',
    parametros: rango,
    parametrosUI: UI_RANGO,
    columnas: [
      { accessorKey: 'sku', header: 'SKU', tipo: 'texto' },
      { accessorKey: 'producto', header: 'Producto', tipo: 'texto' },
      { accessorKey: 'marca', header: 'Marca', tipo: 'texto' },
      { accessorKey: 'cantidad', header: 'Cantidad', tipo: 'numero', total: true },
      { accessorKey: 'total', header: 'Venta', tipo: 'moneda', total: true },
      { accessorKey: 'costo', header: 'Costo', tipo: 'moneda', total: true },
      { accessorKey: 'utilidad', header: 'Utilidad', tipo: 'moneda', total: true },
      { accessorKey: 'margen', header: 'Margen %', tipo: 'porcentaje' },
    ],
    ejecutar: (db, p, fs) => db.$queryRaw<Fila[]>`
      SELECT pr.sku, pr.nombre AS producto, m.nombre AS marca, SUM(dv.cantidad) AS cantidad, SUM(dv.subtotal) AS total,
             ROUND(SUM(dv.costo_unitario * dv.cantidad), 2) AS costo,
             ROUND(SUM(dv.subtotal - dv.costo_unitario * dv.cantidad), 2) AS utilidad,
             ROUND(CASE WHEN SUM(dv.subtotal) > 0 THEN SUM(dv.subtotal - dv.costo_unitario * dv.cantidad) / SUM(dv.subtotal) * 100 ELSE 0 END, 2) AS margen
      FROM ventas_detalle dv
      JOIN ventas v ON v.id = dv.venta_id
      JOIN productos pr ON pr.id = dv.producto_id
      LEFT JOIN marcas m ON m.id = pr.marca_id
      WHERE v.tipo = 'VENTA' AND v.estado = 'CONFIRMADA'
        AND v.fecha_contable BETWEEN ${d(p, 'desde')}::date AND ${d(p, 'hasta')}::date ${fs}
      GROUP BY pr.sku, pr.nombre, m.nombre ORDER BY total DESC`,
  },
  {
    clave: 'ventas-por-vendedor',
    titulo: 'Ventas por vendedor',
    categoria: 'Ventas',
    permiso: 'reportes.ventas',
    descripcion: 'Desempeño por vendedor (base para comisiones)',
    parametros: rango,
    parametrosUI: UI_RANGO,
    columnas: [
      { accessorKey: 'vendedor', header: 'Vendedor', tipo: 'texto' },
      { accessorKey: 'ventas', header: '# Ventas', tipo: 'numero', total: true },
      { accessorKey: 'total', header: 'Total', tipo: 'moneda', total: true },
      { accessorKey: 'descuentos', header: 'Descuentos', tipo: 'moneda', total: true },
      { accessorKey: 'ticketPromedio', header: 'Ticket prom.', tipo: 'moneda' },
      { accessorKey: 'anuladas', header: '# Anuladas', tipo: 'numero', total: true },
    ],
    ejecutar: (db, p, fs) => db.$queryRaw<Fila[]>`
      SELECT u.nombre AS vendedor,
             COUNT(*) FILTER (WHERE v.estado = 'CONFIRMADA')::int AS ventas,
             COALESCE(SUM(v.total) FILTER (WHERE v.estado = 'CONFIRMADA'), 0) AS total,
             COALESCE(SUM(v.descuento_total) FILTER (WHERE v.estado = 'CONFIRMADA'), 0) AS descuentos,
             ROUND(COALESCE(AVG(v.total) FILTER (WHERE v.estado = 'CONFIRMADA'), 0), 2) AS "ticketPromedio",
             COUNT(*) FILTER (WHERE v.estado = 'ANULADA')::int AS anuladas
      FROM ventas v JOIN usuarios u ON u.id = v.vendedor_id
      WHERE v.tipo = 'VENTA' AND v.fecha_contable BETWEEN ${d(p, 'desde')}::date AND ${d(p, 'hasta')}::date ${fs}
      GROUP BY u.nombre ORDER BY total DESC`,
  },
  {
    clave: 'ventas-por-medio-pago',
    titulo: 'Ventas por medio de pago',
    categoria: 'Caja',
    permiso: 'reportes.caja',
    descripcion: 'Cobros por medio de pago (efectivo neto de vuelto)',
    parametros: rango,
    parametrosUI: UI_RANGO,
    columnas: [
      { accessorKey: 'medioPago', header: 'Medio de pago', tipo: 'texto' },
      { accessorKey: 'transacciones', header: '# Transacciones', tipo: 'numero', total: true },
      { accessorKey: 'monto', header: 'Monto', tipo: 'moneda', total: true },
    ],
    ejecutar: (db, p, fs) => db.$queryRaw<Fila[]>`
      SELECT x.medio AS "medioPago", SUM(x.n)::int AS transacciones, SUM(x.monto) AS monto FROM (
        SELECT vp.medio_pago::text AS medio, COUNT(*) AS n, SUM(vp.monto) AS monto
        FROM ventas_pagos vp JOIN ventas v ON v.id = vp.venta_id
        WHERE v.tipo = 'VENTA' AND v.estado = 'CONFIRMADA'
          AND v.fecha_contable BETWEEN ${d(p, 'desde')}::date AND ${d(p, 'hasta')}::date ${fs}
        GROUP BY vp.medio_pago
        UNION ALL
        SELECT 'EFECTIVO', 0, -COALESCE(SUM(v.cambio), 0) FROM ventas v
        WHERE v.tipo = 'VENTA' AND v.estado = 'CONFIRMADA'
          AND v.fecha_contable BETWEEN ${d(p, 'desde')}::date AND ${d(p, 'hasta')}::date ${fs}
      ) x GROUP BY x.medio ORDER BY monto DESC`,
  },
  {
    clave: 'cuadre-cajas',
    titulo: 'Cuadre de cajas',
    categoria: 'Caja',
    permiso: 'reportes.caja',
    descripcion: 'Esperado vs. contado por turno y cajero (faltantes/sobrantes)',
    parametros: rango,
    parametrosUI: UI_RANGO,
    columnas: [
      { accessorKey: 'fecha', header: 'Fecha', tipo: 'fecha' },
      { accessorKey: 'caja', header: 'Caja', tipo: 'texto' },
      { accessorKey: 'cajero', header: 'Cajero', tipo: 'texto' },
      { accessorKey: 'estado', header: 'Estado', tipo: 'texto' },
      { accessorKey: 'apertura', header: 'Fondo', tipo: 'moneda' },
      { accessorKey: 'esperado', header: 'Esperado', tipo: 'moneda', total: true },
      { accessorKey: 'contado', header: 'Contado', tipo: 'moneda', total: true },
      { accessorKey: 'diferencia', header: 'Diferencia', tipo: 'moneda', total: true },
      { accessorKey: 'observacion', header: 'Observación', tipo: 'texto' },
    ],
    ejecutar: (db, p, fs) => db.$queryRaw<Fila[]>`
      SELECT s.fecha_contable AS fecha, c.nombre AS caja, u.nombre AS cajero, s.estado::text AS estado,
             s.monto_apertura AS apertura, s.total_esperado AS esperado, s.total_contado AS contado, s.diferencia, s.observacion
      FROM caja_sesiones s
      JOIN cajas c ON c.id = s.caja_id
      JOIN sucursales su ON su.id = c.sucursal_id
      JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.fecha_contable BETWEEN ${d(p, 'desde')}::date AND ${d(p, 'hasta')}::date ${fs}
      ORDER BY s.fecha_contable, c.nombre`,
  },
  {
    clave: 'inventario-valorizado',
    titulo: 'Inventario valorizado',
    categoria: 'Inventario',
    permiso: 'reportes.inventario',
    descripcion: 'Existencias a costo promedio y a precio de venta',
    parametros: z.object({ consolidado: z.enum(['true', 'false']).optional() }),
    parametrosUI: { consolidado: UI_RANGO.consolidado },
    columnas: [
      { accessorKey: 'sucursal', header: 'Sucursal', tipo: 'texto' },
      { accessorKey: 'bodega', header: 'Bodega', tipo: 'texto' },
      { accessorKey: 'sku', header: 'SKU', tipo: 'texto' },
      { accessorKey: 'producto', header: 'Producto', tipo: 'texto' },
      { accessorKey: 'existencia', header: 'Existencia', tipo: 'numero' },
      { accessorKey: 'costoPromedio', header: 'Costo prom.', tipo: 'moneda' },
      { accessorKey: 'valorCosto', header: 'Valor costo', tipo: 'moneda', total: true },
      { accessorKey: 'precioVenta', header: 'Precio venta', tipo: 'moneda' },
      { accessorKey: 'valorVenta', header: 'Valor venta', tipo: 'moneda', total: true },
    ],
    ejecutar: (db, _p, fs) => db.$queryRaw<Fila[]>`
      SELECT su.nombre AS sucursal, b.nombre AS bodega, pr.sku, pr.nombre AS producto, e.cantidad AS existencia,
             e.costo_promedio AS "costoPromedio", ROUND(e.cantidad * e.costo_promedio, 2) AS "valorCosto",
             pr.precio_venta AS "precioVenta", ROUND(e.cantidad * pr.precio_venta, 2) AS "valorVenta"
      FROM existencias e
      JOIN bodegas b ON b.id = e.bodega_id
      JOIN sucursales su ON su.id = b.sucursal_id
      JOIN productos pr ON pr.id = e.producto_id
      WHERE e.cantidad <> 0 ${fs}
      ORDER BY su.nombre, b.nombre, pr.nombre`,
  },
  {
    clave: 'productos-bajo-minimo',
    titulo: 'Productos bajo mínimo (sugerido de compra)',
    categoria: 'Inventario',
    permiso: 'reportes.inventario',
    descripcion: 'Existencia menor o igual al stock mínimo, con venta promedio diaria de 30 días',
    parametros: z.object({ consolidado: z.enum(['true', 'false']).optional() }),
    parametrosUI: { consolidado: UI_RANGO.consolidado },
    columnas: [
      { accessorKey: 'sucursal', header: 'Sucursal', tipo: 'texto' },
      { accessorKey: 'sku', header: 'SKU', tipo: 'texto' },
      { accessorKey: 'producto', header: 'Producto', tipo: 'texto' },
      { accessorKey: 'existencia', header: 'Existencia', tipo: 'numero' },
      { accessorKey: 'minimo', header: 'Mínimo', tipo: 'numero' },
      { accessorKey: 'ventaDiaria', header: 'Venta diaria (30d)', tipo: 'numero' },
      { accessorKey: 'diasCobertura', header: 'Días de cobertura', tipo: 'numero' },
    ],
    ejecutar: (db, _p, fs) => db.$queryRaw<Fila[]>`
      WITH venta30 AS (
        SELECT v.sucursal_id, dv.producto_id, SUM(dv.cantidad) / 30.0 AS diaria
        FROM ventas_detalle dv JOIN ventas v ON v.id = dv.venta_id
        WHERE v.tipo = 'VENTA' AND v.estado = 'CONFIRMADA' AND v.fecha_contable >= CURRENT_DATE - 30
        GROUP BY v.sucursal_id, dv.producto_id
      )
      SELECT su.nombre AS sucursal, pr.sku, pr.nombre AS producto, SUM(e.cantidad) AS existencia, pr.stock_minimo AS minimo,
             ROUND(COALESCE(MAX(v30.diaria), 0), 2) AS "ventaDiaria",
             CASE WHEN COALESCE(MAX(v30.diaria), 0) > 0 THEN ROUND(SUM(e.cantidad) / MAX(v30.diaria), 1) ELSE NULL END AS "diasCobertura"
      FROM existencias e
      JOIN bodegas b ON b.id = e.bodega_id
      JOIN sucursales su ON su.id = b.sucursal_id
      JOIN productos pr ON pr.id = e.producto_id AND pr.activo AND pr.maneja_inventario
      LEFT JOIN venta30 v30 ON v30.producto_id = pr.id AND v30.sucursal_id = su.id
      WHERE TRUE ${fs}
      GROUP BY su.nombre, pr.sku, pr.nombre, pr.stock_minimo
      HAVING SUM(e.cantidad) <= pr.stock_minimo
      ORDER BY "diasCobertura" NULLS FIRST`,
  },
  {
    clave: 'compras-por-proveedor',
    titulo: 'Compras por proveedor',
    categoria: 'Compras',
    permiso: 'reportes.financieros',
    descripcion: 'Facturas y montos comprados por proveedor',
    parametros: rango,
    parametrosUI: UI_RANGO,
    columnas: [
      { accessorKey: 'proveedor', header: 'Proveedor', tipo: 'texto' },
      { accessorKey: 'nit', header: 'NIT', tipo: 'texto' },
      { accessorKey: 'facturas', header: '# Facturas', tipo: 'numero', total: true },
      { accessorKey: 'total', header: 'Total', tipo: 'moneda', total: true },
    ],
    ejecutar: (db, p, fs) => db.$queryRaw<Fila[]>`
      SELECT COALESCE(t.razon_social, CONCAT_WS(' ', t.nombres, t.apellidos)) AS proveedor, t.nit,
             COUNT(*)::int AS facturas, SUM(c.total) AS total
      FROM compras c JOIN terceros t ON t.id = c.proveedor_id
      WHERE c.estado = 'CONFIRMADO' AND c.fecha_contable BETWEEN ${d(p, 'desde')}::date AND ${d(p, 'hasta')}::date ${fs}
      GROUP BY 1, t.nit ORDER BY total DESC`,
  },
  {
    clave: 'kardex-movimientos',
    titulo: 'Movimientos de inventario (kardex general)',
    categoria: 'Inventario',
    permiso: 'inventario.kardex',
    descripcion: 'Entradas y salidas por tipo de movimiento en el período',
    parametros: rango,
    parametrosUI: UI_RANGO,
    columnas: [
      { accessorKey: 'tipo', header: 'Tipo', tipo: 'texto' },
      { accessorKey: 'movimientos', header: '# Movimientos', tipo: 'numero', total: true },
      { accessorKey: 'unidades', header: 'Unidades', tipo: 'numero', total: true },
      { accessorKey: 'valor', header: 'Valor a costo', tipo: 'moneda', total: true },
    ],
    ejecutar: (db, p, fs) => db.$queryRaw<Fila[]>`
      SELECT m.tipo::text AS tipo, COUNT(*)::int AS movimientos, SUM(m.cantidad) AS unidades,
             ROUND(SUM(m.cantidad * m.costo_unitario), 2) AS valor
      FROM movimientos_inventario m JOIN bodegas b ON b.id = m.bodega_id JOIN sucursales su ON su.id = b.sucursal_id
      WHERE (m.fecha AT TIME ZONE 'UTC' AT TIME ZONE ${env.TZ_NEGOCIO})::date BETWEEN ${d(p, 'desde')}::date AND ${d(p, 'hasta')}::date ${fs}
      GROUP BY m.tipo ORDER BY m.tipo`,
  },
  {
    clave: 'ventas-por-mes',
    titulo: 'Ventas por mes',
    categoria: 'Ventas',
    permiso: 'reportes.ventas',
    descripcion: 'Total, costo, utilidad y margen por mes (base para comparar meses y años)',
    parametros: rango,
    parametrosUI: UI_RANGO,
    columnas: [
      { accessorKey: 'mes', header: 'Mes', tipo: 'texto' },
      { accessorKey: 'ventas', header: '# Ventas', tipo: 'numero', total: true },
      { accessorKey: 'total', header: 'Total', tipo: 'moneda', total: true },
      { accessorKey: 'costo', header: 'Costo', tipo: 'moneda', total: true },
      { accessorKey: 'utilidad', header: 'Utilidad', tipo: 'moneda', total: true },
      { accessorKey: 'margen', header: 'Margen %', tipo: 'porcentaje' },
      { accessorKey: 'ticketPromedio', header: 'Ticket prom.', tipo: 'moneda' },
    ],
    ejecutar: (db, p, fs) => db.$queryRaw<Fila[]>`
      SELECT to_char(v.fecha_contable, 'YYYY-MM') AS mes, COUNT(*)::int AS ventas, SUM(v.total) AS total, SUM(v.costo_total) AS costo,
             SUM(v.total - v.costo_total) AS utilidad,
             ROUND(CASE WHEN SUM(v.total) > 0 THEN SUM(v.total - v.costo_total) / SUM(v.total) * 100 ELSE 0 END, 2) AS margen,
             ROUND(AVG(v.total), 2) AS "ticketPromedio"
      FROM ventas v
      WHERE v.tipo = 'VENTA' AND v.estado = 'CONFIRMADA'
        AND v.fecha_contable BETWEEN ${d(p, 'desde')}::date AND ${d(p, 'hasta')}::date ${fs}
      GROUP BY 1 ORDER BY 1`,
  },
  {
    clave: 'depositos-bancarios',
    titulo: 'Depósitos bancarios de caja',
    categoria: 'Caja',
    permiso: 'reportes.caja',
    descripcion: 'Boletas depositadas: banco, depositante, quién registró y qué encargado validó',
    parametros: rango,
    parametrosUI: UI_RANGO,
    columnas: [
      { accessorKey: 'fecha', header: 'Fecha depósito', tipo: 'fecha' },
      { accessorKey: 'caja', header: 'Caja', tipo: 'texto' },
      { accessorKey: 'banco', header: 'Banco', tipo: 'texto' },
      { accessorKey: 'boleta', header: 'Boleta', tipo: 'texto' },
      { accessorKey: 'depositante', header: 'Depositante', tipo: 'texto' },
      { accessorKey: 'monto', header: 'Monto', tipo: 'moneda', total: true },
      { accessorKey: 'registro', header: 'Registró', tipo: 'texto' },
      { accessorKey: 'valido', header: 'Validó', tipo: 'texto' },
      { accessorKey: 'comprobante', header: 'Comprobante', tipo: 'texto' },
    ],
    ejecutar: (db, p, fs) => db.$queryRaw<Fila[]>`
      SELECT dp.fecha_deposito AS fecha, c.nombre AS caja, dp.banco, dp.numero_boleta AS boleta, dp.depositante, dp.monto,
             ur.nombre AS registro, uv.nombre AS valido, CASE WHEN dp.comprobante_id IS NULL THEN 'No' ELSE 'Sí' END AS comprobante
      FROM caja_depositos dp
      JOIN caja_sesiones s ON s.id = dp.sesion_id
      JOIN cajas c ON c.id = s.caja_id
      JOIN sucursales su ON su.id = c.sucursal_id
      JOIN usuarios ur ON ur.id = dp.registrado_por_id
      JOIN usuarios uv ON uv.id = dp.validado_por_id
      WHERE dp.fecha_deposito BETWEEN ${d(p, 'desde')}::date AND ${d(p, 'hasta')}::date ${fs}
      ORDER BY dp.fecha_deposito, dp.id`,
  },
  // ────────────────────────────── ANÁLISIS ──────────────────────────────────
  {
    clave: 'sugerido-compra',
    titulo: 'Sugerido de compra (existencia baja)',
    categoria: 'Inventario',
    permiso: 'reportes.inventario',
    descripcion: 'Productos con existencia menor o igual al umbral, con velocidad de venta y cantidad sugerida para cubrir N días',
    parametros: z.object({
      umbral: z.coerce.number().min(0).max(100000).default(5),
      diasVenta: z.coerce.number().int().min(7).max(365).default(30),
      diasObjetivo: z.coerce.number().int().min(1).max(180).default(30),
      consolidado: z.enum(['true', 'false']).optional(),
    }),
    parametrosUI: {
      umbral: { etiqueta: 'Existencia ≤', tipo: 'numero', defecto: 5 },
      diasVenta: { etiqueta: 'Velocidad de los últimos (días)', tipo: 'numero', defecto: 30 },
      diasObjetivo: { etiqueta: 'Cubrir (días)', tipo: 'numero', defecto: 30 },
      consolidado: UI_RANGO.consolidado,
    },
    columnas: [
      { accessorKey: 'sucursal', header: 'Sucursal', tipo: 'texto' },
      { accessorKey: 'sku', header: 'SKU', tipo: 'texto' },
      { accessorKey: 'producto', header: 'Producto', tipo: 'texto' },
      { accessorKey: 'marca', header: 'Marca', tipo: 'texto' },
      { accessorKey: 'existencia', header: 'Existencia', tipo: 'numero' },
      { accessorKey: 'ventaDiaria', header: 'Venta diaria', tipo: 'numero' },
      { accessorKey: 'diasCobertura', header: 'Días de cobertura', tipo: 'numero' },
      { accessorKey: 'sugerido', header: 'Sugerido', tipo: 'numero', total: true },
      { accessorKey: 'costoEstimado', header: 'Costo estimado', tipo: 'moneda', total: true },
    ],
    ejecutar: (db, p, _fs, s) => db.$queryRaw<Fila[]>`
      WITH ex AS (
        SELECT b.sucursal_id, e.producto_id, SUM(e.cantidad) AS existencia, MAX(e.costo_promedio) AS costo
        FROM existencias e JOIN bodegas b ON b.id = e.bodega_id
        WHERE TRUE ${sucF('b.sucursal_id', s)}
        GROUP BY 1, 2
      ), vel AS (
        SELECT v.sucursal_id, dv.producto_id, SUM(dv.cantidad) / ${n(p, 'diasVenta')}::numeric AS diaria
        FROM ventas_detalle dv JOIN ventas v ON v.id = dv.venta_id
        WHERE v.tipo = 'VENTA' AND v.estado = 'CONFIRMADA'
          AND v.fecha_contable > CURRENT_DATE - ${n(p, 'diasVenta')}::int ${sucF('v.sucursal_id', s)}
        GROUP BY 1, 2
      )
      SELECT su.nombre AS sucursal, pr.sku, pr.nombre AS producto, m.nombre AS marca, ex.existencia,
             ROUND(COALESCE(vel.diaria, 0), 2) AS "ventaDiaria",
             CASE WHEN COALESCE(vel.diaria, 0) > 0 THEN ROUND(GREATEST(ex.existencia, 0) / vel.diaria, 1) END AS "diasCobertura",
             GREATEST(0, CEIL(COALESCE(vel.diaria, 0) * ${n(p, 'diasObjetivo')}::int) - ex.existencia) AS sugerido,
             ROUND(GREATEST(0, CEIL(COALESCE(vel.diaria, 0) * ${n(p, 'diasObjetivo')}::int) - ex.existencia) * ex.costo, 2) AS "costoEstimado"
      FROM ex
      JOIN productos pr ON pr.id = ex.producto_id AND pr.activo AND pr.maneja_inventario
      JOIN sucursales su ON su.id = ex.sucursal_id
      LEFT JOIN marcas m ON m.id = pr.marca_id
      LEFT JOIN vel ON vel.producto_id = ex.producto_id AND vel.sucursal_id = ex.sucursal_id
      WHERE ex.existencia <= ${n(p, 'umbral')}
      ORDER BY (COALESCE(vel.diaria, 0) = 0), "diasCobertura" NULLS LAST, sugerido DESC`,
  },
  {
    clave: 'productos-menos-vendidos',
    titulo: 'Baja rotación (no recomprar)',
    categoria: 'Análisis',
    permiso: 'reportes.analitica',
    descripcion: 'Productos con existencia y pocas o ninguna venta en el período: capital inmovilizado',
    parametros: z.object({
      desde: zFecha.default(() => aYmd(sumarDias(fechaContable(), -90))),
      hasta: zFecha.default(() => aYmd(fechaContable())),
      limite: z.coerce.number().int().min(1).max(1000).default(50),
      consolidado: z.enum(['true', 'false']).optional(),
    }),
    parametrosUI: { ...UI_RANGO, limite: { etiqueta: 'Máximo de filas', tipo: 'numero', defecto: 50 } },
    columnas: [
      { accessorKey: 'sku', header: 'SKU', tipo: 'texto' },
      { accessorKey: 'producto', header: 'Producto', tipo: 'texto' },
      { accessorKey: 'marca', header: 'Marca', tipo: 'texto' },
      { accessorKey: 'existencia', header: 'Existencia', tipo: 'numero' },
      { accessorKey: 'unidadesVendidas', header: 'Vendidas en el período', tipo: 'numero' },
      { accessorKey: 'ultimaVenta', header: 'Última venta', tipo: 'fecha' },
      { accessorKey: 'valorInmovilizado', header: 'Valor inmovilizado', tipo: 'moneda', total: true },
      { accessorKey: 'temporada', header: 'De temporada (no descartar)', tipo: 'texto' },
    ],
    ejecutar: (db, p, _fs, s) => db.$queryRaw<Fila[]>`
      WITH ex AS (
        SELECT e.producto_id, SUM(e.cantidad) AS existencia, SUM(e.cantidad * e.costo_promedio) AS valor
        FROM existencias e JOIN bodegas b ON b.id = e.bodega_id
        WHERE TRUE ${sucF('b.sucursal_id', s)}
        GROUP BY 1
      ), vend AS (
        SELECT dv.producto_id, SUM(dv.cantidad) AS unidades
        FROM ventas_detalle dv JOIN ventas v ON v.id = dv.venta_id
        WHERE v.tipo = 'VENTA' AND v.estado = 'CONFIRMADA'
          AND v.fecha_contable BETWEEN ${d(p, 'desde')}::date AND ${d(p, 'hasta')}::date ${sucF('v.sucursal_id', s)}
        GROUP BY 1
      ), ult AS (
        SELECT dv.producto_id, MAX(v.fecha_contable) AS ultima
        FROM ventas_detalle dv JOIN ventas v ON v.id = dv.venta_id
        WHERE v.tipo = 'VENTA' AND v.estado = 'CONFIRMADA' ${sucF('v.sucursal_id', s)}
        GROUP BY 1
      )
      SELECT pr.sku, pr.nombre AS producto, m.nombre AS marca, ex.existencia,
             COALESCE(vend.unidades, 0) AS "unidadesVendidas", ult.ultima AS "ultimaVenta", ROUND(ex.valor, 2) AS "valorInmovilizado",
             (SELECT string_agg(DISTINCT t.nombre, ', ') FROM temporadas t JOIN temporadas_alcance ta ON ta.temporada_id = t.id
               JOIN subgrupos sg ON sg.id = pr.subgrupo_id JOIN grupos gr ON gr.id = sg.grupo_id
              WHERE t.estado = 'ACTIVA' AND ((ta.tipo = 'PRODUCTO' AND ta.ref_id = pr.id) OR (ta.tipo = 'SUBGRUPO' AND ta.ref_id = sg.id)
                OR (ta.tipo = 'GRUPO' AND ta.ref_id = gr.id) OR (ta.tipo = 'CATEGORIA' AND ta.ref_id = gr.categoria_id))) AS temporada
      FROM ex
      JOIN productos pr ON pr.id = ex.producto_id AND pr.activo
      LEFT JOIN marcas m ON m.id = pr.marca_id
      LEFT JOIN vend ON vend.producto_id = ex.producto_id
      LEFT JOIN ult ON ult.producto_id = ex.producto_id
      WHERE ex.existencia > 0
      ORDER BY COALESCE(vend.unidades, 0) ASC, ex.valor DESC
      LIMIT ${n(p, 'limite')}`,
  },
  {
    clave: 'estacionalidad',
    titulo: 'Productos de temporada (compra anticipada)',
    categoria: 'Análisis',
    permiso: 'reportes.analitica',
    descripcion: 'Productos que en los próximos meses venden bastante más que su promedio, según los años anteriores',
    parametros: z.object({
      meses: z.coerce.number().int().min(1).max(6).default(2),
      anios: z.coerce.number().int().min(1).max(5).default(3),
      indiceMinimo: z.coerce.number().min(1).max(10).default(1.5),
      limite: z.coerce.number().int().min(1).max(500).default(50),
      consolidado: z.enum(['true', 'false']).optional(),
    }),
    parametrosUI: {
      meses: { etiqueta: 'Próximos meses', tipo: 'numero', defecto: 2 },
      anios: { etiqueta: 'Años de historia', tipo: 'numero', defecto: 3 },
      indiceMinimo: { etiqueta: 'Índice mínimo (× promedio)', tipo: 'numero', defecto: 1.5 },
      limite: { etiqueta: 'Máximo de filas', tipo: 'numero', defecto: 50 },
      consolidado: UI_RANGO.consolidado,
    },
    columnas: [
      { accessorKey: 'sku', header: 'SKU', tipo: 'texto' },
      { accessorKey: 'producto', header: 'Producto', tipo: 'texto' },
      { accessorKey: 'marca', header: 'Marca', tipo: 'texto' },
      { accessorKey: 'ventaMesTemporada', header: 'Venta/mes en temporada', tipo: 'numero' },
      { accessorKey: 'ventaMesPromedio', header: 'Venta/mes promedio', tipo: 'numero' },
      { accessorKey: 'indice', header: 'Índice', tipo: 'numero' },
      { accessorKey: 'existencia', header: 'Existencia', tipo: 'numero' },
      { accessorKey: 'sugerido', header: 'Comprar', tipo: 'numero', total: true },
    ],
    ejecutar: (db, p, _fs, s) => {
      // Meses calendario objetivo (1..12): los próximos N meses a partir del actual
      const mesActual = Number(aYmd(fechaContable()).slice(5, 7));
      const objetivo = Array.from({ length: n(p, 'meses') }, (_, i) => ((mesActual + i) % 12) + 1);
      return db.$queryRaw<Fila[]>`
        WITH vm AS (
          SELECT dv.producto_id, date_trunc('month', v.fecha_contable)::date AS mes, SUM(dv.cantidad) AS unidades
          FROM ventas_detalle dv JOIN ventas v ON v.id = dv.venta_id
          WHERE v.tipo = 'VENTA' AND v.estado = 'CONFIRMADA'
            AND v.fecha_contable >= (date_trunc('month', CURRENT_DATE) - make_interval(years => ${n(p, 'anios')}::int))::date
            AND v.fecha_contable < date_trunc('month', CURRENT_DATE)::date
            ${sucF('v.sucursal_id', s)}
          GROUP BY 1, 2
        ), st AS (
          SELECT producto_id,
                 COALESCE(SUM(unidades) FILTER (WHERE EXTRACT(MONTH FROM mes)::int = ANY(${objetivo}::int[])), 0)
                   / (${n(p, 'anios')}::numeric * ${n(p, 'meses')}::numeric) AS temporada,
                 SUM(unidades) / (${n(p, 'anios')}::numeric * 12) AS promedio
          FROM vm GROUP BY 1
        ), ex AS (
          SELECT e.producto_id, SUM(e.cantidad) AS existencia
          FROM existencias e JOIN bodegas b ON b.id = e.bodega_id
          WHERE TRUE ${sucF('b.sucursal_id', s)}
          GROUP BY 1
        )
        SELECT pr.sku, pr.nombre AS producto, m.nombre AS marca,
               ROUND(st.temporada, 1) AS "ventaMesTemporada", ROUND(st.promedio, 1) AS "ventaMesPromedio",
               ROUND(st.temporada / NULLIF(st.promedio, 0), 2) AS indice,
               COALESCE(ex.existencia, 0) AS existencia,
               GREATEST(0, CEIL(st.temporada * ${n(p, 'meses')}::int) - COALESCE(ex.existencia, 0)) AS sugerido
        FROM st
        JOIN productos pr ON pr.id = st.producto_id AND pr.activo
        LEFT JOIN marcas m ON m.id = pr.marca_id
        LEFT JOIN ex ON ex.producto_id = st.producto_id
        WHERE st.promedio > 0 AND st.temporada >= 1 AND st.temporada / st.promedio >= ${n(p, 'indiceMinimo')}
        ORDER BY indice DESC, "ventaMesTemporada" DESC
        LIMIT ${n(p, 'limite')}`;
    },
  },
];

/**
 * Filtro de sucursal: consolidado solo con permiso `sucursales.todas`.
 * Todas las consultas exponen la tabla de sucursal con alias `su` o `v`.
 */
export function filtroSucursal(def: DefinicionReporte, ctx: Ctx, consolidado: boolean): Prisma.Sql {
  if (consolidado && tienePermiso(ctx.usuario, 'sucursales.todas')) return Prisma.empty;
  const id = ctx.sucursalId ?? -1;
  const usaVentas = ['ventas-por-dia', 'ventas-por-mes', 'ventas-por-producto', 'ventas-por-vendedor', 'ventas-por-medio-pago'].includes(def.clave);
  if (usaVentas) return Prisma.sql`AND v.sucursal_id = ${id}`;
  if (def.clave === 'compras-por-proveedor') return Prisma.sql`AND c.sucursal_id = ${id}`;
  return Prisma.sql`AND su.id = ${id}`;
}
