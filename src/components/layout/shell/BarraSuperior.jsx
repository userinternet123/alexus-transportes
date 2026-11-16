// Barra superior translúcida: título de la pantalla, sucursal, tema y búsqueda.
import { aplicarMovimiento, leerMovimiento, OPCIONES_MOVIMIENTO } from '../../../utils/movimiento'
import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Menu, Palette, Search, Check } from 'lucide-react'
import SelectorSucursal from '../../comun/SelectorSucursal'
import { MODOS, TEMAS, useTemaUsuario } from '../../../hooks/useTema'
import { destinos, esActual } from './navegacionData'
import { BotonAyuda } from '../../central/Ayuda'
import Notificaciones from '../../central/Notificaciones'
import { useEstadoCentral } from '../../central/Anuncios'

export default function BarraSuperior({ onMenu, onBuscar }) {
  const { pathname, search } = useLocation()
  const [movimiento, setMovimiento] = useState(leerMovimiento)
  const sistemaReduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const [temaAbierto, setTemaAbierto] = useState(false)
  const { prefs, cambiar } = useTemaUsuario()
  const central = useEstadoCentral()
  const actual = destinos().find((d) => esActual(d.sub, pathname, search))
  const titulo = pathname === '/home' ? 'Inicio' : actual?.etiqueta ?? ''

  return (
    <header className="material separador sticky top-0 z-20 flex items-center gap-3 border-b px-4 py-2.5">
      <button type="button" onClick={onMenu} className="rounded-md p-1.5 hover:bg-gray-200 md:hidden" aria-label="Abrir menú"><Menu className="h-5 w-5" /></button>
      <div className="min-w-0 flex-1">
        {actual?.grupo && actual.grupo !== titulo && <p className="truncate text-xs text-gray-500">{actual.grupo}</p>}
        <h1 className="truncate text-lg font-semibold tracking-tight">{titulo}</h1>
      </div>
      <button type="button" onClick={onBuscar} className="rounded-md p-1.5 text-gray-600 hover:bg-gray-200 md:hidden" aria-label="Buscar"><Search className="h-5 w-5" /></button>
      <div className="hidden sm:block"><SelectorSucursal /></div>
      <Notificaciones />
      <BotonAyuda pendientes={central?.ticketsConRespuesta ?? 0} />
      <div className="relative">
        <button type="button" onClick={() => setTemaAbierto((x) => !x)} className="rounded-md p-1.5 text-gray-600 hover:bg-gray-200" aria-label="Apariencia" aria-expanded={temaAbierto}>
          <Palette className="h-5 w-5" />
        </button>
        {temaAbierto && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setTemaAbierto(false)} aria-hidden />
            <div className="mac-spotlight absolute right-0 z-20 mt-2 w-64 rounded-tarjeta border bg-white p-3 shadow-lg" role="dialog" aria-label="Apariencia">
              <p className="text-sm font-semibold">Color</p>
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => cambiar({ tema: '' })} className={`h-8 rounded-full border px-2 text-xs ${!prefs.tema ? 'border-green-600 text-green-700' : ''}`}>Del negocio</button>
                {TEMAS.map((t) => (
                  <button key={t.id} type="button" onClick={() => cambiar({ tema: t.id })} title={t.nombre} aria-label={`Tema ${t.nombre}`}
                    className="flex h-8 w-8 items-center justify-center rounded-full ring-offset-2 focus-visible:ring-2" style={{ backgroundColor: t.muestra }}>
                    {prefs.tema === t.id && <Check className="h-4 w-4 text-white" />}
                  </button>
                ))}
              </div>
              <p className="mt-4 text-sm font-semibold">Apariencia</p>
              <div className="mt-2 grid grid-cols-3 rounded-control bg-gray-100 p-0.5 text-sm" role="radiogroup">
                {MODOS.map((m) => (
                  <button key={m.id} type="button" role="radio" aria-checked={(prefs.modo || '') === m.id} onClick={() => cambiar({ modo: m.id })}
                    className={`rounded-[6px] py-1 ${(prefs.modo || '') === m.id ? 'bg-white font-medium shadow-sm' : 'text-gray-600'}`}>{m.nombre}</button>
                ))}
              </div>
              <p className="mt-4 text-sm font-semibold">Animaciones</p>
              <div className="mt-2 grid grid-cols-3 rounded-control bg-gray-100 p-0.5 text-xs" role="radiogroup" aria-label="Animaciones">
                {OPCIONES_MOVIMIENTO.map((o) => (
                  <button key={o.id} type="button" role="radio" aria-checked={movimiento === o.id} onClick={() => setMovimiento(aplicarMovimiento(o.id))}
                    className={`rounded-[6px] px-1 py-1 ${movimiento === o.id ? 'bg-white font-medium shadow-sm' : 'text-gray-600'}`}>{o.nombre}</button>
                ))}
              </div>
              {movimiento === 'auto' && sistemaReduce && <p className="mt-1 text-xs text-amber-700">Su equipo pide reducir el movimiento (accesibilidad o ahorro de batería): se usan desvanecidos. Elija «Siempre» para ver todas.</p>}
              <button type="button" onClick={() => cambiar({ tema: '', modo: '' })} className="mt-3 text-xs text-gray-500 underline">Usar la apariencia del negocio</button>
            </div>
          </>
        )}
      </div>
    </header>
  )
}
