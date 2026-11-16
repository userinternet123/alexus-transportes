import { confirmar } from '../comun/Confirmacion'
import { useEffect, useState } from 'react'
import { CalendarCheck, AlertTriangle } from 'lucide-react'
import api from '../../services/api'
import { usePermisos } from '../../hooks/usePermisos'
import { showToast } from '../../utils/showToast'
import { Q, errorApi } from './formato'
import BotonPantallaCompleta from '../comun/BotonPantallaCompleta'

const hoyLocal = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(new Date())

export default function CierreDiario() {
  const { puede } = usePermisos()
  const [fecha, setFecha] = useState(hoyLocal())
  const [preview, setPreview] = useState(null)
  const [observacion, setObservacion] = useState('')
  const [enviando, setEnviando] = useState(false)

  const cargar = () =>
    api.get(`/cierres/${fecha}/preview`).then(({ data }) => setPreview(data.data)).catch((e) => showToast({ type: 'error', message: errorApi(e).mensaje }))
  useEffect(() => { cargar() }, [fecha]) // eslint-disable-line react-hooks/exhaustive-deps

  const cerrar = async () => {
    if (!(await confirmar({ titulo: `Cerrar el día ${fecha}`, mensaje: `Después de cerrar el ${fecha} no se podrán registrar ni anular ventas con esa fecha.`, confirmar: 'Cerrar el día', peligro: true }))) return
    setEnviando(true)
    try {
      const { data } = await api.post(`/cierres/${fecha}`, { observacion: observacion || undefined })
      showToast({ type: 'success', message: data.message })
      cargar()
    } catch (e) {
      showToast({ type: 'error', message: errorApi(e).mensaje })
    } finally {
      setEnviando(false)
    }
  }

  const r = preview?.resumen
  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="flex items-center gap-2 text-2xl font-semibold"><CalendarCheck className="h-6 w-6 text-green-700" /> Cierre del día <BotonPantallaCompleta vista="cierre" /></h2>
        <label className="text-sm">Fecha <input type="date" value={fecha} max={hoyLocal()} onChange={(e) => setFecha(e.target.value)} className="ml-2 rounded-lg border px-3 py-2" /></label>
      </div>

      {preview && (
        <>
          {preview.bloqueos.length > 0 && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <p className="font-medium">No se puede cerrar todavía:</p>
              <ul className="ml-5 list-disc">{preview.bloqueos.map((b) => <li key={b}>{b}</li>)}</ul>
            </div>
          )}
          {preview.advertencias.map((a) => (
            <p key={a} className="mt-3 flex items-center gap-2 text-sm text-amber-700"><AlertTriangle className="h-4 w-4" /> {a}</p>
          ))}

          <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3">
            {[
              ['Ventas', Q(r.ventasTotal), `${r.ventasCantidad} documentos`],
              // Costos y utilidad: solo gerencia (permiso finanzas.costos)
              ...(puede('finanzas.costos') ? [['Utilidad bruta', Q(r.utilidadBruta), `Margen ${r.margenPorcentaje}%`], ['Costo de ventas', Q(r.costoTotal), '']] : []),
              ['Anulaciones', Q(r.anulacionesTotal), ''],
              ['Devoluciones', Q(r.devolucionesTotal), ''],
              ['Diferencia en cajas', Q(r.diferenciaCajas), Number(r.diferenciaCajas) === 0 ? 'Cuadrado' : 'Revisar turnos'],
            ].map(([t, v, s]) => (
              <div key={t} className="rounded-xl border bg-white p-4">
                <p className="text-sm text-gray-500">{t}</p>
                <p className="text-xl font-semibold tabular-nums">{v}</p>
                {s && <p className="text-xs text-gray-500">{s}</p>}
              </div>
            ))}
          </div>

          <h3 className="mt-6 font-medium">Cobros por medio de pago</h3>
          <table className="mt-2 w-full text-sm">
            <tbody>
              {Object.entries(r.porMedioPago).map(([m, v]) => (
                <tr key={m} className="border-t"><td className="py-2">{m}</td><td className="text-right tabular-nums">{Q(v)}</td></tr>
              ))}
            </tbody>
          </table>

          {puede('cierre.ejecutar') && (
            <>
              <textarea value={observacion} onChange={(e) => setObservacion(e.target.value)} rows={2} placeholder="Observaciones del cierre (opcional)" className="mt-6 w-full rounded-lg border px-3 py-2" />
              <button type="button" disabled={!preview.puedeCerrar || enviando} onClick={cerrar} className="mt-3 w-full rounded-lg bg-green-700 py-3 font-semibold text-white disabled:opacity-50">
                {enviando ? 'Cerrando…' : `Cerrar el día ${fecha}`}
              </button>
            </>
          )}
        </>
      )}
    </div>
  )
}
