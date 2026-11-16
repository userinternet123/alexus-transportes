// ─────────────────────────────────────────────────────────────────────────────
// CAMPANA DE NOTIFICACIONES: actualizaciones, soporte, avisos de ALEXUS, traslados, conteos, licencia, temporadas y
// hechos de la última semana (pedido enviado, recibido…). Cada una tiene estado VISTO / NO VISTO (por usuario, en el
// servidor): las no vistas arriba; las vistas siguen en la lista, abajo y en gris.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CalendarRange, Check, ClipboardList, Download, KeyRound, LifeBuoy, Megaphone, PackageCheck, RotateCcw, Truck } from 'lucide-react'
import api from '../../services/api'

const ICONOS = { actualizacion: Download, soporte: LifeBuoy, aviso: Megaphone, traslado: Truck, conteo: ClipboardList, licencia: KeyRound, temporada: CalendarRange, pedido: PackageCheck }
const COLOR = { critico: 'text-red-600 bg-red-50', aviso: 'text-amber-700 bg-amber-50', info: 'text-sky-700 bg-sky-50' }
function cuando(fecha) {
  if (!fecha) return 'Vigente'
  const min = Math.round((Date.now() - new Date(fecha).getTime()) / 60000)
  if (min < 60) return min <= 1 ? 'Hace un momento' : `Hace ${min} min`
  if (min < 24 * 60) return `Hace ${Math.round(min / 60)} h`
  if (min < 48 * 60) return 'Ayer'
  return new Date(fecha).toLocaleDateString('es-GT', { weekday: 'long', day: 'numeric', month: 'short' })
}

export default function Notificaciones() {
  const navigate = useNavigate()
  const [lista, setLista] = useState([])
  const [abierta, setAbierta] = useState(false)
  const caja = useRef(null)

  const cargar = useCallback(() => {
    api.get('/notificaciones').then(({ data }) => setLista(data.data ?? [])).catch(() => {})
  }, [])
  useEffect(() => {
    cargar()
    const t = setInterval(cargar, 120_000)
    const alVolver = () => { if (document.visibilityState === 'visible') cargar() }
    document.addEventListener('visibilitychange', alVolver)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', alVolver) }
  }, [cargar])

  // Cerrar al tocar fuera o con Escape
  useEffect(() => {
    if (!abierta) return undefined
    const fuera = (e) => { if (caja.current && !caja.current.contains(e.target)) setAbierta(false) }
    const esc = (e) => { if (e.key === 'Escape') setAbierta(false) }
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', esc) }
  }, [abierta])

  const marcar = (claves, visto = true) => {
    if (!claves.length) return
    setLista((l) => l.map((n) => (claves.includes(n.id) ? { ...n, visto } : n)))
    api.put('/notificaciones/vistas', { claves, visto }).catch(() => {})
  }
  const nuevas = lista.filter((n) => !n.visto)
  const leidas = lista.filter((n) => n.visto)
  const ir = (n) => {
    marcar([n.id])
    setAbierta(false)
    if (n.accion === 'ayuda') window.dispatchEvent(new CustomEvent('spvi:abrir-ayuda'))
    else if (n.ruta) navigate(n.ruta)
    else if (n.enlace) window.open(n.enlace, '_blank', 'noopener,noreferrer')
  }
  const fila = (n) => {
    const Icono = ICONOS[n.tipo] ?? Bell
    return (
      <li key={n.id} className={`group flex items-start ${n.visto ? 'opacity-60' : ''}`}>
        <button type="button" onClick={() => ir(n)} className="flex min-w-0 flex-1 gap-3 px-4 py-3 text-left hover:bg-gray-50">
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${COLOR[n.nivel] ?? COLOR.info}`}><Icono className="h-4 w-4" aria-hidden /></span>
          <span className="min-w-0">
            <span className={`block text-sm ${n.visto ? '' : 'font-semibold'}`}>{!n.visto && <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-sky-600 align-middle" aria-label="No vista" />}{n.titulo}</span>
            <span className="block text-xs text-gray-600">{n.detalle}</span>
            <span className="mt-0.5 block text-[11px] text-gray-400">{cuando(n.fecha)}</span>
          </span>
        </button>
        <button type="button" onClick={() => marcar([n.id], !n.visto)} title={n.visto ? 'Marcar como no vista' : 'Marcar como vista'} aria-label={n.visto ? `Marcar como no vista: ${n.titulo}` : `Marcar como vista: ${n.titulo}`} className="m-2 rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
          {n.visto ? <RotateCcw className="h-3.5 w-3.5" aria-hidden /> : <Check className="h-3.5 w-3.5" aria-hidden />}
        </button>
      </li>
    )
  }

  return (
    <div className="relative" ref={caja}>
      <button type="button" onClick={() => setAbierta((a) => !a)} className="relative rounded-md p-1.5 text-gray-600 hover:bg-gray-200" aria-label={nuevas.length ? `Notificaciones: ${nuevas.length} sin ver` : 'Notificaciones'} aria-expanded={abierta}>
        <Bell className="h-5 w-5" />
        {nuevas.length > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">{nuevas.length}</span>}
      </button>
      {abierta && (
        <div className="mac-spotlight absolute right-0 top-full z-50 mt-2 w-[min(24rem,calc(100vw-1.5rem))] overflow-hidden rounded-superficie border bg-white shadow-2xl" role="dialog" aria-label="Notificaciones">
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <p className="text-sm font-semibold">Notificaciones</p>
            {nuevas.length > 0 && <button type="button" onClick={() => marcar(nuevas.map((n) => n.id))} className="text-xs text-sky-700 hover:underline">Marcar todo como visto</button>}
          </div>
          <ul className="max-h-[65vh] divide-y divide-gray-100 overflow-y-auto">
            {nuevas.map(fila)}
            {leidas.length > 0 && <li className="bg-gray-50 px-4 py-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-500" aria-hidden>Vistas</li>}
            {leidas.map(fila)}
            {!lista.length && <li className="px-4 py-8 text-center text-sm text-gray-500">No hay notificaciones. Todo al día.</li>}
          </ul>
        </div>
      )}
    </div>
  )
}
