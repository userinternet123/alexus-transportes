/**
 * QUÉ COMPRAR (lógica pura). Cuánto pedir de cada producto y a qué proveedor; agrupa las líneas en un pedido por proveedor.
 */
import { z } from 'zod';

export const sugeridoZ = z.object({
  criterio: z.enum(['sin-existencia', 'bajo-minimo', 'hasta-cantidad', 'por-conseguir', 'para-listas', 'temporada']).default('sin-existencia'),
  // Ventas de un rango de fechas a elección (si no, los últimos `diasVentas` días)
  ventasDesde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  ventasHasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  temporadaId: z.coerce.number().int().positive().optional(), // modo «por temporada»: lo calcula el motor analítico
  cantidad: z.coerce.number().min(0).max(1_000_000).default(0), // para "hasta-cantidad": existencia ≤ cantidad
  diasVentas: z.coerce.number().int().min(7).max(365).default(60), // ventas que se toman en cuenta
  diasCobertura: z.coerce.number().int().min(1).max(365).default(30), // para cuántos días alcanzar
  conVentas: z.preprocess((v) => v === 'false' || v === false ? false : true, z.boolean()), // solo productos vendidos en esos días
});
export type ParametrosSugerido = z.infer<typeof sugeridoZ>;

/**
 * Cuánto pedir: lo necesario para cubrir `diasCobertura` días al ritmo de venta reciente, y nunca menos que el mínimo.
 * Siempre al menos 1 (el producto entró a la lista porque se quiere comprar). La persona puede cambiarlo.
 */
export function cantidadSugerida(p: { existencia: number; minimo: number; vendido: number }, q: { diasVentas: number; diasCobertura: number }): number {
  const porDia = q.diasVentas > 0 ? p.vendido / q.diasVentas : 0;
  const objetivo = Math.max(p.minimo, Math.ceil(porDia * q.diasCobertura - 1e-9));
  return Math.max(1, Math.ceil(objetivo - p.existencia - 1e-9));
}

/**
 * Cantidad según el criterio: "por conseguir" pide lo cotizado; "para listas" lo que falta para los compradores esperados
 * de las listas reutilizables; los demás, el ritmo de venta. Siempre al menos 1.
 */
export function cantidadPorCriterio(p: { existencia: number; minimo: number; vendido: number; cotizado: number; porListas: number }, q: { criterio: string; diasVentas: number; diasCobertura: number }): number {
  if (q.criterio === 'por-conseguir') return Math.max(1, Math.ceil(p.cotizado - Math.max(p.existencia, 0) - 1e-9));
  if (q.criterio === 'para-listas') return Math.max(1, Math.ceil(p.porListas - p.existencia - 1e-9));
  return cantidadSugerida(p, q);
}

export const porConseguirZ = z.object({
  nombre: z.string({ required_error: 'Escriba el nombre del producto' }).trim().min(3, 'Escriba el nombre del producto (al menos 3 letras)').max(200),
  precioVenta: z.coerce.number({ invalid_type_error: 'Escriba un precio válido' }).positive('El precio debe ser mayor que cero').max(1_000_000),
});

export interface OpcionProveedor { proveedorId: number; ultimaCompra: string | null; compras: number; asignado: boolean; principal: boolean }
/** Proveedor sugerido: el que el negocio eligió como principal; si no, el de la compra más reciente; si no, ninguno. */
export function proveedorSugerido(opciones: OpcionProveedor[]): number | null {
  const elegido = opciones.find((o) => o.asignado && o.principal);
  if (elegido) return elegido.proveedorId;
  const conCompra = opciones.filter((o) => o.ultimaCompra).sort((a, b) => String(b.ultimaCompra).localeCompare(String(a.ultimaCompra)));
  return conCompra[0]?.proveedorId ?? opciones[0]?.proveedorId ?? null;
}

export const pedidoZ = z.object({
  nota: z.string().trim().max(500).optional(),
  recordarProveedor: z.boolean().default(true),
  lineas: z.array(z.object({
    productoId: z.number().int().positive(),
    proveedorId: z.number({ required_error: 'Elija el proveedor', invalid_type_error: 'Elija el proveedor' }).int().positive(),
    cantidad: z.number().positive('La cantidad debe ser mayor que cero').max(1_000_000),
    existencia: z.number().optional(),
  })).min(1, 'Marque al menos un producto').max(2000),
});

/** Un pedido por proveedor; si el mismo producto viene dos veces para el mismo proveedor, se suman las cantidades. */
export function agruparPorProveedor(lineas: z.infer<typeof pedidoZ>['lineas']) {
  const grupos = new Map<number, Map<number, { productoId: number; cantidad: number; existencia?: number }>>();
  for (const l of lineas) {
    const g = grupos.get(l.proveedorId) ?? new Map();
    const previa = g.get(l.productoId);
    g.set(l.productoId, { productoId: l.productoId, cantidad: Math.round(((previa?.cantidad ?? 0) + l.cantidad) * 1000) / 1000, existencia: l.existencia ?? previa?.existencia });
    grupos.set(l.proveedorId, g);
  }
  return [...grupos].map(([proveedorId, g]) => ({ proveedorId, lineas: [...g.values()] }));
}

export const SIGUIENTE_ESTADO: Record<string, string[]> = { BORRADOR: ['ENVIADO', 'ANULADO'], ENVIADO: ['ANULADO'], RECIBIDO_PARCIAL: [], RECIBIDO: [], ANULADO: [] };
/** Se puede registrar lo que llegó de un pedido por enviar, enviado o recibido en parte. */
export const RECIBIBLE = ['BORRADOR', 'ENVIADO', 'RECIBIDO_PARCIAL'];
export const MEDIOS_ENVIO = ['WHATSAPP', 'CORREO', 'TELEFONO', 'PERSONA', 'OTRO'] as const;
export const NOMBRE_MEDIO: Record<string, string> = { WHATSAPP: 'WhatsApp', CORREO: 'correo', TELEFONO: 'teléfono', PERSONA: 'en persona', OTRO: 'otro medio' };

/** Rango de ventas a usar: el elegido o los últimos N días. Devuelve también cuántos días abarca (para el ritmo de venta). */
export function rangoVentas(q: { diasVentas: number; ventasDesde?: string; ventasHasta?: string }, hoy: string): { desde: string; hasta: string; dias: number } {
  const dia = (s: string) => Date.parse(`${s}T00:00:00Z`);
  if (q.ventasDesde && q.ventasHasta) {
    const [desde, hasta] = q.ventasDesde <= q.ventasHasta ? [q.ventasDesde, q.ventasHasta] : [q.ventasHasta, q.ventasDesde];
    return { desde, hasta, dias: Math.round((dia(hasta) - dia(desde)) / 86_400_000) + 1 };
  }
  return { desde: new Date(dia(hoy) - q.diasVentas * 86_400_000).toISOString().slice(0, 10), hasta: hoy, dias: q.diasVentas };
}

export const recepcionZ = z.object({
  lineas: z.array(z.object({ productoId: z.number().int().positive(), recibido: z.number().min(0, 'La cantidad recibida no puede ser negativa').max(1_000_000) })).min(1, 'Indique lo que llegó'),
  nota: z.string().trim().max(500).optional(),
});

/** Suma lo que llegó a lo ya recibido y dice si el pedido quedó completo y qué falta. */
export function aplicarRecepcion(detalles: { productoId: number; cantidad: number; cantidadRecibida: number }[], llegada: { productoId: number; recibido: number }[]) {
  const ajenos = llegada.filter((l) => !detalles.some((d) => d.productoId === l.productoId));
  if (ajenos.length) return { error: 'Solo se puede recibir lo que está en el pedido' as const };
  const nuevos = detalles.map((d) => ({ ...d, cantidadRecibida: Math.round((d.cantidadRecibida + (llegada.find((l) => l.productoId === d.productoId)?.recibido ?? 0)) * 1000) / 1000 }));
  const faltan = nuevos.filter((d) => d.cantidadRecibida < d.cantidad).map((d) => ({ productoId: d.productoId, falta: Math.round((d.cantidad - d.cantidadRecibida) * 1000) / 1000 }));
  return { nuevos, completo: faltan.length === 0, faltan };
}
export const numeroPedido = (id: number) => `P-${String(id).padStart(5, '0')}`;
export const nombreTercero = (t: { razonSocial?: string | null; nombreComercial?: string | null; nombres?: string | null; apellidos?: string | null }) =>
  t.razonSocial || t.nombreComercial || [t.nombres, t.apellidos].filter(Boolean).join(' ') || 'Proveedor sin nombre';
