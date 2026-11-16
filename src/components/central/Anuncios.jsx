// Avisos del proveedor y publicidad (desde ALEXUS Central). Nunca se muestran
// durante el cobro. La publicidad se identifica como tal. Cada anuncio se
// puede cerrar y no vuelve a aparecer en este navegador.
import { useEffect, useState } from 'react'
import { ExternalLink, Megaphone, X } from 'lucide-react'
import axios from 'axios'
import api from '../../services/api'

const CERRADOS = 'spvi_anuncios_cerrados'
const leerCerrados = () => { try { return new Set(JSON.parse(localStorage.getItem(CERRADOS) || '[]')) } catch { return new Set() } }
const BASE = import.meta.env.VITE_API_URL

export default function Anuncios({ ubicacion = 'inicio', anuncios: predefinidos }) {
  const [lista, setLista] = useState(predefinidos ?? [])
  const [cerrados, setCerrados] = useState(leerCerrados)

  useEffect(() => {
    if (predefinidos) { setLista(predefinidos); return }
    // En el ingreso no hay sesión: se usa el endpoint público
    axios.get(`${BASE}/central/anuncios-publicos`, { params: { ubicacion } }).then(({ data }) => { if (Array.isArray(data?.data)) setLista(data.data) }).catch(() => {})
  }, [predefinidos, ubicacion])

  const visibles = (Array.isArray(lista) ? lista : []).filter((a) => !cerrados.has(a.id)).slice(0, 2)

  // Una impresión por anuncio y sesión
  useEffect(() => {
    visibles.forEach((a) => {
      const clave = `spvi_anuncio_visto_${a.id}`
      if (sessionStorage.getItem(clave)) return
      sessionStorage.setItem(clave, '1')
      axios.post(`${BASE}/central/anuncios/${a.id}/impresion`).catch(() => {})
    })
  }, [visibles.map((a) => a.id).join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  const cerrar = (id) => {
    const n = new Set(cerrados); n.add(id)
    localStorage.setItem(CERRADOS, JSON.stringify([...n]))
    setCerrados(n)
  }
  const abrir = (a) => {
    axios.post(`${BASE}/central/anuncios/${a.id}/clic`).catch(() => {})
    window.open(a.enlace, '_blank', 'noopener,noreferrer')
  }

  if (!visibles.length) return null
  return (
    <div className="space-y-2">
      {visibles.map((a) => (
        <div key={a.id} className={`relative flex items-start gap-3 rounded-tarjeta border p-4 ${a.tipo === 'publicidad' ? 'bg-white' : 'border-sky-200 bg-sky-50'}`}>
          {a.imagenUrl
            ? <img src={a.imagenUrl} alt="" className="h-14 w-14 shrink-0 rounded-control object-cover" />
            : <Megaphone className={`mt-0.5 h-5 w-5 shrink-0 ${a.tipo === 'publicidad' ? 'text-gray-400' : 'text-sky-700'}`} aria-hidden />}
          <div className="min-w-0 flex-1 pr-6">
            {a.tipo === 'publicidad' && <p className="text-[11px] uppercase tracking-wide text-gray-400">Publicidad</p>}
            <p className="text-[15px] font-semibold">{a.titulo}</p>
            <p className="text-sm text-gray-600">{a.texto}</p>
            {a.enlace && (
              <button type="button" onClick={() => abrir(a)} className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-green-700 hover:underline">
                Ver más <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
          </div>
          <button type="button" onClick={() => cerrar(a.id)} className="absolute right-2 top-2 rounded-full p-1 text-gray-400 hover:bg-gray-100" aria-label="Cerrar anuncio"><X className="h-4 w-4" /></button>
        </div>
      ))}
    </div>
  )
}

/** Estado de Central para el usuario en sesión (anuncios del inicio, actualización, respuestas). */
export function useEstadoCentral() {
  const [estado, setEstado] = useState(null)
  useEffect(() => { api.get('/central/estado').then(({ data }) => setEstado(data.data)).catch(() => setEstado(null)) }, [])
  return estado
}
