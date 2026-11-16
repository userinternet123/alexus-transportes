// Imprimir etiquetas con el código de barras del producto: tamaño, copias y si lleva nombre y precio.
import { useMemo, useState } from 'react'
import { Printer } from 'lucide-react'
import { detectar, htmlEtiquetas, milimetrosPorModulo, svgCodigo, TAMANOS } from '../../utils/codigoBarras'
import { imprimirHtml } from '../../utils/imprimir'
import Modal from '../comun/Modal'

const FORMATO = { EAN13: 'EAN-13', EAN8: 'EAN-8', CODE128: 'Code 128' }

export default function EtiquetaCodigo({ nombre, codigo, precio, onCerrar }) {
  const [tamano, setTamano] = useState('50x30')
  const [copias, setCopias] = useState('1')
  const [conNombre, setConNombre] = useState(true)
  const [conPrecio, setConPrecio] = useState(false)
  const info = useMemo(() => {
    try { return { ...detectar(codigo), svg: svgCodigo(codigo, { modulo: 2, alto: 60 }) } } catch (e) { return { error: e.message } }
  }, [codigo])
  const t = TAMANOS[tamano]
  const fino = !info.error && milimetrosPorModulo(codigo, tamano) < 0.25
  const n = Math.min(500, Math.max(1, Math.trunc(Number(copias)) || 1))

  return (
    <Modal abierto titulo="Imprimir etiqueta" onCerrar={onCerrar} ancho="max-w-lg"
      pie={<>
        <button type="button" onClick={onCerrar} className="rounded-control border px-4 py-2">Cerrar</button>
        <button type="button" disabled={Boolean(info.error)} onClick={() => imprimirHtml(htmlEtiquetas({ nombre, codigo, precio, tamano, copias: n, conNombre, conPrecio }))}
          className="inline-flex items-center gap-2 rounded-control bg-green-600 px-4 py-2 font-medium text-white disabled:opacity-50">
          <Printer className="h-4 w-4" aria-hidden /> Imprimir {n} {n === 1 ? 'etiqueta' : 'etiquetas'}
        </button>
      </>}>
      {info.error ? <p className="rounded-control bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{info.error}</p> : (
        <div className="flex justify-center rounded-tarjeta bg-gray-100 p-4">
          <div className="flex flex-col items-center justify-center gap-1 overflow-hidden rounded-md border bg-white p-2 shadow-sm" style={{ width: `${t.ancho * 4}px`, maxWidth: '100%', aspectRatio: `${t.ancho} / ${t.alto}` }}>
            {conNombre && <p className="line-clamp-2 w-full text-center text-[11px] font-bold leading-tight">{nombre}</p>}
            <div className="min-h-0 w-full flex-1 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: info.svg }} />
            {conPrecio && precio != null && <p className="text-sm font-bold">Q {Number(precio).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>}
          </div>
        </div>
      )}
      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <label className="block">Tamaño de la etiqueta
          <select value={tamano} onChange={(e) => setTamano(e.target.value)} className="mt-1 w-full rounded-control border px-3 py-2">
            {Object.entries(TAMANOS).map(([k, v]) => <option key={k} value={k}>{v.nombre}</option>)}
          </select>
        </label>
        <label className="block">Copias
          <input type="number" min="1" max="500" inputMode="numeric" value={copias} onChange={(e) => setCopias(e.target.value)} className="cifra mt-1 w-full rounded-control border px-3 py-2 text-right" />
        </label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={conNombre} onChange={(e) => setConNombre(e.target.checked)} className="accent-green-600" /> Mostrar el nombre</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={conPrecio} disabled={precio == null} onChange={(e) => setConPrecio(e.target.checked)} className="accent-green-600" /> Mostrar el precio</label>
      </div>
      {!info.error && <p className="mt-3 text-xs text-gray-500">Tipo de código: <b>{FORMATO[info.formato]}</b>{info.formato === 'CODE128' ? ' (código propio del negocio: lo leen todos los lectores)' : ''}.</p>}
      {fino && <p className="mt-2 rounded-control bg-amber-50 px-3 py-2 text-xs text-amber-800" role="alert">Este código es largo para una etiqueta tan pequeña: las barras quedan muy finas y quizá no se lean. Elija una etiqueta más grande.</p>}
      <p className="mt-3 text-xs text-gray-500">Se imprime en la impresora predeterminada del equipo. Si usa impresión silenciosa, asegúrese de que sea la de etiquetas.</p>
    </Modal>
  )
}
