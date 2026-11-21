/**
 * TALLER (lógica pura, sin base de datos): órdenes de trabajo, alertas de mantenimiento y duración de repuestos por marca.
 *
 * Mantenimiento preventivo: cada plan se repite cada X km o Y días, lo que ocurra primero, desde el último servicio
 * cerrado de ese plan en esa unidad. Se avisa con anticipación (avisoKm / avisoDias).
 *
 * Duración por marca: entre dos cambios del mismo repuesto en el mismo cabezal pasan N km; esos km se le atribuyen a
 * la marca que se puso en el primer cambio. Costo por km = costo unitario ÷ km que duró.
 */
import { z } from 'zod';
import { D, Decimal, Num, r2, suma, ZERO } from '../../common/money';
import { zIdOpt, zIdReq, zMontoOpt, zNum } from '../../common/pipes/zod';

export const TIPOS_ORDEN = ['PREVENTIVO', 'SERVICIO_MAYOR', 'CORRECTIVO', 'LLANTAS', 'CARROCERIA'] as const;
export const PRIORIDADES = ['URGENTE', 'ALTA', 'MODERADA', 'BAJA'] as const;
const DIA = 86_400_000;
const texto = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => v || null);
const zFecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha no válida (AAAA-MM-DD)').transform((s) => new Date(`${s}T12:00:00.000Z`));
const km = zNum(z.number().min(0).max(99_999_999).optional().nullable());

export const crearOrdenZ = z.object({
  cabezalId: zIdOpt,
  remolqueId: zIdOpt,
  tipo: z.enum(TIPOS_ORDEN),
  prioridad: z.enum(PRIORIDADES).default('MODERADA'),
  descripcion: z.string().trim().min(5, 'Describa el trabajo (mínimo 5 letras)').max(1000),
  planId: zIdOpt,
  tallerId: zIdOpt, // vacío = taller propio
  odometro: km,
  /** Deja la unidad «en taller» (no puede salir a viaje) hasta cerrar la orden. */
  ponerEnTaller: z.boolean().default(false),
  /** Servicio que ya se hizo (para arrancar las alertas con su historial): se crea cerrada. */
  yaRealizado: z.boolean().default(false),
  fecha: zFecha.optional(),
  manoObra: zMontoOpt,
  documento: texto(60),
  observaciones: texto(1000),
}).refine((d) => Boolean(d.cabezalId) !== Boolean(d.remolqueId), { message: 'Indique el cabezal o el remolque (uno de los dos)', path: ['cabezalId'] })
  .refine((d) => !d.yaRealizado || d.fecha, { message: 'Indique la fecha en que se hizo el servicio', path: ['fecha'] });

export const editarOrdenZ = z.object({
  tipo: z.enum(TIPOS_ORDEN).optional(),
  prioridad: z.enum(PRIORIDADES).optional(),
  descripcion: z.string().trim().min(5).max(1000).optional(),
  planId: zIdOpt,
  tallerId: zIdOpt,
  odometro: km,
  manoObra: zMontoOpt,
  documento: texto(60),
  archivoId: z.string().uuid().optional().nullable(),
  observaciones: texto(1000),
});

export const repuestoZ = z.object({
  repuestoId: zIdReq,
  marcaId: zIdOpt,
  cantidad: zNum(z.number().positive().max(9999)),
  costoUnitario: zNum(z.number().nonnegative().max(9_999_999)).optional(),
});

export const estadoOrdenZ = z.object({
  estado: z.enum(['EN_PROCESO', 'CERRADA', 'ANULADA']),
  /** Al cerrar: qué se hizo. Al anular: el motivo. */
  comentario: texto(1000),
  odometro: km,
}).refine((d) => d.estado === 'EN_PROCESO' || (d.comentario ?? '').length >= 5, { message: 'Escriba qué se hizo (o por qué se anula), mínimo 5 letras', path: ['comentario'] });

export const filtroOrdenesZ = z.object({
  estado: z.enum(['ABIERTAS', 'ABIERTA', 'EN_PROCESO', 'CERRADA', 'ANULADA', 'TODAS']).default('ABIERTAS'),
  cabezalId: zIdOpt,
  q: z.string().trim().max(60).optional(),
  limit: zNum(z.number().int().min(1).max(500).default(200)),
});

export const TRANSICIONES: Record<string, string[]> = { ABIERTA: ['EN_PROCESO', 'CERRADA', 'ANULADA'], EN_PROCESO: ['CERRADA', 'ANULADA'], CERRADA: [], ANULADA: [] };

export const totales = (manoObra: Num, repuestos: { total: Num }[]) => {
  const totalRepuestos = r2(suma(repuestos.map((r) => r.total)));
  return { totalRepuestos, total: r2(D(manoObra).plus(totalRepuestos)) };
};

export interface Plan { cadaKm: number | null; cadaDias: number | null; avisoKm: number; avisoDias: number }
export type EstadoPlan = 'VENCIDO' | 'PROXIMO' | 'AL_DIA' | 'SIN_HISTORIAL';

/**
 * Cómo va un plan en una unidad. `kmDesde`: km recorridos desde el último servicio (cabezal: odómetro; remolque: sus viajes).
 * Sin servicio registrado: SIN_HISTORIAL (hay que registrar el último o hacerlo ya).
 */
export function estadoPlan(p: Plan, ultimo: { fecha: Date; odometro: Num | null } | null, actual: { hoy: Date; odometro?: Num | null; kmDesde?: Num | null }) {
  if (!ultimo) return { estado: 'SIN_HISTORIAL' as EstadoPlan, kmDesde: null, diasDesde: null, faltaKm: null, faltaDias: null, proximoKm: null, proximaFecha: null };
  const diasDesde = Math.floor((actual.hoy.getTime() - ultimo.fecha.getTime()) / DIA);
  const kmDesde = actual.kmDesde != null ? D(actual.kmDesde) : actual.odometro != null && ultimo.odometro != null ? Decimal.max(ZERO, D(actual.odometro).minus(D(ultimo.odometro))) : null;
  const faltaKm = p.cadaKm && kmDesde ? D(p.cadaKm).minus(kmDesde) : null;
  const faltaDias = p.cadaDias ? p.cadaDias - diasDesde : null;
  const vencido = (faltaKm != null && faltaKm.lte(0)) || (faltaDias != null && faltaDias <= 0);
  const proximo = (faltaKm != null && faltaKm.lte(p.avisoKm)) || (faltaDias != null && faltaDias <= p.avisoDias);
  return {
    estado: (vencido ? 'VENCIDO' : proximo ? 'PROXIMO' : 'AL_DIA') as EstadoPlan,
    kmDesde, diasDesde, faltaKm, faltaDias,
    proximoKm: p.cadaKm && ultimo.odometro != null ? D(ultimo.odometro).plus(p.cadaKm) : null,
    proximaFecha: p.cadaDias ? new Date(ultimo.fecha.getTime() + p.cadaDias * DIA).toISOString().slice(0, 10) : null,
  };
}

export interface Uso { unidad: string; repuestoId: number; repuesto: string; categoria: string | null; marca: string; odometro: Num | null; fecha: Date; costoUnitario: Num; cantidad: Num }

/** Por repuesto y marca: veces usado, costo promedio, km que dura en promedio y costo por km. Ordenado por repuesto y menor costo/km. */
export function duracionPorMarca(usos: Uso[]) {
  const grupos = new Map<string, { repuestoId: number; repuesto: string; categoria: string | null; marca: string; veces: number; unidades: Decimal; costo: Decimal; tramos: Decimal[] }>();
  const clave = (u: Uso) => `${u.repuestoId}|${u.marca}`;
  for (const u of usos) {
    const g = grupos.get(clave(u)) ?? { repuestoId: u.repuestoId, repuesto: u.repuesto, categoria: u.categoria, marca: u.marca, veces: 0, unidades: ZERO, costo: ZERO, tramos: [] };
    g.veces += 1;
    g.unidades = g.unidades.plus(D(u.cantidad));
    g.costo = g.costo.plus(D(u.costoUnitario).times(D(u.cantidad)));
    grupos.set(clave(u), g);
  }
  // Km entre cambios consecutivos del mismo repuesto en la misma unidad
  const porUnidad = new Map<string, Uso[]>();
  for (const u of usos.filter((x) => x.odometro != null)) {
    const k = `${u.unidad}|${u.repuestoId}`;
    porUnidad.set(k, [...(porUnidad.get(k) ?? []), u]);
  }
  for (const lista of porUnidad.values()) {
    lista.sort((a, b) => D(a.odometro).comparedTo(D(b.odometro)) || a.fecha.getTime() - b.fecha.getTime());
    for (let i = 0; i + 1 < lista.length; i++) {
      const km = D(lista[i + 1].odometro).minus(D(lista[i].odometro));
      if (km.gt(0)) grupos.get(clave(lista[i]))!.tramos.push(km);
    }
  }
  return [...grupos.values()].map((g) => {
    const costoPromedio = g.unidades.gt(0) ? r2(g.costo.div(g.unidades)) : ZERO;
    const kmPromedio = g.tramos.length ? suma(g.tramos).div(g.tramos.length).toDecimalPlaces(0) : null;
    return {
      repuestoId: g.repuestoId, repuesto: g.repuesto, categoria: g.categoria, marca: g.marca, veces: g.veces, unidades: g.unidades,
      costoPromedio, kmPromedio, medidas: g.tramos.length,
      costoKm: kmPromedio && kmPromedio.gt(0) ? costoPromedio.div(kmPromedio).toDecimalPlaces(4) : null,
    };
  }).sort((a, b) => a.repuesto.localeCompare(b.repuesto, 'es') || (a.costoKm && b.costoKm ? a.costoKm.comparedTo(b.costoKm) : a.costoKm ? -1 : b.costoKm ? 1 : 0));
}
