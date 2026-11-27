/**
 * GERENCIA (lógica pura, sin base de datos): costo total por cabezal (TCO), scorecard del piloto,
 * presupuesto de mantenimiento e indicadores del tablero.
 *
 * Costo total de un cabezal en un período = combustible + costos directos de sus viajes (peajes, viáticos, parqueos…)
 * + pago al piloto (bono por viaje y su sueldo repartido por los km que manejó en cada cabezal) + taller + llantas
 * (km × costo por km de las llantas montadas) + incidentes (costo neto) + depreciación + seguros y documentos
 * (prorrateados por días de vigencia) + gastos generales repartidos por km.
 */
import { z } from 'zod';
import { D, Decimal, Num, r2, suma, ZERO } from '../../common/money';
import { zIdOpt, zNum } from '../../common/pipes/zod';

const DIA = 86_400_000;
const zDia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha no válida (AAAA-MM-DD)');

export const periodoZ = z.object({ desde: zDia.optional(), hasta: zDia.optional() });
export const presupuestoZ = z.object({
  anio: zNum(z.number().int().min(2020).max(2100)),
  mes: zNum(z.number().int().min(1).max(12)),
  cabezalId: zIdOpt, // vacío = toda la flota
  monto: zNum(z.number().nonnegative().max(99_999_999)),
  todoElAnio: z.boolean().default(false), // aplica el monto a todos los meses del año desde `mes`
  notas: z.string().trim().max(300).optional().nullable(),
});

/** Días (enteros, inclusivos) en que se traslapan dos rangos. */
export function diasTraslape(a1: Date, a2: Date, b1: Date, b2: Date): number {
  const ini = Math.max(a1.getTime(), b1.getTime());
  const fin = Math.min(a2.getTime(), b2.getTime());
  return fin < ini ? 0 : Math.floor((fin - ini) / DIA) + 1;
}

/** Parte de un seguro o documento que corresponde al período (costo × días del período dentro de su vigencia ÷ días de vigencia). */
export function prorrateoDocumento(d: { costo: Num | null; emitido: Date | null; vence: Date }, desde: Date, hasta: Date): Decimal {
  if (d.costo == null || D(d.costo).lte(0)) return ZERO;
  const inicio = d.emitido ?? new Date(d.vence.getTime() - 364 * DIA);
  const vigencia = Math.max(1, Math.floor((d.vence.getTime() - inicio.getTime()) / DIA) + 1);
  return r2(D(d.costo).times(diasTraslape(inicio, d.vence, desde, hasta)).div(vigencia));
}

export const PARTIDAS = ['combustible', 'viaje', 'piloto', 'taller', 'llantas', 'incidentes', 'depreciacion', 'documentos', 'generales'] as const;
export type Partida = (typeof PARTIDAS)[number];
export const NOMBRE_PARTIDA: Record<Partida, string> = {
  combustible: 'Combustible', viaje: 'Peajes, viáticos y otros del viaje', piloto: 'Piloto (sueldo y bono por viaje)', taller: 'Taller y repuestos',
  llantas: 'Llantas', incidentes: 'Incidentes y multas', depreciacion: 'Depreciación', documentos: 'Seguros y documentos', generales: 'Gastos generales',
};

export interface EntradaTco {
  ingresos: Num; km: Num; kmVacios: Num; viajes: number; diasConViaje: number; diasPeriodo: number;
  partidas: Partial<Record<Partida, Num>>;
}

/** Costo total, utilidad, margen, costo e ingreso por km, km vacíos y utilización de una unidad. */
export function tco(e: EntradaTco) {
  const partidas = Object.fromEntries(PARTIDAS.map((p) => [p, r2(e.partidas[p] ?? 0)])) as Record<Partida, Decimal>;
  const costoTotal = r2(suma(Object.values(partidas)));
  const ingresos = r2(e.ingresos);
  const km = D(e.km);
  const utilidad = r2(ingresos.minus(costoTotal));
  return {
    partidas, costoTotal, ingresos, utilidad,
    margen: ingresos.gt(0) ? utilidad.div(ingresos).times(100).toDecimalPlaces(1) : null,
    costoKm: km.gt(0) ? costoTotal.div(km).toDecimalPlaces(2) : null,
    ingresoKm: km.gt(0) ? ingresos.div(km).toDecimalPlaces(2) : null,
    km: km.toDecimalPlaces(0), viajes: e.viajes,
    kmVaciosPct: km.gt(0) ? D(e.kmVacios).div(km).times(100).toDecimalPlaces(1) : null,
    utilizacion: e.diasPeriodo > 0 ? Math.round(Math.min(100, (e.diasConViaje / e.diasPeriodo) * 100)) : null,
  };
}

/** Reparte un monto entre claves en proporción a un peso (km). Lo que no tenga peso no recibe nada. */
export function repartir(monto: Num, pesos: Map<number, Decimal>): Map<number, Decimal> {
  const total = suma([...pesos.values()]);
  const salida = new Map<number, Decimal>();
  if (total.lte(0)) return salida;
  for (const [k, p] of pesos) salida.set(k, D(monto).times(p).div(total));
  return salida;
}

// ─────────────────────────────── Scorecard del piloto ───────────────────────────────

/** Pesos del puntaje (suman 100). Si falta un dato (p. ej. sin viajes con fecha comprometida) se reparte entre los demás. */
export const PESOS = { puntualidad: 30, rendimiento: 25, seguridad: 30, inspecciones: 15 } as const;

export interface EntradaPiloto {
  viajes: number; conCompromiso: number; aTiempo: number;
  rendimientoReal: Num | null; rendimientoEsperado: Num | null; // km/gal promedio y el esperado de los cabezales que manejó
  accidentes: number; multas: number; otrosIncidentes: number; // de los que fue responsable (o sin definir)
  inspecciones: number;
}

export function scorePiloto(e: EntradaPiloto) {
  const puntualidad = e.conCompromiso ? Math.round((e.aTiempo / e.conCompromiso) * 100) : null;
  const rendimiento = e.rendimientoReal != null && e.rendimientoEsperado != null && D(e.rendimientoEsperado).gt(0)
    ? Math.round(Math.min(110, D(e.rendimientoReal).div(D(e.rendimientoEsperado)).times(100).toNumber())) : null;
  const seguridad = Math.max(0, 100 - 35 * e.accidentes - 15 * e.multas - 10 * e.otrosIncidentes);
  const inspecciones = e.viajes ? Math.round(Math.min(100, (e.inspecciones / e.viajes) * 100)) : null;
  const partes = { puntualidad, rendimiento: rendimiento == null ? null : Math.min(100, rendimiento), seguridad, inspecciones };
  let peso = 0;
  let acumulado = 0;
  for (const [k, v] of Object.entries(partes) as [keyof typeof PESOS, number | null][]) {
    if (v == null) continue;
    peso += PESOS[k];
    acumulado += v * PESOS[k];
  }
  const puntaje = peso && e.viajes ? Math.round(acumulado / peso) : null;
  const nivel = puntaje == null ? 'SIN_DATOS' : puntaje >= 85 ? 'EXCELENTE' : puntaje >= 70 ? 'BUENO' : puntaje >= 50 ? 'REGULAR' : 'BAJO';
  return { ...partes, rendimientoPct: rendimiento, puntaje, nivel };
}

// ─────────────────────────────── Presupuesto ───────────────────────────────

export type EstadoPresupuesto = 'SIN_PRESUPUESTO' | 'BIEN' | 'CERCA' | 'EXCEDIDO';

/** Situación del gasto frente al presupuesto (a partir del 90 % se avisa). */
export function estadoPresupuesto(presupuesto: Num | null, gastado: Num): { estado: EstadoPresupuesto; usado: number | null } {
  if (presupuesto == null || D(presupuesto).lte(0)) return { estado: 'SIN_PRESUPUESTO', usado: null };
  const usado = Math.round(D(gastado).div(D(presupuesto)).times(100).toNumber());
  return { estado: usado > 100 ? 'EXCEDIDO' : usado >= 90 ? 'CERCA' : 'BIEN', usado };
}

/** Presupuesto sugerido: promedio mensual de los meses con gasto (los últimos que se pasen), redondeado a 100. */
export function sugerido(gastosMensuales: Num[]): Decimal | null {
  const con = gastosMensuales.map(D).filter((x) => x.gt(0));
  if (!con.length) return null;
  return suma(con).div(con.length).div(100).toDecimalPlaces(0, Decimal.ROUND_UP).times(100);
}

/** Mes «AAAA-MM» de una fecha en hora de Guatemala. */
export const mesDe = (d: Date) => new Date(d.getTime() - 6 * 3_600_000).toISOString().slice(0, 7);
