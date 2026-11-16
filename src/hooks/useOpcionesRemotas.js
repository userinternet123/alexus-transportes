import { useEffect, useState } from 'react'
import api from '../services/api'

const cache = new Map() // catálogos cambian poco: se cachean por sesión de página (solo si traen datos)

/**
 * Opciones de un <select> desde el API (campos con "optionsUrl" en el JSON), con su estado de carga:
 * { opciones, cargando, error }. Así el formulario distingue "todavía cargando" de "no hay ninguna" y puede explicarlo.
 * Una lista VACÍA nunca se guarda en caché: si el usuario crea el primer elemento y vuelve, se consulta de nuevo.
 */
export function useEstadoOpciones(url) {
  const [estado, setEstado] = useState(() => ({ opciones: (url && cache.get(url)) || [], cargando: Boolean(url) && !cache.has(url), error: false }))
  useEffect(() => {
    if (!url) return undefined
    if (cache.has(url)) { setEstado({ opciones: cache.get(url), cargando: false, error: false }); return undefined }
    let vivo = true
    setEstado((e) => ({ ...e, cargando: true, error: false }))
    api
      .get(url, { params: { limit: 0 } })
      .then(({ data }) => {
        const lista = data?.data ?? []
        if (lista.length) cache.set(url, lista)
        if (vivo) setEstado({ opciones: lista, cargando: false, error: false })
      })
      .catch(() => vivo && setEstado({ opciones: [], cargando: false, error: true })) // sin permiso o sin conexión: NO es lo mismo que "no hay ninguna"
    return () => { vivo = false }
  }, [url])
  return estado
}

/** Solo la lista (compatibilidad con los usos anteriores). */
export const useOpcionesRemotas = (url) => useEstadoOpciones(url).opciones

export const invalidarOpciones = (url) => (url ? cache.delete(url) : cache.clear())
