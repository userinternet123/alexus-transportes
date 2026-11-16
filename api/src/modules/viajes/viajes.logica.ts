/**
 * VIAJES (lógica pura): validaciones de entrada, numeración y cálculo de la liquidación.
 * Sin acceso a base de datos: todo lo que está aquí se prueba con jest sin levantar nada.
 */
import { z } from 'zod';
import { zBool, zFecha, zIdOpt, zIdReq, zMontoOpt, zNum } from '../../common/pipes/zod';

export const ESTADOS_VIAJE = ['PROGRAMADO', 'EN_RUTA', 'FINALIZADO', 'LIQUIDADO', 'CANCELADO'] as const;
export const TIPOS_COSTO = ['COMBUSTIBLE', 'PEAJE', 'VIATICO', 'HORAS_EXTRA', 'PARQUEO', 'CARGA_DESCARGA', 'MULTA', 'REPARACION_EN_RUTA', 'OTRO'] as const;
export const NOMBRE_COSTO: Record<(typeof TIPOS_COSTO)[number], string> = {
  COMBUSTIBLE: 'Combustible', PEAJE: 'Peajes', VIATICO: 'Viáticos', HORAS_EXTRA: 'Horas extra', PARQUEO: 'Parqueo',
  CARGA_DESCARGA: 'Carga y descarga', MULTA: 'Multas', REPARACION_EN_RUTA: 'Reparación en ruta', OTRO: 'Otros',
};

const texto = (max: number) => z.string().trim().max(max).nullish();
const fechaHora = z.string().trim().min(10, 'Indique la fecha').max(25); // "2026-11-16" o "2026-11-16T08:30"

/** Programar un viaje. Origen/destino y monto se completan desde la ruta y la tarifa si no vienen. */
export const programarZ = z.object({
  clienteId: zIdReq,
  rutaId: zIdOpt,
  tarifaId: zIdOpt,
  cabezalId: zIdReq,
  remolqueId: zIdOpt,
  pilotoId: zIdReq,
  origen: texto(120),
  destino: texto(120),
  carga: texto(200),
  toneladas: zMontoOpt,
  referencia: texto(80),
  fechaSalida: fechaHora,
  fechaCompromiso: z.string().trim().max(25).nullish(),
  montoCobrado: zMontoOpt,
  anticipoPiloto: zMontoOpt,
  pagoPiloto: zMontoOpt,
  kmVacios: zMontoOpt,
  observaciones: texto(500),
});
export type Programar = z.infer<typeof programarZ>;

/** Editar mientras está PROGRAMADO o EN_RUTA (no se cambia el cabezal/piloto de un viaje en ruta). */
export const editarZ = programarZ.partial();

export const iniciarZ = z.object({
  kmSalida: zMontoOpt, // por defecto, el odómetro actual del cabezal
  fechaSalida: z.string().trim().max(25).nullish(),
  inspeccionId: zIdOpt,
});

export const finalizarZ = z.object({
  kmLlegada: zNum(z.number({ invalid_type_error: 'Indique el km de llegada' }).positive('Indique el km de llegada')),
  fechaLlegada: z.string().trim().max(25).nullish(),
  kmVacios: zMontoOpt,
  observaciones: texto(500),
});

export const costoZ = (hoy: string) => z.object({
  tipo: z.enum(TIPOS_COSTO, { errorMap: () => ({ message: 'Elija el tipo de costo' }) }),
  descripcion: texto(200),
  monto: z.coerce.number({ invalid_type_error: 'Escriba un monto válido' }).positive('El monto debe ser mayor que cero').max(1_000_000).multipleOf(0.01, 'Use máximo 2 decimales'),
  fecha: zFecha.refine((f) => f <= hoy, 'La fecha no puede ser futura').optional(),
  archivoId: z.string().uuid().nullish(),
  pagadoPorPiloto: zBool.default(true),
});

export const liquidarZ = z.object({
  montoCobrado: zMontoOpt,
  pagoPiloto: zMontoOpt,
  anticipoPiloto: zMontoOpt,
  observaciones: texto(500),
});

export const cancelarZ = z.object({ motivo: z.string().trim().min(10, 'Explique el motivo (al menos 10 caracteres)').max(300) });

export const filtroViajesZ = z.object({
  mes: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  estado: z.enum(ESTADOS_VIAJE).optional(),
  cabezalId: z.coerce.number().int().positive().optional(),
  pilotoId: z.coerce.number().int().positive().optional(),
  clienteId: z.coerce.number().int().positive().optional(),
});

/** "V-000123" → 123; devuelve el siguiente correlativo con el prefijo dado. */
export function siguienteNumero(prefijo: string, ultimo: string | null | undefined): string {
  const n = ultimo && ultimo.startsWith(prefijo) ? Number(ultimo.slice(prefijo.length)) : 0;
  return `${prefijo}${String((Number.isFinite(n) ? n : 0) + 1).padStart(6, '0')}`;
}

/** Monto a cobrar según el tipo de tarifa (por viaje, por km o por tonelada). */
export function montoPorTarifa(t: { tipo: 'POR_VIAJE' | 'POR_KM' | 'POR_TONELADA'; monto: number }, km: number, toneladas: number): number {
  if (t.tipo === 'POR_KM') return r2(t.monto * km);
  if (t.tipo === 'POR_TONELADA') return r2(t.monto * toneladas);
  return r2(t.monto);
}

export const r2 = (n: number) => Math.round(n * 100) / 100;

export interface CostoLinea { tipo: string; monto: number; pagadoPorPiloto: boolean }

/**
 * LIQUIDACIÓN DEL VIAJE
 *  ingreso         = lo que se cobra al cliente
 *  costos          = suma de costos del viaje (combustible, peajes, viáticos…)
 *  pagoPiloto      = bono del piloto por el viaje
 *  utilidad        = ingreso − costos − pagoPiloto
 *  rendidoPiloto   = costos que pagó el piloto de su bolsa/anticipo
 *  saldoPiloto     = pagoPiloto + rendidoPiloto − anticipo  (>0 se le paga; <0 debe devolver)
 */
export function liquidar(v: { montoCobrado: number; pagoPiloto: number; anticipoPiloto: number; kmSalida?: number | null; kmLlegada?: number | null; kmVacios?: number }, costos: CostoLinea[]) {
  const porTipo: Record<string, number> = {};
  let total = 0; let rendidoPiloto = 0;
  for (const c of costos) { porTipo[c.tipo] = r2((porTipo[c.tipo] ?? 0) + c.monto); total += c.monto; if (c.pagadoPorPiloto) rendidoPiloto += c.monto; }
  total = r2(total); rendidoPiloto = r2(rendidoPiloto);
  const utilidad = r2(v.montoCobrado - total - v.pagoPiloto);
  const km = v.kmSalida != null && v.kmLlegada != null ? Math.max(0, v.kmLlegada - v.kmSalida) : 0;
  const costoTotal = r2(total + v.pagoPiloto);
  return {
    ingreso: r2(v.montoCobrado), costos: total, porTipo, pagoPiloto: r2(v.pagoPiloto), anticipoPiloto: r2(v.anticipoPiloto), rendidoPiloto,
    saldoPiloto: r2(v.pagoPiloto + rendidoPiloto - v.anticipoPiloto),
    utilidad, margen: v.montoCobrado > 0 ? r2((utilidad / v.montoCobrado) * 100) : 0,
    km, kmVacios: r2(v.kmVacios ?? 0), porcentajeVacios: km > 0 ? r2(((v.kmVacios ?? 0) / km) * 100) : 0,
    costoPorKm: km > 0 ? r2(costoTotal / km) : null, ingresoPorKm: km > 0 ? r2(v.montoCobrado / km) : null,
  };
}

/** Nombre corto del tercero (razón social, nombre comercial o nombres y apellidos). */
export const nombreTercero = (t?: { razonSocial?: string | null; nombreComercial?: string | null; nombres?: string | null; apellidos?: string | null } | null) =>
  t ? (t.razonSocial || t.nombreComercial || [t.nombres, t.apellidos].filter(Boolean).join(' ')) : '';
