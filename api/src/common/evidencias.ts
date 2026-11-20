/**
 * EVIDENCIAS: fotos (o PDF) que respaldan un evento del viaje, un caso o una inspección.
 * El archivo se sube antes con POST /archivos (el móvil lo comprime) y aquí se liga, con dónde y cuándo se tomó.
 * Solo se pueden ligar archivos que subió el mismo usuario: nadie usa como prueba la foto de otro.
 */
import { z } from 'zod';
import type { Ctx } from './auth/tipos';
import { reglaNegocio } from './errors';
import type { Tx } from './prisma/prisma.service';
import { zNum } from './pipes/zod';

const MIMES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
export const MAX_EVIDENCIAS = 10;

export const zLatitud = zNum(z.number().min(-90).max(90).nullable().optional());
export const zLongitud = zNum(z.number().min(-180).max(180).nullable().optional());

export const evidenciaZ = z.object({
  archivoId: z.string().uuid('Archivo no válido'),
  descripcion: z.string().trim().max(200).nullish().transform((v) => v || null),
  latitud: zLatitud,
  longitud: zLongitud,
  tomadaEn: z.coerce.date().nullish(),
});
export const evidenciasZ = z.array(evidenciaZ).max(MAX_EVIDENCIAS, `Máximo ${MAX_EVIDENCIAS} fotos por reporte`).default([]);
export type EvidenciaEntrada = z.infer<typeof evidenciaZ>;

/** Hora del celular: puede llegar tarde (sin señal), pero no del futuro ni de hace más de una semana. */
export function validarHoraEquipo(fecha: Date, ahora = new Date()) {
  if (fecha.getTime() > ahora.getTime() + 5 * 60_000) throw reglaNegocio('HORA_FUTURA', 'La hora del reporte está en el futuro: revise la hora del celular');
  if (fecha.getTime() < ahora.getTime() - 7 * 86_400_000) throw reglaNegocio('HORA_ANTIGUA', 'El reporte tiene más de 7 días: regístrelo como caso o nota en el portal');
}

/** Liga las evidencias a su destino, validando que cada archivo exista, sea del usuario y no esté repetido. */
export async function ligarEvidencias(tx: Tx, ctx: Ctx, lista: EvidenciaEntrada[], destino: { eventoViajeId?: number; casoId?: number; inspeccionId?: number }) {
  if (!lista.length) return 0;
  const ids = [...new Set(lista.map((e) => e.archivoId))];
  if (ids.length !== lista.length) throw reglaNegocio('EVIDENCIA_REPETIDA', 'La misma foto viene dos veces');
  const archivos = await tx.archivo.findMany({ where: { id: { in: ids } }, select: { id: true, mime: true, creadoPorId: true } });
  if (archivos.length !== ids.length) throw reglaNegocio('EVIDENCIA_NO_EXISTE', 'Alguna foto no se subió completa: vuelva a enviarla');
  if (archivos.some((a) => a.creadoPorId !== ctx.usuario.sub)) throw reglaNegocio('EVIDENCIA_AJENA', 'Solo puede adjuntar fotos que usted subió');
  if (archivos.some((a) => !MIMES.includes(a.mime))) throw reglaNegocio('EVIDENCIA_TIPO', 'Las evidencias deben ser fotos (JPG, PNG, WEBP) o PDF');
  await tx.evidencia.createMany({ data: lista.map((e) => ({ archivoId: e.archivoId, descripcion: e.descripcion, latitud: e.latitud ?? null, longitud: e.longitud ?? null, tomadaEn: e.tomadaEn ?? null, creadoPorId: ctx.usuario.sub, ...destino })) });
  return lista.length;
}

/** Forma pública de una evidencia (la foto se pide a GET /archivos/:id con la sesión). */
export const evidenciaSalida = (e: { id: number; archivoId: string; descripcion: string | null; latitud: unknown; longitud: unknown; tomadaEn: Date | null; creadoEn: Date; archivo?: { mime: string; nombre: string } }) => ({
  id: e.id, archivoId: e.archivoId, descripcion: e.descripcion, latitud: e.latitud, longitud: e.longitud, tomadaEn: e.tomadaEn ?? e.creadoEn, mime: e.archivo?.mime ?? null, nombre: e.archivo?.nombre ?? null,
});
