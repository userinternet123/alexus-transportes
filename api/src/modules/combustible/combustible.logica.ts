/**
 * COMBUSTIBLE (lógica pura): rendimiento de tanque lleno a tanque lleno y alerta de consumo.
 *
 * Método estándar de flotas: el rendimiento real solo se conoce entre dos llenados completos.
 *   km = odómetro de este llenado − odómetro del llenado completo anterior
 *   gal = galones de todas las cargas DESPUÉS del llenado anterior, incluida esta
 *   rendimiento = km ÷ gal
 * Una carga parcial (tanque no lleno) suma galones al tramo pero no cierra el cálculo.
 */
import { z } from 'zod';
import { D, Decimal, Num, r2 } from '../../common/money';
import { zBool, zIdOpt, zIdReq, zNum } from '../../common/pipes/zod';

export interface CargaPrevia { odometro: Num; galones: Num; tanqueLleno: boolean }

/**
 * @param previas cargas anteriores del mismo cabezal (no anuladas), en cualquier orden.
 * @returns el tramo cerrado por esta carga, o null si no se puede calcular (carga parcial o primera carga).
 */
export function tramo(previas: CargaPrevia[], actual: { odometro: Num; galones: Num; tanqueLleno: boolean }) {
  if (!actual.tanqueLleno) return null;
  const odo = D(actual.odometro);
  const antes = previas.filter((c) => D(c.odometro).lt(odo)).sort((a, b) => D(b.odometro).cmp(D(a.odometro)));
  const idx = antes.findIndex((c) => c.tanqueLleno);
  if (idx < 0) return null; // primer llenado completo: es el punto de partida
  const base = antes[idx];
  const intermedias = antes.slice(0, idx); // parciales entre el llenado anterior y este
  const galones = intermedias.reduce((a, c) => a.plus(D(c.galones)), D(actual.galones));
  const km = odo.minus(D(base.odometro));
  if (galones.lte(0) || km.lte(0)) return null;
  return { km: km.toDecimalPlaces(1), galones: galones.toDecimalPlaces(3), rendimiento: km.div(galones).toDecimalPlaces(3) };
}

/** true si el rendimiento cae más del porcentaje permitido frente al esperado del cabezal. */
export function bajoRendimiento(rendimiento: Num, esperado: Num, caidaPermitidaPct: Num): boolean {
  const esp = D(esperado);
  if (esp.lte(0)) return false;
  return D(rendimiento).lt(esp.times(D(1).minus(D(caidaPermitidaPct).div(100))));
}

/** Variación % del rendimiento real frente al esperado (negativo = consume más). */
export const variacionPct = (rendimiento: Num, esperado: Num): Decimal | null =>
  D(esperado).gt(0) ? D(rendimiento).minus(D(esperado)).div(D(esperado)).times(100).toDecimalPlaces(1) : null;

/**
 * Un salto de odómetro que no cabe en un tanque (capacidad × rendimiento × 1.5) suele ser un error de digitación.
 * Devuelve el máximo razonable o null si el cabezal no tiene datos para estimarlo.
 */
export function saltoMaximo(capacidadTanque: Num, rendimientoEsperado: Num): Decimal | null {
  const cap = D(capacidadTanque);
  const rend = D(rendimientoEsperado);
  return cap.gt(0) && rend.gt(0) ? cap.times(rend).times(1.5).toDecimalPlaces(0) : null;
}

export const totalCarga = (galones: Num, precioGalon: Num) => r2(D(galones).times(D(precioGalon)));

export const cargaZ = z.object({
  cabezalId: zIdReq,
  pilotoId: zIdOpt,
  viajeId: zIdOpt,
  fecha: z.coerce.date().optional(),
  odometro: zNum(z.number({ invalid_type_error: 'Escriba el odómetro' }).positive('Escriba el odómetro').max(9_999_999)),
  galones: zNum(z.number({ invalid_type_error: 'Escriba los galones' }).positive('Los galones deben ser mayores que cero').max(2000).multipleOf(0.001, 'Máximo 3 decimales')),
  precioGalon: zNum(z.number({ invalid_type_error: 'Escriba el precio por galón' }).positive('Escriba el precio por galón').max(500)),
  total: zNum(z.number().positive().max(1_000_000).nullable().optional()), // si viene, debe cuadrar con galones × precio
  tanqueLleno: zBool.transform((v) => v ?? true),
  pagadoPorPiloto: zBool.transform((v) => v ?? false),
  estacion: z.string().trim().max(120).nullish().transform((v) => v || null),
  documento: z.string().trim().max(60).nullish().transform((v) => v || null),
  archivoId: z.string().uuid().nullish(),
  confirmarSalto: zBool, // el usuario confirma un salto de odómetro fuera de lo normal
  uuidCliente: z.string().uuid().nullish(), // reenvío desde el móvil sin duplicar
});

export const filtroCargasZ = z.object({
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  cabezalId: zIdOpt,
  pilotoId: zIdOpt,
  soloAlertas: zBool,
  incluirAnuladas: zBool,
  limit: z.coerce.number().int().min(1).max(1000).default(200),
});
