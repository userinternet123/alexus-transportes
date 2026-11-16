/** EXPERIENCIA (lógica pura): qué se registra del uso y cómo se protege la privacidad. */
import { z } from 'zod';

/** "/home/ventas/123?x=1" → "/home/ventas/:id": sin ids, documentos ni búsquedas (podrían identificar a alguien). */
export function normalizarRuta(ruta: string): string {
  const limpia = String(ruta ?? '').split(/[?#]/)[0].toLowerCase().slice(0, 120);
  return limpia.split('/').map((p) => (/^\d+$/.test(p) || /^[0-9a-f-]{16,}$/.test(p) || /@/.test(p) ? ':id' : p.replace(/[^a-z0-9._-]/g, ''))).join('/') || '/';
}
/** Evento permitido: "pantalla:/home/ventas" o una acción como "pos.venta" (solo letras, números y . _ -). */
export function normalizarEvento(e: string): string | null {
  const t = String(e ?? '').trim();
  if (t.startsWith('pantalla:')) return `pantalla:${normalizarRuta(t.slice(9))}`;
  return /^[a-z][a-z0-9._-]{1,59}$/.test(t) ? t : null;
}
export const DISPOSITIVOS = ['celular', 'tableta', 'escritorio'] as const;
export const usoZ = z.object({ eventos: z.array(z.object({ evento: z.string().max(140), dispositivo: z.enum(DISPOSITIVOS).default('escritorio') })).max(200) });
export const opinionZ = z.object({
  tipo: z.enum(['NPS', 'UTIL', 'SUGERENCIA']),
  puntaje: z.coerce.number().int().min(0).max(10).optional(),
  texto: z.string().trim().max(1000).optional(),
  pantalla: z.string().max(120).optional(),
  incluirNombre: z.boolean().default(false),
}).refine((o) => o.tipo !== 'NPS' || o.puntaje !== undefined, 'Elija un número del 0 al 10')
  .refine((o) => o.tipo !== 'UTIL' || o.puntaje === 0 || o.puntaje === 1, 'Indique si le sirvió')
  .refine((o) => o.tipo !== 'SUGERENCIA' || (o.texto && o.texto.length >= 5), 'Escriba su sugerencia');
export const perfilZ = z.object({
  giro: z.string().trim().min(2).max(60),
  empleados: z.enum(['1', '2-5', '6-15', '16-50', 'mas-50']),
  comoNosConocio: z.enum(['recomendacion', 'redes', 'buscador', 'visita', 'evento', 'otro']),
  objetivos: z.array(z.enum(['vender-mas', 'controlar-inventario', 'reducir-perdidas', 'facturar-fel', 'conocer-numeros', 'crecer-sucursales', 'ahorrar-tiempo'])).max(7).default([]),
  comentario: z.string().trim().max(300).optional(),
});
export const DIAS_ENTRE_NPS = 90;
