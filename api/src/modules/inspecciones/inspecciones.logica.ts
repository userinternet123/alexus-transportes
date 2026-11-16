/**
 * INSPECCIÓN PRE VIAJE (lógica pura). Checklist tomado de la práctica de la
 * industria (inspección DOT pre-trip / normas de transporte pesado): el piloto
 * revisa cabezal y remolque antes de salir. Un ítem CRÍTICO que falle impide
 * salir y abre una orden de trabajo correctiva; uno no crítico deja el viaje
 * salir "con observaciones" y queda registrado para el taller.
 */
import { z } from 'zod';
import { zIdOpt, zIdReq, zMontoOpt, zBool } from '../../common/pipes/zod';

export interface ItemChecklist { clave: string; grupo: string; nombre: string; critico: boolean; aplicaA: 'CABEZAL' | 'REMOLQUE' | 'AMBOS' }

export const CHECKLIST: ItemChecklist[] = [
  // Motor y niveles
  { clave: 'ACEITE_MOTOR', grupo: 'Motor y niveles', nombre: 'Nivel de aceite del motor', critico: true, aplicaA: 'CABEZAL' },
  { clave: 'REFRIGERANTE', grupo: 'Motor y niveles', nombre: 'Nivel de refrigerante', critico: true, aplicaA: 'CABEZAL' },
  { clave: 'HIDRAULICO', grupo: 'Motor y niveles', nombre: 'Aceite hidráulico / dirección', critico: false, aplicaA: 'CABEZAL' },
  { clave: 'FUGAS', grupo: 'Motor y niveles', nombre: 'Sin fugas de aceite, combustible o refrigerante', critico: true, aplicaA: 'CABEZAL' },
  { clave: 'FAJAS_MANGUERAS', grupo: 'Motor y niveles', nombre: 'Fajas y mangueras en buen estado', critico: false, aplicaA: 'CABEZAL' },
  { clave: 'BATERIA', grupo: 'Motor y niveles', nombre: 'Batería fija y bornes limpios', critico: false, aplicaA: 'CABEZAL' },
  // Frenos
  { clave: 'FRENO_SERVICIO', grupo: 'Frenos', nombre: 'Freno de servicio responde', critico: true, aplicaA: 'AMBOS' },
  { clave: 'FRENO_PARQUEO', grupo: 'Frenos', nombre: 'Freno de parqueo sostiene', critico: true, aplicaA: 'CABEZAL' },
  { clave: 'PRESION_AIRE', grupo: 'Frenos', nombre: 'Presión de aire sube y se mantiene (sin fugas)', critico: true, aplicaA: 'AMBOS' },
  { clave: 'LINEAS_AIRE', grupo: 'Frenos', nombre: 'Líneas de aire y acoples al remolque', critico: true, aplicaA: 'REMOLQUE' },
  // Llantas y ejes
  { clave: 'LLANTAS_PRESION', grupo: 'Llantas', nombre: 'Presión de llantas', critico: false, aplicaA: 'AMBOS' },
  { clave: 'LLANTAS_LABRADO', grupo: 'Llantas', nombre: 'Labrado suficiente y sin cortes ni separaciones', critico: true, aplicaA: 'AMBOS' },
  { clave: 'TUERCAS', grupo: 'Llantas', nombre: 'Tuercas completas y apretadas', critico: true, aplicaA: 'AMBOS' },
  { clave: 'SUSPENSION', grupo: 'Llantas', nombre: 'Suspensión y muelles sin quiebres', critico: false, aplicaA: 'AMBOS' },
  // Luces y señales
  { clave: 'LUCES_DELANTERAS', grupo: 'Luces', nombre: 'Luces delanteras (altas y bajas)', critico: true, aplicaA: 'CABEZAL' },
  { clave: 'LUCES_TRASERAS', grupo: 'Luces', nombre: 'Luces traseras, freno y retroceso', critico: true, aplicaA: 'AMBOS' },
  { clave: 'DIRECCIONALES', grupo: 'Luces', nombre: 'Direccionales e intermitentes', critico: true, aplicaA: 'AMBOS' },
  { clave: 'REFLECTIVOS', grupo: 'Luces', nombre: 'Cintas reflectivas y luces de gálibo', critico: false, aplicaA: 'REMOLQUE' },
  { clave: 'BOCINA', grupo: 'Luces', nombre: 'Bocina y alarma de retroceso', critico: false, aplicaA: 'CABEZAL' },
  // Cabina
  { clave: 'ESPEJOS', grupo: 'Cabina', nombre: 'Espejos completos y ajustados', critico: false, aplicaA: 'CABEZAL' },
  { clave: 'PARABRISAS', grupo: 'Cabina', nombre: 'Parabrisas sin fisuras; limpiaparabrisas funcionan', critico: false, aplicaA: 'CABEZAL' },
  { clave: 'TABLERO', grupo: 'Cabina', nombre: 'Tablero sin testigos de falla', critico: false, aplicaA: 'CABEZAL' },
  { clave: 'CINTURON', grupo: 'Cabina', nombre: 'Cinturón de seguridad', critico: true, aplicaA: 'CABEZAL' },
  { clave: 'DIRECCION', grupo: 'Cabina', nombre: 'Dirección sin juego excesivo', critico: true, aplicaA: 'CABEZAL' },
  // Acople y carga
  { clave: 'QUINTA_RUEDA', grupo: 'Acople y carga', nombre: 'Quinta rueda engrasada y seguro cerrado', critico: true, aplicaA: 'CABEZAL' },
  { clave: 'KINGPIN', grupo: 'Acople y carga', nombre: 'King pin acoplado y patas del remolque arriba', critico: true, aplicaA: 'REMOLQUE' },
  { clave: 'CARGA_ASEGURADA', grupo: 'Acople y carga', nombre: 'Carga asegurada (twist locks, fajas, lonas)', critico: true, aplicaA: 'REMOLQUE' },
  { clave: 'PUERTAS_REMOLQUE', grupo: 'Acople y carga', nombre: 'Puertas y marchamo del remolque', critico: false, aplicaA: 'REMOLQUE' },
  // Seguridad y documentos
  { clave: 'EXTINTOR', grupo: 'Seguridad y documentos', nombre: 'Extintor cargado y vigente', critico: true, aplicaA: 'CABEZAL' },
  { clave: 'TRIANGULOS', grupo: 'Seguridad y documentos', nombre: 'Triángulos, conos y chaleco', critico: false, aplicaA: 'CABEZAL' },
  { clave: 'BOTIQUIN', grupo: 'Seguridad y documentos', nombre: 'Botiquín y herramienta básica (gato, llave de cruz)', critico: false, aplicaA: 'CABEZAL' },
  { clave: 'DOCUMENTOS', grupo: 'Seguridad y documentos', nombre: 'Tarjeta de circulación, seguro y licencia del piloto a bordo', critico: true, aplicaA: 'AMBOS' },
];

export const inspeccionZ = z.object({
  tipo: z.enum(['PRE_VIAJE', 'POST_VIAJE', 'PERIODICA']).default('PRE_VIAJE'),
  cabezalId: zIdReq,
  remolqueId: zIdOpt,
  pilotoId: zIdReq,
  viajeId: zIdOpt,
  odometro: zMontoOpt,
  observaciones: z.string().trim().max(500).nullish(),
  items: z.array(z.object({ clave: z.string().trim().min(2).max(40), ok: zBool.default(true), observacion: z.string().trim().max(200).nullish(), archivoId: z.string().uuid().nullish() })).min(1, 'Marque el checklist'),
});
export type DatosInspeccion = z.infer<typeof inspeccionZ>;

export const filtroInspeccionesZ = z.object({
  mes: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  cabezalId: z.coerce.number().int().positive().optional(),
  resultado: z.enum(['APROBADA', 'CON_OBSERVACIONES', 'RECHAZADA']).optional(),
});

/** Cruza lo marcado con el checklist y decide el resultado. Los ítems no enviados se toman como OK. */
export function evaluar(items: DatosInspeccion['items'], conRemolque: boolean) {
  const aplicables = CHECKLIST.filter((i) => i.aplicaA !== 'REMOLQUE' || conRemolque);
  const marcados = new Map(items.map((i) => [i.clave.toUpperCase(), i]));
  const filas = aplicables.map((def) => { const m = marcados.get(def.clave); return { clave: def.clave, grupo: def.grupo, nombre: def.nombre, critico: def.critico, ok: m?.ok ?? true, observacion: m?.observacion || null, archivoId: m?.archivoId ?? null }; });
  const fallas = filas.filter((f) => !f.ok);
  const criticas = fallas.filter((f) => f.critico);
  const resultado = criticas.length ? 'RECHAZADA' : fallas.length ? 'CON_OBSERVACIONES' : 'APROBADA';
  return { filas, fallas, criticas, resultado: resultado as 'APROBADA' | 'CON_OBSERVACIONES' | 'RECHAZADA' };
}
