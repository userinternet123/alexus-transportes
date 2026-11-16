// ─────────────────────────────────────────────────────────────────────────────
// CUADRE DE CAJA (arqueo CIEGO): el cajero cuenta billetes y monedas SIN ver
// lo que el sistema espera. Las diferencias se revelan al cerrar.
// Buena práctica de control interno: evita "ajustar" el conteo al esperado.
// ─────────────────────────────────────────────────────────────────────────────
import { usePermisos } from '../../hooks/usePermisos'
import { useEffect, useMemo, useState } from 'react'
import api from '../../services/api'
import { showToast } from '../../utils/showToast'
import { Q, r2, errorApi } from './formato'
import AperturaCaja from './AperturaCaja'
import DepositosBancarios from './DepositosBancarios'
import BotonPantallaCompleta from '../comun/BotonPantallaCompleta'

const BILLETES = ['200', '100', '50', '20', '10', '5', '1']
const MONEDAS = ['1.00', '0.50', '0.25', '0.10', '0.05', '0.01']
const OTROS = [
  { id: 'TARJETA', label: 'Vouchers de tarjeta' },
  { id: 'TRANSFERENCIA', label: 'Transferencias' },
  { id: 'CHEQUE', label: 'Cheques' },
]

export default function CuadreCaja() {
  const [sesion, setSesion] = useState(undefined)
  const [conteo, setConteo] = useState({})
  const [otros, setOtros] = useState({})
  const [observacion, setObservacion] = useState('')
  const [resultado, setResultado] = useState(null)
  const [enviando, setEnviando] = useState(false)

  // El supervisor (caja.supervisar) puede cuadrar cualquier caja abierta de la sucursal; el cajero, solo la suya
  const { puede } = usePermisos()
  const supervisa = puede('caja.supervisar')
  const [abiertas, setAbiertas] = useState([])
  const [elegida, setElegida] = useState('mia')
  const cargar = (id = elegida) => (id === 'mia' ? api.get('/caja/mi-sesion') : api.get(`/caja/sesiones/${id}`))
    .then(({ data }) => setSesion(data.data)).catch(() => setSesion(null))
  const cargarAbiertas = () => { if (supervisa) api.get('/caja/sesiones', { params: { estado: 'ABIERTA' } }).then(({ data }) => setAbiertas(data.data ?? [])).catch(() => setAbiertas([])) }
  useEffect(() => { cargar('mia'); cargarAbiertas() }, [supervisa]) // eslint-disable-line react-hooks/exhaustive-deps
  const elegir = (id) => { setElegida(id); setSesion(undefined); setConteo({}); setOtros({}); setObservacion(''); setResultado(null); cargar(id) }
  const selector = supervisa && abiertas.length > 0 ? (
    <label className="mb-3 flex flex-wrap items-center gap-2 text-sm text-gray-600">Caja a cuadrar
      <select value={elegida} onChange={(e) => elegir(e.target.value)} className="rounded-control border bg-white px-2 py-1.5 text-gray-900" aria-label="Caja a cuadrar">
        <option value="mia">Mi caja</option>
        {abiertas.map((s) => <option key={s.id} value={String(s.id)}>{s.caja?.nombre} · {s.usuario?.nombre}</option>)}
      </select>
    </label>
  ) : null

  const efectivo = useMemo(
    () => r2(Object.entries(conteo).reduce((a, [den, cant]) => a + Number(den) * Number(cant || 0), 0)),
    [conteo]
  )

  const cerrar = async () => {
    setEnviando(true)
    try {
      // Billete de Q1 y moneda de Q1 se suman en la misma denominación
      const denominaciones = Object.entries(conteo)
        .filter(([, c]) => Number(c) > 0)
        .reduce((acc, [d, c]) => ({ ...acc, [String(Number(d))]: (acc[String(Number(d))] ?? 0) + Number(c) }), {})
      const conteos = [
        { medioPago: 'EFECTIVO', montoContado: efectivo, denominaciones },
        ...OTROS.filter((o) => otros[o.id] !== undefined && otros[o.id] !== '').map((o) => ({ medioPago: o.id, montoContado: Number(otros[o.id]) })),
      ]
      const { data } = await api.post(`/caja/sesiones/${sesion.id}/cerrar`, { conteos, observacion: observacion || undefined })
      setResultado(data)
      showToast({ type: Number(data.data.sesion.diferencia) === 0 ? 'success' : 'warning', message: data.message })
    } catch (err) {
      const { codigo, mensaje } = errorApi(err)
      showToast({ type: codigo === 'JUSTIFICAR_DIFERENCIA' ? 'warning' : 'error', message: mensaje })
    } finally {
      setEnviando(false)
    }
  }

  if (sesion === undefined) return <p className="p-6 text-gray-500">Cargando…</p>

  if (resultado) {
    const { sesion: s, arqueos } = resultado.data
    return (
      <div className="mx-auto max-w-2xl p-6">
        <h2 className="text-2xl font-semibold">{resultado.message}</h2>
        <table className="mt-4 w-full text-sm">
          <thead className="text-left text-gray-600"><tr><th className="py-2">Medio</th><th className="text-right">Esperado</th><th className="text-right">Contado</th><th className="text-right">Diferencia</th></tr></thead>
          <tbody>
            {arqueos.map((a) => (
              <tr key={a.medioPago} className="border-t">
                <td className="py-2">{a.medioPago}</td>
                <td className="text-right tabular-nums">{Q(a.montoEsperado)}</td>
                <td className="text-right tabular-nums">{Q(a.montoContado)}</td>
                <td className={`text-right font-semibold tabular-nums ${Number(a.diferencia) < 0 ? 'text-red-600' : Number(a.diferencia) > 0 ? 'text-amber-600' : ''}`}>{Q(a.diferencia)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr className="border-t font-semibold"><td className="py-2">Total</td><td className="text-right">{Q(s.totalEsperado)}</td><td className="text-right">{Q(s.totalContado)}</td><td className="text-right">{Q(s.diferencia)}</td></tr></tfoot>
        </table>
        <button type="button" onClick={() => window.print()} className="mt-6 rounded-lg border px-4 py-2">Imprimir comprobante</button>
      </div>
    )
  }

  if (sesion === null) return <div className={selector ? 'mx-auto max-w-3xl p-6 pb-0' : ''}>{selector}<AperturaCaja onAbierta={() => { cargar('mia'); cargarAbiertas() }} /></div>

  const fila = (den) => (
    <label key={den} className="flex items-center justify-between gap-3 py-1">
      <span className="w-16 tabular-nums">Q{den}</span>
      <input type="number" min="0" step="1" value={conteo[den] ?? ''} onChange={(e) => setConteo((c) => ({ ...c, [den]: e.target.value }))} className="w-20 rounded border px-2 py-1 text-right" aria-label={`Cantidad de Q${den}`} />
      <span className="w-24 text-right tabular-nums text-gray-600">{Q(Number(den) * Number(conteo[den] || 0))}</span>
    </label>
  )

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          {selector}
          <h2 className="text-2xl font-semibold">Cuadre de {sesion.caja?.nombre}{elegida !== 'mia' && sesion.usuario?.nombre ? <span className="font-normal text-gray-500"> · {sesion.usuario.nombre}</span> : null}</h2>
        </div>
        <BotonPantallaCompleta vista="caja" />
      </div>
      <p className="text-sm text-gray-600">Cuente todo el contenido de la gaveta, incluido el fondo inicial. Los montos esperados se muestran al cerrar.</p>
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <fieldset className="rounded-xl border bg-white p-4">
          <legend className="px-1 font-medium">Billetes</legend>
          {BILLETES.map(fila)}
        </fieldset>
        <fieldset className="rounded-xl border bg-white p-4">
          <legend className="px-1 font-medium">Monedas</legend>
          {MONEDAS.map(fila)}
        </fieldset>
      </div>
      <fieldset className="mt-6 rounded-xl border bg-white p-4">
        <legend className="px-1 font-medium">Otros medios</legend>
        {OTROS.map((o) => (
          <label key={o.id} className="flex items-center justify-between py-1">
            <span>{o.label}</span>
            <input type="number" step="0.01" min="0" value={otros[o.id] ?? ''} onChange={(e) => setOtros((x) => ({ ...x, [o.id]: e.target.value }))} className="w-32 rounded border px-2 py-1 text-right" placeholder="0.00" />
          </label>
        ))}
      </fieldset>
      {/* Depósitos al banco del turno: salen del efectivo esperado */}
      <DepositosBancarios sesionId={sesion.id} />
      <label className="mt-6 block text-sm" htmlFor="obs">Observaciones (obligatorio si hay diferencia)</label>
      <textarea id="obs" value={observacion} onChange={(e) => setObservacion(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border px-3 py-2" />
      <div className="mt-6 flex items-center justify-between rounded-xl bg-gray-900 p-4 text-white">
        <span>Efectivo contado</span>
        <span className="text-3xl font-bold tabular-nums">{Q(efectivo)}</span>
      </div>
      <button type="button" disabled={enviando} onClick={cerrar} className="mt-4 w-full rounded-lg bg-green-700 py-3 font-semibold text-white disabled:opacity-50">
        {enviando ? 'Cerrando…' : 'Cerrar caja'}
      </button>
    </div>
  )
}
