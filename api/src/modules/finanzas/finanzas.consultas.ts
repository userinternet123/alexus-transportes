/**
 * Consultas del análisis financiero (toda la empresa). Solo lectura. Separadas para probarlas tal cual en PostgreSQL.
 * $1 = primer día del mes más antiguo a analizar.
 */
export interface Consulta { texto: string; valores: unknown[] }
const MES = (col: string) => `to_char(${col}, 'YYYY-MM')`;

export function consultasFinanzas(desde: string, diasSinMovimiento = 180): Record<string, Consulta> {
  return {
    ventas: { valores: [desde], texto: `
      SELECT ${MES('v.fecha_contable')} AS mes, SUM(v.total)::float8 AS ventas_con_iva, SUM(v.iva_incluido)::float8 AS iva_debito,
             SUM(v.costo_total)::float8 AS costo, COUNT(*)::int AS tickets, SUM(COALESCE(v.cambio, 0))::float8 AS cambio
      FROM ventas v WHERE v.tipo = 'VENTA' AND v.estado = 'CONFIRMADA' AND v.fecha_contable >= $1::date GROUP BY 1` },
    // Devoluciones: restan venta; su costo solo se recupera si la mercadería regresó al inventario
    devoluciones: { valores: [desde], texto: `
      SELECT ${MES('d.fecha_contable')} AS mes, SUM(d.total)::float8 AS devol_con_iva,
             SUM(CASE WHEN d.reingresa_inventario THEN COALESCE(c.costo, 0) ELSE 0 END)::float8 AS devol_costo
      FROM devoluciones d
      LEFT JOIN LATERAL (
        SELECT SUM(dd.cantidad * COALESCE((SELECT vd.costo_unitario FROM ventas_detalle vd WHERE vd.venta_id = d.venta_id AND vd.producto_id = dd.producto_id LIMIT 1), 0)) AS costo
        FROM devoluciones_detalle dd WHERE dd.devolucion_id = d.id
      ) c ON true
      WHERE d.fecha_contable >= $1::date GROUP BY 1` },
    compras: { valores: [desde], texto: `
      SELECT ${MES('c.fecha_contable')} AS mes, SUM(c.total)::float8 AS compras
      FROM compras c WHERE c.estado = 'CONFIRMADO' AND c.fecha_contable >= $1::date GROUP BY 1` },
    // Caja: EGRESO = gasto pagado de caja; INGRESO = efectivo que entra (no es utilidad); RETIRO_PARCIAL (bóveda) no cuenta
    caja: { valores: [desde], texto: `
      SELECT ${MES('s.fecha_contable')} AS mes,
             SUM(CASE WHEN m.tipo = 'EGRESO' THEN m.monto ELSE 0 END)::float8 AS egresos_caja,
             SUM(CASE WHEN m.tipo = 'INGRESO' THEN m.monto ELSE 0 END)::float8 AS ingresos_caja
      FROM caja_movimientos m JOIN caja_sesiones s ON s.id = m.sesion_id
      WHERE s.fecha_contable >= $1::date GROUP BY 1` },
    // Planilla aprobada o pagada: lo devengado (sueldo, bonos) + la cuota patronal
    planilla: { valores: [desde], texto: `
      SELECT ${MES('p.fecha_fin')} AS mes, SUM(p.total_devengado + p.total_patronal)::float8 AS personal
      FROM rrhh_planillas p WHERE p.estado IN ('APROBADA', 'PAGADA') AND p.fecha_fin >= $1::date GROUP BY 1` },
    cobros: { valores: [desde], texto: `
      SELECT ${MES('v.fecha_contable')} AS mes, vp.medio_pago::text AS medio, SUM(vp.monto)::float8 AS monto
      FROM ventas_pagos vp JOIN ventas v ON v.id = vp.venta_id
      WHERE v.tipo = 'VENTA' AND v.estado = 'CONFIRMADA' AND v.fecha_contable >= $1::date GROUP BY 1, 2` },
    // Gastos pagados fuera de caja (módulo Gastos), sin los anulados
    gastos: { valores: [desde], texto: `
      SELECT ${MES('g.fecha')} AS mes, SUM(g.monto)::float8 AS gastos_otros
      FROM gastos g WHERE g.estado = 'REGISTRADO' AND g.fecha >= $1::date GROUP BY 1` },
    // Gastos de caja (por concepto escrito) y fuera de caja (por categoría), juntos
    gastosPorConcepto: { valores: [desde], texto: `
      SELECT concepto, SUM(monto)::float8 AS monto, COUNT(*)::int AS veces FROM (
        SELECT initcap(lower(trim(m.concepto))) AS concepto, m.monto
        FROM caja_movimientos m JOIN caja_sesiones s ON s.id = m.sesion_id
        WHERE m.tipo = 'EGRESO' AND s.fecha_contable >= $1::date
        UNION ALL
        SELECT cg.nombre AS concepto, g.monto FROM gastos g JOIN categorias_gasto cg ON cg.id = g.categoria_id
        WHERE g.estado = 'REGISTRADO' AND g.fecha >= $1::date
      ) x GROUP BY 1 ORDER BY 2 DESC LIMIT 12` },
    inventario: { valores: [diasSinMovimiento], texto: `
      SELECT COALESCE(SUM(e.cantidad * e.costo_promedio), 0)::float8 AS costo,
             COALESCE(SUM(e.cantidad * e.costo_promedio) FILTER (WHERE NOT EXISTS (
               SELECT 1 FROM ventas_detalle vd JOIN ventas v ON v.id = vd.venta_id
               WHERE vd.producto_id = e.producto_id AND v.tipo = 'VENTA' AND v.estado = 'CONFIRMADA' AND v.fecha_contable >= current_date - $1::int
             )), 0)::float8 AS sin_movimiento_costo
      FROM existencias e WHERE e.cantidad > 0` },
  };
}

export interface MesFinanzas {
  mes: string; ventas_con_iva: number; iva_debito: number; costo: number; tickets: number; devol_con_iva: number; devol_costo: number;
  compras: number; egresos_caja: number; ingresos_caja: number; personal: number; gastos_otros: number; cobros: Record<string, number>;
}
type Fila = Record<string, unknown> & { mes?: string };

/** Une los resultados en una lista de meses completa (los meses sin movimiento van en cero). El cambio entregado se resta del efectivo cobrado. */
export function armarMeses(meses: string[], r: { ventas: Fila[]; devoluciones: Fila[]; compras: Fila[]; caja: Fila[]; planilla: Fila[]; cobros: Fila[]; gastos?: Fila[] }): MesFinanzas[] {
  const por = (filas: Fila[]) => new Map(filas.map((f) => [String(f.mes), f]));
  const v = por(r.ventas); const d = por(r.devoluciones); const c = por(r.compras); const k = por(r.caja); const p = por(r.planilla); const g = por(r.gastos ?? []);
  const n = (x: unknown) => Number(x ?? 0) || 0;
  return meses.map((mes) => {
    const cobros: Record<string, number> = {};
    for (const f of r.cobros.filter((x) => x.mes === mes)) cobros[String(f.medio)] = n(f.monto);
    if (cobros.EFECTIVO !== undefined) cobros.EFECTIVO = Math.round((cobros.EFECTIVO - n(v.get(mes)?.cambio)) * 100) / 100;
    return {
      mes, ventas_con_iva: n(v.get(mes)?.ventas_con_iva), iva_debito: n(v.get(mes)?.iva_debito), costo: n(v.get(mes)?.costo), tickets: n(v.get(mes)?.tickets),
      devol_con_iva: n(d.get(mes)?.devol_con_iva), devol_costo: n(d.get(mes)?.devol_costo), compras: n(c.get(mes)?.compras),
      egresos_caja: n(k.get(mes)?.egresos_caja), ingresos_caja: n(k.get(mes)?.ingresos_caja), personal: n(p.get(mes)?.personal), gastos_otros: n(g.get(mes)?.gastos_otros), cobros,
    };
  });
}

/** Los n meses que terminan en el mes actual (incluido): ["2024-11", …, "2026-11"]. */
export function ultimosMeses(mesActual: string, n: number): string[] {
  const [y, m] = mesActual.split('-').map(Number);
  return Array.from({ length: n }, (_, i) => { const d = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; });
}
