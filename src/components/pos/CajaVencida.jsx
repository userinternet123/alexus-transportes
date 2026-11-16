// ─────────────────────────────────────────────────────────────────────────────
// CAJA DE UN DÍA ANTERIOR: el servidor no deja vender con una caja de otro día (para que el cuadre de cada día
// sea correcto). En vez de dejar armar la venta y rechazarla al cobrar, el punto de venta lo explica al entrar y
// dice qué hacer. La venta que estaba en curso se conserva.
// ─────────────────────────────────────────────────────────────────────────────
import { CalendarClock, RefreshCw } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

const fechaLarga = (v) => {
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-GT', { dateStyle: 'long', timeZone: 'UTC' }) // fecha contable: sin hora
}

export default function CajaVencida({ sesion, onActualizar }) {
  const ir = useNavigate()
  const fecha = fechaLarga(sesion?.fechaContable)
  const nombre = sesion?.caja?.nombre
  return (
    <section className="mx-auto mt-12 max-w-lg rounded-xl border border-amber-300 bg-white p-6" aria-labelledby="caja-vencida-titulo">
      <CalendarClock className="h-8 w-8 text-amber-600" aria-hidden />
      <h2 id="caja-vencida-titulo" className="mt-2 text-xl font-semibold">Su caja es de un día anterior</h2>
      <p className="mt-1 text-sm text-gray-700" role="alert">
        {nombre ? `${nombre} se abrió` : 'Su caja se abrió'}{fecha ? ` el ${fecha}` : ''} y sigue abierta. SPVI no deja vender con la caja de otro día, para que el cuadre de cada día sea correcto.
      </p>
      <p className="mt-4 text-sm font-medium">Antes de empezar a vender:</p>
      <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-gray-700">
        <li><b>Cierre esa caja:</b> cuente el efectivo y haga el cuadre.</li>
        <li><b>Abra una caja nueva</b> con su fondo inicial.</li>
        <li>Vuelva a Ventas: la venta que tenía en curso se conserva.</li>
      </ol>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <button type="button" onClick={() => ir('/home/caja')} className="flex-1 rounded-lg bg-green-700 py-2 font-semibold text-white">Ir a cerrar la caja</button>
        {onActualizar && <button type="button" onClick={onActualizar} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-2 hover:bg-gray-50"><RefreshCw className="h-4 w-4" aria-hidden /> Ya la cerré: actualizar</button>}
      </div>
    </section>
  )
}
