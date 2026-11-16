// Barra lateral estilo Configuración de macOS: grupos por módulo con íconos en
// cuadros de color, se contrae a íconos y en el celular es un cajón deslizable.
import { usePresencia } from '../../../hooks/usePresencia'
import { useContext, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ChevronRight, ChevronsLeft, ChevronsRight, LogOut, Search, Home } from 'lucide-react'
import { AuthContext } from '../../../context/AuthContext'
import { navigateToSubmenu } from '../../../utils/NavigationData'
import { useMarca } from '../../../hooks/useMarca'
import { COLOR_MODULO, esActual, modulosVisibles } from './navegacionData'

const iniciales = (n = '') => n.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()

function Cuadro({ icono: Icono = Home, color }) {
  return <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] text-white ${color ?? 'bg-gray-500'}`} aria-hidden><Icono className="h-4 w-4" strokeWidth={2.2} /></span>
}

export default function Navegacion({ abierta, onCerrar, onSalir, onBuscar }) {
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  const { user } = useContext(AuthContext)
  const marca = useMarca()
  const [compacta, setCompacta] = useState(() => localStorage.getItem('spvi_nav_compacta') === '1')
  const modulos = modulosVisibles()

  // Acordeón: módulos desplegados (se recuerdan); el de la pantalla actual siempre se abre
  const moduloActual = modulos.find((m) => m.submenu.some((s) => esActual(s, pathname, search)))?.name
  const [abiertos, setAbiertos] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('spvi_nav_abiertos') || '[]')) } catch { return new Set() }
  })
  const guardarAbiertos = (n) => { setAbiertos(n); localStorage.setItem('spvi_nav_abiertos', JSON.stringify([...n])) }
  useEffect(() => {
    if (moduloActual && !abiertos.has(moduloActual)) guardarAbiertos(new Set([...abiertos, moduloActual]))
  }, [moduloActual]) // eslint-disable-line react-hooks/exhaustive-deps
  const alternarModulo = (nombre) => {
    if (compacta) { // contraída: al tocar un módulo se expande el menú y se abre ese módulo
      localStorage.setItem('spvi_nav_compacta', '0'); setCompacta(false)
      return guardarAbiertos(new Set([...abiertos, nombre]))
    }
    const n = new Set(abiertos)
    n.has(nombre) ? n.delete(nombre) : n.add(nombre)
    guardarAbiertos(n)
  }

  const alternar = () => { localStorage.setItem('spvi_nav_compacta', compacta ? '0' : '1'); setCompacta(!compacta) }
  // Opciones sin submenú (Inicio) navegan directo; las demás conservan el estado del menú (botones, filtros)
  const fondoMenu = usePresencia(Boolean(abierta), 180)
  const ir = (m, s) => { if (s) navigateToSubmenu(navigate, m, s); else navigate(m.path ?? '/home'); onCerrar?.() }
  const sucursal = user?.usuario?.sucursales?.find((x) => String(x.id) === sessionStorage.getItem('spvi_sucursal'))

  return (
    <>
      {fondoMenu.montado && <div className={`mac-fondo ${fondoMenu.saliendo ? 'saliendo' : ''} fixed inset-0 z-30 bg-black/30 md:hidden`} onClick={onCerrar} aria-hidden />}
      <aside
        className={`material separador fixed inset-y-0 left-0 z-40 mac-cajon flex flex-col border-r transition-[width,transform] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] md:static md:translate-x-0
          ${abierta ? 'translate-x-0' : '-translate-x-full'} ${compacta ? 'md:w-[76px]' : 'md:w-64'} w-72`}
        aria-label="Navegación principal"
      >
        <div className="flex items-center gap-2 px-4 pb-2 pt-4">
          {marca.logo
            ? <img src={marca.logo} alt="" className="h-8 w-8 shrink-0 rounded-lg object-contain" />
            : <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-green-700 text-sm font-bold text-white">{iniciales(marca.nombre)}</span>}
          {!compacta && <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{marca.nombre}</span>}
          <button type="button" onClick={alternar} className="hidden rounded-md p-1 text-gray-500 hover:bg-gray-200 md:block" aria-label={compacta ? 'Expandir menú' : 'Contraer menú'}>
            {compacta ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
          </button>
        </div>

        <div className="px-3 pb-2">
          <button type="button" onClick={onBuscar} className={`flex w-full items-center gap-2 rounded-control bg-gray-200/70 px-2.5 py-1.5 text-sm text-gray-500 hover:bg-gray-200 ${compacta ? 'md:justify-center' : ''}`}>
            <Search className="h-4 w-4 shrink-0" />
            {!compacta && <><span className="flex-1 text-left">Buscar</span><kbd className="rounded border border-gray-300 px-1 text-[11px]">Ctrl K</kbd></>}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-3">
          {modulos.map((m) => (
            <div key={m.name} className="mt-3 first:mt-1">
              {m.submenu.length === 0 ? (
                <button type="button" onClick={() => ir(m, null)} title={m.label}
                  className={`flex w-full items-center gap-2.5 rounded-control px-2 py-1.5 text-[15px] ${esActual(null, pathname, search) && m.path ? 'bg-green-600 text-white' : 'hover:bg-gray-200/70'}`}>
                  <Cuadro icono={m.icon} color={COLOR_MODULO[m.name]} />{!compacta && m.label}
                </button>
              ) : (
                <>
                  <button type="button" onClick={() => alternarModulo(m.name)} title={m.label} aria-expanded={!compacta && abiertos.has(m.name)}
                    className={`flex w-full items-center gap-2.5 rounded-control px-2 py-1 hover:bg-gray-200/70 ${compacta ? 'md:justify-center' : ''} ${compacta && m.name === moduloActual ? 'bg-gray-200/70' : ''}`}>
                    <Cuadro icono={m.icon} color={COLOR_MODULO[m.name]} />
                    {!compacta && (
                      <>
                        <span className="flex-1 text-left text-[13px] font-semibold text-gray-600">{m.label}</span>
                        <ChevronRight className={`h-4 w-4 text-gray-400 transition-transform ${abiertos.has(m.name) ? 'rotate-90' : ''}`} aria-hidden />
                      </>
                    )}
                  </button>
                  {!compacta && abiertos.has(m.name) && (
                    <ul className="mt-0.5 space-y-px">
                      {m.submenu.map((s) => {
                        const activo = esActual(s, pathname, search)
                        return (
                          <li key={s.name}>
                            <button type="button" onClick={() => ir(m, s)} aria-current={activo ? 'page' : undefined}
                              className={`w-full rounded-control py-1.5 pl-[46px] pr-2 text-left text-[15px] ${activo ? 'bg-green-600 font-medium text-white' : 'text-gray-800 hover:bg-gray-200/70'}`}>
                              {s.label}
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </>
              )}
            </div>
          ))}
        </nav>

        <div className="separador flex items-center gap-2 border-t px-3 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-300 text-sm font-semibold text-gray-800">{iniciales(user?.usuario?.nombre)}</span>
          {!compacta && (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{user?.usuario?.nombre}</span>
              <span className="block truncate text-xs text-gray-500">{sucursal?.nombre ?? user?.usuario?.username}</span>
            </span>
          )}
          <button type="button" onClick={onSalir} className="rounded-md p-1.5 text-gray-500 hover:bg-gray-200 hover:text-red-600" aria-label="Cerrar sesión" title="Cerrar sesión">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>
    </>
  )
}
