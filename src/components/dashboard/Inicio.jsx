/**
 * INICIO: saludo, avisos de Central y licencia, resumen de la flota y accesos rápidos.
 * El resumen sale de los catálogos y reportes del API; cuando entren viajes y combustible
 * (fase 1) se completa con viajes en ruta, ingresos del mes y alertas de mantenimiento.
 */
import FirmaAlexus from '../comun/FirmaAlexus'
import { useContext, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AuthContext } from '../../context/AuthContext'
import { MENU_ITEMS } from '../layout/sidebar/config/sidebarMenu'
import { navigateToSubmenu } from '../../utils/NavigationData'
import { hasPermission } from '../../services/authService'
import { useMarca } from '../../hooks/useMarca'
import api from '../../services/api'
import Anuncios, { useEstadoCentral } from '../central/Anuncios'
import AvisoActualizacion from '../central/AvisoActualizacion'

const saludo = () => {
  const h = Number(new Intl.DateTimeFormat('es-GT', { hour: 'numeric', hour12: false, timeZone: 'America/Guatemala' }).format(new Date()))
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'
}

export default function Inicio() {
  const navigate = useNavigate()
  const { user } = useContext(AuthContext)
  const marca = useMarca()
  const [flota, setFlota] = useState(null)
  const [porVencer, setPorVencer] = useState(null)

  useEffect(() => {
    if (hasPermission('flota.ver')) {
      Promise.all([
        api.get('/flota/cabezales', { params: { limit: 0, activo: 'true' } }),
        api.get('/pilotos', { params: { limit: 0, activo: 'true' } }),
      ]).then(([c, p]) => {
        const cabezales = c.data.data ?? []
        setFlota({ cabezales: cabezales.length, enTaller: cabezales.filter((x) => x.estado === 'EN_TALLER').length, pilotos: (p.data.data ?? []).length })
      }).catch(() => {})
    }
    if (hasPermission('reportes.flota')) {
      api.get('/reportes/documentos-por-vencer', { params: { dias: 30 } }).then(({ data }) => setPorVencer(data.data ?? [])).catch(() => {})
    }
  }, [])

  // Accesos rápidos: opciones del menú visibles para el usuario
  const central = useEstadoCentral()
  const lic = user?.usuario?.licencia
  const avisoLicencia = lic && (lic.modo === 'vencida' || lic.modo === 'sin-licencia' || (lic.diasRestantes != null && lic.diasRestantes <= 15))

  const accesos = MENU_ITEMS.menu
    .filter((m) => m.submenu && hasPermission(m.tag))
    .flatMap((m) => m.submenu.filter((s) => hasPermission(s.tag)).map((s) => ({ menu: m, sub: s, Icono: m.icon })))
    .slice(0, 12)

  return (
    <div className="space-y-4 p-4">
      {/* Con la imagen de ALEXUS (la empresa aún no subió la suya) se usa su azul, sin mezclar con el verde */}
      <section className={`relative overflow-hidden rounded-2xl text-white ${marca.predeterminada?.imagenInicio ? '' : 'bg-green-900'}`}
        style={marca.predeterminada?.imagenInicio ? { backgroundColor: '#0B2D6B' } : undefined}>
        {marca.imagenInicio && <img src={marca.imagenInicio} alt="" className={`absolute inset-0 h-full w-full object-cover ${marca.predeterminada?.imagenInicio ? '' : 'opacity-60'}`} />}
        <div className="relative bg-gradient-to-r from-black/60 to-transparent p-6 md:p-10">
          <p className="text-sm opacity-90">{marca.nombre}</p>
          <h1 className="mt-1 text-2xl font-semibold md:text-3xl">{saludo()}, {user?.usuario?.nombre?.split(' ')[0] ?? ''}</h1>
          <p className="mt-1 text-sm opacity-90">{new Date().toLocaleDateString('es-GT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
      </section>

      {central?.actualizacion && <AvisoActualizacion actualizacion={central.actualizacion} versionActual={central.version} />}
      {central?.anuncios?.length > 0 && <Anuncios ubicacion="inicio" anuncios={central.anuncios} />}

      {avisoLicencia && (
        <div className="rounded-tarjeta border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800" role="status">
          {lic.modo === 'vencida' ? 'La licencia venció: el sistema funciona con el plan Básico.' : lic.modo === 'sin-licencia' ? 'Este sistema no tiene licencia: funciona con el plan Básico.' : `La licencia vence en ${lic.diasRestantes} días (${lic.vence}).`}
          {' '}Comuníquese con su proveedor para renovarla.
        </div>
      )}

      {porVencer?.length > 0 && (
        <button type="button" onClick={() => navigate('/home/reportes?clave=documentos-por-vencer')} className="flex w-full items-center justify-between gap-3 rounded-tarjeta border border-amber-300 bg-amber-50 p-4 text-left">
          <span><span className="block font-semibold text-amber-900">{porVencer.length === 1 ? 'Un documento o licencia vence en los próximos 30 días' : `${porVencer.length} documentos o licencias vencen en los próximos 30 días`}</span>
          <span className="text-sm text-amber-800">Seguros, tarjetas de circulación y licencias de pilotos. Renuévelos antes de que la unidad quede fuera de ruta.</span></span>
          <span className="shrink-0 font-medium text-amber-900">Ver →</span>
        </button>
      )}

      {flota && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border bg-white p-4"><p className="text-sm text-gray-500">Cabezales activos</p><p className="text-2xl font-semibold tabular-nums">{flota.cabezales}</p></div>
          <div className="rounded-xl border bg-white p-4"><p className="text-sm text-gray-500">En taller</p><p className={`text-2xl font-semibold tabular-nums ${flota.enTaller ? 'text-amber-700' : ''}`}>{flota.enTaller}</p></div>
          <div className="rounded-xl border bg-white p-4"><p className="text-sm text-gray-500">Pilotos</p><p className="text-2xl font-semibold tabular-nums">{flota.pilotos}</p></div>
        </div>
      )}

      <section>
        <h2 className="mb-2 font-semibold">Accesos rápidos</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {accesos.map(({ menu, sub, Icono }) => (
            <button key={`${menu.name}-${sub.name}`} type="button" onClick={() => navigateToSubmenu(navigate, menu, sub)}
              className="mac-elevar flex items-center gap-3 rounded-xl border bg-white p-4 text-left hover:border-green-600 hover:bg-green-50">
              {Icono && <Icono className="h-6 w-6 shrink-0 text-green-700" aria-hidden />}
              <span><span className="block text-sm font-medium">{sub.label}</span><span className="text-xs text-gray-500">{menu.label}</span></span>
            </button>
          ))}
        </div>
      </section>
      <div className="flex justify-center pb-2 pt-4"><FirmaAlexus siempre /></div>
    </div>
  )
}
