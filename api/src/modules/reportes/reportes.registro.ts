import { Prisma } from '@prisma/client';
import { z, ZodObject, ZodRawShape } from 'zod';
import type { Ctx } from '../../common/auth/tipos';
import { tienePermiso } from '../../common/auth/tipos';
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
  categoria: 'Viajes' | 'Flota' | 'Combustible' | 'Mantenimiento' | 'Llantas' | 'Financiero' | 'RRHH';
  permiso: string;
  descripcion: string;
  parametros: ZodObject<ZodRawShape>;
  /** Cómo pintar cada parámetro en el portal (etiqueta, tipo y valor por defecto). */
  parametrosUI?: Record<string, { etiqueta: string; tipo: 'fecha' | 'numero' | 'bool'; defecto?: string | number }>;
  columnas: Columna[];
  /** filtroSucursal: fragmento listo (alias v/cc/ot/g/su); sucursalId: null = consolidado */
  ejecutar: (db: PrismaService, p: Record<string, unknown>, filtroSucursal: Prisma.Sql, sucursalId: number | null) => Promise<Fila[]>;
}

const UI_RANGO = {
  desde: { etiqueta: 'Desde', tipo: 'fecha' as const },
  hasta: { etiqueta: 'Hasta', tipo: 'fecha' as const },
  consolidado: { etiqueta: 'Todas las sedes', tipo: 'bool' as const },
};

/**
 * REPORTERÍA DECLARATIVA (metadata-driven):
 * cada reporte declara parámetros + columnas + consulta. El portal obtiene
 * GET /reportes (catálogo) y renderiza filtros y tabla con su motor de
 * configuración — un reporte nuevo NO requiere pantalla nueva.
 * Las consultas son SQL parametrizado (tagged templates => sin inyección SQL).
 */
const rango = z.object({
  desde: zFecha.default(() => aYmd(sumarDias(fechaContable(), -30))),
  hasta: zFecha.default(() => aYmd(fechaContable())),
  consolidado: z.enum(['true', 'false']).optional(), // todas las sedes (requiere sucursales.todas)
});

/** Fecha validada 'YYYY-MM-DD' (se castea a ::date en SQL). */
const d = (p: Record<string, unknown>, k: string): string => {
  parseFecha(String(p[k])); // valida
  return String(p[k]);
};

const NOMBRE_TERCERO = Prisma.raw(`COALESCE(t.razon_social, t.nombre_comercial, CONCAT_WS(' ', t.nombres, t.apellidos))`);
const NOMBRE_PILOTO = Prisma.raw(`CONCAT_WS(' ', e.nombres, e.apellidos)`);

export const REPORTES: DefinicionReporte[] = [
  // ─────────────────────────── VIAJES ───────────────────────────
  {
    clave: 'viajes-por-periodo',
    titulo: 'Viajes del período',
    categoria: 'Viajes',
    permiso: 'reportes.viajes',
    descripcion: 'Cada viaje con cliente, cabezal, piloto, km, lo cobrado, sus costos y la utilidad',
    parametros: rango,
    parametrosUI: UI_RANGO,
    columnas: [
      { accessorKey: 'numero', header: 'Viaje', tipo: 'texto' },
      { accessorKey: 'fecha', header: 'Salida', tipo: 'fecha' },
      { accessorKey: 'cliente', header: 'Cliente', tipo: 'texto' },
      { accessorKey: 'origen', header: 'Origen', tipo: 'texto' },
      { accessorKey: 'destino', header: 'Destino', tipo: 'texto' },
      { accessorKey: 'cabezal', header: 'Cabezal', tipo: 'texto' },
      { accessorKey: 'piloto', header: 'Piloto', tipo: 'texto' },
      { accessorKey: 'km', header: 'Km', tipo: 'numero', total: true },
      { accessorKey: 'kmVacios', header: 'Km vacíos', tipo: 'numero', total: true },
      { accessorKey: 'ingreso', header: 'Cobrado', tipo: 'moneda', total: true },
      { accessorKey: 'costoTotal', header: 'Costos', tipo: 'moneda', total: true },
      { accessorKey: 'utilidad', header: 'Utilidad', tipo: 'moneda', total: true },
      { accessorKey: 'estado', header: 'Estado', tipo: 'texto' },
    ],
    ejecutar: (db, p, f) => db.$queryRaw<Fila[]>`
      SELECT v.numero, v.fecha_salida::date AS fecha, ${NOMBRE_TERCERO} AS cliente, v.origen, v.destino,
             c.codigo AS cabezal, ${NOMBRE_PILOTO} AS piloto,
             COALESCE(v.km_llegada - v.km_salida, 0) AS km, v.km_vacios AS "kmVacios",
             v.monto_cobrado AS ingreso, v.total_costos AS "costoTotal",
             v.monto_cobrado - v.total_costos - v.pago_piloto AS utilidad, v.estado
      FROM viajes v
      JOIN terceros t ON t.id = v.cliente_id
      JOIN cabezales c ON c.id = v.cabezal_id
      JOIN pilotos pi ON pi.id = v.piloto_id
      JOIN rrhh_empleados e ON e.id = pi.empleado_id
      WHERE v.fecha_salida::date BETWEEN ${d(p, 'desde')}::date AND ${d(p, 'hasta')}::date
        AND v.estado <> 'CANCELADO' ${f}
      ORDER BY v.fecha_salida DESC`,
  },
  {
    clave: 'ingresos-por-cliente',
    titulo: 'Ingresos y utilidad por cliente',
    categoria: 'Viajes',
    permiso: 'reportes.viajes',
    descripcion: 'Qué cliente deja más dinero: viajes, km, cobrado, costos y margen',
    parametros: rango,
    parametrosUI: UI_RANGO,
    columnas: [
      { accessorKey: 'cliente', header: 'Cliente', tipo: 'texto' },
      { accessorKey: 'viajes', header: 'Viajes', tipo: 'numero', total: true },
      { accessorKey: 'km', header: 'Km', tipo: 'numero', total: true },
      { accessorKey: 'ingreso', header: 'Cobrado', tipo: 'moneda', total: true },
      { accessorKey: 'costoTotal', header: 'Costos', tipo: 'moneda', total: true },
      { accessorKey: 'utilidad', header: 'Utilidad', tipo: 'moneda', total: true },
      { accessorKey: 'margen', header: 'Margen %', tipo: 'porcentaje' },
      { accessorKey: 'ingresoPorKm', header: 'Ingreso/km', tipo: 'moneda' },
    ],
    ejecutar: (db, p, f) => db.$queryRaw<Fila[]>`
      SELECT ${NOMBRE_TERCERO} AS cliente, COUNT(*)::int AS viajes,
             SUM(COALESCE(v.km_llegada - v.km_salida, 0)) AS km,
             SUM(v.monto_cobrado) AS ingreso, SUM(v.total_costos + v.pago_piloto) AS "costoTotal",
             SUM(v.monto_cobrado - v.total_costos - v.pago_piloto) AS utilidad,
             CASE WHEN SUM(v.monto_cobrado) > 0 THEN ROUND(100 * SUM(v.monto_cobrado - v.total_costos - v.pago_piloto) / SUM(v.monto_cobrado), 2) ELSE 0 END AS margen,
             CASE WHEN SUM(COALESCE(v.km_llegada - v.km_salida, 0)) > 0 THEN ROUND(SUM(v.monto_cobrado) / SUM(COALESCE(v.km_llegada - v.km_salida, 0)), 2) ELSE 0 END AS "ingresoPorKm"
      FROM viajes v JOIN terceros t ON t.id = v.cliente_id
      WHERE v.fecha_salida::date BETWEEN ${d(p, 'desde')}::date AND ${d(p, 'hasta')}::date
        AND v.estado IN ('FINALIZADO', 'LIQUIDADO') ${f}
      GROUP BY t.id, cliente
      ORDER BY utilidad DESC`,
  },

  // ─────────────────────────── FLOTA ────────────────────────────
  {
    clave: 'rentabilidad-por-cabezal',
    titulo: 'Rentabilidad por cabezal',
    categoria: 'Flota',
    permiso: 'reportes.financieros',
    descripcion: 'Por cabezal: viajes, km, ingresos, combustible, taller, costos de viaje y utilidad; costo e ingreso por km',
    parametros: rango,
    parametrosUI: UI_RANGO,
    columnas: [
      { accessorKey: 'cabezal', header: 'Cabezal', tipo: 'texto' },
      { accessorKey: 'placa', header: 'Placa', tipo: 'texto' },
      { accessorKey: 'viajes', header: 'Viajes', tipo: 'numero', total: true },
      { accessorKey: 'km', header: 'Km', tipo: 'numero', total: true },
      { accessorKey: 'ingreso', header: 'Ingresos', tipo: 'moneda', total: true },
      { accessorKey: 'combustible', header: 'Combustible', tipo: 'moneda', total: true },
      { accessorKey: 'taller', header: 'Taller', tipo: 'moneda', total: true },
      { accessorKey: 'otrosCostos', header: 'Otros costos de viaje', tipo: 'moneda', total: true },
      { accessorKey: 'utilidad', header: 'Utilidad', tipo: 'moneda', total: true },
      { accessorKey: 'costoPorKm', header: 'Costo/km', tipo: 'moneda' },
      { accessorKey: 'ingresoPorKm', header: 'Ingreso/km', tipo: 'moneda' },
    ],
    ejecutar: (db, p, f) => db.$queryRaw<Fila[]>`
      WITH vi AS (
        SELECT v.cabezal_id, COUNT(*)::int AS viajes, SUM(COALESCE(v.km_llegada - v.km_salida, 0)) AS km,
               SUM(v.monto_cobrado) AS ingreso, SUM(v.pago_piloto) AS pago_piloto,
               SUM((SELECT COALESCE(SUM(cv.monto), 0) FROM costos_viaje cv WHERE cv.viaje_id = v.id AND cv.tipo <> 'COMBUSTIBLE')) AS otros
        FROM viajes v
        WHERE v.fecha_salida::date BETWEEN ${d(p, 'desde')}::date AND ${d(p, 'hasta')}::date AND v.estado IN ('FINALIZADO', 'LIQUIDADO') ${f}
        GROUP BY v.cabezal_id),
      co AS (SELECT cc.cabezal_id, SUM(cc.total) AS combustible FROM cargas_combustible cc
             WHERE cc.fecha::date BETWEEN ${d(p, 'desde')}::date AND ${d(p, 'hasta')}::date GROUP BY cc.cabezal_id),
      ta AS (SELECT ot.cabezal_id, SUM(ot.total) AS taller FROM ordenes_trabajo ot
             WHERE ot.fecha_apertura::date BETWEEN ${d(p, 'desde')}::date AND ${d(p, 'hasta')}::date AND ot.estado <> 'ANULADA' GROUP BY ot.cabezal_id)
      SELECT c.codigo AS cabezal, c.placa, COALESCE(vi.viajes, 0) AS viajes, COALESCE(vi.km, 0) AS km, COALESCE(vi.ingreso, 0) AS ingreso,
             COALESCE(co.combustible, 0) AS combustible, COALESCE(ta.taller, 0) AS taller, COALESCE(vi.otros, 0) AS "otrosCostos",
             COALESCE(vi.ingreso, 0) - COALESCE(co.combustible, 0) - COALESCE(ta.taller, 0) - COALESCE(vi.otros, 0) - COALESCE(vi.pago_piloto, 0) AS utilidad,
             CASE WHEN COALESCE(vi.km, 0) > 0 THEN ROUND((COALESCE(co.combustible, 0) + COALESCE(ta.taller, 0) + COALESCE(vi.otros, 0) + COALESCE(vi.pago_piloto, 0)) / vi.km, 2) ELSE 0 END AS "costoPorKm",
             CASE WHEN COALESCE(vi.km, 0) > 0 THEN ROUND(COALESCE(vi.ingreso, 0) / vi.km, 2) ELSE 0 END AS "ingresoPorKm"
      FROM cabezales c
      LEFT JOIN vi ON vi.cabezal_id = c.id
      LEFT JOIN co ON co.cabezal_id = c.id
      LEFT JOIN ta ON ta.cabezal_id = c.id
      WHERE c.activo = true
      ORDER BY utilidad DESC`,
  },
  {
    clave: 'documentos-por-vencer',
    titulo: 'Documentos y licencias por vencer',
    categoria: 'Flota',
    permiso: 'reportes.flota',
    descripcion: 'Seguros, tarjetas de circulación, permisos y licencias de pilotos que vencen en los próximos días',
    parametros: z.object({ dias: z.coerce.number().int().min(1).max(365).default(60) }),
    parametrosUI: { dias: { etiqueta: 'Próximos días', tipo: 'numero', defecto: 60 } },
    columnas: [
      { accessorKey: 'vence', header: 'Vence', tipo: 'fecha' },
      { accessorKey: 'diasRestantes', header: 'Días', tipo: 'numero' },
      { accessorKey: 'tipo', header: 'Documento', tipo: 'texto' },
      { accessorKey: 'unidad', header: 'Cabezal / remolque / piloto', tipo: 'texto' },
      { accessorKey: 'numero', header: 'Número', tipo: 'texto' },
      { accessorKey: 'emisor', header: 'Emisor', tipo: 'texto' },
    ],
    ejecutar: (db, p) => db.$queryRaw<Fila[]>`
      SELECT dv.vence, (dv.vence - CURRENT_DATE)::int AS "diasRestantes", dv.tipo,
             COALESCE(c.codigo || ' ' || c.placa, r.codigo || ' ' || r.placa) AS unidad, dv.numero, dv.emisor
      FROM documentos_vehiculo dv
      LEFT JOIN cabezales c ON c.id = dv.cabezal_id
      LEFT JOIN remolques r ON r.id = dv.remolque_id
      WHERE dv.activo = true AND dv.vence <= CURRENT_DATE + ${Number(p.dias)}::int
      UNION ALL
      SELECT pi.licencia_vence AS vence, (pi.licencia_vence - CURRENT_DATE)::int, 'LICENCIA_PILOTO',
             CONCAT_WS(' ', e.nombres, e.apellidos), pi.licencia_numero, pi.licencia_tipo
      FROM pilotos pi JOIN rrhh_empleados e ON e.id = pi.empleado_id
      WHERE pi.activo = true AND pi.licencia_vence <= CURRENT_DATE + ${Number(p.dias)}::int
      ORDER BY 1`,
  },

  // ─────────────────────────── COMBUSTIBLE ──────────────────────
  {
    clave: 'combustible-por-cabezal',
    titulo: 'Combustible y rendimiento por cabezal',
    categoria: 'Combustible',
    permiso: 'reportes.flota',
    descripcion: 'Galones, gasto y km por galón real de cada cabezal frente a su rendimiento esperado',
    parametros: rango,
    parametrosUI: UI_RANGO,
    columnas: [
      { accessorKey: 'cabezal', header: 'Cabezal', tipo: 'texto' },
      { accessorKey: 'cargas', header: 'Cargas', tipo: 'numero', total: true },
      { accessorKey: 'galones', header: 'Galones', tipo: 'numero', total: true },
      { accessorKey: 'gasto', header: 'Gasto', tipo: 'moneda', total: true },
      { accessorKey: 'precioPromedio', header: 'Precio/gal', tipo: 'moneda' },
      { accessorKey: 'km', header: 'Km recorridos', tipo: 'numero', total: true },
      { accessorKey: 'rendimiento', header: 'Km/gal real', tipo: 'numero' },
      { accessorKey: 'esperado', header: 'Km/gal esperado', tipo: 'numero' },
      { accessorKey: 'costoPorKm', header: 'Combustible/km', tipo: 'moneda' },
    ],
    ejecutar: (db, p, f) => db.$queryRaw<Fila[]>`
      SELECT c.codigo AS cabezal, COUNT(cc.id)::int AS cargas, SUM(cc.galones) AS galones, SUM(cc.total) AS gasto,
             CASE WHEN SUM(cc.galones) > 0 THEN ROUND(SUM(cc.total) / SUM(cc.galones), 2) ELSE 0 END AS "precioPromedio",
             MAX(cc.odometro) - MIN(cc.odometro) AS km,
             CASE WHEN SUM(cc.galones) > 0 THEN ROUND((MAX(cc.odometro) - MIN(cc.odometro)) / SUM(cc.galones), 2) ELSE 0 END AS rendimiento,
             c.rendimiento_esperado AS esperado,
             CASE WHEN MAX(cc.odometro) - MIN(cc.odometro) > 0 THEN ROUND(SUM(cc.total) / (MAX(cc.odometro) - MIN(cc.odometro)), 2) ELSE 0 END AS "costoPorKm"
      FROM cargas_combustible cc JOIN cabezales c ON c.id = cc.cabezal_id
      WHERE cc.fecha::date BETWEEN ${d(p, 'desde')}::date AND ${d(p, 'hasta')}::date ${f}
      GROUP BY c.id, c.codigo, c.rendimiento_esperado
      ORDER BY c.codigo`,
  },

  // ─────────────────────────── MANTENIMIENTO ────────────────────
  {
    clave: 'mantenimiento-por-cabezal',
    titulo: 'Gasto de taller por cabezal',
    categoria: 'Mantenimiento',
    permiso: 'reportes.mantenimiento',
    descripcion: 'Órdenes de trabajo, mano de obra y repuestos por cabezal, separando preventivo, correctivo y servicios mayores',
    parametros: rango,
    parametrosUI: UI_RANGO,
    columnas: [
      { accessorKey: 'cabezal', header: 'Cabezal', tipo: 'texto' },
      { accessorKey: 'ordenes', header: 'Órdenes', tipo: 'numero', total: true },
      { accessorKey: 'preventivo', header: 'Preventivo', tipo: 'moneda', total: true },
      { accessorKey: 'servicioMayor', header: 'Servicio mayor', tipo: 'moneda', total: true },
      { accessorKey: 'correctivo', header: 'Correctivo', tipo: 'moneda', total: true },
      { accessorKey: 'llantas', header: 'Llantas', tipo: 'moneda', total: true },
      { accessorKey: 'manoObra', header: 'Mano de obra', tipo: 'moneda', total: true },
      { accessorKey: 'repuestos', header: 'Repuestos', tipo: 'moneda', total: true },
      { accessorKey: 'total', header: 'Total', tipo: 'moneda', total: true },
    ],
    ejecutar: (db, p, f) => db.$queryRaw<Fila[]>`
      SELECT c.codigo AS cabezal, COUNT(ot.id)::int AS ordenes,
             SUM(CASE WHEN ot.tipo = 'PREVENTIVO' THEN ot.total ELSE 0 END) AS preventivo,
             SUM(CASE WHEN ot.tipo = 'SERVICIO_MAYOR' THEN ot.total ELSE 0 END) AS "servicioMayor",
             SUM(CASE WHEN ot.tipo IN ('CORRECTIVO', 'CARROCERIA') THEN ot.total ELSE 0 END) AS correctivo,
             SUM(CASE WHEN ot.tipo = 'LLANTAS' THEN ot.total ELSE 0 END) AS llantas,
             SUM(ot.mano_obra) AS "manoObra", SUM(ot.total_repuestos) AS repuestos, SUM(ot.total) AS total
      FROM ordenes_trabajo ot JOIN cabezales c ON c.id = ot.cabezal_id
      WHERE ot.fecha_apertura::date BETWEEN ${d(p, 'desde')}::date AND ${d(p, 'hasta')}::date AND ot.estado <> 'ANULADA' ${f}
      GROUP BY c.id, c.codigo
      ORDER BY total DESC`,
  },
  {
    clave: 'repuestos-por-marca',
    titulo: 'Repuestos usados por marca',
    categoria: 'Mantenimiento',
    permiso: 'reportes.mantenimiento',
    descripcion: 'Qué marcas de repuestos se usan, cuántas veces y cuánto cuestan (para decidir con cuál quedarse)',
    parametros: rango,
    parametrosUI: UI_RANGO,
    columnas: [
      { accessorKey: 'repuesto', header: 'Repuesto', tipo: 'texto' },
      { accessorKey: 'marca', header: 'Marca', tipo: 'texto' },
      { accessorKey: 'veces', header: 'Veces usado', tipo: 'numero', total: true },
      { accessorKey: 'cantidad', header: 'Cantidad', tipo: 'numero', total: true },
      { accessorKey: 'costoPromedio', header: 'Costo promedio', tipo: 'moneda' },
      { accessorKey: 'total', header: 'Total', tipo: 'moneda', total: true },
    ],
    ejecutar: (db, p) => db.$queryRaw<Fila[]>`
      SELECT r.nombre AS repuesto, COALESCE(m.nombre, 'Sin marca') AS marca, COUNT(*)::int AS veces, SUM(otr.cantidad) AS cantidad,
             ROUND(AVG(otr.costo_unitario), 2) AS "costoPromedio", SUM(otr.total) AS total
      FROM ordenes_trabajo_repuestos otr
      JOIN ordenes_trabajo ot ON ot.id = otr.orden_id
      JOIN repuestos r ON r.id = otr.repuesto_id
      LEFT JOIN marcas m ON m.id = COALESCE(otr.marca_id, r.marca_id)
      WHERE ot.fecha_apertura::date BETWEEN ${d(p, 'desde')}::date AND ${d(p, 'hasta')}::date AND ot.estado <> 'ANULADA'
      GROUP BY r.id, r.nombre, m.nombre
      ORDER BY r.nombre, total DESC`,
  },

  // ─────────────────────────── LLANTAS ──────────────────────────
  {
    clave: 'llantas-costo-por-km',
    titulo: 'Rendimiento de llantas por marca',
    categoria: 'Llantas',
    permiso: 'reportes.flota',
    descripcion: 'Km promedio que dura cada marca y medida de llanta y lo que cuesta por km (llantas ya retiradas)',
    parametros: z.object({}),
    columnas: [
      { accessorKey: 'marca', header: 'Marca', tipo: 'texto' },
      { accessorKey: 'medida', header: 'Medida', tipo: 'texto' },
      { accessorKey: 'llantas', header: 'Llantas', tipo: 'numero', total: true },
      { accessorKey: 'kmPromedio', header: 'Km promedio', tipo: 'numero' },
      { accessorKey: 'precioPromedio', header: 'Precio promedio', tipo: 'moneda' },
      { accessorKey: 'costoPorKm', header: 'Costo/km', tipo: 'moneda' },
    ],
    ejecutar: (db) => db.$queryRaw<Fila[]>`
      SELECT COALESCE(m.nombre, 'Sin marca') AS marca, l.medida, COUNT(*)::int AS llantas,
             ROUND(AVG(l.km_acumulados), 0) AS "kmPromedio", ROUND(AVG(l.precio), 2) AS "precioPromedio",
             CASE WHEN SUM(l.km_acumulados) > 0 THEN ROUND(SUM(l.precio) / SUM(l.km_acumulados), 4) ELSE 0 END AS "costoPorKm"
      FROM llantas l LEFT JOIN marcas m ON m.id = l.marca_id
      WHERE l.km_acumulados > 0
      GROUP BY m.nombre, l.medida
      ORDER BY "costoPorKm" ASC`,
  },

  // ─────────────────────────── FINANCIERO ───────────────────────
  {
    clave: 'gastos-por-categoria',
    titulo: 'Gastos de operación por categoría',
    categoria: 'Financiero',
    permiso: 'reportes.financieros',
    descripcion: 'Gastos fijos y administrativos del período agrupados por categoría',
    parametros: rango,
    parametrosUI: UI_RANGO,
    columnas: [
      { accessorKey: 'categoria', header: 'Categoría', tipo: 'texto' },
      { accessorKey: 'gastos', header: 'Registros', tipo: 'numero', total: true },
      { accessorKey: 'total', header: 'Total', tipo: 'moneda', total: true },
    ],
    ejecutar: (db, p, f) => db.$queryRaw<Fila[]>`
      SELECT cg.nombre AS categoria, COUNT(*)::int AS gastos, SUM(g.monto) AS total
      FROM gastos g JOIN categorias_gasto cg ON cg.id = g.categoria_id
      WHERE g.fecha BETWEEN ${d(p, 'desde')}::date AND ${d(p, 'hasta')}::date AND g.estado = 'REGISTRADO' ${f}
      GROUP BY cg.nombre
      ORDER BY total DESC`,
  },

  // ─────────────────────────── RRHH ─────────────────────────────
  {
    clave: 'pago-pilotos',
    titulo: 'Viajes y pago por viaje de cada piloto',
    categoria: 'RRHH',
    permiso: 'reportes.rrhh',
    descripcion: 'Por piloto: viajes realizados, km, bono por viajes, anticipos entregados y costos que liquidó',
    parametros: rango,
    parametrosUI: UI_RANGO,
    columnas: [
      { accessorKey: 'piloto', header: 'Piloto', tipo: 'texto' },
      { accessorKey: 'viajes', header: 'Viajes', tipo: 'numero', total: true },
      { accessorKey: 'km', header: 'Km', tipo: 'numero', total: true },
      { accessorKey: 'pagoViajes', header: 'Bono por viajes', tipo: 'moneda', total: true },
      { accessorKey: 'anticipos', header: 'Anticipos', tipo: 'moneda', total: true },
      { accessorKey: 'costosLiquidados', header: 'Costos liquidados', tipo: 'moneda', total: true },
      { accessorKey: 'saldo', header: 'Saldo (a favor del piloto)', tipo: 'moneda', total: true },
    ],
    ejecutar: (db, p, f) => db.$queryRaw<Fila[]>`
      SELECT ${NOMBRE_PILOTO} AS piloto, COUNT(*)::int AS viajes, SUM(COALESCE(v.km_llegada - v.km_salida, 0)) AS km,
             SUM(v.pago_piloto) AS "pagoViajes", SUM(v.anticipo_piloto) AS anticipos, SUM(v.total_costos) AS "costosLiquidados",
             SUM(v.total_costos - v.anticipo_piloto) AS saldo
      FROM viajes v JOIN pilotos pi ON pi.id = v.piloto_id JOIN rrhh_empleados e ON e.id = pi.empleado_id
      WHERE v.fecha_salida::date BETWEEN ${d(p, 'desde')}::date AND ${d(p, 'hasta')}::date AND v.estado IN ('FINALIZADO', 'LIQUIDADO') ${f}
      GROUP BY pi.id, piloto
      ORDER BY viajes DESC`,
  },
];

/** Fragmento "AND <tabla>.sucursal_id = <sede>" según el reporte, o vacío si es consolidado. */
export function filtroSucursal(def: DefinicionReporte, ctx: Ctx, consolidado: boolean): Prisma.Sql {
  if (consolidado && tienePermiso(ctx.usuario, 'sucursales.todas')) return Prisma.empty;
  const id = ctx.sucursalId ?? -1;
  if (def.clave === 'combustible-por-cabezal') return Prisma.sql`AND cc.sucursal_id = ${id}`;
  if (def.clave === 'mantenimiento-por-cabezal') return Prisma.sql`AND ot.sucursal_id = ${id}`;
  if (def.clave === 'gastos-por-categoria') return Prisma.sql`AND g.sucursal_id = ${id}`;
  if (def.clave === 'rentabilidad-por-cabezal') return Prisma.sql`AND v.sucursal_id = ${id}`;
  if (['viajes-por-periodo', 'ingresos-por-cliente', 'pago-pilotos'].includes(def.clave)) return Prisma.sql`AND v.sucursal_id = ${id}`;
  return Prisma.empty;
}
