/**
 * COMBUSTIBLE (lógica pura): validación de cargas y cálculo del rendimiento
 * "tanque lleno a tanque lleno": entre dos cargas con tanque lleno, los km
 * recorridos se dividen entre todos los galones cargados en el tramo.
 */
import { z } from 'zod';
import { zBool, zIdOpt, zIdReq, zMontoOpt, zNum } from '../../common/pipes/zod';

export const cargaZ = z.object({
  cabezalId: zIdReq,
  pilotoId: zIdOpt,
  viajeId: zIdOpt,
  fecha: z.string().trim().min(10, 'Indique la fecha').max(25),
  odometro: zNum(z.number({ invalid_type_error: 'Indique el odómetro' }).positive('Indique el odómetro')),
  galones: zNum(z.number({ invalid_type_error: 'Indique los galones' }).positive('Indique los galones').max(500, 'Revise los galones')),
  precioGalon: zMontoOpt, // por defecto, el parámetro combustible.precio_galon
  total: zMontoOpt, // si viene, manda; si no, galones × precio
  tanqueLleno: zBool.default(true),
  estacion: z.string().trim().max(120).nullish(),
  documento: z.string().trim().max(60).nullish(),
  archivoId: z.string().uuid().nullish(),
  pagadoPorPiloto: zBool.default(false),
});

export const filtroCargasZ = z.object({
  mes: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  cabezalId: z.coerce.number().int().positive().optional(),
  incluirAnuladas: z.preprocess((v) => v === 'true' || v === true, z.boolean()).default(false),
});

export interface CargaBase { id: number; cabezalId: number; fecha: Date; odometro: number; galones: number; total: number; tanqueLleno: boolean }
export interface Rendimiento { cargaId: number; km: number; galones: number; kmPorGalon: number; costoPorKm: number }

export const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Rendimiento por carga (solo se calcula en cargas con tanque lleno que tengan
 * una carga con tanque lleno anterior del mismo cabezal). Entrada: cargas de un
 * cabezal ordenadas por odómetro ascendente.
 */
export function rendimientos(cargas: CargaBase[]): Rendimiento[] {
  const out: Rendimiento[] = [];
  const porCabezal = new Map<number, CargaBase[]>();
  for (const c of cargas) porCabezal.set(c.cabezalId, [...(porCabezal.get(c.cabezalId) ?? []), c]);
  for (const lista of porCabezal.values()) {
    lista.sort((a, b) => a.odometro - b.odometro || a.fecha.getTime() - b.fecha.getTime());
    let anterior: CargaBase | null = null; let galones = 0; let total = 0;
    for (const c of lista) {
      if (anterior) { galones += c.galones; total += c.total; }
      if (c.tanqueLleno) {
        if (anterior && galones > 0) {
          const km = c.odometro - anterior.odometro;
          if (km > 0) out.push({ cargaId: c.id, km: r2(km), galones: r2(galones), kmPorGalon: r2(km / galones), costoPorKm: r2(total / km) });
        }
        anterior = c; galones = 0; total = 0;
      }
    }
  }
  return out;
}

/** Resumen de un conjunto de rendimientos (km, galones, km/gal ponderado, costo/km). */
export function resumenRendimiento(r: Rendimiento[], totalGastado = 0) {
  const km = r.reduce((a, x) => a + x.km, 0); const gal = r.reduce((a, x) => a + x.galones, 0);
  return { km: r2(km), galones: r2(gal), kmPorGalon: gal > 0 ? r2(km / gal) : null, costoPorKm: km > 0 && totalGastado > 0 ? r2(totalGastado / km) : null };
}
