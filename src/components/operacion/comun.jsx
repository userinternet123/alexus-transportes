// ─────────────────────────────────────────────────────────────────────────────
// Componentes compartidos de las pantallas de operación (etiquetas, cifras, pestañas, botones).
// ─────────────────────────────────────────────────────────────────────────────
const COLORES = {
  verde: 'bg-green-100 text-green-800', azul: 'bg-blue-100 text-blue-800', ambar: 'bg-amber-100 text-amber-900',
  rojo: 'bg-red-100 text-red-800', gris: 'bg-gray-100 text-gray-700', morado: 'bg-violet-100 text-violet-800',
}
export function Etiqueta({ color = 'gris', children, titulo }) {
  return <span title={titulo} className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${COLORES[color]}`}>{children}</span>
}


/** Tarjeta de indicador */
export function Cifra({ titulo, valor, detalle, tono }) {
  return (
    <div className="rounded-superficie border bg-white p-4">
      <p className="text-sm text-gray-500">{titulo}</p>
      <p className={`cifra mt-1 text-2xl font-semibold ${tono === 'malo' ? 'text-red-700' : tono === 'bueno' ? 'text-green-700' : ''}`}>{valor}</p>
      {detalle && <p className="mt-0.5 text-xs text-gray-500">{detalle}</p>}
    </div>
  )
}

/** Pestañas simples */
export function Pestanas({ opciones, valor, onCambio }) {
  return (
    <div role="tablist" className="flex flex-wrap gap-1 rounded-control bg-gray-100 p-1 text-sm">
      {opciones.map(([v, t]) => (
        <button key={v} type="button" role="tab" aria-selected={valor === v} onClick={() => onCambio(v)}
          className={`rounded-md px-3 py-1.5 ${valor === v ? 'bg-white font-medium shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>{t}</button>
      ))}
    </div>
  )
}

export const BotonPrimario = ({ children, ...p }) => <button type="button" {...p} className={`inline-flex items-center gap-1.5 rounded-control bg-green-600 px-4 py-2 font-medium text-white hover:bg-green-700 disabled:opacity-50 ${p.className ?? ''}`}>{children}</button>
export const Boton = ({ children, peligro, ...p }) => <button type="button" {...p} className={`inline-flex items-center gap-1.5 rounded-control border px-3 py-2 disabled:opacity-50 ${peligro ? 'border-red-200 text-red-700 hover:bg-red-50' : 'hover:bg-gray-50'} ${p.className ?? ''}`}>{children}</button>
