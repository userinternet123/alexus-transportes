/**
 * PLANTILLAS ANALÍTICAS (lógica pura, sin base de datos ni IA).
 * Una plantilla es una consulta guardada con PERÍODOS RELATIVOS ("este mes", "últimos 12 meses"):
 * se vuelve a ejecutar cuando se quiera, con los datos de ese momento y sin gastar IA.
 */
import { z } from 'zod';
import { AGRUPAR, ENTIDADES, MEDIDAS } from './agente.consultas';

export const PERIODOS = {
  hoy: 'Hoy',
  este_mes: 'Este mes (hasta hoy)',
  mes_pasado: 'El mes pasado',
  ultimos_7_dias: 'Últimos 7 días',
  ultimos_30_dias: 'Últimos 30 días',
  este_anio: 'Este año (hasta hoy)',
  anio_pasado: 'El año pasado',
  ultimos_12_meses: 'Últimos 12 meses (incluye el mes en curso)',
  ultimos_36_meses: 'Últimos 36 meses (incluye el mes en curso)',
} as const;
export type PeriodoToken = keyof typeof PERIODOS;
export const TOKENS = Object.keys(PERIODOS) as [PeriodoToken, ...PeriodoToken[]];
export const CONTRA = { periodo_anterior: 'Contra el período anterior', mismo_periodo_anio_anterior: 'Contra el mismo período del año pasado' } as const;
export type Contra = keyof typeof CONTRA;
export interface Rango { desde: string; hasta: string }

// ───────────────────────── Calendario (UTC, sin zonas horarias) ─────────────────────────
const aFecha = (iso: string) => new Date(`${iso}T00:00:00Z`);
const aIso = (d: Date) => d.toISOString().slice(0, 10);
const sumarDias = (iso: string, n: number) => { const d = aFecha(iso); d.setUTCDate(d.getUTCDate() + n); return aIso(d); };
const primerDia = (y: number, m: number) => aIso(new Date(Date.UTC(y, m, 1)));
const ultimoDia = (y: number, m: number) => aIso(new Date(Date.UTC(y, m + 1, 0)));
const ym = (iso: string): [number, number] => { const d = aFecha(iso); return [d.getUTCFullYear(), d.getUTCMonth()]; };
export const diasEntre = (a: string, b: string) => Math.round((aFecha(b).getTime() - aFecha(a).getTime()) / 86_400_000) + 1;
/** Mueve una fecha N meses conservando el día; si ese mes no lo tiene (29 de febrero), usa su último día. */
export function desplazarMeses(iso: string, n: number): string {
  const d = aFecha(iso); const dia = d.getUTCDate();
  const destino = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const maximo = new Date(Date.UTC(destino.getUTCFullYear(), destino.getUTCMonth() + 1, 0)).getUTCDate();
  destino.setUTCDate(Math.min(dia, maximo));
  return aIso(destino);
}

export function resolverPeriodo(token: PeriodoToken, hoy: string): Rango {
  const [y, m] = ym(hoy);
  switch (token) {
    case 'hoy': return { desde: hoy, hasta: hoy };
    case 'este_mes': return { desde: primerDia(y, m), hasta: hoy };
    case 'mes_pasado': return { desde: primerDia(y, m - 1), hasta: ultimoDia(y, m - 1) };
    case 'ultimos_7_dias': return { desde: sumarDias(hoy, -6), hasta: hoy };
    case 'ultimos_30_dias': return { desde: sumarDias(hoy, -29), hasta: hoy };
    case 'este_anio': return { desde: `${y}-01-01`, hasta: hoy };
    case 'anio_pasado': return { desde: `${y - 1}-01-01`, hasta: `${y - 1}-12-31` };
    case 'ultimos_12_meses': return { desde: primerDia(y, m - 11), hasta: hoy };
    case 'ultimos_36_meses': return { desde: primerDia(y, m - 35), hasta: hoy };
  }
}

/** Período contra el que se compara: el inmediatamente anterior (alineado a meses y años) o el mismo del año pasado. */
export function resolverContra(token: PeriodoToken, contra: Contra, a: Rango): Rango {
  if (contra === 'mismo_periodo_anio_anterior') return { desde: desplazarMeses(a.desde, -12), hasta: desplazarMeses(a.hasta, -12) };
  const [y, m] = ym(a.desde);
  switch (token) {
    case 'este_mes': { // mismos días del mes anterior (sin pasarse de su último día)
      const ini = primerDia(y, m - 1); const fin = ultimoDia(y, m - 1); const comparable = sumarDias(ini, diasEntre(a.desde, a.hasta) - 1);
      return { desde: ini, hasta: comparable < fin ? comparable : fin };
    }
    case 'mes_pasado': return { desde: primerDia(y, m - 1), hasta: ultimoDia(y, m - 1) };
    case 'este_anio': case 'anio_pasado': return { desde: desplazarMeses(a.desde, -12), hasta: desplazarMeses(a.hasta, -12) };
    case 'ultimos_12_meses': return { desde: desplazarMeses(a.desde, -12), hasta: desplazarMeses(a.hasta, -12) };
    case 'ultimos_36_meses': return { desde: desplazarMeses(a.desde, -36), hasta: desplazarMeses(a.hasta, -36) };
    default: { const largo = diasEntre(a.desde, a.hasta); return { desde: sumarDias(a.desde, -largo), hasta: sumarDias(a.desde, -1) }; }
  }
}

/** Si un rango de fechas coincide con un período relativo conocido, devuelve su nombre. */
export function inferirPeriodo(r: Rango, hoy: string): PeriodoToken | null {
  return TOKENS.find((t) => { const x = resolverPeriodo(t, hoy); return x.desde === r.desde && x.hasta === r.hasta; }) ?? null;
}
export function inferirContra(token: PeriodoToken, a: Rango, b: Rango): Contra | null {
  return (Object.keys(CONTRA) as Contra[]).find((c) => { const x = resolverContra(token, c, a); return x.desde === b.desde && x.hasta === b.hasta; }) ?? null;
}

// ───────────────────────── Definición de una plantilla ─────────────────────────
const esFecha = (s: string) => { const d = new Date(`${s}T00:00:00Z`); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s; };
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(esFecha, 'La fecha no existe');
const rangoZ = z.object({ desde: fecha, hasta: fecha }).refine((r) => r.desde <= r.hasta, '"desde" no puede ser posterior a "hasta"');
const periodoZ = z.union([z.enum(TOKENS), rangoZ]);
const entero = z.coerce.number().int().positive();
const filtros = {
  producto_id: entero.optional(), vendedor_id: entero.optional(),
  clasificacion_tipo: z.enum(['categoria', 'grupo', 'subgrupo']).optional(), clasificacion_id: entero.optional(),
};
const medida = z.enum(MEDIDAS as [string, ...string[]]).default('total');
const limite = (def: number, max: number) => z.coerce.number().int().min(1).max(max).default(def);

const paso = z.discriminatedUnion('herramienta', [
  z.object({ herramienta: z.literal('ventas_por_periodo'), entrada: z.object({ periodo: periodoZ, agrupar_por: z.enum(AGRUPAR as [string, ...string[]]), medida, ...filtros }) }),
  z.object({ herramienta: z.literal('ranking'), entrada: z.object({ entidad: z.enum(ENTIDADES as [string, ...string[]]), periodo: periodoZ, medida, limite: limite(10, 30), orden: z.enum(['mayor', 'menor']).default('mayor'), ...filtros }) }),
  z.object({
    herramienta: z.literal('comparar_periodos'),
    entrada: z.object({ medida, por: z.enum(['total', 'producto', 'subgrupo', 'grupo', 'categoria', 'vendedor']), periodo: z.enum(TOKENS).optional(), contra: z.enum(['periodo_anterior', 'mismo_periodo_anio_anterior']).optional(), a: rangoZ.optional(), b: rangoZ.optional(), limite: limite(10, 30), ...filtros })
      .refine((e) => (e.periodo && e.contra) || (e.a && e.b), 'Indique el período y contra qué comparar, o dos rangos fijos'),
  }),
  z.object({ herramienta: z.literal('inventario'), entrada: z.object({ consulta: z.enum(['bajo_minimo', 'agotados_con_ventas', 'sin_ventas', 'mayor_valor']), dias: z.coerce.number().int().min(1).max(730).default(90), limite: limite(15, 50) }) }),
  z.object({ herramienta: z.literal('compras'), entrada: z.object({ periodo: periodoZ, agrupar_por: z.enum(['proveedor', 'mes', 'dia']), limite: limite(10, 50) }) }),
  z.object({ herramienta: z.literal('proyectar'), entrada: z.object({ periodos_futuros: z.coerce.number().int().min(1).max(90) }) }),
]);
export type Paso = z.infer<typeof paso>;

export const TIPOS_GRAFICA = ['barras', 'barras_horizontales', 'lineas', 'area', 'dona', 'numero', 'tabla'] as const;
export const definicionZ = z.object({
  version: z.literal(1).default(1),
  titulo: z.string().trim().min(1, 'Escriba un título').max(120),
  pasos: z.array(paso).min(1).max(2),
  salida: z.object({ tipoGrafica: z.enum(TIPOS_GRAFICA).optional(), columnasY: z.array(z.string()).max(6).optional() }).default({}),
}).superRefine((d, ctx) => {
  d.pasos.forEach((p, i) => {
    if (p.herramienta === 'proyectar' && (i === 0 || d.pasos[i - 1].herramienta !== 'ventas_por_periodo')) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Una proyección debe ir después de una serie de ventas por período', path: ['pasos', i] });
    }
  });
});
export type Definicion = z.infer<typeof definicionZ>;

export interface PasoResuelto { herramienta: string; entrada: Record<string, unknown> }
const limpiar = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null));
const FILTROS = ['producto_id', 'vendedor_id', 'clasificacion_tipo', 'clasificacion_id'] as const;
const soloFiltros = (e: Record<string, unknown>) => Object.fromEntries(FILTROS.filter((k) => e[k] !== undefined).map((k) => [k, e[k]]));

/** Convierte la plantilla en llamadas concretas a las herramientas, con las fechas de hoy. */
export function resolverDefinicion(def: Definicion, hoy: string, override?: PeriodoToken | null): { pasos: PasoResuelto[]; avisos: string[] } {
  const avisos: string[] = [];
  const conProyeccion = def.pasos.some((p) => p.herramienta === 'proyectar');
  if (override && conProyeccion) avisos.push('El período no se puede cambiar en un análisis con proyección: usa su propio historial.');
  const ov = override && !conProyeccion ? override : null;
  const rango = (p: PeriodoToken | Rango): Rango => (typeof p === 'string' ? resolverPeriodo(ov ?? p, hoy) : (ov ? resolverPeriodo(ov, hoy) : p));
  const pasos = def.pasos.map((p): PasoResuelto => {
    switch (p.herramienta) {
      case 'ventas_por_periodo': { const e = p.entrada; return { herramienta: p.herramienta, entrada: limpiar({ ...rango(e.periodo), agrupar_por: e.agrupar_por, medida: e.medida, ...soloFiltros(e) }) }; }
      case 'ranking': { const e = p.entrada; return { herramienta: p.herramienta, entrada: limpiar({ entidad: e.entidad, ...rango(e.periodo), medida: e.medida, limite: e.limite, orden: e.orden, ...soloFiltros(e) }) }; }
      case 'comparar_periodos': {
        const e = p.entrada; let a: Rango; let b: Rango;
        if (e.periodo && e.contra) {
          const token = ov ?? e.periodo; a = resolverPeriodo(token, hoy); b = resolverContra(token, e.contra, a);
        } else { a = e.a!; b = e.b!; if (ov) avisos.push('Un análisis con fechas fijas no cambia de período.'); }
        return { herramienta: p.herramienta, entrada: limpiar({ medida: e.medida, por: e.por, desde_a: a.desde, hasta_a: a.hasta, desde_b: b.desde, hasta_b: b.hasta, limite: e.limite, ...soloFiltros(e) }) };
      }
      case 'inventario': return { herramienta: p.herramienta, entrada: { ...p.entrada } };
      case 'compras': { const e = p.entrada; return { herramienta: p.herramienta, entrada: { ...rango(e.periodo), agrupar_por: e.agrupar_por, limite: e.limite } }; }
      case 'proyectar': return { herramienta: p.herramienta, entrada: { resultado_id: '@anterior', periodos_futuros: p.entrada.periodos_futuros } };
    }
  });
  return { pasos, avisos };
}

/** Lo contrario: de las llamadas que hizo la IA (fechas concretas) a una plantilla con períodos relativos cuando se pueda. */
export function aDefinicion(ejecutados: PasoResuelto[], titulo: string, salida: Definicion['salida'], hoy: string): { definicion: Definicion; fijos: string[] } {
  const fijos: string[] = [];
  const per = (e: Record<string, unknown>, n: number): PeriodoToken | Rango => {
    const r = { desde: String(e.desde), hasta: String(e.hasta) };
    const t = inferirPeriodo(r, hoy);
    if (!t) fijos.push(`Paso ${n}: usa fechas fijas (${r.desde} a ${r.hasta}).`);
    return t ?? r;
  };
  const pasos = ejecutados.map((p, i) => {
    const e = p.entrada; const n = i + 1;
    switch (p.herramienta) {
      case 'ventas_por_periodo': return { herramienta: p.herramienta, entrada: limpiar({ periodo: per(e, n), agrupar_por: e.agrupar_por, medida: e.medida, ...soloFiltros(e) }) };
      case 'ranking': return { herramienta: p.herramienta, entrada: limpiar({ entidad: e.entidad, periodo: per(e, n), medida: e.medida, limite: e.limite, orden: e.orden, ...soloFiltros(e) }) };
      case 'comparar_periodos': {
        const a = { desde: String(e.desde_a), hasta: String(e.hasta_a) }; const b = { desde: String(e.desde_b), hasta: String(e.hasta_b) };
        const t = inferirPeriodo(a, hoy); const c = t ? inferirContra(t, a, b) : null;
        if (!t || !c) fijos.push(`Paso ${n}: compara fechas fijas (${a.desde} a ${a.hasta} contra ${b.desde} a ${b.hasta}).`);
        return { herramienta: p.herramienta, entrada: limpiar({ medida: e.medida, por: e.por, ...(t && c ? { periodo: t, contra: c } : { a, b }), limite: e.limite, ...soloFiltros(e) }) };
      }
      case 'compras': return { herramienta: p.herramienta, entrada: limpiar({ periodo: per(e, n), agrupar_por: e.agrupar_por, limite: e.limite }) };
      case 'inventario': return { herramienta: p.herramienta, entrada: limpiar({ consulta: e.consulta, dias: e.dias, limite: e.limite }) };
      default: return { herramienta: p.herramienta, entrada: limpiar({ periodos_futuros: e.periodos_futuros }) };
    }
  });
  return { definicion: definicionZ.parse({ version: 1, titulo, pasos, salida }), fijos };
}

// ───────────────────────── Visibilidad ─────────────────────────
export interface Compartido { destinoTipo: 'ROL' | 'USUARIO' | string; destinoId: number }
/** Lo ve su dueño, o quien lo recibió directamente o por medio de alguno de sus roles. */
export function puedeVer(o: { propietarioId: number; compartidos: Compartido[] }, usuarioId: number, rolIds: number[]): boolean {
  return o.propietarioId === usuarioId || o.compartidos.some((c) => (c.destinoTipo === 'USUARIO' && c.destinoId === usuarioId) || (c.destinoTipo === 'ROL' && rolIds.includes(c.destinoId)));
}
