// Buscador de comandos (Ctrl+K / Cmd+K): escribir para ir a cualquier pantalla.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { navigateToSubmenu } from '../../../utils/NavigationData'
import { COLOR_MODULO, destinos } from './navegacionData'

const normal = (t) =>
  t
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

export default function PaletaComandos({ abierta, onAbrir, onCerrar }) {
  const navigate = useNavigate()
  const [texto, setTexto] = useState('')
  const [i, setI] = useState(0)
  const ref = useRef(null)

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        onAbrir()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onAbrir])

  useEffect(() => {
    if (abierta) {
      setTexto('')
      setI(0)
      setTimeout(() => ref.current?.focus(), 0)
    }
  }, [abierta])

  const lista = useMemo(() => {
    const q = normal(texto.trim())
    return destinos()
      .filter((d) => !q || normal(`${d.etiqueta} ${d.grupo}`).includes(q))
      .slice(0, 12)
  }, [texto, abierta]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!abierta) return null
  const ir = (d) => {
    if (d.sub) navigateToSubmenu(navigate, d.modulo, d.sub)
    else navigate(d.modulo.path ?? '/home')
    onCerrar()
  }
  const onKeyDown = (e) => {
    if (e.key === 'Escape') onCerrar()
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setI((x) => Math.min(x + 1, lista.length - 1))
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setI((x) => Math.max(x - 1, 0))
    }
    if (e.key === 'Enter' && lista[i]) ir(lista[i])
  }

  return (
    <div
      className="mac-fondo fixed inset-0 z-50 flex items-start justify-center bg-black/20 px-4 pt-[12vh]"
      onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}
    >
      <div
        className="mac-spotlight w-full max-w-lg overflow-hidden rounded-superficie border bg-white shadow-2xl"
        role="dialog"
        aria-label="Buscar pantalla"
      >
        <div className="separador flex items-center gap-2 border-b px-4">
          <Search className="h-5 w-5 text-gray-400" aria-hidden />
          <input
            ref={ref}
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value)
              setI(0)
            }}
            onKeyDown={onKeyDown}
            placeholder="¿A dónde quiere ir? Ej. vender, existencias, cierre"
            className="w-full bg-transparent py-3.5 text-[17px] outline-none"
            aria-label="Buscar pantalla"
          />
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-1.5" role="listbox">
          {lista.map((d, k) => {
            const Icono = d.modulo.icon
            return (
              <li key={`${d.grupo}-${d.etiqueta}`} role="option" aria-selected={k === i}>
                <button
                  type="button"
                  onMouseEnter={() => setI(k)}
                  onClick={() => ir(d)}
                  className={`flex w-full items-center gap-3 rounded-control px-3 py-2 text-left ${k === i ? 'bg-green-600 text-white' : ''}`}
                >
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-[7px] text-white ${COLOR_MODULO[d.modulo.name] ?? 'bg-gray-500'}`}
                  >
                    {Icono && <Icono className="h-4 w-4" />}
                  </span>
                  <span className="flex-1">{d.etiqueta}</span>
                  {d.grupo && (
                    <span className={`text-xs ${k === i ? 'text-white/80' : 'text-gray-500'}`}>
                      {d.grupo}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
          {!lista.length && (
            <li className="px-3 py-6 text-center text-sm text-gray-500">
              No hay pantallas con «{texto}»
            </li>
          )}
        </ul>
      </div>
    </div>
  )
}
