// ─────────────────────────────────────────────────────────────────────────────
// VOUCHERS, TRANSFERENCIAS Y CHEQUES: verificar los cobros que no son en efectivo,
// igual que los depósitos bancarios (número, banco y foto del comprobante).
// Los totales por medio sirven para cuadrar contra el cierre del POS o el banco.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react'
import { CreditCard, FileImage, Landmark, ScrollText } from 'lucide-react'
import api from '../../services/api'
import { showToast } from '../../utils/showToast'
import { subirArchivo, verArchivo } from '../../utils/imagen'
import { Q, errorApi } from '../pos/formato'
import Modal from '../comun/Modal'

const MEDIOS = { TARJETA: ['Tarjeta', CreditCard], TRANSFERENCIA: ['Transferencia', Landmark], CHEQUE: ['Cheque', ScrollText] }
const ESTADOS = { PENDIENTE: ['Pendiente', 'bg-amber-50 text-amber-700'], VERIFICADO: ['Verificado', 'bg-green-50 text-green-700'], RECHAZADO: ['Rechazado', 'bg-red-50 text-red-700'] }
const BANCOS = ['BANRURAL', 'BI', 'BAM', 'G&T CONTINENTAL', 'BANTRAB', 'PROMERICA', 'INTERBANCO', 'FICOHSA', 'OTRO']
const hoyGt = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(new Date())
const haceDias = (n) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(new Date(Date.now() - n * 86_400_000))
const cliente = (c) => c?.razonSocial || [c?.nombres, c?.apellidos].filter(Boolean).join(' ') || 'Consumidor final'

export default function Cobros() {
  const [f, setF] = useState({ desde: haceDias(7), hasta: hoyGt(), medio: '', estado: 'PENDIENTE' })
  const [datos, setDatos] = useState({ data: [], totales: {} })
  const [cargando, setCargando] = useState(false)
  const [abierto, setAbierto] = useState(null)

  const cargar = useCallback(() => {
    setCargando(true)
    api.get('/cobros', { params: { desde: f.desde, hasta: f.hasta, medio: f.medio || undefined, estado: f.estado || undefined } })
      .then(({ data }) => setDatos(data)).catch((e) => showToast({ type: 'error', message: errorApi(e).mensaje })).finally(() => setCargando(false))
  }, [f])
  useEffect(() => { cargar() }, [cargar])
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <p className="text-sm text-gray-600">Confirme contra el banco o el cierre del datáfono cada cobro que no fue en efectivo. Si un cheque rebota o una transferencia no llegó, márquelo como rechazado.</p>
      <div className="grid gap-3 rounded-tarjeta border bg-white p-3 sm:grid-cols-4">
        <label className="text-sm">Desde<input type="date" value={f.desde} onChange={set('desde')} className="mt-1 w-full rounded-control border px-2 py-1.5" /></label>
        <label className="text-sm">Hasta<input type="date" value={f.hasta} onChange={set('hasta')} className="mt-1 w-full rounded-control border px-2 py-1.5" /></label>
        <label className="text-sm">Medio
          <select value={f.medio} onChange={set('medio')} className="mt-1 w-full rounded-control border px-2 py-1.5"><option value="">Todos</option>{Object.entries(MEDIOS).map(([k, [t]]) => <option key={k} value={k}>{t}</option>)}</select>
        </label>
        <label className="text-sm">Estado
          <select value={f.estado} onChange={set('estado')} className="mt-1 w-full rounded-control border px-2 py-1.5"><option value="">Todos</option>{Object.entries(ESTADOS).map(([k, [t]]) => <option key={k} value={k}>{t}</option>)}</select>
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {Object.entries(MEDIOS).map(([k, [t, Icono]]) => {
          const tot = datos.totales[k]
          return (
            <div key={k} className="rounded-tarjeta border bg-white p-4">
              <p className="flex items-center gap-2 text-sm text-gray-500"><Icono className="h-4 w-4" aria-hidden /> {t}</p>
              <p className="cifra text-2xl font-semibold">{Q(tot?.total ?? 0)}</p>
              {tot && <p className="text-xs text-gray-500">{Q(tot.VERIFICADO)} verificado · <span className="text-amber-700">{Q(tot.PENDIENTE)} pendiente</span>{tot.RECHAZADO ? <span className="text-red-600"> · {Q(tot.RECHAZADO)} rechazado</span> : null}</p>}
            </div>
          )
        })}
      </div>

      <ul className="separador divide-y divide-gray-200 overflow-hidden rounded-tarjeta border bg-white">
        {datos.data.map((p) => {
          const [medio, Icono] = MEDIOS[p.medioPago] ?? [p.medioPago, CreditCard]
          const [estado, color] = ESTADOS[p.estado] ?? ESTADOS.PENDIENTE
          return (
            <li key={p.id}>
              <button type="button" onClick={() => setAbierto(p)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50">
                <Icono className="h-5 w-5 shrink-0 text-gray-400" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{medio}{p.referencia ? ` · ${p.referencia}` : ' · sin número'}{p.banco ? ` · ${p.banco}` : ''}</span>
                  <span className="block truncate text-xs text-gray-500">Venta {p.venta.serie}-{p.venta.numero} · {new Date(p.venta.fecha).toLocaleString('es-GT', { dateStyle: 'short', timeStyle: 'short' })} · {cliente(p.venta.cliente)} · {p.venta.vendedor?.nombre}</span>
                </span>
                <span className="cifra shrink-0 font-semibold">{Q(p.monto)}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>{estado}</span>
              </button>
            </li>
          )
        })}
        {!datos.data.length && !cargando && <li className="px-4 py-10 text-center text-sm text-gray-500">No hay cobros con esos filtros.</li>}
      </ul>

      {abierto && <Verificar pago={abierto} onCerrar={() => setAbierto(null)} onListo={() => { setAbierto(null); cargar() }} />}
    </div>
  )
}

function Verificar({ pago, onCerrar, onListo }) {
  const [f, setF] = useState({ referencia: pago.referencia ?? '', banco: pago.banco ?? '', nota: pago.nota ?? '', comprobanteId: pago.comprobanteId ?? null })
  const [subiendo, setSubiendo] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const conBanco = pago.medioPago !== 'TARJETA'

  const subir = async (archivo) => {
    if (!archivo) return
    setSubiendo(true)
    try { const id = await subirArchivo(archivo, { maxLado: 1600, calidad: 0.75 }); setF((x) => ({ ...x, comprobanteId: id })) }
    catch (e) { showToast({ type: 'error', message: errorApi(e).mensaje }) } finally { setSubiendo(false) }
  }
  const guardar = async (estado) => {
    setEnviando(true)
    try {
      const { data } = await api.put(`/cobros/${pago.id}`, { estado, referencia: f.referencia || null, banco: f.banco || null, nota: f.nota || null, comprobanteId: f.comprobanteId })
      showToast({ type: 'success', message: data.message })
      onListo()
    } catch (e) { showToast({ type: 'error', message: errorApi(e).mensaje }) } finally { setEnviando(false) }
  }

  return (
    <Modal abierto titulo={`${MEDIOS[pago.medioPago]?.[0] ?? pago.medioPago} por ${Q(pago.monto)}`} onCerrar={onCerrar} ancho="max-w-lg"
      pie={<>
        {pago.estado !== 'PENDIENTE' && <button type="button" disabled={enviando} onClick={() => guardar('PENDIENTE')} className="mr-auto text-sm text-gray-600 underline">Volver a pendiente</button>}
        <button type="button" disabled={enviando || subiendo || f.nota.trim().length < 5} onClick={() => guardar('RECHAZADO')} title="Requiere una nota" className="rounded-control border border-red-300 px-4 py-2 text-red-700 disabled:opacity-40">Rechazado</button>
        <button type="button" disabled={enviando || subiendo || !f.referencia.trim()} onClick={() => guardar('VERIFICADO')} className="rounded-control bg-green-600 px-4 py-2 font-medium text-white disabled:opacity-50">Verificado</button>
      </>}>
      <p className="mb-3 text-sm text-gray-600">Venta {pago.venta.serie}-{pago.venta.numero} del {new Date(pago.venta.fecha).toLocaleString('es-GT', { dateStyle: 'medium', timeStyle: 'short' })} · {cliente(pago.venta.cliente)}</p>
      <div className="space-y-3 text-sm">
        <label className="block">{pago.medioPago === 'TARJETA' ? 'Número de voucher o autorización' : pago.medioPago === 'CHEQUE' ? 'Número de cheque' : 'Número de transferencia'}
          <input value={f.referencia} onChange={set('referencia')} maxLength={60} className="mt-1 w-full rounded-control border px-3 py-2" />
        </label>
        {conBanco && (
          <label className="block">Banco
            <select value={f.banco} onChange={set('banco')} className="mt-1 w-full rounded-control border px-3 py-2"><option value="">Elegir…</option>{BANCOS.map((b) => <option key={b} value={b}>{b}</option>)}</select>
          </label>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-1 font-medium text-green-700"><FileImage className="h-4 w-4" /> {subiendo ? 'Subiendo…' : f.comprobanteId ? 'Cambiar foto del comprobante' : 'Adjuntar foto del comprobante'}
            <input type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => { subir(e.target.files?.[0]); e.target.value = '' }} />
          </label>
          {f.comprobanteId && <button type="button" onClick={() => verArchivo(f.comprobanteId)} className="text-gray-600 underline">Ver comprobante</button>}
        </div>
        <label className="block">Nota {pago.estado === 'RECHAZADO' || '(obligatoria para rechazar)'}
          <textarea value={f.nota} onChange={set('nota')} rows={2} maxLength={300} placeholder="Por ejemplo: cheque devuelto por fondos insuficientes" className="mt-1 w-full rounded-control border px-3 py-2" />
        </label>
      </div>
    </Modal>
  )
}
