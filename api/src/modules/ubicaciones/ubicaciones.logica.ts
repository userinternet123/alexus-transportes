/**
 * UBICACIÓN EFECTIVA de un producto en una bodega (lógica pura, sin base de datos):
 *   1. la propia del producto (gana siempre);
 *   2. la de su sub-agrupación más cercana (subiendo por el árbol);
 *   3. la de su grupo; 4. la de su categoría.
 */
export interface UbicacionRef { id: number; codigoCompleto: string }
export interface Arbol {
  subgrupos: Map<number, { padreId: number | null; grupoId: number; nombre: string }>;
  grupos: Map<number, { categoriaId: number; nombre: string }>;
  categorias: Map<number, string>;
}
export interface Efectiva { ubicacionId: number; codigo: string; origen: 'producto' | 'clasificacion'; via?: string }

/** Une el código del padre con el del nivel: P2E2 + D2 = P2E2D2 */
export const codigoCompleto = (padre: string | null | undefined, codigo: string) => `${padre ?? ''}${codigo}`;
export const normalizarCodigo = (c: string) => c.trim().toUpperCase().replace(/\s+/g, '');
export const CODIGO_VALIDO = /^[A-Z0-9-]{1,10}$/;

export function ubicacionEfectiva(
  producto: { subgrupoId: number },
  propia: UbicacionRef | null | undefined,
  asignadas: Map<string, UbicacionRef>, // "SUBGRUPO:12" → ubicación
  arbol: Arbol,
): Efectiva | null {
  if (propia) return { ubicacionId: propia.id, codigo: propia.codigoCompleto, origen: 'producto' };
  const vistos = new Set<number>();
  let grupoId: number | null = null;
  for (let sg: number | null = producto.subgrupoId; sg != null && !vistos.has(sg) && vistos.size < 50;) {
    vistos.add(sg);
    const nodo = arbol.subgrupos.get(sg);
    if (!nodo) break;
    grupoId = nodo.grupoId;
    const u = asignadas.get(`SUBGRUPO:${sg}`);
    if (u) return { ubicacionId: u.id, codigo: u.codigoCompleto, origen: 'clasificacion', via: nodo.nombre };
    sg = nodo.padreId;
  }
  if (grupoId != null) {
    const g = arbol.grupos.get(grupoId);
    const u = asignadas.get(`GRUPO:${grupoId}`);
    if (u) return { ubicacionId: u.id, codigo: u.codigoCompleto, origen: 'clasificacion', via: g?.nombre };
    if (g) {
      const uc = asignadas.get(`CATEGORIA:${g.categoriaId}`);
      if (uc) return { ubicacionId: uc.id, codigo: uc.codigoCompleto, origen: 'clasificacion', via: arbol.categorias.get(g.categoriaId) };
    }
  }
  return null;
}

/** Ids de una ubicación y todas las que tiene dentro. */
export function descendientes(ubicaciones: { id: number; padreId: number | null }[], raiz: number): Set<number> {
  const ids = new Set([raiz]);
  for (let cambio = true; cambio;) {
    cambio = false;
    for (const u of ubicaciones) if (u.padreId != null && ids.has(u.padreId) && !ids.has(u.id)) { ids.add(u.id); cambio = true; }
  }
  return ids;
}
