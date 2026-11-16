/**
 * CONSULTAS DEL AGENTE DE DATOS (capa semántica).
 *
 * La IA NO escribe SQL. Elige una herramienta y sus parámetros; aquí se arma una consulta
 * fija y parametrizada ($1, $2…). Nada de lo que escriba el usuario o la IA se pega dentro
 * del texto SQL: solo viajan como parámetros. Lo único que se inserta son fragmentos de una
 * lista cerrada (columnas, unidades de fecha).
 *
 * Reglas de negocio (iguales al cierre del día, para que las cifras coincidan):
 *  - Solo ventas confirmadas (sin anuladas ni cotizaciones) de la sucursal activa.
 *  - Fecha por día contable (fecha_contable), no por la hora UTC.
 *  - Montos con IVA incluido. Utilidad bruta = ventas - costo.
 * Todas las cifras salen como float8 y las fechas como texto: sin BigInt, Decimal ni Date.
 */
export type Medida = 'total' | 'transacciones' | 'unidades' | 'ticket_promedio' | 'descuentos' | 'utilidad';
export type Agrupar = 'dia' | 'semana' | 'mes' | 'anio' | 'dia_de_la_semana' | 'hora';
export type Entidad = 'producto' | 'subgrupo' | 'grupo' | 'categoria' | 'vendedor' | 'medio_pago';
export interface Clasificacion { tipo: 'categoria' | 'grupo' | 'subgrupo'; id: number }
export interface Filtros { productoId?: number; clasificacion?: Clasificacion; vendedorId?: number }
export interface Consulta { texto: string; valores: unknown[] }
export type Fila = Record<string, string | number | null>;

export const MEDIDAS: Medida[] = ['total', 'transacciones', 'unidades', 'ticket_promedio', 'descuentos', 'utilidad'];
export const ENTIDADES: Entidad[] = ['producto', 'subgrupo', 'grupo', 'categoria', 'vendedor', 'medio_pago'];
export const AGRUPAR: Agrupar[] = ['dia', 'semana', 'mes', 'anio', 'dia_de_la_semana', 'hora'];
export const ETIQUETA_MEDIDA: Record<Medida, { texto: string; formato: 'moneda' | 'numero' }> = {
  total: { texto: 'Ventas (Q)', formato: 'moneda' },
  transacciones: { texto: 'Número de ventas', formato: 'numero' },
  unidades: { texto: 'Unidades vendidas', formato: 'numero' },
  ticket_promedio: { texto: 'Ticket promedio (Q)', formato: 'moneda' },
  descuentos: { texto: 'Descuentos (Q)', formato: 'moneda' },
  utilidad: { texto: 'Utilidad bruta (Q)', formato: 'moneda' },
};
export const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

class Parametros {
  valores: unknown[] = [];
  agregar(valor: unknown, tipo: string) { this.valores.push(valor); return `$${this.valores.length}::${tipo}`; }
}

/** Medidas que necesitan el detalle de la venta (líneas) y no solo el encabezado. */
const necesitaDetalle = (m: Medida, f: Filtros) => m === 'unidades' || Boolean(f.productoId || f.clasificacion);

function expresionMedida(m: Medida, detalle: boolean): string {
  const e = {
    total: detalle ? 'SUM(d.subtotal)' : 'SUM(v.total)',
    transacciones: 'COUNT(DISTINCT v.id)',
    unidades: 'SUM(d.cantidad)',
    ticket_promedio: detalle ? 'SUM(d.subtotal) / NULLIF(COUNT(DISTINCT v.id), 0)' : 'SUM(v.total) / NULLIF(COUNT(v.id), 0)',
    descuentos: detalle ? 'SUM(d.descuento)' : 'SUM(v.descuento_total)',
    utilidad: detalle ? 'SUM(d.subtotal - d.cantidad * d.costo_unitario)' : 'SUM(v.total - v.costo_total)',
  }[m];
  return `COALESCE((${e})::float8, 0)`;
}

function condiciones(p: Parametros, sucursalId: number, desde: string, hasta: string, f: Filtros) {
  const where = [
    `v.sucursal_id = ${p.agregar(sucursalId, 'int')}`, `v.tipo = 'VENTA'`, `v.estado = 'CONFIRMADA'`,
    `v.fecha_contable BETWEEN ${p.agregar(desde, 'date')} AND ${p.agregar(hasta, 'date')}`,
  ];
  if (f.vendedorId) where.push(`v.vendedor_id = ${p.agregar(f.vendedorId, 'int')}`);
  if (f.productoId) where.push(`d.producto_id = ${p.agregar(f.productoId, 'int')}`);
  if (f.clasificacion) {
    const { tipo, id } = f.clasificacion; const ref = p.agregar(id, 'int');
    where.push(`p.subgrupo_id IN (${
      tipo === 'subgrupo' ? `WITH RECURSIVE sg(id) AS (SELECT id FROM subgrupos WHERE id = ${ref} UNION ALL SELECT s.id FROM subgrupos s JOIN sg ON s.padre_id = sg.id) SELECT id FROM sg`
        : tipo === 'grupo' ? `SELECT id FROM subgrupos WHERE grupo_id = ${ref}`
        : `SELECT s.id FROM subgrupos s JOIN grupos g ON g.id = s.grupo_id WHERE g.categoria_id = ${ref}`})`);
  }
  return where;
}
const JOIN_DETALLE = 'JOIN ventas_detalle d ON d.venta_id = v.id JOIN productos p ON p.id = d.producto_id';

const EXPRESION_PERIODO: Record<Agrupar, string> = {
  dia: `to_char(v.fecha_contable, 'YYYY-MM-DD')`,
  semana: `to_char(date_trunc('week', v.fecha_contable), 'YYYY-MM-DD')`,
  mes: `to_char(date_trunc('month', v.fecha_contable), 'YYYY-MM')`,
  anio: `to_char(date_trunc('year', v.fecha_contable), 'YYYY')`,
  dia_de_la_semana: `extract(isodow FROM v.fecha_contable)::int::text`,
  // v.fecha se guarda en UTC: se convierte a la hora de Guatemala
  hora: `extract(hour FROM (v.fecha AT TIME ZONE 'UTC') AT TIME ZONE 'America/Guatemala')::int::text`,
};

export function consultaSerie(a: { sucursalId: number; desde: string; hasta: string; agrupar: Agrupar; medida: Medida; filtros: Filtros }): Consulta {
  const p = new Parametros();
  const detalle = necesitaDetalle(a.medida, a.filtros);
  const where = condiciones(p, a.sucursalId, a.desde, a.hasta, a.filtros);
  return {
    texto: `SELECT ${EXPRESION_PERIODO[a.agrupar]} AS clave, ${expresionMedida(a.medida, detalle)} AS valor
FROM ventas v ${detalle ? JOIN_DETALLE : ''}
WHERE ${where.join(' AND ')}
GROUP BY 1 ORDER BY 1`,
    valores: p.valores,
  };
}

const ENTIDAD_SQL: Record<Entidad, { joins: string; id: string; etiqueta: string; detalle?: string; requiereDetalle: boolean }> = {
  producto: { joins: '', id: 'p.id', etiqueta: 'p.nombre', detalle: 'p.sku', requiereDetalle: true },
  subgrupo: { joins: 'JOIN subgrupos sg ON sg.id = p.subgrupo_id JOIN grupos g ON g.id = sg.grupo_id', id: 'sg.id', etiqueta: `g.nombre || ' › ' || sg.nombre`, requiereDetalle: true },
  grupo: { joins: 'JOIN subgrupos sg ON sg.id = p.subgrupo_id JOIN grupos g ON g.id = sg.grupo_id JOIN categorias c ON c.id = g.categoria_id', id: 'g.id', etiqueta: `c.nombre || ' › ' || g.nombre`, requiereDetalle: true },
  categoria: { joins: 'JOIN subgrupos sg ON sg.id = p.subgrupo_id JOIN grupos g ON g.id = sg.grupo_id JOIN categorias c ON c.id = g.categoria_id', id: 'c.id', etiqueta: 'c.nombre', requiereDetalle: true },
  vendedor: { joins: 'JOIN usuarios u ON u.id = v.vendedor_id', id: 'u.id', etiqueta: 'u.nombre', requiereDetalle: false },
  medio_pago: { joins: 'JOIN ventas_pagos pg ON pg.venta_id = v.id', id: 'pg.medio_pago::text', etiqueta: 'pg.medio_pago::text', requiereDetalle: false },
};

/** Ranking por entidad. En 'medio_pago' el total son los montos recibidos (ventas_pagos). */
export function consultaRanking(a: { sucursalId: number; desde: string; hasta: string; entidad: Entidad; medida: Medida; orden: 'mayor' | 'menor'; limite: number; filtros: Filtros }): Consulta {
  const p = new Parametros();
  const e = ENTIDAD_SQL[a.entidad];
  const detalle = e.requiereDetalle || necesitaDetalle(a.medida, a.filtros);
  const where = condiciones(p, a.sucursalId, a.desde, a.hasta, a.filtros);
  const valor = a.entidad === 'medio_pago'
    ? (a.medida === 'transacciones' ? 'COUNT(DISTINCT v.id)::float8' : 'COALESCE(SUM(pg.monto)::float8, 0)')
    : expresionMedida(a.medida, detalle);
  const limite = Math.min(500, Math.max(1, Math.trunc(a.limite))); // entero validado: no viene de texto libre
  return {
    texto: `SELECT *, SUM(valor) OVER () AS total_general FROM (
  SELECT ${e.id} AS id, ${e.etiqueta} AS etiqueta, ${e.detalle ? `${e.detalle} AS detalle,` : `NULL::text AS detalle,`} ${valor} AS valor
  FROM ventas v ${detalle ? JOIN_DETALLE : ''} ${e.joins}
  WHERE ${where.join(' AND ')}
  GROUP BY ${e.id}, ${e.etiqueta}${e.detalle ? `, ${e.detalle}` : ''}
) t ORDER BY valor ${a.orden === 'menor' ? 'ASC' : 'DESC'}, etiqueta ASC LIMIT ${limite}`,
    valores: p.valores,
  };
}

/** Un solo valor del período (para comparar períodos sin agrupar). */
export function consultaTotal(a: { sucursalId: number; desde: string; hasta: string; medida: Medida; filtros: Filtros }): Consulta {
  const p = new Parametros();
  const detalle = necesitaDetalle(a.medida, a.filtros);
  const where = condiciones(p, a.sucursalId, a.desde, a.hasta, a.filtros);
  return { texto: `SELECT ${expresionMedida(a.medida, detalle)} AS valor FROM ventas v ${detalle ? JOIN_DETALLE : ''} WHERE ${where.join(' AND ')}`, valores: p.valores };
}

export type EstadoInventario = 'bajo_minimo' | 'agotados_con_ventas' | 'sin_ventas' | 'mayor_valor';
const BODEGAS = `e.bodega_id IN (SELECT id FROM bodegas WHERE sucursal_id = $1::int AND activo)`;

export function consultaInventario(a: { sucursalId: number; estado: EstadoInventario; dias: number; hoy: string; limite: number; conCostos: boolean }): Consulta {
  const limite = Math.min(100, Math.max(1, Math.trunc(a.limite)));
  const valorCosto = a.conCostos ? `, COALESCE(SUM(e.cantidad * e.costo_promedio), 0)::float8 AS valor` : '';
  const baseProd = `FROM productos p LEFT JOIN existencias e ON e.producto_id = p.id AND ${BODEGAS}`;
  const ventasDe = (extra: string) => `SELECT 1 FROM ventas_detalle d JOIN ventas v ON v.id = d.venta_id WHERE d.producto_id = p.id AND v.sucursal_id = $1::int AND v.tipo = 'VENTA' AND v.estado = 'CONFIRMADA' ${extra}`;
  switch (a.estado) {
    case 'bajo_minimo':
      return { valores: [a.sucursalId], texto: `SELECT p.id, p.sku, p.nombre AS etiqueta, COALESCE(SUM(e.cantidad), 0)::float8 AS existencia, p.stock_minimo::float8 AS minimo${valorCosto}
${baseProd} WHERE p.activo AND p.maneja_inventario AND p.stock_minimo > 0
GROUP BY p.id HAVING COALESCE(SUM(e.cantidad), 0) < p.stock_minimo
ORDER BY (p.stock_minimo - COALESCE(SUM(e.cantidad), 0)) DESC, p.nombre LIMIT ${limite}` };
    case 'agotados_con_ventas':
      return { valores: [a.sucursalId, a.hoy, a.dias], texto: `SELECT p.id, p.sku, p.nombre AS etiqueta, COALESCE(SUM(e.cantidad), 0)::float8 AS existencia,
  (SELECT COALESCE(SUM(d.cantidad), 0)::float8 FROM ventas_detalle d JOIN ventas v ON v.id = d.venta_id WHERE d.producto_id = p.id AND v.sucursal_id = $1::int AND v.tipo = 'VENTA' AND v.estado = 'CONFIRMADA' AND v.fecha_contable > $2::date - $3::int) AS vendidas_periodo
${baseProd} WHERE p.activo AND p.maneja_inventario AND EXISTS (${ventasDe('AND v.fecha_contable > $2::date - $3::int')})
GROUP BY p.id HAVING COALESCE(SUM(e.cantidad), 0) <= 0
ORDER BY vendidas_periodo DESC, p.nombre LIMIT ${limite}` };
    case 'sin_ventas':
      return { valores: [a.sucursalId, a.hoy, a.dias], texto: `SELECT p.id, p.sku, p.nombre AS etiqueta, COALESCE(SUM(e.cantidad), 0)::float8 AS existencia,
  (SELECT to_char(MAX(v.fecha_contable), 'YYYY-MM-DD') FROM ventas_detalle d JOIN ventas v ON v.id = d.venta_id WHERE d.producto_id = p.id AND v.sucursal_id = $1::int AND v.tipo = 'VENTA' AND v.estado = 'CONFIRMADA') AS ultima_venta${valorCosto}
${baseProd} WHERE p.activo AND p.maneja_inventario AND NOT EXISTS (${ventasDe('AND v.fecha_contable > $2::date - $3::int')})
GROUP BY p.id HAVING COALESCE(SUM(e.cantidad), 0) > 0
ORDER BY ${a.conCostos ? 'COALESCE(SUM(e.cantidad * e.costo_promedio), 0)' : 'COALESCE(SUM(e.cantidad), 0)'} DESC, p.nombre LIMIT ${limite}` };
    case 'mayor_valor':
      return { valores: [a.sucursalId], texto: `SELECT p.id, p.sku, p.nombre AS etiqueta, COALESCE(SUM(e.cantidad), 0)::float8 AS existencia, COALESCE(SUM(e.cantidad * e.costo_promedio), 0)::float8 AS valor
${baseProd} WHERE p.activo AND p.maneja_inventario
GROUP BY p.id HAVING COALESCE(SUM(e.cantidad), 0) > 0
ORDER BY valor DESC, p.nombre LIMIT ${limite}` };
  }
}

export function consultaCompras(a: { sucursalId: number; desde: string; hasta: string; agrupar: 'proveedor' | 'mes' | 'dia'; limite: number }): Consulta {
  const limite = Math.min(100, Math.max(1, Math.trunc(a.limite)));
  const clave = a.agrupar === 'proveedor' ? `COALESCE(t.razon_social, t.nombre_comercial, NULLIF(TRIM(CONCAT(t.nombres, ' ', t.apellidos)), ''), 'Proveedor ' || c.proveedor_id)`
    : a.agrupar === 'mes' ? `to_char(date_trunc('month', c.fecha_contable), 'YYYY-MM')` : `to_char(c.fecha_contable, 'YYYY-MM-DD')`;
  return {
    valores: [a.sucursalId, a.desde, a.hasta],
    texto: `SELECT ${clave} AS clave, SUM(c.total)::float8 AS valor FROM compras c LEFT JOIN terceros t ON t.id = c.proveedor_id
WHERE c.sucursal_id = $1::int AND c.estado = 'CONFIRMADO' AND c.fecha_contable BETWEEN $2::date AND $3::date
GROUP BY 1 ORDER BY ${a.agrupar === 'proveedor' ? 'valor DESC' : '1'} LIMIT ${limite}`,
  };
}

/** Escapa % y _ para usarlos dentro de un ILIKE (el texto del usuario no debe actuar como comodín). */
export const escaparLike = (t: string) => t.replace(/[\\%_]/g, (c) => `\\${c}`);

export function consultaBuscar(a: { tipo: 'producto' | 'clasificacion' | 'vendedor'; texto: string }): Consulta {
  const like = `%${escaparLike(a.texto.trim().slice(0, 60))}%`;
  if (a.tipo === 'producto') {
    return { valores: [like, a.texto.trim().slice(0, 60)], texto: `SELECT id, sku, nombre AS etiqueta, similarity(nombre, $2::text)::float8 AS parecido FROM productos
WHERE activo AND (nombre ILIKE $1::text OR sku ILIKE $1::text OR texto_busqueda ILIKE $1::text) ORDER BY parecido DESC, nombre LIMIT 8` };
  }
  if (a.tipo === 'vendedor') {
    return { valores: [like], texto: `SELECT id, nombre AS etiqueta FROM usuarios WHERE activo AND (nombre ILIKE $1::text OR username ILIKE $1::text) ORDER BY nombre LIMIT 8` };
  }
  return { valores: [like], texto: `SELECT * FROM (
  SELECT 'categoria' AS tipo, id, nombre AS etiqueta FROM categorias WHERE activo AND nombre ILIKE $1::text
  UNION ALL SELECT 'grupo', g.id, c.nombre || ' › ' || g.nombre FROM grupos g JOIN categorias c ON c.id = g.categoria_id WHERE g.activo AND g.nombre ILIKE $1::text
  UNION ALL SELECT 'subgrupo', s.id, c.nombre || ' › ' || g.nombre || ' › ' || s.nombre FROM subgrupos s JOIN grupos g ON g.id = s.grupo_id JOIN categorias c ON c.id = g.categoria_id WHERE s.activo AND s.nombre ILIKE $1::text
) t ORDER BY etiqueta LIMIT 10` };
}

// ───────────────────────── Utilidades puras ─────────────────────────

const fechaUTC = (iso: string) => new Date(`${iso.length === 7 ? `${iso}-01` : iso}T00:00:00Z`);
/** Etiquetas de todos los períodos entre dos fechas (para rellenar con cero los que no tuvieron ventas). */
export function periodosEntre(desde: string, hasta: string, agrupar: 'dia' | 'semana' | 'mes' | 'anio'): string[] {
  const out: string[] = []; const fin = fechaUTC(hasta);
  const d = fechaUTC(desde);
  if (agrupar === 'semana') d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); // lunes de esa semana
  if (agrupar === 'mes') d.setUTCDate(1);
  if (agrupar === 'anio') { d.setUTCMonth(0, 1); }
  for (let i = 0; d <= fin && i < 5000; i++) {
    out.push(agrupar === 'mes' ? d.toISOString().slice(0, 7) : agrupar === 'anio' ? d.toISOString().slice(0, 4) : d.toISOString().slice(0, 10));
    if (agrupar === 'dia') d.setUTCDate(d.getUTCDate() + 1);
    else if (agrupar === 'semana') d.setUTCDate(d.getUTCDate() + 7);
    else if (agrupar === 'mes') d.setUTCMonth(d.getUTCMonth() + 1, 1);
    else d.setUTCFullYear(d.getUTCFullYear() + 1);
  }
  return out;
}

/** Serie completa: períodos sin ventas = 0, etiquetas de días de la semana y horas con nombre legible. */
export function completarSerie(filas: { clave: string; valor: number }[], a: { desde: string; hasta: string; agrupar: Agrupar }): { periodo: string; valor: number }[] {
  const por = new Map(filas.map((f) => [f.clave, Number(f.valor)]));
  if (a.agrupar === 'dia_de_la_semana') return DIAS_SEMANA.map((n, i) => ({ periodo: n, valor: por.get(String(i + 1)) ?? 0 }));
  if (a.agrupar === 'hora') {
    const horas = filas.map((f) => Number(f.clave)); if (!horas.length) return [];
    const lo = Math.min(...horas); const hi = Math.max(...horas);
    return Array.from({ length: hi - lo + 1 }, (_, i) => ({ periodo: `${String(lo + i).padStart(2, '0')}:00`, valor: por.get(String(lo + i)) ?? 0 }));
  }
  return periodosEntre(a.desde, a.hasta, a.agrupar).map((p) => ({ periodo: p, valor: por.get(p) ?? 0 }));
}

/** Resumen numérico de una serie: es lo que la IA ve para explicar, sin tener que mirar cientos de filas. */
export function resumirSerie(serie: { periodo: string; valor: number }[], esMedia = false) {
  if (!serie.length) return { periodos: 0 };
  const total = serie.reduce((s, p) => s + p.valor, 0);
  const max = serie.reduce((m, p) => (p.valor > m.valor ? p : m), serie[0]);
  const min = serie.reduce((m, p) => (p.valor < m.valor ? p : m), serie[0]);
  const mitad = Math.floor(serie.length / 2);
  const prom = (xs: { valor: number }[]) => (xs.length ? xs.reduce((s, p) => s + p.valor, 0) / xs.length : 0);
  const a = prom(serie.slice(0, mitad)); const b = prom(serie.slice(mitad));
  return {
    periodos: serie.length,
    ...(esMedia ? {} : { total: redondear(total) }),
    promedio_por_periodo: redondear(total / serie.length),
    maximo: { periodo: max.periodo, valor: redondear(max.valor) },
    minimo: { periodo: min.periodo, valor: redondear(min.valor) },
    cambio_segunda_mitad_vs_primera_pct: serie.length >= 4 && a > 0 ? redondear(((b - a) / a) * 100) : null,
  };
}
export const redondear = (n: number) => Math.round(n * 100) / 100;
