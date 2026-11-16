// ─────────────────────────────────────────────────────────────────────────────
// CONFIRMACIONES PROPIAS: reemplazan las del navegador (window.confirm), con el estilo y la animación de las demás
// ventanas. Uso:  if (!(await confirmar({ titulo, mensaje, confirmar: 'Eliminar', peligro: true }))) return
// En acciones peligrosas el foco empieza en "Cancelar". Escape o un toque fuera = cancelar. Si llegan dos a la vez,
// se muestran una después de otra. <AnfitrionConfirmacion /> se monta una sola vez en main.jsx.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, HelpCircle } from 'lucide-react'
import { usePresencia } from '../../hooks/usePresencia'

let encolar = null

/** Devuelve una promesa: true si la persona confirma, false si cancela. */
export function confirmar(opciones) {
  const o = typeof opciones === 'string' ? { mensaje: opciones } : opciones
  if (!encolar) return Promise.resolve(window.confirm(o.mensaje)) // sin anfitrión montado (no debería ocurrir)
  return new Promise((resolve) => encolar({ ...o, resolve }))
}

export function AnfitrionConfirmacion() {
  const [cola, setCola] = useState([])
  const [abierto, setAbierto] = useState(false)
  const respondido = useRef(false)
  const actual = cola[0]
  const { montado, saliendo } = usePresencia(abierto, 170)
  const botonConfirmar = useRef(null)
  const botonCancelar = useRef(null)

  useEffect(() => { encolar = (p) => setCola((c) => [...c, p]); return () => { encolar = null } }, [])
  // Abre la siguiente cuando no hay ninguna en pantalla
  useEffect(() => { if (actual && !abierto && !montado && !respondido.current) setAbierto(true) }, [actual, abierto, montado])
  // Al terminar la animación de salida, quita la respondida de la cola
  useEffect(() => { if (!montado && respondido.current) { respondido.current = false; setCola((c) => c.slice(1)) } }, [montado])
  // Foco inicial: "Cancelar" en acciones peligrosas, "Confirmar" en las demás
  useEffect(() => { if (abierto && actual) setTimeout(() => (actual.peligro ? botonCancelar : botonConfirmar).current?.focus(), 30) }, [abierto, actual])

  const responder = (valor) => {
    if (!abierto || !actual || respondido.current) return
    respondido.current = true
    actual.resolve(valor)
    setAbierto(false)
  }
  useEffect(() => {
    if (!abierto) return undefined
    const tecla = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); responder(false) } }
    window.addEventListener('keydown', tecla, true)
    return () => window.removeEventListener('keydown', tecla, true)
  }) // eslint-disable-line react-hooks/exhaustive-deps

  if (!montado || !actual) return null
  const Icono = actual.peligro ? AlertTriangle : HelpCircle
  return (
    <div className={`mac-fondo ${saliendo ? 'saliendo' : ''} fixed inset-0 z-[70] flex items-center justify-center bg-black/30 p-4`} onMouseDown={(e) => e.target === e.currentTarget && responder(false)}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirmacion-titulo" aria-describedby="confirmacion-mensaje"
        className={`mac-ventana ${saliendo ? 'saliendo' : ''} w-full max-w-sm rounded-2xl bg-white p-5 text-center`}>
        <span className={`mx-auto flex h-11 w-11 items-center justify-center rounded-full ${actual.peligro ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'}`}><Icono className="h-6 w-6" aria-hidden /></span>
        <h2 id="confirmacion-titulo" className="mt-3 text-[17px] font-semibold">{actual.titulo ?? '¿Continuar?'}</h2>
        <p id="confirmacion-mensaje" className="mt-1.5 whitespace-pre-line text-sm text-gray-600">{actual.mensaje}</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button ref={botonCancelar} type="button" onClick={() => responder(false)} className="rounded-control border px-4 py-2.5 font-medium hover:bg-gray-50">{actual.cancelar ?? 'Cancelar'}</button>
          <button ref={botonConfirmar} type="button" onClick={() => responder(true)} className={`rounded-control px-4 py-2.5 font-medium text-white ${actual.peligro ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}>{actual.confirmar ?? 'Aceptar'}</button>
        </div>
      </div>
    </div>
  )
}
