// Ubicación física de un producto en cada bodega (propia o heredada de su clasificación).
import { useCallback, useEffect, useState } from 'react'
import { MapPin } from 'lucide-react'
import api from '../../services/api'
import { showToast } from '../../utils/showToast'
import { errorApi } from '../pos/formato'

const origen = (u) => (u.origen === 'producto' ? 'propia' : `hereda de ${u.via}`)

/** Solo lectura (ficha del punto de venta): "📍 P2E2D2P15 · Bodega principal". */
export function UbicacionesLectura({ productoId }) {
  const [lista, setLista] = useState([])
  useEffect(() => { api.get(`/ubicaciones/producto/${productoId}`).then(({ data }) => setLista(data.data)).catch(() => {}) }, [productoId])
  if (!lista.length) return <span className="text-gray-500">Sin ubicación asignada</span>
  return (
    <span className="flex flex-col gap-0.5">
      {lista.map((b) => (
        <span key={b.bodegaId} className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-green-700" aria-hidden /><b className="cifra tracking-wide">{b.ubicacion.codigo}</b> <span className="text-gray-500">· {b.bodega}</span></span>
      ))}
    </span>
  )
}

/** Editor (ficha del producto): ubicación propia por bodega de la sucursal, o heredada. */
export function UbicacionesEditor({ productoId, editable }) {
  const [bodegas, setBodegas] = useState([])
  const [opciones, setOpciones] = useState({}) // bodegaId → ubicaciones
  const [actual, setActual] = useState({}) // bodegaId → efectiva
  const cargar = useCallback(() => {
    api.get(`/ubicaciones/producto/${productoId}`).then(({ data }) => setActual(Object.fromEntries(data.data.map((b) => [b.bodegaId, b.ubicacion])))).catch(() => {})
  }, [productoId])
  useEffect(() => {
    cargar()
    api.get('/catalogos/bodegas', { params: { limit: 0 } }).then(async ({ data }) => {
      const activas = data.data.filter((b) => b.activo !== false)
      setBodegas(activas)
      const pares = await Promise.all(activas.map((b) => api.get('/ubicaciones', { params: { bodegaId: b.id } }).then((r) => [b.id, r.data.data.filter((u) => u.activo)]).catch(() => [b.id, []])))
      setOpciones(Object.fromEntries(pares))
    }).catch(() => {})
  }, [cargar])

  const asignar = async (bodegaId, ubicacionId) => {
    try { const { data } = await api.put('/ubicaciones/producto', { productoId, bodegaId, ubicacionId: ubicacionId ? Number(ubicacionId) : null }); showToast({ type: 'success', message: data.message }); cargar() }
    catch (e) { showToast({ type: 'error', message: errorApi(e).mensaje }) }
  }

  return bodegas.map((b) => {
    const u = actual[b.id]
    const lista = opciones[b.id] ?? []
    return (
      <label key={b.id} className="flex items-center gap-3 px-4 py-2.5 text-[15px]">
        <span className="w-32 shrink-0 text-gray-800">{b.nombre}</span>
        <span className="min-w-0 flex-1 text-right">
          {editable && lista.length ? (
            <select value={u?.origen === 'producto' ? String(u.ubicacionId) : ''} onChange={(e) => asignar(b.id, e.target.value)} className="w-full bg-transparent text-right outline-none" aria-label={`Ubicación en ${b.nombre}`}>
              <option value="">{u && u.origen !== 'producto' ? `${u.codigo} (${origen(u)})` : 'Sin ubicación propia'}</option>
              {lista.map((x) => <option key={x.id} value={x.id}>{x.codigoCompleto}{x.nombre ? ` · ${x.nombre}` : ''}</option>)}
            </select>
          ) : (
            <span className="cifra">{u ? `${u.codigo} (${origen(u)})` : lista.length ? 'Sin ubicación' : 'La bodega no tiene ubicaciones'}</span>
          )}
        </span>
      </label>
    )
  })
}
