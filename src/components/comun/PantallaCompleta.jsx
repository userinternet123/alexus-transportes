// ─────────────────────────────────────────────────────────────────────────────
// PANTALLA COMPLETA configurable: cualquier pantalla registrada en VISTAS se
// puede abrir sin menú lateral ni encabezado, en /pantalla/<vista>, y además
// en pantalla completa del navegador (F11 automático).
// Para agregar otra pantalla: una línea en VISTAS y <BotonPantallaCompleta vista="…" />.
// ─────────────────────────────────────────────────────────────────────────────
import { useContext, useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Maximize2, Minimize2, LogOut } from 'lucide-react'
import { enFullscreen, RUTAS_VISTA } from './BotonPantallaCompleta'
import { AuthContext } from '../../context/AuthContext'
import { useMarca } from '../../hooks/useMarca'
import { useMarcaAlexus } from '../../hooks/useMarcaAlexus'
import FirmaAlexus from './FirmaAlexus'
import PuntoVenta from '../pos/PuntoVenta'
import CuadreCaja from '../pos/CuadreCaja'
import CierreDiario from '../pos/CierreDiario'
import CentroReportes from '../pos/CentroReportes'
import { Existencias, VentasDelDia } from '../operacion'
import DashboardAnalitico from '../analitica/DashboardAnalitico'

// Pantallas que se pueden abrir en modo completo (la ruta de regreso está en RUTAS_VISTA)
export const VISTAS = {
  pos: { titulo: 'Punto de venta', componente: PuntoVenta },
  caja: { titulo: 'Cuadre de caja', componente: CuadreCaja },
  cierre: { titulo: 'Cierre del día', componente: CierreDiario },
  ventas: { titulo: 'Ventas y cotizaciones', componente: VentasDelDia },
  existencias: { titulo: 'Existencias y kardex', componente: Existencias },
  reportes: { titulo: 'Reportes', componente: CentroReportes },
  dashboard: { titulo: 'Dashboard analítico', componente: DashboardAnalitico },
}

/** Ruta /pantalla/:vista — la pantalla sola, con una barra mínima. */
export default function PantallaCompleta() {
  const { vista } = useParams()
  const navigate = useNavigate()
  const { search } = useLocation()
  const { user } = useContext(AuthContext)
  const [fs, setFs] = useState(enFullscreen())
  const marca = useMarca()
  const conMarcaAlexus = useMarcaAlexus()
  const def = VISTAS[vista]

  useEffect(() => {
    const onChange = () => setFs(enFullscreen())
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  if (!def) return <p className="p-6">Pantalla no disponible: {vista}</p>
  const Vista = def.componente

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <div className="flex items-center justify-between gap-3 border-b bg-white px-4 py-2">
        <div className="flex min-w-0 items-center gap-3">
          {!marca.predeterminada.logo && <img src={marca.logo} alt="" className="h-8 w-8 shrink-0 rounded-md object-contain" />}
          <div className="min-w-0 leading-tight">
            <p className="truncate text-base font-semibold">{marca.nombre}</p>
            <p className="truncate text-xs text-gray-500">{def.titulo} · {user?.usuario?.nombre}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => (fs ? document.exitFullscreen() : document.documentElement.requestFullscreen?.()).catch?.(() => {})}
            className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm" title="F11">
            {fs ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />} {fs ? 'Ventana' : 'Pantalla completa'}
          </button>
          <button type="button" onClick={async () => { if (enFullscreen()) await document.exitFullscreen().catch(() => {}); navigate(`${RUTAS_VISTA[vista] ?? '/home'}${search}`) }}
            className="inline-flex items-center gap-1 rounded-lg bg-gray-900 px-3 py-1.5 text-sm text-white">
            <LogOut className="h-4 w-4" /> Volver al menú
          </button>
        </div>
      </div>
      <div className="flex-1"><Vista /></div>
      {conMarcaAlexus && <footer className="flex justify-center border-t bg-white py-1.5"><FirmaAlexus /></footer>}
    </div>
  )
}
