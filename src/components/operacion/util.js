// ─────────────────────────────────────────────────────────────────────────────
// Utilidades de las pantallas de operación: formatos, fechas, catálogos, consultas y envíos al API.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react'
import api from '../../services/api'
import { useEstadoOpciones } from '../../hooks/useOpcionesRemotas'
import { showToast } from '../../utils/showToast'
import { errorApi } from '../comun/formato'

export const hay = (v) => v !== null && v !== undefined
export const ent = 'mt-1 w-full rounded-control border px-3 py-2'
export const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(new Date())
export const haceDias = (n) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(new Date(Date.now() - n * 86_400_000))
export const num = (v, d = 0) => (!hay(v) || v === '' ? '—' : Number(v).toLocaleString('es-GT', { minimumFractionDigits: d, maximumFractionDigits: d }))
export const fechaHora = (v) => (v ? new Date(v).toLocaleString('es-GT', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Guatemala' }) : '—')
export const fecha = (v) => (v ? new Date(v).toLocaleDateString('es-GT', { dateStyle: 'medium', timeZone: 'UTC' }) : '—')
/** Valor para <input type="datetime-local"> en hora de Guatemala */
export const ahoraLocal = (masHoras = 0) => {
  const d = new Date(Date.now() + masHoras * 3_600_000 - 6 * 3_600_000)
  return d.toISOString().slice(0, 16)
}
/** "2026-11-20T08:30" (hora de Guatemala) → ISO */
export const deLocal = (v) => (v ? new Date(`${v}:00-06:00`).toISOString() : null)

export const nombreTercero = (t) => t?.nombreComercial || t?.razonSocial || [t?.nombres, t?.apellidos].filter(Boolean).join(' ') || '—'
export const nombrePiloto = (p) => (p?.empleado ? `${p.empleado.nombres} ${p.empleado.apellidos}` : p?.nombre ?? '—')

/** Catálogos para los selectores de las pantallas de operación (se cachean por sesión). */
export function useCatalogos() {
  const cabezales = useEstadoOpciones('/flota/cabezales').opciones.filter((c) => c.activo !== false)
  const remolques = useEstadoOpciones('/flota/remolques').opciones.filter((c) => c.activo !== false)
  const pilotos = useEstadoOpciones('/pilotos').opciones.filter((c) => c.activo !== false)
  const clientes = useEstadoOpciones('/terceros/clientes').opciones.filter((c) => c.activo !== false)
  const rutas = useEstadoOpciones('/catalogos/rutas').opciones.filter((c) => c.activo !== false)
  return { cabezales, remolques, pilotos, clientes, rutas }
}

/** GET con recarga y aviso de error. `cargando` es verdadero mientras la respuesta no corresponde a los filtros actuales. */
export function useConsulta(url, params) {
  const p = JSON.stringify(params ?? {})
  const clave = `${url}?${p}`
  const [res, setRes] = useState({ clave: null, datos: null })
  const [version, setVersion] = useState(0)
  useEffect(() => {
    if (!url) { return undefined }
    let vivo = true
    api.get(url, { params: JSON.parse(p) })
      .then(({ data }) => { if (vivo) { setRes({ clave, datos: data.data }) } })
      .catch((e) => { if (vivo) { setRes((r) => ({ ...r, clave })); showToast({ type: 'error', message: errorApi(e).mensaje }) } })
    return () => { vivo = false }
  }, [url, p, clave, version])
  const recargar = useCallback(() => setVersion((v) => v + 1), [])
  return { datos: url ? res.datos : null, cargando: Boolean(url) && res.clave !== clave, recargar }
}

/** POST/PUT con mensaje del servidor; devuelve la respuesta o null si falló. */
export async function enviar(metodo, url, cuerpo) {
  try {
    const { data } = await api[metodo](url, cuerpo)
    if (data?.message) { showToast({ type: 'success', message: data.message }) }
    for (const a of data?.data?.avisos ?? []) { showToast({ type: 'warning', message: a }) }
    return data ?? {}
  } catch (e) {
    showToast({ type: 'error', message: errorApi(e).mensaje })
    return null
  }
}

export const ESTADO_VIAJE = {
  PROGRAMADO: { texto: 'Programado', color: 'azul' }, EN_RUTA: { texto: 'En ruta', color: 'ambar' }, FINALIZADO: { texto: 'Por liquidar', color: 'morado' },
  LIQUIDADO: { texto: 'Liquidado', color: 'verde' }, CANCELADO: { texto: 'Cancelado', color: 'gris' },
}

export const PRIORIDAD = {
  URGENTE: { texto: 'Urgente', color: 'rojo' }, ALTA: { texto: 'Alta', color: 'ambar' }, MODERADA: { texto: 'Moderada', color: 'azul' }, BAJA: { texto: 'Baja', color: 'gris' },
}

export const TIPO_CASO = { MECANICO: 'Mecánico', LLANTAS: 'Llantas', DOCUMENTOS: 'Documentos', SEGURIDAD: 'Seguridad', CARGA: 'Carga', OTRO: 'Otro' }
