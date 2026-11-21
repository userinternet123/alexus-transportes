/**
 * CUENTAS POR COBRAR (lógica pura, sin base de datos).
 *
 * Una cuenta es el documento (factura) que se le cobra a un cliente por uno o varios viajes terminados.
 * Vence a los días de crédito pactados: 30, 60, 90… o los del cliente. Su saldo baja con abonos: pagos,
 * retenciones de IVA o ISR que hace el cliente (con su constancia) y descuentos acordados.
 *
 * Antigüedad de saldos: lo vencido se agrupa por tramos (por defecto 1–30, 31–60, 61–90 y más de 90 días).
 * Días de cobro (DSO) = saldo por cobrar ÷ ventas diarias promedio del período.
 */
import { z } from 'zod';
import { D, Decimal, Num, r2, suma, ZERO } from '../../common/money';
import { zIdOpt, zIdReq, zMonto, zNum } from '../../common/pipes/zod';

export const TIPOS_DOCUMENTO = ['FACTURA', 'RECIBO', 'NOTA_DEBITO', 'OTRO'] as const;
export const MEDIOS = ['TRANSFERENCIA', 'DEPOSITO', 'CHEQUE', 'EFECTIVO', 'RETENCION_IVA', 'RETENCION_ISR', 'DESCUENTO', 'OTRO'] as const;
export const GESTIONES = ['LLAMADA', 'CORREO', 'WHATSAPP', 'VISITA', 'PROMESA', 'NOTA'] as const;
export const NOMBRE_MEDIO: Record<(typeof MEDIOS)[number], string> = {
  TRANSFERENCIA: 'Transferencia', DEPOSITO: 'Depósito', CHEQUE: 'Cheque', EFECTIVO: 'Efectivo',
  RETENCION_IVA: 'Retención de IVA', RETENCION_ISR: 'Retención de ISR', DESCUENTO: 'Descuento', OTRO: 'Otro',
};
/** Medios que no son dinero que entra: no cuentan como «cobrado» en el flujo de caja. */
export const MEDIOS_NO_EFECTIVO = new Set(['RETENCION_IVA', 'RETENCION_ISR', 'DESCUENTO']);

const DIA = 86_400_000;
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const zFecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha no válida (AAAA-MM-DD)').transform((s) => new Date(`${s}T00:00:00.000Z`));
const texto = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => v || null);

export const crearCuentaZ = z.object({
  clienteId: zIdReq,
  viajeIds: z.array(zIdReq).max(200).default([]),
  /** Sin viajes (cobro de otro servicio), el monto es obligatorio. Con viajes, por defecto es la suma de lo cobrado. */
  monto: zNum(z.number().positive().multipleOf(0.01, 'Máximo 2 decimales').optional()),
  tipoDocumento: z.enum(TIPOS_DOCUMENTO).default('FACTURA'),
  serie: texto(20),
  numeroDocumento: texto(40),
  autorizacionFel: texto(60),
  fechaEmision: zFecha,
  /** Vacío: los días de crédito del cliente o, si no tiene, los del parámetro. */
  diasCredito: zNum(z.number().int().min(0).max(365).optional()),
  descripcion: texto(500),
  archivoId: z.string().uuid().optional().nullable(),
}).refine((d) => d.viajeIds.length > 0 || d.monto != null, { message: 'Elija los viajes que cobra o escriba el monto', path: ['monto'] });

export const abonoZ = z.object({
  fecha: zFecha,
  monto: zMonto.refine((v) => v > 0, 'El monto debe ser mayor que cero'),
  medio: z.enum(MEDIOS),
  referencia: texto(60),
  banco: texto(60),
  archivoId: z.string().uuid().optional().nullable(),
});

export const anularZ = z.object({ motivo: z.string().trim().min(5, 'Explique el motivo (mínimo 5 letras)').max(300) });

export const gestionZ = z.object({
  tipo: z.enum(GESTIONES),
  nota: z.string().trim().min(3, 'Escriba qué se habló o acordó').max(1000),
  promesaFecha: zFecha.optional().nullable(),
  promesaMonto: zNum(z.number().positive().optional().nullable()),
}).refine((d) => d.tipo !== 'PROMESA' || d.promesaFecha, { message: 'Una promesa de pago necesita su fecha', path: ['promesaFecha'] });

export const filtroCuentasZ = z.object({
  vista: z.enum(['ABIERTAS', 'VENCIDAS', 'POR_VENCER', 'PAGADAS', 'ANULADAS', 'TODAS']).default('ABIERTAS'),
  clienteId: zIdOpt,
  q: z.string().trim().max(60).optional(),
  limit: zNum(z.number().int().min(1).max(500).default(200)),
});

export const vencimiento = (emision: Date, dias: number) => new Date(emision.getTime() + dias * DIA);

/** Días desde el vencimiento (negativo: faltan días para vencer). Por día calendario. */
export function diasVencida(venceEl: Date, hoy: Date): number {
  const a = Date.UTC(venceEl.getUTCFullYear(), venceEl.getUTCMonth(), venceEl.getUTCDate());
  const b = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate());
  return Math.round((b - a) / DIA);
}

/** "30, 60, 90" → [30, 60, 90] (ordenados, sin repetidos). Si no sirve, [30, 60, 90]. */
export function parsearTramos(t: string | null | undefined): number[] {
  const v = [...new Set(String(t ?? '').split(/[,;\s]+/).map(Number).filter((n) => Number.isInteger(n) && n > 0 && n <= 3650))].sort((a, b) => a - b);
  return v.length ? v : [30, 60, 90];
}

export interface Tramo { clave: string; nombre: string; desde: number; hasta: number | null }
/** Tramos de antigüedad: «Al día» y, para [30, 60, 90]: 1–30, 31–60, 61–90, más de 90. */
export function tramos(limites: number[]): Tramo[] {
  const t: Tramo[] = [{ clave: 'AL_DIA', nombre: 'Al día', desde: -Infinity, hasta: 0 }];
  let desde = 1;
  for (const l of limites) { t.push({ clave: `D${desde}_${l}`, nombre: `${desde} a ${l} días`, desde, hasta: l }); desde = l + 1; }
  t.push({ clave: `MAS_${desde - 1}`, nombre: `Más de ${desde - 1} días`, desde, hasta: null });
  return t;
}
export const tramoDe = (dias: number, t: Tramo[]) => t.find((x) => dias >= x.desde && (x.hasta == null || dias <= x.hasta))!;

export type Estado = 'PENDIENTE' | 'PARCIAL' | 'PAGADA' | 'ANULADA';
export function estadoPorSaldo(monto: Num, saldo: Num): Exclude<Estado, 'ANULADA'> {
  if (D(saldo).lte(0)) return 'PAGADA';
  return D(saldo).gte(D(monto)) ? 'PENDIENTE' : 'PARCIAL';
}

/** Saldo = monto − abonos vigentes. Nunca negativo (un abono no puede pasar el saldo). */
export const saldoDe = (monto: Num, abonos: { monto: Num; anulado: boolean }[]) =>
  r2(Decimal.max(ZERO, D(monto).minus(suma(abonos.filter((a) => !a.anulado).map((a) => a.monto)))));

export interface CuentaResumen { id: number; clienteId: number; cliente: string; monto: Num; saldo: Num; fechaVencimiento: Date; fechaEmision: Date }

/** Antigüedad de saldos por cliente y total, con el saldo vencido más viejo de cada cliente. */
export function antiguedad(cuentas: CuentaResumen[], hoy: Date, limites: number[]) {
  const t = tramos(limites);
  const vacio = () => Object.fromEntries(t.map((x) => [x.clave, ZERO])) as Record<string, Decimal>;
  const porCliente = new Map<number, { clienteId: number; cliente: string; saldo: Decimal; vencido: Decimal; tramos: Record<string, Decimal>; cuentas: number; diasMasVieja: number }>();
  const total = { saldo: ZERO, vencido: ZERO, tramos: vacio(), cuentas: 0 };
  for (const c of cuentas) {
    const saldo = D(c.saldo);
    if (saldo.lte(0)) continue;
    const dias = diasVencida(c.fechaVencimiento, hoy);
    const tr = tramoDe(dias, t);
    const fila = porCliente.get(c.clienteId) ?? { clienteId: c.clienteId, cliente: c.cliente, saldo: ZERO, vencido: ZERO, tramos: vacio(), cuentas: 0, diasMasVieja: -Infinity };
    fila.saldo = fila.saldo.plus(saldo);
    fila.tramos[tr.clave] = fila.tramos[tr.clave].plus(saldo);
    fila.cuentas += 1;
    fila.diasMasVieja = Math.max(fila.diasMasVieja, dias);
    if (dias > 0) { fila.vencido = fila.vencido.plus(saldo); total.vencido = total.vencido.plus(saldo); }
    porCliente.set(c.clienteId, fila);
    total.saldo = total.saldo.plus(saldo);
    total.tramos[tr.clave] = total.tramos[tr.clave].plus(saldo);
    total.cuentas += 1;
  }
  const clientes = [...porCliente.values()].sort((a, b) => b.vencido.comparedTo(a.vencido) || b.saldo.comparedTo(a.saldo));
  return { tramos: t.map(({ clave, nombre }) => ({ clave, nombre })), clientes, total };
}

/** Días promedio de cobro: cuánto tarda en promedio en entrar lo que se factura. null sin ventas. */
export function diasDeCobro(saldoPorCobrar: Num, ventasPeriodo: Num, diasPeriodo: number): Decimal | null {
  const ventas = D(ventasPeriodo);
  if (ventas.lte(0) || diasPeriodo <= 0) return null;
  return D(saldoPorCobrar).div(ventas.div(diasPeriodo)).toDecimalPlaces(0);
}

/** Promesa de pago más reciente y si se cumplió: lo abonado desde que se hizo alcanza lo prometido (o la cuenta ya está pagada). */
export function estadoPromesa(
  gestiones: { tipo: string; promesaFecha: Date | null; promesaMonto: Num | null; creadoEn: Date }[],
  abonos: { monto: Num; anulado: boolean; fecha: Date; creadoEn: Date }[],
  saldo: Num, hoy: Date,
): { fecha: string; monto: Decimal | null; estado: 'PENDIENTE' | 'CUMPLIDA' | 'INCUMPLIDA'; abonado: Decimal } | null {
  const p = gestiones.filter((g) => g.tipo === 'PROMESA' && g.promesaFecha).sort((a, b) => b.creadoEn.getTime() - a.creadoEn.getTime())[0];
  if (!p) return null;
  // Cuenta lo que se registró después de hacer la promesa (aunque se le ponga una fecha anterior)
  const abonado = suma(abonos.filter((a) => !a.anulado && a.creadoEn >= p.creadoEn).map((a) => a.monto));
  const meta = p.promesaMonto != null ? D(p.promesaMonto) : null;
  const cumplida = D(saldo).lte(0) || (meta ? abonado.gte(meta) : abonado.gt(0));
  const estado = cumplida ? 'CUMPLIDA' : diasVencida(p.promesaFecha!, hoy) > 0 ? 'INCUMPLIDA' : 'PENDIENTE';
  return { fecha: ymd(p.promesaFecha!), monto: meta, estado, abonado };
}

const Q = (n: Num) => `Q${Number(D(n)).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fechaLarga = (d: Date) => d.toLocaleDateString('es-GT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Texto del recordatorio al cliente (para WhatsApp o correo), amable y con el detalle de lo pendiente. */
export function mensajeRecordatorio(d: { empresa: string; contacto?: string | null; cuentas: { documento: string; saldo: Num; fechaVencimiento: Date }[]; hoy: Date }) {
  const total = suma(d.cuentas.map((c) => c.saldo));
  const vencidas = d.cuentas.filter((c) => diasVencida(c.fechaVencimiento, d.hoy) > 0);
  const lineas = d.cuentas.map((c) => {
    const dias = diasVencida(c.fechaVencimiento, d.hoy);
    const cuando = dias > 0 ? `venció el ${fechaLarga(c.fechaVencimiento)}` : dias === 0 ? 'vence hoy' : `vence el ${fechaLarga(c.fechaVencimiento)}`;
    return `• ${c.documento}: ${Q(c.saldo)} (${cuando})`;
  });
  return [
    `Buen día${d.contacto ? `, ${d.contacto}` : ''}.`,
    '',
    `Le saludamos de ${d.empresa.replace(/\.+$/, '')}. ${vencidas.length ? 'Le recordamos amablemente que tiene saldo pendiente' : 'Le compartimos el estado de su cuenta'}:`,
    ...lineas,
    '',
    `Total: ${Q(total)}.`,
    'Si ya realizó el pago, por favor envíenos el comprobante para aplicarlo. ¡Muchas gracias!',
  ].join('\n');
}

/** Documento legible: «Factura A-1234», o el número interno si no tiene. */
export const documentoDe = (c: { tipoDocumento: string; serie: string | null; numeroDocumento: string | null; numero: string }) => {
  const tipo = { FACTURA: 'Factura', RECIBO: 'Recibo', NOTA_DEBITO: 'Nota de débito', OTRO: 'Documento' }[c.tipoDocumento] ?? 'Documento';
  return c.numeroDocumento ? `${tipo} ${[c.serie, c.numeroDocumento].filter(Boolean).join('-')}` : `${tipo} ${c.numero}`;
};

/** Teléfono de Guatemala para wa.me: 8 dígitos → 502XXXXXXXX. null si no parece un número. */
export function telefonoWhatsapp(t: string | null | undefined): string | null {
  const dig = String(t ?? '').replace(/\D/g, '');
  if (dig.length === 8) return `502${dig}`;
  if (dig.length === 11 && dig.startsWith('502')) return dig;
  return dig.length >= 10 && dig.length <= 15 ? dig : null;
}

export { ymd as aYmdCobro };
