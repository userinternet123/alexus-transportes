// Modal accesible y liviano para las pantallas operativas.
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { usePresencia } from '../../hooks/usePresencia'

export default function Modal({ titulo, abierto, onCerrar, children, ancho = 'max-w-2xl', pie }) {
  useEffect(() => {
    if (!abierto) return
    const onKey = (e) => e.key === 'Escape' && onCerrar?.()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [abierto, onCerrar])

  const { montado, saliendo } = usePresencia(abierto, 170)
  if (!montado) return null
  // Portal: se dibuja en <body>, fuera de contenedores con desenfoque o transformaciones que la recortarían
  return createPortal(
    <div className={`mac-fondo ${saliendo ? 'saliendo' : ''} fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4`} role="dialog" aria-modal="true" aria-labelledby="modal-titulo" onMouseDown={(e) => e.target === e.currentTarget && onCerrar?.()}>
      <div className={`mac-ventana ${saliendo ? 'saliendo' : ''} flex max-h-[90vh] w-full ${ancho} flex-col rounded-2xl bg-white`}>
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 id="modal-titulo" className="text-lg font-semibold">{titulo}</h2>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="rounded p-1 hover:bg-gray-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="overflow-auto px-5 py-4">{children}</div>
        {pie && <div className="flex justify-end gap-2 border-t px-5 py-3">{pie}</div>}
      </div>
    </div>,
    document.body,
  )
}
