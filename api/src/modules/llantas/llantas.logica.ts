/**
 * LLANTAS (lógica pura, sin base de datos).
 *
 * Posiciones: eje y lado. El eje 1 del cabezal es direccional (sencillo: I, D); los demás ejes son duales
 * (IE izquierda externa, II izquierda interna, DI derecha interna, DE derecha externa). REP = repuesto.
 *
 * Km de una llanta = km de los montajes ya cerrados (kmAcumulados) + km del montaje actual. En el cabezal se cuentan
 * con el odómetro; en un remolque, con los km de los viajes que hizo ese remolque mientras la llanta estuvo montada.
 *
 * Costo por km = (precio + reencauches) ÷ km totales. Desgaste = mm perdidos por cada 1,000 km desde el labrado inicial
 * (o desde el último reencauche); con él se proyecta cuántos km le quedan hasta el mínimo legal.
 */
import { z } from 'zod';
import { D, Decimal, Num, r2, ZERO } from '../../common/money';
import { zIdOpt, zMontoOpt, zNum } from '../../common/pipes/zod';

const texto = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => v || null);
const zDia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha no válida (AAAA-MM-DD)').transform((s) => new Date(`${s}T12:00:00.000Z`));
const km = zNum(z.number().min(0).max(99_999_999).optional().nullable());
const mm = zNum(z.number().min(0).max(40));
const POSICION = /^(E\d{1,2}-(I|D|IE|II|DI|DE)|REP\d?)$/;

export function posiciones(ejes: number, tipo: 'CABEZAL' | 'REMOLQUE'): string[] {
  const lista: string[] = [];
  for (let e = 1; e <= Math.max(1, ejes); e += 1) {
    if (tipo === 'CABEZAL' && e === 1) lista.push('E1-I', 'E1-D');
    else lista.push(`E${e}-IE`, `E${e}-II`, `E${e}-DI`, `E${e}-DE`);
  }
  lista.push('REP');
  return lista;
}

export const NOMBRE_LADO: Record<string, string> = { I: 'izquierda', D: 'derecha', IE: 'izquierda externa', II: 'izquierda interna', DI: 'derecha interna', DE: 'derecha externa' };
export const nombrePosicion = (p: string) => {
  if (p.startsWith('REP')) return 'Repuesto';
  const [eje, lado] = p.split('-');
  return `Eje ${eje.slice(1)} ${NOMBRE_LADO[lado] ?? lado}`;
};

export const montarZ = z.object({
  cabezalId: zIdOpt,
  remolqueId: zIdOpt,
  posicion: z.string().trim().toUpperCase().regex(POSICION, 'Posición no válida (ej. E1-I, E2-DE, REP)'),
  fecha: zDia,
  km, // odómetro del cabezal al montar (vacío = el actual)
}).refine((d) => Boolean(d.cabezalId) !== Boolean(d.remolqueId), { message: 'Indique el cabezal o el remolque (uno de los dos)', path: ['cabezalId'] });

export const DESTINOS = ['EN_BODEGA', 'EN_REENCAUCHE', 'DESECHADA'] as const;
export const retirarZ = z.object({
  fecha: zDia,
  km,
  profundidadMm: zNum(z.number().min(0).max(40).optional().nullable()),
  motivo: z.string().trim().min(3, 'Escriba el motivo del retiro').max(200),
  destino: z.enum(DESTINOS),
});

export const rotarZ = z.object({
  cabezalId: zIdOpt,
  remolqueId: zIdOpt,
  posicion: z.string().trim().toUpperCase().regex(POSICION, 'Posición no válida (ej. E1-I, E2-DE, REP)'),
  fecha: zDia,
  km,
  profundidadMm: zNum(z.number().min(0).max(40).optional().nullable()),
});

export const medicionZ = z.object({
  fecha: zDia,
  profundidadMm: mm,
  presionPsi: zNum(z.number().min(0).max(250).optional().nullable()),
  km,
  observacion: texto(300),
});

export const reencaucheZ = z.object({
  fecha: zDia,
  costo: zNum(z.number().positive().max(99_999)),
  proveedorId: zIdOpt,
  documento: texto(60),
  profundidadMm: zNum(z.number().positive().max(40).optional().nullable()), // labrado nuevo
});

export const desecharZ = z.object({ motivo: z.string().trim().min(3, 'Escriba el motivo').max(200) });

export const filtroLlantasZ = z.object({
  estado: z.enum(['EN_BODEGA', 'MONTADA', 'EN_REENCAUCHE', 'DESECHADA', 'ACTIVAS', 'ALERTAS', 'TODAS']).default('ACTIVAS'),
  cabezalId: zIdOpt,
  marcaId: zIdOpt,
  q: z.string().trim().max(60).optional(),
});

/** Km de un montaje en un cabezal: del km de montaje al de retiro (o al odómetro actual si sigue montada). */
export function kmMontajeCabezal(m: { kmMontaje: Num; kmRetiro: Num | null }, odometroActual: Num): Decimal {
  const fin = m.kmRetiro != null ? D(m.kmRetiro) : D(odometroActual);
  return Decimal.max(ZERO, fin.minus(D(m.kmMontaje)));
}

/** Km de los viajes de un remolque entre dos fechas (salida dentro del rango; viajes con km de salida y llegada). */
export function kmViajesRemolque(viajes: { fechaSalida: Date; kmSalida: Num | null; kmLlegada: Num | null }[], desde: Date, hasta: Date | null): Decimal {
  let t = ZERO;
  for (const v of viajes) {
    if (v.fechaSalida < desde || (hasta && v.fechaSalida > new Date(hasta.getTime() + 86_400_000))) continue;
    if (v.kmSalida == null || v.kmLlegada == null) continue;
    t = t.plus(Decimal.max(ZERO, D(v.kmLlegada).minus(D(v.kmSalida))));
  }
  return t;
}

export type EstadoVida = 'CAMBIAR' | 'PRONTO' | 'KM_EXCEDIDO' | 'SIN_MEDIR' | 'BIEN';

export interface EntradaVida {
  precio: Num; costoReencauches: Num; kmTotales: Num; kmVidaActual: Num; // km desde nueva o desde el último reencauche
  profundidadInicialMm: Num | null; ultimaMedicion: { profundidadMm: Num; fecha: Date } | null;
  kmEsperados: number; montada: boolean;
}
export interface Umbrales { minimoMm: number; avisoMm: number; diasSinMedir: number }

/** Costo por km, desgaste, km que le quedan y alerta de una llanta. */
export function vidaLlanta(e: EntradaVida, u: Umbrales, hoy: Date) {
  const costo = r2(D(e.precio).plus(D(e.costoReencauches)));
  const kmTot = D(e.kmTotales);
  const kmVida = D(e.kmVidaActual);
  const costoKm = kmTot.gt(0) ? costo.div(kmTot).toDecimalPlaces(4) : null;
  const ultima = e.ultimaMedicion ? D(e.ultimaMedicion.profundidadMm) : null;
  let desgaste1000: Decimal | null = null;
  let kmRestantes: Decimal | null = null;
  if (ultima && e.profundidadInicialMm != null && kmVida.gt(1000)) {
    const perdido = D(e.profundidadInicialMm).minus(ultima);
    if (perdido.gt(0)) {
      desgaste1000 = perdido.div(kmVida).times(1000).toDecimalPlaces(3);
      kmRestantes = Decimal.max(ZERO, ultima.minus(u.minimoMm).div(perdido).times(kmVida)).toDecimalPlaces(0);
    }
  }
  const diasSinMedir = e.ultimaMedicion ? Math.floor((hoy.getTime() - e.ultimaMedicion.fecha.getTime()) / 86_400_000) : null;
  let alerta: EstadoVida = 'BIEN';
  if (ultima && ultima.lte(u.minimoMm)) alerta = 'CAMBIAR';
  else if (ultima && ultima.lte(u.avisoMm)) alerta = 'PRONTO';
  else if (kmVida.gt(e.kmEsperados)) alerta = 'KM_EXCEDIDO';
  else if (e.montada && (diasSinMedir == null || diasSinMedir > u.diasSinMedir)) alerta = 'SIN_MEDIR';
  return { costo, costoKm, desgaste1000, kmRestantes, diasSinMedir, alerta, ultimaMm: ultima };
}

/** Por marca (y modelo): km promedio de las que ya terminaron su vida, costo por km y desgaste promedio. */
export function rendimientoPorMarca(filas: { marca: string; modelo: string | null; estado: string; costo: Num; kmTotales: Num; desgaste1000: Num | null; reencauches: number }[]) {
  const mapa = new Map<string, { marca: string; modelo: string | null; llantas: number; terminadas: number; kmTerminadas: Decimal; km: Decimal; costo: Decimal; desgastes: Decimal[]; reencauches: number }>();
  for (const f of filas) {
    const k = `${f.marca}|${f.modelo ?? ''}`;
    const g = mapa.get(k) ?? { marca: f.marca, modelo: f.modelo, llantas: 0, terminadas: 0, kmTerminadas: ZERO, km: ZERO, costo: ZERO, desgastes: [], reencauches: 0 };
    g.llantas += 1;
    g.reencauches += f.reencauches;
    if (D(f.kmTotales).gt(0)) { g.km = g.km.plus(D(f.kmTotales)); g.costo = g.costo.plus(D(f.costo)); }
    if (f.estado === 'DESECHADA') { g.terminadas += 1; g.kmTerminadas = g.kmTerminadas.plus(D(f.kmTotales)); }
    if (f.desgaste1000 != null) g.desgastes.push(D(f.desgaste1000));
    mapa.set(k, g);
  }
  const salida = [...mapa.values()].map((g) => ({
    marca: g.marca, modelo: g.modelo, llantas: g.llantas, terminadas: g.terminadas, reencauches: g.reencauches,
    kmPromedioVida: g.terminadas ? g.kmTerminadas.div(g.terminadas).toDecimalPlaces(0) : null,
    kmRecorridos: g.km.toDecimalPlaces(0),
    costoKm: g.km.gt(0) ? g.costo.div(g.km).toDecimalPlaces(4) : null,
    desgaste1000: g.desgastes.length ? g.desgastes.reduce((a, b) => a.plus(b), ZERO).div(g.desgastes.length).toDecimalPlaces(3) : null,
  }));
  return salida.sort((a, b) => (a.costoKm == null ? 1 : b.costoKm == null ? -1 : a.costoKm.comparedTo(b.costoKm)));
}
