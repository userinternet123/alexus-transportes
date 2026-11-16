// Piezas visuales compartidas por las pantallas de operación.
import { ESTADOS } from './comun'

export const Etiqueta = ({ estado }) => { const e = ESTADOS[estado] ?? { texto: estado, clase: 'bg-gray-100' }; return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${e.clase}`}>{e.texto}</span> }
export const Boton = ({ children, color = 'bg-green-600', ...p }) => <button type="button" {...p} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-50 ${color} ${p.className ?? ''}`}>{children}</button>
export const BotonBorde = ({ children, ...p }) => <button type="button" {...p} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50 ${p.className ?? ''}`}>{children}</button>
