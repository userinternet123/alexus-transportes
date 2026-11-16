import { env } from '../config/env';

/**
 * "Fecha contable" = día operativo en la zona horaria del negocio, guardado
 * como DATE (medianoche UTC). Evita que una venta de las 11:30 p.m. caiga en
 * el día siguiente por usar UTC del servidor.
 */
export function fechaContable(fecha: Date = new Date(), tz: string = env.TZ_NEGOCIO): Date {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(fecha);
  return new Date(`${ymd}T00:00:00.000Z`);
}

/** "2026-10-09" -> Date (DATE en UTC). Lanza si el formato es inválido. */
export function parseFecha(ymd: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) throw new Error(`Fecha inválida: ${ymd}`);
  const d = new Date(`${ymd}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new Error(`Fecha inválida: ${ymd}`);
  return d;
}

export const aYmd = (d: Date): string => d.toISOString().slice(0, 10);

export function sumarDias(d: Date, dias: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + dias);
  return r;
}

/** Fecha de hoy en Guatemala como 'YYYY-MM-DD'. */
export const hoyGuatemala = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(new Date());
