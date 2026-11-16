/** GASTOS FUERA DE CAJA (lógica pura): reglas y categorías de inicio. */
import { z } from 'zod';

export const CATEGORIAS_BASICAS = ['Alquiler', 'Energía eléctrica', 'Agua', 'Internet y teléfono', 'Transporte y combustible', 'Publicidad', 'Mantenimiento y reparaciones', 'Impuestos y trámites', 'Servicios profesionales (contador, abogado)', 'Papelería y oficina', 'Comisiones bancarias', 'Otros gastos'];
export const MEDIOS = ['TRANSFERENCIA', 'TARJETA', 'CHEQUE', 'DEBITO', 'EFECTIVO_FUERA_CAJA'] as const;

const ymd = /^\d{4}-\d{2}-\d{2}$/;
export const gastoZ = (hoy: string) => z.object({
  fecha: z.string({ required_error: 'Indique la fecha' }).regex(ymd, 'Fecha no válida').refine((f) => f <= hoy, 'La fecha no puede ser futura'),
  categoriaId: z.coerce.number({ invalid_type_error: 'Elija la categoría' }).int().positive('Elija la categoría'),
  concepto: z.string({ required_error: 'Escriba el concepto' }).trim().min(3, 'Escriba el concepto (al menos 3 letras)').max(200),
  monto: z.coerce.number({ invalid_type_error: 'Escriba un monto válido' }).positive('El monto debe ser mayor que cero').max(10_000_000).multipleOf(0.01, 'Use máximo 2 decimales'),
  medioPago: z.enum(MEDIOS, { errorMap: () => ({ message: 'Elija cómo se pagó' }) }),
  proveedorId: z.coerce.number().int().positive().nullish(),
  documento: z.string().trim().max(60).nullish(),
});

export const filtroGastosZ = z.object({
  mes: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(), // por defecto, el mes actual
  categoriaId: z.coerce.number().int().positive().optional(),
  incluirAnulados: z.preprocess((v) => v === 'true' || v === true, z.boolean()).default(false),
});

/** Primer y último día de un mes "2026-11" → ["2026-11-01", "2026-11-30"]. */
export function rangoMes(mes: string): [string, string] {
  const [y, m] = mes.split('-').map(Number);
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return [`${mes}-01`, `${mes}-${String(ultimo).padStart(2, '0')}`];
}
