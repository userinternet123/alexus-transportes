// Buscador de productos reutilizable (compras, ajustes, traslados).
// Enter con código exacto (lector de barras) selecciona directo; si no, muestra lista.
import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import api from '../../services/api'
import { ChipsGiro, useCamposProducto } from '../../hooks/useCamposProducto'
import { Q } from '../pos/formato'

export default function BuscadorProducto({ onSelect, placeholder = 'Buscar producto por nombre, SKU o código de barras', autoFocus = true }) {
  const campos = useCamposProducto()
  const [texto, setTexto] = useState('')
  const [resultados, setResultados] = useState([])
  const [abierto, setAbierto] = useState(false)
  const [activo, setActivo] = useState(0)
  const ref = useRef(null)

  // Búsqueda con espera de 300 ms para no consultar en cada tecla
  useEffect(() => {
    const q = texto.trim()
    if (q.length < 2) { setResultados([]); return }
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get('/productos', { params: { q, limit: 15 } })
        setResultados(data.data)
        setActivo(0)
        setAbierto(true)
      } catch { setResultados([]) }
    }, 300)
    return () => clearTimeout(t)
  }, [texto])

  const elegir = (p) => {
    onSelect(p)
    setTexto('')
    setResultados([])
    setAbierto(false)
    ref.current?.focus()
  }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActivo((i) => Math.min(i + 1, resultados.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActivo((i) => Math.max(i - 1, 0)) }
    if (e.key === 'Escape') setAbierto(false)
    if (e.key === 'Enter') {
      e.preventDefault()
      const q = texto.trim().toUpperCase()
      const exacto = resultados.find((p) => p.codigoBarra === texto.trim() || p.sku === q)
      if (exacto) return elegir(exacto)
      if (resultados[activo]) elegir(resultados[activo])
    }
  }

  return (
    <div className="relative">
      <Search className="absolute left-3 top-3 h-5 w-5 text-gray-400" aria-hidden />
      <input
        ref={ref} autoFocus={autoFocus} value={texto} placeholder={placeholder}
        onChange={(e) => setTexto(e.target.value)} onKeyDown={onKeyDown} onBlur={() => setTimeout(() => setAbierto(false), 150)}
        onFocus={() => resultados.length && setAbierto(true)}
        className="w-full rounded-lg border py-2.5 pl-10 pr-3 focus:outline-none focus:ring-2 focus:ring-green-600"
        aria-label="Buscar producto" role="combobox" aria-expanded={abierto}
      />
      {abierto && resultados.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-80 overflow-auto rounded-lg border bg-white shadow-lg" role="listbox">
          {resultados.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === activo}>
              <button type="button" onMouseDown={() => elegir(p)}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${i === activo ? 'bg-green-50' : 'hover:bg-gray-50'}`}>
                <span><span className="font-medium">{p.nombre}</span> <span className="text-gray-500">{p.sku}{p.marca?.nombre ? ` · ${p.marca.nombre}` : ''}</span><ChipsGiro atributos={p.atributos} campos={campos} className="mt-0.5" /></span>
                <span className="text-right text-xs text-gray-600">{Q(p.precioVenta)}{p.existencia != null && <> · Exist. {Number(p.existencia)}</>}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
