// Campo con etiqueta para formularios en modal (alta rápida): asterisco si es obligatorio y el mensaje del problema debajo.
import { cloneElement, isValidElement } from 'react'

export default function Campo({ etiqueta, id, requerido = false, error, className = '', children }) {
  const hijo = isValidElement(children) && typeof children.type === 'string' && ['input', 'select', 'textarea'].includes(children.type)
    ? cloneElement(children, { id: children.props.id ?? id, 'aria-invalid': error ? true : undefined, 'aria-describedby': error ? `${id}-error` : undefined, 'aria-required': requerido || undefined, className: `${children.props.className ?? ''} ${error ? 'border-red-500 bg-red-50' : ''}`.trim() })
    : children
  return (
    <div className={className}>
      <label htmlFor={id} className="block">{etiqueta}{requerido && <span className="ml-0.5 text-red-600" aria-hidden="true">*</span>}{hijo}</label>
      {error && <p id={`${id}-error`} className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  )
}
