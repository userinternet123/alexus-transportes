/**
 * INCIDENTES Y MULTAS (lógica pura, sin base de datos).
 *
 * Costo de un incidente = multa (lo pagado o, si no se ha pagado, lo que dice la boleta) + daños propios + pagos a terceros.
 * Recuperado = lo que pagó el seguro + lo que se descuenta al piloto. Costo neto = costo − recuperado.
 *
 * Descuento al piloto: se reparte en cuotas por planilla, sin pasar de un tope por planilla (un % de su salario del período).
 * Cada planilla en borrador reserva su cuota; al aprobarla, la cuota cuenta como descontada.
 */
import { z } from 'zod';
import { D, Decimal, Num, r2, suma, ZERO } from '../../common/money';
import { zIdOpt, zMontoOpt, zNum } from '../../common/pipes/zod';

export const TIPOS_INCIDENTE = ['MULTA', 'ACCIDENTE', 'ROBO', 'DANO_CARGA', 'AVERIA_EN_RUTA', 'RECLAMO_CLIENTE', 'OTRO'] as const;
export const RESPONSABLES = ['SIN_DEFINIR', 'EMPRESA', 'PILOTO', 'TERCERO'] as const;
export const ESTADOS_RECLAMO = ['SIN_RECLAMO', 'PRESENTADO', 'APROBADO', 'RECHAZADO', 'PAGADO'] as const;
const DIA = 86_400_000;
const texto = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => v || null);
const zDia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha no válida (AAAA-MM-DD)').transform((s) => new Date(`${s}T12:00:00.000Z`));
/** Fecha con hora («2026-11-20T08:30:00-06:00») o solo el día. */
const zMomento = z.string().refine((s) => !Number.isNaN(new Date(s.length === 10 ? `${s}T12:00:00Z` : s).getTime()), 'Fecha no válida')
  .transform((s) => new Date(s.length === 10 ? `${s}T12:00:00Z` : s));

const base = {
  tipo: z.enum(TIPOS_INCIDENTE),
  fecha: zMomento,
  lugar: texto(200),
  descripcion: z.string().trim().min(5, 'Describa lo que pasó (mínimo 5 letras)').max(2000),
  cabezalId: zIdOpt,
  remolqueId: zIdOpt,
  pilotoId: zIdOpt,
  viajeId: zIdOpt,
  autoridad: texto(80),
  numeroBoleta: texto(60),
  montoMulta: zMontoOpt,
  fechaLimitePago: zDia.optional().nullable(),
  costoDanos: zMontoOpt,
  costoTerceros: zMontoOpt,
  heridos: z.boolean().optional(),
};

export const crearIncidenteZ = z.object({
  ...base,
  /** Abre una orden de taller para reparar los daños del cabezal o remolque. */
  abrirOrden: z.boolean().default(false),
  ponerEnTaller: z.boolean().default(false),
}).refine((d) => d.tipo !== 'MULTA' || Number(d.montoMulta ?? 0) > 0, { message: 'Escriba el monto de la multa', path: ['montoMulta'] })
  .refine((d) => !d.abrirOrden || d.cabezalId || d.remolqueId, { message: 'Para abrir una orden de taller indique el cabezal o el remolque', path: ['cabezalId'] });

export const editarIncidenteZ = z.object(Object.fromEntries(Object.entries(base).map(([k, v]) => [k, (v as z.ZodTypeAny).optional()])) as { [K in keyof typeof base]: z.ZodOptional<(typeof base)[K]> });

/** Lo que gestiona administración: pago de la multa, seguro, responsable y descuento al piloto. */
export const gestionarIncidenteZ = z.object({
  responsable: z.enum(RESPONSABLES).optional(),
  pagadoEn: zDia.optional().nullable(),
  montoPagado: zMontoOpt,
  aseguradora: texto(120),
  numeroReclamo: texto(60),
  estadoReclamo: z.enum(ESTADOS_RECLAMO).optional(),
  reclamoEn: zDia.optional().nullable(),
  deducible: zMontoOpt,
  montoRecuperado: zMontoOpt,
  descuentoPiloto: zMontoOpt,
  cuotasDescuento: zNum(z.number().int().min(1).max(24).optional()),
  ordenTrabajoId: zIdOpt,
});

export const estadoIncidenteZ = z.object({
  estado: z.enum(['EN_TRAMITE', 'CERRADO', 'ANULADO']),
  comentario: z.string().trim().min(3, 'Escriba la resolución o el motivo').max(1000),
});

export const filtroIncidentesZ = z.object({
  estado: z.enum(['ABIERTOS', 'ABIERTO', 'EN_TRAMITE', 'CERRADO', 'ANULADO', 'TODOS']).default('ABIERTOS'),
  tipo: z.enum(TIPOS_INCIDENTE).optional(),
  pilotoId: zIdOpt,
  cabezalId: zIdOpt,
  desde: zDia.optional(),
  hasta: zDia.optional(),
  q: z.string().trim().max(60).optional(),
  limit: zNum(z.number().int().min(1).max(500).default(200)),
});

export interface MontosIncidente {
  montoMulta: Num; montoPagado: Num; pagadoEn: Date | null; costoDanos: Num; costoTerceros: Num; montoRecuperado: Num; descuentoPiloto: Num;
}

/** Costo, recuperado y neto de un incidente. */
export function costoIncidente(i: MontosIncidente) {
  const multa = i.pagadoEn ? D(i.montoPagado) : D(i.montoMulta);
  const costo = r2(multa.plus(D(i.costoDanos)).plus(D(i.costoTerceros)));
  const recuperado = r2(D(i.montoRecuperado).plus(D(i.descuentoPiloto)));
  return { costoMulta: r2(multa), costo, recuperado, neto: r2(costo.minus(recuperado)) };
}

export type EstadoMulta = 'PAGADA' | 'VENCIDA' | 'POR_VENCER' | 'PENDIENTE';

/** Situación del pago de una multa. null si el incidente no tiene multa. */
export function estadoMulta(i: { montoMulta: Num; pagadoEn: Date | null; fechaLimitePago: Date | null }, hoy: Date, avisarDias: number): { estado: EstadoMulta; dias: number | null } | null {
  if (D(i.montoMulta).lte(0)) return null;
  if (i.pagadoEn) return { estado: 'PAGADA', dias: null };
  if (!i.fechaLimitePago) return { estado: 'PENDIENTE', dias: null };
  const dias = Math.floor((Date.UTC(i.fechaLimitePago.getUTCFullYear(), i.fechaLimitePago.getUTCMonth(), i.fechaLimitePago.getUTCDate()) - Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate())) / DIA);
  if (dias < 0) return { estado: 'VENCIDA', dias };
  return { estado: dias <= avisarDias ? 'POR_VENCER' : 'PENDIENTE', dias };
}

export interface PendientePiloto { incidenteId: number; descuento: Num; cuotas: number; descontado: Num; reservado: Num }

/**
 * Cuotas a descontar en una planilla: cada incidente aporta su cuota (descuento ÷ cuotas) sin pasar de lo pendiente;
 * los más antiguos primero, hasta el tope de la planilla.
 */
export function repartirDescuentos(pendientes: PendientePiloto[], tope: Num): { incidenteId: number; monto: Decimal }[] {
  let disponible = D(tope);
  const salida: { incidenteId: number; monto: Decimal }[] = [];
  for (const p of [...pendientes].sort((a, b) => a.incidenteId - b.incidenteId)) {
    if (disponible.lte(0)) break;
    const pendiente = D(p.descuento).minus(D(p.descontado)).minus(D(p.reservado));
    if (pendiente.lte(0)) continue;
    const cuota = r2(D(p.descuento).div(Math.max(1, p.cuotas)));
    const monto = r2(Decimal.min(pendiente, cuota, disponible));
    if (monto.lte(0)) continue;
    salida.push({ incidenteId: p.incidenteId, monto });
    disponible = disponible.minus(monto);
  }
  return salida;
}

/** Resumen por clave (piloto o cabezal): cuántos, multas y costo neto. */
export function agrupar<T extends MontosIncidente & { tipo: string }>(filas: T[], clave: (f: T) => string | null) {
  const mapa = new Map<string, { clave: string; incidentes: number; multas: number; accidentes: number; costo: Decimal; recuperado: Decimal; neto: Decimal }>();
  for (const f of filas) {
    const k = clave(f);
    if (!k) continue;
    const g = mapa.get(k) ?? { clave: k, incidentes: 0, multas: 0, accidentes: 0, costo: ZERO, recuperado: ZERO, neto: ZERO };
    const c = costoIncidente(f);
    g.incidentes += 1;
    if (f.tipo === 'MULTA') g.multas += 1;
    if (f.tipo === 'ACCIDENTE') g.accidentes += 1;
    g.costo = g.costo.plus(c.costo);
    g.recuperado = g.recuperado.plus(c.recuperado);
    g.neto = g.neto.plus(c.neto);
    mapa.set(k, g);
  }
  return [...mapa.values()].sort((a, b) => Number(b.neto.minus(a.neto)) || b.incidentes - a.incidentes);
}

export const totalNeto = (filas: MontosIncidente[]) => suma(filas.map((f) => costoIncidente(f).neto));
