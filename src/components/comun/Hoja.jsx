// Hoja lateral (sheet) estilo iOS/macOS para ver o editar un registro sin
// salir de la lista. En el celular sube desde abajo a pantalla casi completa.
import { cloneElement, isValidElement, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { usePresencia } from '../../hooks/usePresencia'

export default function Hoja({ abierta, titulo, onCerrar, children, pie }) {
  useEffect(() => {
    if (!abierta) return
    const onKey = (e) => e.key === 'Escape' && onCerrar?.()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [abierta, onCerrar])
  const { montado, saliendo } = usePresencia(abierta, 230)
  if (!montado) return null
  // Portal: se dibuja en <body>, fuera de contenedores con desenfoque o transformaciones que la recortarían
  return createPortal(
    <div className={`mac-fondo ${saliendo ? 'saliendo' : ''} fixed inset-0 z-50 flex justify-end bg-black/20`} onMouseDown={(e) => e.target === e.currentTarget && onCerrar?.()} role="dialog" aria-modal="true" aria-labelledby="hoja-titulo">
      <div className={`mac-hoja ${saliendo ? 'saliendo' : ''} mt-auto flex h-[92vh] w-full flex-col rounded-t-superficie bg-gray-100 shadow-2xl sm:mt-0 sm:h-full sm:max-w-md sm:rounded-none sm:rounded-l-superficie`}>
        <div className="separador flex items-center justify-between border-b px-5 py-3">
          <h2 id="hoja-titulo" className="text-[17px] font-semibold">{titulo}</h2>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="rounded-full bg-gray-200 p-1 text-gray-600 hover:bg-gray-300"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {pie && <div className="separador flex justify-end gap-2 border-t bg-white px-5 py-3">{pie}</div>}
      </div>
    </div>,
    document.body,
  )
}

/** Grupo de campos tipo "lista agrupada" de Ajustes de iOS. */
export function Grupo({ titulo, children, nota, id, requerido = false, error }) {
  return (
    <section id={id} tabIndex={id ? -1 : undefined} className="mb-5 outline-none">
      {titulo && <h3 className="mb-1.5 px-1 text-[13px] text-gray-500">{titulo}{requerido && <span className="ml-0.5 text-red-600" aria-hidden="true">*</span>}</h3>}
      <div className={`separador divide-y divide-gray-200 overflow-hidden rounded-tarjeta border bg-white ${error ? 'ring-2 ring-red-400' : ''}`}>{children}</div>
      {error && <p id={`${id}-error`} className="mt-1.5 px-1 text-[13px] text-red-700">{error}</p>}
      {nota && <p className="mt-1.5 px-1 text-xs text-gray-500">{nota}</p>}
    </section>
  )
}

/** Fila de formulario: etiqueta a la izquierda, control a la derecha. */
/**
 * Renglón de formulario. Con `id` (el nombre del campo) el cursor puede llevarse a él; `requerido` pone el asterisco
 * y `error` muestra el problema debajo, con el renglón marcado en rojo.
 */
export function Fila({ etiqueta, children, htmlFor, id, requerido = false, error }) {
  const campoId = id ?? htmlFor
  const contenido = campoId && isValidElement(children) && typeof children.type === 'string' && ['input', 'select', 'textarea'].includes(children.type)
    ? cloneElement(children, { id: children.props.id ?? campoId, 'aria-invalid': error ? true : undefined, 'aria-describedby': error ? `${campoId}-error` : undefined, 'aria-required': requerido || undefined })
    : children
  return (
    <div className={error ? 'bg-red-50' : undefined}>
      <label htmlFor={campoId} className="flex items-center gap-3 px-4 py-2.5 text-[15px]">
        <span className="w-32 shrink-0 text-gray-800">{etiqueta}{requerido && <span className="ml-0.5 text-red-600" aria-hidden="true">*</span>}</span>
        <span className="min-w-0 flex-1 text-right [&_input]:w-full [&_input]:bg-transparent [&_input]:text-right [&_input]:outline-none [&_select]:w-full [&_select]:bg-transparent [&_select]:text-right [&_select]:outline-none">{contenido}</span>
      </label>
      {error && <p id={`${campoId}-error`} className="px-4 pb-2 text-right text-[13px] text-red-700">{error}</p>}
    </div>
  )
}

/** Avatar con iniciales y color estable según el nombre. */
const TONOS_AVATAR = ['bg-sky-500', 'bg-amber-500', 'bg-violet-500', 'bg-teal-500', 'bg-rose-500', 'bg-indigo-500', 'bg-green-600', 'bg-orange-500']
export function Avatar({ nombre = '', imagen, tamano = 'h-11 w-11 text-base' }) {
  const ini = nombre.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?'
  const tono = TONOS_AVATAR[[...nombre].reduce((a, c) => a + c.charCodeAt(0), 0) % TONOS_AVATAR.length]
  if (imagen) return <img src={imagen} alt="" className={`${tamano} shrink-0 rounded-full object-cover`} />
  return <span className={`${tamano} flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${tono}`} aria-hidden>{ini}</span>
}
