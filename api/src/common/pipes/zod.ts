import { BadRequestException, PipeTransform } from '@nestjs/common';
import { ZodTypeAny, z } from 'zod';

function errorValidacion(err: z.ZodError) {
  const campos = err.flatten().fieldErrors;
  const primeros = err.issues
    .slice(0, 5)
    .map((i) => `${i.path.join('.') || 'body'}: ${i.message}`)
    .join(' | ');
  return new BadRequestException({ codigo: 'VALIDACION', mensaje: `Datos inválidos — ${primeros}`, detalle: campos });
}

/** Valida y tipa un payload con Zod. Uso: `const dto = validar(schema, body)` */
export function validar<T extends ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) throw errorValidacion(r.error);
  return r.data;
}

/** Pipe para usar en parámetros: `@Body(new ZodPipe(schema)) dto` */
export class ZodPipe<T extends ZodTypeAny> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}
  transform(value: unknown): z.infer<T> {
    return validar(this.schema, value);
  }
}

/**
 * Normaliza valores que llegan del motor de formularios del portal:
 *  ''  -> undefined (select "Seleccione...", input vacío)
 *  'Q. 1,250.50' -> 1250.5 (máscara money)   '15' -> 15
 */
const limpiarNumero = (v: unknown) => {
  if (v === '') return undefined;
  if (typeof v === 'string') return Number(v.replace(/^Q\.?\s*/i, '').replace(/,/g, '').trim());
  return v;
};
/** Número tolerante a formato de UI. Pasar el schema COMPLETO (incl. optional/nullable). */
export const zNum = <T extends ZodTypeAny>(schema: T) => z.preprocess(limpiarNumero, schema);
export const zIdReq = zNum(z.number().int().positive());
export const zIdOpt = zNum(z.number().int().positive().nullable().optional());
export const zMonto = zNum(z.number().nonnegative().multipleOf(0.01, 'Máximo 2 decimales'));
export const zMontoOpt = zNum(z.number().nonnegative().nullable().optional());
const BOOL_SI = new Set(['true', 'on', '1', 'si', 'sí']);
const BOOL_NO = new Set(['false', 'off', '0', 'no']);
/** Casilla tolerante: "" o null = sin dato (usa el valor por defecto); "true"/"on"/1 = sí; "false"/0 = no. */
export const zBool = z.preprocess((v) => {
  if (v === '' || v === null) return undefined;
  if (typeof v === 'number') return v === 1 ? true : v === 0 ? false : v;
  if (typeof v === 'string') { const t = v.trim().toLowerCase(); return BOOL_SI.has(t) ? true : BOOL_NO.has(t) ? false : v; }
  return v;
}, z.boolean().optional()); // "opcional" va DENTRO: así una casilla vacía ("") cuenta como sin dato

/** Helpers reutilizables */
export const zId = z.coerce.number().int().positive();
export const zFecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato esperado YYYY-MM-DD');
export const zDinero = z.coerce.number().nonnegative().multipleOf(0.01, 'Máximo 2 decimales');
export const zCantidad = z.coerce.number().positive().multipleOf(0.001, 'Máximo 3 decimales');
export const zPaginacion = z.object({
  page: z.coerce.number().int().min(1).default(1),
  // limit=0 => todos (compatibilidad con ListBase del portal, que pagina en cliente). Tope 5000.
  limit: z.coerce.number().int().min(0).max(5000).default(25),
  q: z.string().trim().max(100).optional(),
});
