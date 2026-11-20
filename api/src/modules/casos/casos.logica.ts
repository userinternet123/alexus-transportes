/**
 * CASOS (lógica pura): tipos, prioridades con plazo de atención y cambios de estado.
 */
import { z } from 'zod';
import { zBool, zIdOpt } from '../../common/pipes/zod';

export const PRIORIDADES = ['URGENTE', 'ALTA', 'MODERADA', 'BAJA'] as const;
export type Prioridad = (typeof PRIORIDADES)[number];
export const TIPOS = ['MECANICO', 'LLANTAS', 'DOCUMENTOS', 'SEGURIDAD', 'CARGA', 'OTRO'] as const;
export type TipoCaso = (typeof TIPOS)[number];
/** Los tipos que se resuelven en el taller abren (o se suman a) una orden de trabajo. */
export const TIPOS_TALLER: TipoCaso[] = ['MECANICO', 'LLANTAS'];

export const ETIQUETA_PRIORIDAD: Record<Prioridad, string> = { URGENTE: 'Urgente', ALTA: 'Alta', MODERADA: 'Moderada', BAJA: 'Baja' };
export const PARAMETRO_PLAZO: Record<Prioridad, string> = { URGENTE: 'casos.horas_urgente', ALTA: 'casos.horas_alta', MODERADA: 'casos.horas_moderada', BAJA: 'casos.horas_baja' };

/** La de mayor urgencia de una lista (para la prioridad de la orden de trabajo). */
export const masUrgente = (ps: Prioridad[]): Prioridad => PRIORIDADES.find((p) => ps.includes(p)) ?? 'MODERADA';

export const venceEn = (desde: Date, horas: number) => new Date(desde.getTime() + horas * 3_600_000);

export type EstadoCaso = 'ABIERTO' | 'EN_PROCESO' | 'RESUELTO' | 'ANULADO';
const SIGUIENTES: Record<EstadoCaso, EstadoCaso[]> = {
  ABIERTO: ['EN_PROCESO', 'RESUELTO', 'ANULADO'],
  EN_PROCESO: ['ABIERTO', 'RESUELTO', 'ANULADO'],
  RESUELTO: ['ABIERTO'], // reabrir si la falla volvió
  ANULADO: [],
};
export const puedePasar = (de: EstadoCaso, a: EstadoCaso) => SIGUIENTES[de].includes(a);

/** Semáforo del plazo: vencido, por vencer (último 25 % del plazo) o a tiempo. */
export function semaforo(c: { estado: EstadoCaso; venceEn: Date; creadoEn: Date }, ahora = new Date()): 'VENCIDO' | 'POR_VENCER' | 'A_TIEMPO' | null {
  if (c.estado === 'RESUELTO' || c.estado === 'ANULADO') return null;
  if (c.venceEn <= ahora) return 'VENCIDO';
  const total = c.venceEn.getTime() - c.creadoEn.getTime();
  return c.venceEn.getTime() - ahora.getTime() <= total * 0.25 ? 'POR_VENCER' : 'A_TIEMPO';
}

const texto = (max: number) => z.string().trim().max(max).nullish().transform((v) => v || null);

export const crearCasoZ = z.object({
  tipo: z.enum(TIPOS, { errorMap: () => ({ message: 'Elija el tipo de caso' }) }),
  prioridad: z.enum(PRIORIDADES, { errorMap: () => ({ message: 'Elija la prioridad' }) }),
  titulo: z.string({ required_error: 'Escriba de qué se trata' }).trim().min(5, 'Escriba de qué se trata (al menos 5 letras)').max(150),
  descripcion: texto(1000),
  impideSalir: zBool.transform((v) => v ?? false),
  cabezalId: zIdOpt,
  remolqueId: zIdOpt,
  viajeId: zIdOpt,
  responsableId: zIdOpt,
});

export const cambiarEstadoZ = z.object({
  estado: z.enum(['ABIERTO', 'EN_PROCESO', 'RESUELTO', 'ANULADO']),
  comentario: texto(1000),
}).superRefine((d, ctx) => {
  if ((d.estado === 'RESUELTO' || d.estado === 'ANULADO') && (!d.comentario || d.comentario.length < 5)) ctx.addIssue({ code: 'custom', path: ['comentario'], message: d.estado === 'RESUELTO' ? 'Escriba qué se hizo para resolverlo' : 'Escriba por qué se anula' });
});

export const editarCasoZ = z.object({
  prioridad: z.enum(PRIORIDADES).optional(),
  responsableId: zIdOpt,
  comentario: texto(1000),
});

export const filtroCasosZ = z.object({
  estado: z.enum(['ABIERTO', 'EN_PROCESO', 'RESUELTO', 'ANULADO', 'ABIERTOS']).optional(),
  prioridad: z.enum(PRIORIDADES).optional(),
  tipo: z.enum(TIPOS).optional(),
  cabezalId: zIdOpt,
  vencidos: zBool,
  mios: zBool,
  limit: z.coerce.number().int().min(1).max(500).default(200),
});
