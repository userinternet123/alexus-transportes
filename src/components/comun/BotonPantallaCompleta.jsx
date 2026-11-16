// Botón "Pantalla completa" para cualquier pantalla registrada (sin importar
// las pantallas, para evitar importaciones circulares).
import { useLocation, useNavigate } from 'react-router-dom'
import { Maximize2, Minimize2 } from 'lucide-react'

/** Ruta normal (dentro del menú) de cada vista que admite pantalla completa. */
export const RUTAS_VISTA = {
  pos: '/home/pos',
  caja: '/home/caja',
  cierre: '/home/cierre',
  ventas: '/home/ventas',
  existencias: '/home/existencias',
  reportes: '/home/reportes',
  dashboard: '/home/dashboard',
}

export const enFullscreen = () => Boolean(document.fullscreenElement)

/** Botón para poner en cada pantalla. Dentro de /pantalla muestra "Salir". */
export default function BotonPantallaCompleta({ vista }) {
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  const dentro = pathname.startsWith('/pantalla/')

  const alternar = async () => {
    if (dentro) {
      if (enFullscreen()) await document.exitFullscreen().catch(() => {})
      navigate(`${RUTAS_VISTA[vista] ?? '/home'}${search}`)
    } else {
      await document.documentElement.requestFullscreen?.().catch(() => {})
      navigate(`/pantalla/${vista}${search}`)
    }
  }
  return (
    <button type="button" onClick={alternar} title={dentro ? 'Salir de pantalla completa' : 'Pantalla completa'}
      className="inline-flex items-center gap-1 rounded-lg border bg-white px-3 py-1.5 text-sm hover:bg-gray-50">
      {dentro ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
      <span className="hidden sm:inline">{dentro ? 'Salir de pantalla completa' : 'Pantalla completa'}</span>
    </button>
  )
}

