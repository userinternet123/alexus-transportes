// Árbol de clasificación: Categoría › Grupo › Sub-agrupación › … (niveles ilimitados).
import api from '../services/api'

let cache = null
export const invalidarArbol = () => { cache = null }

export async function cargarArbol() {
  if (!cache) cache = api.get('/clasificacion/arbol').then(({ data }) => data.data).catch((e) => { cache = null; throw e })
  return cache
}

/** Hijos de una sub-agrupación (o de primer nivel de un grupo, con padreId null). */
export const hijosDe = (subgrupos, grupoId, padreId) =>
  subgrupos.filter((s) => s.grupoId === grupoId && (s.padreId ?? null) === (padreId ?? null))

/**
 * Opciones para un <select>: todas las sub-agrupaciones activas con su ruta completa,
 * en orden de árbol (cada madre seguida de sus hijas).
 */
export function opcionesSubgrupo(arbol) {
  const categorias = new Map(arbol.categorias.map((c) => [c.id, c]))
  const salida = []
  const recorrer = (grupo, padreId, ruta, nivel) => {
    for (const s of hijosDe(arbol.subgrupos, grupo.id, padreId)) {
      if (s.activo === false) continue
      const r = [...ruta, s.nombre]
      salida.push({ id: s.id, ruta: r.join(' › '), nivel, categoriaId: grupo.categoriaId })
      recorrer(grupo, s.id, r, nivel + 1)
    }
  }
  const grupos = [...arbol.grupos].sort((a, b) =>
    `${categorias.get(a.categoriaId)?.nombre}${a.nombre}`.localeCompare(`${categorias.get(b.categoriaId)?.nombre}${b.nombre}`, 'es'))
  for (const g of grupos) recorrer(g, null, [categorias.get(g.categoriaId)?.nombre ?? '', g.nombre], 0)
  return salida
}

/** Ids de una sub-agrupación y todas sus descendientes (para no moverla dentro de sí misma). */
export function descendientes(subgrupos, id) {
  const r = new Set([id])
  let cambio = true
  while (cambio) {
    cambio = false
    for (const s of subgrupos) if (s.padreId != null && r.has(s.padreId) && !r.has(s.id)) { r.add(s.id); cambio = true }
  }
  return r
}
