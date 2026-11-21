/**
 * INSPECCIÓN PRE VIAJE (lógica pura): lista de revisión y resultado.
 *
 * Basada en el reporte diario del conductor que exigen las normas de EE. UU. (FMCSA §396.11/§396.13) y en las
 * prácticas de flotas de carga pesada; se agregan el equipo de emergencia y los documentos que pide la PMT/PNC.
 * Un punto CRÍTICO en falla deja el cabezal fuera de servicio: el viaje no puede iniciar hasta repararlo.
 */
import { z } from 'zod';
import { zBool, zIdOpt, zIdReq, zNum } from '../../common/pipes/zod';
import { PRIORIDADES, Prioridad, TIPOS, TipoCaso } from '../casos/casos.logica';
import { evidenciasZ } from '../../common/evidencias';

export interface Punto { codigo: string; nombre: string; grupo: string; critico: boolean; aplicaA: 'CABEZAL' | 'REMOLQUE' }

export const PUNTOS: Punto[] = [
  // Seguridad: fuera de servicio si fallan
  { codigo: 'FRENOS', nombre: 'Frenos de servicio (presión de aire, respuesta del pedal)', grupo: 'Frenos y dirección', critico: true, aplicaA: 'CABEZAL' },
  { codigo: 'FRENO_ESTACIONAMIENTO', nombre: 'Freno de estacionamiento', grupo: 'Frenos y dirección', critico: true, aplicaA: 'CABEZAL' },
  { codigo: 'DIRECCION', nombre: 'Dirección (juego del timón, ruidos)', grupo: 'Frenos y dirección', critico: true, aplicaA: 'CABEZAL' },
  { codigo: 'LLANTAS', nombre: 'Llantas: presión, cortes, desgaste parejo', grupo: 'Llantas y ruedas', critico: true, aplicaA: 'CABEZAL' },
  { codigo: 'RUEDAS', nombre: 'Rines y tuercas completas y apretadas', grupo: 'Llantas y ruedas', critico: true, aplicaA: 'CABEZAL' },
  { codigo: 'LUCES', nombre: 'Luces: altas, bajas, freno, direccionales, intermitentes', grupo: 'Luces y visibilidad', critico: true, aplicaA: 'CABEZAL' },
  { codigo: 'FUGAS', nombre: 'Sin fugas de aire, aceite, combustible o refrigerante', grupo: 'Motor', critico: true, aplicaA: 'CABEZAL' },
  { codigo: 'QUINTA_RUEDA', nombre: 'Quinta rueda y seguro del perno rey', grupo: 'Acople', critico: true, aplicaA: 'CABEZAL' },
  // Remolque
  { codigo: 'REM_FRENOS', nombre: 'Frenos del remolque', grupo: 'Remolque', critico: true, aplicaA: 'REMOLQUE' },
  { codigo: 'REM_LLANTAS', nombre: 'Llantas y rines del remolque', grupo: 'Remolque', critico: true, aplicaA: 'REMOLQUE' },
  { codigo: 'REM_LUCES', nombre: 'Luces y reflectivos del remolque', grupo: 'Remolque', critico: true, aplicaA: 'REMOLQUE' },
  { codigo: 'REM_MANGUERAS', nombre: 'Mangueras de aire y cable eléctrico al remolque', grupo: 'Remolque', critico: false, aplicaA: 'REMOLQUE' },
  { codigo: 'REM_PUERTAS', nombre: 'Puertas, amarres o sellos de la carga', grupo: 'Remolque', critico: false, aplicaA: 'REMOLQUE' },
  // Mantenimiento: se puede salir, se abre orden de trabajo
  { codigo: 'ACEITE', nombre: 'Nivel de aceite de motor', grupo: 'Motor', critico: false, aplicaA: 'CABEZAL' },
  { codigo: 'REFRIGERANTE', nombre: 'Nivel de refrigerante', grupo: 'Motor', critico: false, aplicaA: 'CABEZAL' },
  { codigo: 'TABLERO', nombre: 'Tablero sin testigos encendidos', grupo: 'Motor', critico: false, aplicaA: 'CABEZAL' },
  { codigo: 'ESPEJOS', nombre: 'Espejos completos y ajustados', grupo: 'Luces y visibilidad', critico: false, aplicaA: 'CABEZAL' },
  { codigo: 'PARABRISAS', nombre: 'Parabrisas y limpiaparabrisas', grupo: 'Luces y visibilidad', critico: false, aplicaA: 'CABEZAL' },
  { codigo: 'BOCINA', nombre: 'Bocina', grupo: 'Cabina', critico: false, aplicaA: 'CABEZAL' },
  { codigo: 'CINTURON', nombre: 'Cinturón de seguridad', grupo: 'Cabina', critico: false, aplicaA: 'CABEZAL' },
  { codigo: 'EXTINTOR', nombre: 'Extintor cargado y vigente', grupo: 'Equipo de emergencia', critico: false, aplicaA: 'CABEZAL' },
  { codigo: 'TRIANGULOS', nombre: 'Triángulos o conos reflectivos', grupo: 'Equipo de emergencia', critico: false, aplicaA: 'CABEZAL' },
  { codigo: 'BOTIQUIN', nombre: 'Botiquín de primeros auxilios', grupo: 'Equipo de emergencia', critico: false, aplicaA: 'CABEZAL' },
  { codigo: 'DOCUMENTOS', nombre: 'Tarjeta de circulación, seguro y licencia a bordo', grupo: 'Documentos', critico: false, aplicaA: 'CABEZAL' },
];

const PUNTO = new Map(PUNTOS.map((p) => [p.codigo, p]));
export const punto = (codigo: string) => PUNTO.get(codigo);

/** A qué tipo de caso va la falla de cada punto (los mecánicos y de llantas van al taller). */
export function tipoDeCaso(codigo: string): TipoCaso {
  const p = PUNTO.get(codigo);
  if (!p) return 'OTRO';
  if (['LLANTAS', 'RUEDAS', 'REM_LLANTAS'].includes(codigo)) return 'LLANTAS';
  if (p.grupo === 'Documentos') return 'DOCUMENTOS';
  if (p.grupo === 'Equipo de emergencia' || codigo === 'CINTURON') return 'SEGURIDAD';
  if (codigo === 'REM_PUERTAS') return 'CARGA';
  return 'MECANICO';
}

/** Prioridad por defecto: un punto crítico es urgente; los demás, moderados. El piloto o el despachador la pueden cambiar. */
export const prioridadSugerida = (codigo: string): Prioridad => (PUNTO.get(codigo)?.critico ? 'URGENTE' : 'MODERADA');

/** Puntos que corresponden según lleve o no remolque. */
export const puntosPara = (conRemolque: boolean) => PUNTOS.filter((p) => p.aplicaA === 'CABEZAL' || conRemolque);

export type EstadoP = 'OK' | 'FALLA' | 'NO_APLICA';

/**
 * Resultado: una falla crítica (o un hallazgo que impide salir) rechaza; cualquier otra falla u hallazgo deja observaciones.
 */
export function evaluar(respuestas: { codigo: string; estado: EstadoP }[], hallazgos: { impideSalir?: boolean | null }[] = []) {
  const fallas = respuestas.filter((r) => r.estado === 'FALLA');
  const criticas = fallas.filter((r) => PUNTO.get(r.codigo)?.critico).length + hallazgos.filter((h) => h.impideSalir).length;
  const total = fallas.length + hallazgos.length;
  const resultado = criticas ? 'RECHAZADA' : total ? 'CON_OBSERVACIONES' : 'APROBADA';
  return { resultado: resultado as 'APROBADA' | 'CON_OBSERVACIONES' | 'RECHAZADA', fallas: total, fallasCriticas: criticas };
}

/** Faltan puntos obligatorios (todos los que aplican deben contestarse). */
export function faltantes(conRemolque: boolean, respuestas: { codigo: string }[]) {
  const dados = new Set(respuestas.map((r) => r.codigo));
  return puntosPara(conRemolque).filter((p) => !dados.has(p.codigo)).map((p) => p.nombre);
}

/** Texto de la orden de trabajo que se abre sola. */
export const descripcionOrden = (fallas: { codigo: string; nota?: string | null }[]) =>
  'Inspección pre viaje: ' + fallas.map((f) => `${PUNTO.get(f.codigo)?.nombre ?? f.codigo}${f.nota ? ` (${f.nota})` : ''}`).join('; ');

/** Horas que vale una inspección para iniciar un viaje. */
export const VIGENCIA_HORAS = 24;

export const inspeccionZ = z.object({
  cabezalId: zIdReq,
  remolqueId: zIdOpt,
  pilotoId: zIdOpt,
  viajeId: zIdOpt,
  odometro: zNum(z.number().nonnegative().max(9_999_999).nullable().optional()),
  observaciones: z.string().trim().max(500).nullish().transform((v) => v || null),
  puntos: z.array(z.object({
    codigo: z.string().refine((c) => PUNTO.has(c), 'Punto de inspección desconocido'),
    estado: z.enum(['OK', 'FALLA', 'NO_APLICA']),
    nota: z.string().trim().max(200).nullish().transform((v) => v || null),
    prioridad: z.enum(PRIORIDADES).nullish(), // de la falla; vacío = la sugerida
    archivoId: z.string().uuid().nullish(),
  })).min(1, 'Conteste la lista de revisión'),
  // Cualquier otra cosa que haya que reportar (fuera de la lista): abre su propio caso
  hallazgos: z.array(z.object({
    titulo: z.string().trim().min(5, 'Describa el hallazgo (al menos 5 letras)').max(150),
    descripcion: z.string().trim().max(1000).nullish().transform((v) => v || null),
    tipo: z.enum(TIPOS).default('MECANICO'),
    prioridad: z.enum(PRIORIDADES, { errorMap: () => ({ message: 'Elija la prioridad del hallazgo' }) }),
    impideSalir: zBool.transform((v) => v ?? false),
  })).max(20).default([]),
  evidencias: evidenciasZ, // fotos generales de la unidad
  uuidCliente: z.string().uuid().nullish(), // reenvío desde el móvil sin duplicar
}).superRefine((d, ctx) => {
  const vistos = new Set<string>();
  for (const p of d.puntos) {
    if (vistos.has(p.codigo)) ctx.addIssue({ code: 'custom', path: ['puntos'], message: `Punto repetido: ${p.codigo}` });
    vistos.add(p.codigo);
    if (p.estado === 'FALLA' && !p.nota) ctx.addIssue({ code: 'custom', path: ['puntos', p.codigo], message: `Describa la falla en «${PUNTO.get(p.codigo)?.nombre ?? p.codigo}»` });
    if (p.estado === 'NO_APLICA' && PUNTO.get(p.codigo)?.critico && PUNTO.get(p.codigo)?.aplicaA === 'CABEZAL') ctx.addIssue({ code: 'custom', path: ['puntos', p.codigo], message: `«${PUNTO.get(p.codigo)?.nombre}» siempre aplica` });
  }
});

export const filtroInspeccionesZ = z.object({
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  cabezalId: zIdOpt,
  resultado: z.enum(['APROBADA', 'CON_OBSERVACIONES', 'RECHAZADA']).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});
