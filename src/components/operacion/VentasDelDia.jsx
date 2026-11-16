import { useNavigate } from 'react-router-dom'
// ─────────────────────────────────────────────────────────────────────────────
// VENTAS Y COTIZACIONES (reemplaza MantanimientoVentaUI)
// Consulta por rango, detalle, anulación (mismo día, caja abierta),
// devolución parcial/total, conversión de cotización y reintento FEL.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react'
import { RotateCcw, Ban, FileCheck2, ArrowRightLeft, RefreshCw, Share2, ListChecks } from 'lucide-react'
import api from '../../services/api'
import { usePermisos } from '../../hooks/usePermisos'
import { showToast } from '../../utils/showToast'
import { Q, errorApi } from '../pos/formato'
import Modal from '../comun/Modal'
import { conAutorizacion, useAutorizacion } from '../comun/AutorizacionSupervisor'
import BotonPantallaCompleta from '../comun/BotonPantallaCompleta'
import { imprimirTicket } from '../../utils/ticket'
import EnviarDocumento from './EnviarDocumento'

const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(new Date())
const COLOR_ESTADO = { CONFIRMADA: 'bg-green-100 text-green-800', ANULADA: 'bg-red-100 text-red-800', CONVERTIDA: 'bg-blue-100 text-blue-800', VENCIDA: 'bg-gray-100 text-gray-600', BORRADOR: 'bg-gray-100 text-gray-600' }
const COLOR_FEL = { CERTIFICADO: 'text-green-700', PENDIENTE: 'text-amber-600', ERROR: 'text-red-600', ANULADO: 'text-gray-500', NO_APLICA: 'text-gray-400' }
const nombreCliente = (c) => c?.razonSocial || [c?.nombres, c?.apellidos].filter(Boolean).join(' ') || 'Consumidor final'

export default function VentasDelDia() {
  const navigate = useNavigate()
  const { puede } = usePermisos()
  const [filtros, setFiltros] = useState({ desde: hoy(), hasta: hoy(), tipo: 'VENTA', estado: '', q: '' })
  const [ventas, setVentas] = useState([])
  const [cargando, setCargando] = useState(false)
  const [compartiendo, setCompartiendo] = useState(null) // documento que se comparte (PDF, Word, WhatsApp, correo)
  const [detalle, setDetalle] = useState(null)
  const [accion, setAccion] = useState(null) // 'anular' | 'devolver' | 'convertir' | 'lista'
  const [version, setVersion] = useState(0) // para refrescar las listas reutilizables
  // Sin permiso propio, anular/devolver piden la autorización de un encargado
  const { pedirAutorizacion, modalAutorizacion } = useAutorizacion()

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const params = Object.fromEntries(Object.entries({ ...filtros, limit: 0 }).filter(([, v]) => v !== ''))
      const { data } = await api.get('/ventas', { params })
      setVentas(data.data)
    } catch (e) {
      showToast({ type: 'error', message: errorApi(e).mensaje })
    } finally {
      setCargando(false)
    }
  }, [filtros])

  useEffect(() => { cargar() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const abrir = async (id) => {
    try {
      const { data } = await api.get(`/ventas/${id}`)
      setDetalle(data.data)
    } catch (e) {
      showToast({ type: 'error', message: errorApi(e).mensaje })
    }
  }

  const despues = async (mensaje) => {
    showToast({ type: 'success', message: mensaje })
    setAccion(null)
    setVersion((n) => n + 1)
    await cargar()
    if (detalle) await abrir(detalle.id)
  }

  const emitirFel = async () => {
    try {
      await api.post(`/ventas/${detalle.id}/fel/emitir`)
      await despues('Factura FEL emitida')
    } catch (e) {
      showToast({ type: 'error', message: errorApi(e).mensaje })
    }
  }

  const reintentarFel = async () => {
    try {
      await api.post(`/ventas/${detalle.id}/fel/reintentar`)
      await despues('Reintento FEL enviado')
    } catch (e) {
      showToast({ type: 'error', message: errorApi(e).mensaje })
    }
  }

  const totalConfirmado = ventas.filter((v) => v.estado === 'CONFIRMADA').reduce((a, v) => a + Number(v.total), 0)

  return (
    <div className="p-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4">
        <label className="text-sm">Desde<input type="date" value={filtros.desde} onChange={(e) => setFiltros((f) => ({ ...f, desde: e.target.value }))} className="mt-1 block rounded border px-2 py-1.5" /></label>
        <label className="text-sm">Hasta<input type="date" value={filtros.hasta} onChange={(e) => setFiltros((f) => ({ ...f, hasta: e.target.value }))} className="mt-1 block rounded border px-2 py-1.5" /></label>
        <label className="text-sm">Tipo
          <select value={filtros.tipo} onChange={(e) => setFiltros((f) => ({ ...f, tipo: e.target.value }))} className="mt-1 block rounded border px-2 py-1.5">
            <option value="VENTA">Ventas</option><option value="COTIZACION">Cotizaciones</option><option value="">Todas</option>
          </select>
        </label>
        <label className="text-sm">Estado
          <select value={filtros.estado} onChange={(e) => setFiltros((f) => ({ ...f, estado: e.target.value }))} className="mt-1 block rounded border px-2 py-1.5">
            <option value="">Todos</option><option value="CONFIRMADA">Confirmadas</option><option value="ANULADA">Anuladas</option><option value="CONVERTIDA">Convertidas</option>
          </select>
        </label>
        <label className="flex-1 text-sm">Buscar<input value={filtros.q} onChange={(e) => setFiltros((f) => ({ ...f, q: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && cargar()} placeholder="Número, NIT o cliente" className="mt-1 block w-full rounded border px-2 py-1.5" /></label>
        <button type="button" onClick={cargar} disabled={cargando} className="flex items-center gap-2 rounded-lg bg-green-700 px-4 py-2 text-white disabled:opacity-50"><RefreshCw className="h-4 w-4" /> {cargando ? 'Buscando…' : 'Buscar'}</button>
        <BotonPantallaCompleta vista="ventas" />
      </div>

      <p className="mt-3 text-sm text-gray-600">{ventas.length} documentos · Confirmado: <strong>{Q(totalConfirmado)}</strong></p>
      <ListasReutilizables version={version} onAbrir={abrir} />

      <div className="mt-2 overflow-auto rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr><th className="px-3 py-2">Documento</th><th className="px-3 py-2">Fecha</th><th className="px-3 py-2">Cliente</th><th className="px-3 py-2">Vendedor</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2">Estado</th><th className="px-3 py-2">FEL</th></tr>
          </thead>
          <tbody>
            {ventas.map((v) => (
              <tr key={v.id} onClick={() => abrir(v.id)} className="cursor-pointer border-t hover:bg-green-50">
                <td className="px-3 py-2 font-medium">{v.serie}-{v.numero}</td>
                <td className="px-3 py-2">{new Date(v.fecha).toLocaleString('es-GT', { dateStyle: 'short', timeStyle: 'short' })}</td>
                <td className="px-3 py-2">{v.cliente?.nit} · {nombreCliente(v.cliente)}</td>
                <td className="px-3 py-2">{v.vendedor?.nombre}</td>
                <td className="px-3 py-2 text-right tabular-nums">{Q(v.total)}</td>
                <td className="px-3 py-2"><span className={`rounded px-2 py-0.5 text-xs ${COLOR_ESTADO[v.estado] ?? ''}`}>{v.estado}</span></td>
                <td className={`px-3 py-2 text-xs ${COLOR_FEL[v.felEstado] ?? ''}`}>{v.felEstado}</td>
              </tr>
            ))}
            {!ventas.length && !cargando && <tr><td colSpan={7} className="py-10 text-center text-gray-500">Sin documentos en el rango</td></tr>}
          </tbody>
        </table>
      </div>

      {/* ── Detalle ─────────────────────────────────────────────────────── */}
      <Modal
        abierto={Boolean(detalle) && !accion}
        titulo={detalle ? `${detalle.tipo === 'VENTA' ? 'Venta' : detalle.reutilizable ? `Lista reutilizable${detalle.nombreLista ? ` «${detalle.nombreLista}»` : ''}` : 'Cotización'} ${detalle.serie}-${detalle.numero}` : ''}
        onCerrar={() => setDetalle(null)}
        ancho="max-w-3xl"
        pie={detalle && (
          <>
            {detalle.tipo === 'VENTA' && detalle.estado === 'CONFIRMADA' && detalle.felEstado === 'NO_APLICA' && puede('ventas.crear') && <button type="button" onClick={emitirFel} className="flex items-center gap-1 rounded-lg bg-green-700 px-3 py-2 text-white"><FileCheck2 className="h-4 w-4" /> Emitir FEL</button>}
            <button type="button" onClick={async () => { if (!(await imprimirTicket(detalle.id))) showToast({ type: 'error', message: 'No se pudo imprimir el ticket' }) }} className="rounded-lg border px-3 py-2">Imprimir ticket</button>
            {detalle.estado !== 'BORRADOR' && <button type="button" onClick={() => setCompartiendo(detalle)} className="mr-auto flex items-center gap-1 rounded-lg border px-3 py-2"><Share2 className="h-4 w-4" /> PDF, Word o WhatsApp</button>}
            {detalle.tipo === 'VENTA' && ['ERROR', 'PENDIENTE'].includes(detalle.felEstado) && <button type="button" onClick={reintentarFel} className="flex items-center gap-1 rounded-lg border px-3 py-2"><FileCheck2 className="h-4 w-4" /> Reintentar FEL</button>}
            {detalle.tipo === 'COTIZACION' && detalle.estado === 'CONFIRMADA' && puede('ventas.crear') && <button type="button" onClick={() => navigate(`/home/pos?cotizacion=${detalle.id}`)} className="flex items-center gap-1 rounded-lg border px-3 py-2"><ArrowRightLeft className="h-4 w-4" /> Convertir en venta</button>}
            {detalle.tipo === 'COTIZACION' && detalle.estado === 'CONFIRMADA' && puede('ventas.cotizar') && <button type="button" onClick={() => setAccion('lista')} className="flex items-center gap-1 rounded-lg border px-3 py-2"><ListChecks className="h-4 w-4" /> {detalle.reutilizable ? 'Lista' : 'Hacer lista reutilizable'}</button>}
            {detalle.tipo === 'VENTA' && detalle.estado === 'CONFIRMADA' && <button type="button" onClick={() => setAccion('devolver')} className="flex items-center gap-1 rounded-lg border px-3 py-2"><RotateCcw className="h-4 w-4" /> Devolución</button>}
            {detalle.estado === 'CONFIRMADA' && <button type="button" onClick={() => setAccion('anular')} className="flex items-center gap-1 rounded-lg bg-red-600 px-3 py-2 text-white"><Ban className="h-4 w-4" /> Anular</button>}
          </>
        )}
      >
        {detalle && (
          <>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm md:grid-cols-3">
              <div><dt className="text-gray-500">Cliente</dt><dd>{detalle.cliente?.nit} · {nombreCliente(detalle.cliente)}</dd></div>
              <div><dt className="text-gray-500">Vendedor</dt><dd>{detalle.vendedor?.nombre}</dd></div>
              <div><dt className="text-gray-500">Fecha</dt><dd>{new Date(detalle.fecha).toLocaleString('es-GT')}</dd></div>
              <div><dt className="text-gray-500">Estado</dt><dd>{detalle.estado}{detalle.motivoAnulacion ? ` — ${detalle.motivoAnulacion}` : ''}</dd></div>
              <div><dt className="text-gray-500">FEL</dt><dd className={COLOR_FEL[detalle.felEstado]}>{detalle.felEstado}{detalle.felNumero ? ` · ${detalle.felSerie}-${detalle.felNumero}` : ''}</dd></div>
              {detalle.validaHasta && <div><dt className="text-gray-500">Válida hasta</dt><dd>{detalle.validaHasta.slice(0, 10)}</dd></div>}
            </dl>
            <table className="mt-4 w-full text-sm">
              <thead className="text-left text-gray-600"><tr><th className="py-1">Producto</th><th className="text-right">Cant.</th><th className="text-right">Precio</th><th className="text-right">Desc.</th><th className="text-right">Subtotal</th></tr></thead>
              <tbody>
                {detalle.detalles.map((d) => (
                  <tr key={d.id} className="border-t"><td className="py-1.5">{d.descripcion}</td><td className="text-right">{Number(d.cantidad)}</td><td className="text-right">{Q(d.precioLista)}</td><td className="text-right">{Number(d.porcentajeDescuento)}%</td><td className="text-right tabular-nums">{Q(d.subtotal)}</td></tr>
                ))}
              </tbody>
              <tfoot className="font-semibold"><tr className="border-t-2"><td colSpan={4} className="py-2 text-right">Total</td><td className="text-right tabular-nums">{Q(detalle.total)}</td></tr></tfoot>
            </table>
            {detalle.pagos?.length > 0 && <p className="mt-2 text-sm text-gray-600">Pagos: {detalle.pagos.map((p) => `${p.medioPago} ${Q(p.monto)}`).join(' · ')} · Cambio {Q(detalle.cambio)}</p>}
            {detalle.devoluciones?.length > 0 && <p className="mt-1 text-sm text-amber-700">Devoluciones: {detalle.devoluciones.map((d) => `${Q(d.total)} (${d.motivo})`).join(' · ')}</p>}
          </>
        )}
      </Modal>

      {accion === 'anular' && <Anular venta={detalle} pedir={pedirAutorizacion} onCerrar={() => setAccion(null)} onListo={despues} />}
      {accion === 'devolver' && <Devolver venta={detalle} pedir={pedirAutorizacion} onCerrar={() => setAccion(null)} onListo={despues} />}
      {accion === 'convertir' && <Convertir venta={detalle} onCerrar={() => setAccion(null)} onListo={despues} />}
      {accion === 'lista' && <MarcarLista venta={detalle} onCerrar={() => setAccion(null)} onListo={despues} />}
      {modalAutorizacion}
      {compartiendo && <EnviarDocumento venta={compartiendo} onCerrar={() => setCompartiendo(null)} />}
    </div>
  )
}

function Anular({ venta, pedir, onCerrar, onListo }) {
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const enviar = async () => {
    setEnviando(true)
    try {
      const r = await conAutorizacion(
        (autorizacion) => api.post(`/ventas/${venta.id}/anular`, { motivo, autorizacion }),
        { permiso: 'ventas.anular', detalle: `Anular ${venta.serie}-${venta.numero} por ${Q(venta.total)}`, pedir },
      )
      if (r) await onListo('Documento anulado')
    } catch (e) {
      showToast({ type: 'error', message: errorApi(e).mensaje })
    } finally { setEnviando(false) }
  }
  return (
    <Modal abierto titulo={`Anular ${venta.serie}-${venta.numero}`} onCerrar={onCerrar} ancho="max-w-md"
      pie={<><button type="button" onClick={onCerrar} className="rounded-lg border px-3 py-2">Cancelar</button><button type="button" disabled={motivo.trim().length < 10 || enviando} onClick={enviar} className="rounded-lg bg-red-600 px-3 py-2 text-white disabled:opacity-50">Anular</button></>}>
      <p className="text-sm text-gray-600">Solo se anulan ventas del día con la caja aún abierta. En otros casos registre una devolución.</p>
      <label htmlFor="motivo" className="mt-3 block text-sm">Motivo (mín. 10 caracteres)</label>
      <textarea id="motivo" rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" />
    </Modal>
  )
}

function Devolver({ venta, pedir, onCerrar, onListo }) {
  const devuelto = (productoId) => venta.devoluciones.flatMap((d) => d.detalles).filter((x) => x.productoId === productoId).reduce((a, x) => a + Number(x.cantidad), 0)
  const [cantidades, setCantidades] = useState({})
  const [motivo, setMotivo] = useState('')
  const [reingresa, setReingresa] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const lineas = Object.entries(cantidades).filter(([, c]) => Number(c) > 0).map(([productoId, cantidad]) => ({ productoId: Number(productoId), cantidad: Number(cantidad) }))
  const total = lineas.reduce((a, l) => a + l.cantidad * Number(venta.detalles.find((d) => d.productoId === l.productoId).precioUnitario), 0)

  const enviar = async () => {
    setEnviando(true)
    try {
      const r = await conAutorizacion(
        (autorizacion) => api.post(`/ventas/${venta.id}/devoluciones`, { motivo, reingresaInventario: reingresa, lineas, autorizacion }),
        { permiso: 'ventas.devolver', detalle: `Devolución de ${venta.serie}-${venta.numero} por ${Q(total)}`, pedir },
      )
      if (r) await onListo(r.data.message)
    } catch (e) {
      showToast({ type: 'error', message: errorApi(e).mensaje })
    } finally { setEnviando(false) }
  }

  return (
    <Modal abierto titulo={`Devolución de ${venta.serie}-${venta.numero}`} onCerrar={onCerrar} ancho="max-w-2xl"
      pie={<><button type="button" onClick={onCerrar} className="rounded-lg border px-3 py-2">Cancelar</button><button type="button" disabled={!lineas.length || motivo.trim().length < 5 || enviando} onClick={enviar} className="rounded-lg bg-green-700 px-3 py-2 text-white disabled:opacity-50">Devolver {Q(total)}</button></>}>
      <p className="text-sm text-gray-600">El efectivo sale de <strong>su caja abierta</strong> y queda reflejado en el cuadre.</p>
      <table className="mt-3 w-full text-sm">
        <thead className="text-left text-gray-600"><tr><th>Producto</th><th className="text-right">Vendido</th><th className="text-right">Devuelto</th><th className="text-right">A devolver</th></tr></thead>
        <tbody>
          {venta.detalles.map((d) => {
            const max = Number(d.cantidad) - devuelto(d.productoId)
            return (
              <tr key={d.id} className="border-t">
                <td className="py-1.5">{d.descripcion}</td><td className="text-right">{Number(d.cantidad)}</td><td className="text-right">{devuelto(d.productoId)}</td>
                <td className="text-right"><input type="number" min="0" max={max} step="1" disabled={max <= 0} value={cantidades[d.productoId] ?? ''} onChange={(e) => setCantidades((c) => ({ ...c, [d.productoId]: Math.min(max, Math.max(0, Number(e.target.value))) }))} className="w-20 rounded border px-2 py-1 text-right" aria-label={`Cantidad a devolver de ${d.descripcion}`} /></td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={reingresa} onChange={(e) => setReingresa(e.target.checked)} /> Reingresar mercadería al inventario (desmarque si viene dañada)</label>
      <label htmlFor="motivo-dev" className="mt-3 block text-sm">Motivo</label>
      <input id="motivo-dev" value={motivo} onChange={(e) => setMotivo(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" />
    </Modal>
  )
}

function Convertir({ venta, onCerrar, onListo }) {
  // Lista reutilizable: cada comprador lleva solo lo que necesita (la lista queda abierta para el siguiente)
  const lista = Boolean(venta.reutilizable)
  const [sel, setSel] = useState(() => Object.fromEntries((venta.detalles ?? []).map((d) => [d.productoId, { marcado: true, cantidad: Number(d.cantidad) }])))
  const estimado = (venta.detalles ?? []).reduce((a, d) => a + (sel[d.productoId]?.marcado ? Number(d.precioUnitario) * Number(sel[d.productoId].cantidad || 0) : 0), 0)
  const [monto, setMonto] = useState(Number(venta.total).toFixed(2))
  useEffect(() => { if (lista) setMonto(estimado.toFixed(2)) }, [estimado, lista])
  const [conFel, setConFel] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const enviar = async () => {
    const lineas = lista ? (venta.detalles ?? []).filter((d) => sel[d.productoId]?.marcado && Number(sel[d.productoId].cantidad) > 0).map((d) => ({ productoId: d.productoId, cantidad: Number(sel[d.productoId].cantidad) })) : undefined
    if (lista && !lineas.length) { showToast({ type: 'error', message: 'Marque al menos un producto de la lista' }); return }
    setEnviando(true)
    try {
      const { data } = await api.post(`/ventas/${venta.id}/convertir`, { pagos: [{ medioPago: 'EFECTIVO', monto: Number(monto) }], emitirFel: conFel, ...(lineas ? { lineas } : {}) })
      await onListo(`Venta ${data.data.serie}-${data.data.numero} creada. Cambio ${Q(data.data.cambio)}${lista ? '. La lista sigue abierta para el siguiente comprador' : ''}`)
    } catch (e) {
      showToast({ type: 'error', message: errorApi(e).mensaje })
    } finally { setEnviando(false) }
  }
  return (
    <Modal abierto titulo={`${lista ? 'Vender la lista' : 'Convertir'} ${venta.serie}-${venta.numero}${lista ? '' : ' en venta'}`} onCerrar={onCerrar} ancho={lista ? 'max-w-lg' : 'max-w-md'}
      pie={<><button type="button" onClick={onCerrar} className="rounded-lg border px-3 py-2">Cancelar</button><button type="button" disabled={enviando} onClick={enviar} className="rounded-lg bg-green-700 px-3 py-2 text-white disabled:opacity-50">{enviando ? 'Procesando…' : 'Cobrar'}</button></>}>
      <p className="text-sm text-gray-600">Los precios se recalculan a hoy. Requiere su caja abierta. Para pagos mixtos use el POS.</p>
      {lista && (
        <fieldset className="mt-3">
          <legend className="text-sm font-medium">¿Qué lleva este comprador?</legend>
          <ul className="mt-1 max-h-64 divide-y overflow-auto rounded-lg border">
            {(venta.detalles ?? []).map((d) => (
              <li key={d.productoId} className="flex items-center gap-2 px-3 py-2 text-sm">
                <input type="checkbox" checked={Boolean(sel[d.productoId]?.marcado)} onChange={(e) => setSel((x) => ({ ...x, [d.productoId]: { ...x[d.productoId], marcado: e.target.checked } }))} aria-label={`Lleva ${d.descripcion}`} className="accent-green-600" />
                <span className="min-w-0 flex-1">{d.descripcion}</span>
                <input type="number" min="0" step="any" value={sel[d.productoId]?.cantidad ?? 0} onChange={(e) => setSel((x) => ({ ...x, [d.productoId]: { ...x[d.productoId], cantidad: e.target.value } }))} aria-label={`Cantidad de ${d.descripcion}`} className="w-20 rounded border px-2 py-1 text-right" />
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-gray-500">Total estimado: {Q(estimado)}. La lista queda abierta para el siguiente comprador.</p>
        </fieldset>
      )}
      <label htmlFor="monto" className="mt-3 block text-sm">Efectivo recibido (Q)</label>
      <input id="monto" type="number" step="0.01" min="0" value={monto} onChange={(e) => setMonto(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-right" />
      <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={conFel} onChange={(e) => setConFel(e.target.checked)} /> Emitir factura electrónica (FEL)</label>
    </Modal>
  )
}

/** Marcar una cotización como lista reutilizable (o quitarla), con su nombre y los compradores esperados. */
function MarcarLista({ venta, onCerrar, onListo }) {
  const [f, setF] = useState({ reutilizable: true, nombre: venta.nombreLista ?? '', esperados: venta.compradoresEsperados ?? '' })
  const [enviando, setEnviando] = useState(false)
  const guardar = async () => {
    setEnviando(true)
    try {
      const { data } = await api.put(`/ventas/${venta.id}/lista`, { reutilizable: f.reutilizable, nombreLista: f.nombre.trim() || null, compradoresEsperados: Number(f.esperados) > 0 ? Math.round(Number(f.esperados)) : null })
      await onListo(data.message)
    } catch (e) { showToast({ type: 'error', message: errorApi(e).mensaje }) } finally { setEnviando(false) }
  }
  return (
    <Modal abierto titulo="Lista reutilizable" onCerrar={onCerrar} ancho="max-w-md"
      pie={<><button type="button" onClick={onCerrar} className="rounded-lg border px-3 py-2">Cancelar</button><button type="button" disabled={enviando} onClick={guardar} className="rounded-lg bg-green-700 px-4 py-2 text-white disabled:opacity-50">Guardar</button></>}>
      <p className="text-sm text-gray-600">Una lista reutilizable (por ejemplo la lista de útiles de un colegio) se vende a varios compradores: cada venta lleva lo que esa persona necesita y la lista sigue abierta. Para cerrarla, anúlela.</p>
      <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={f.reutilizable} onChange={(e) => setF((x) => ({ ...x, reutilizable: e.target.checked }))} className="accent-green-600" /> Es una lista reutilizable</label>
      {f.reutilizable && <div className="mt-3 space-y-3 text-sm">
        <label className="block">Nombre de la lista<input value={f.nombre} onChange={(e) => setF((x) => ({ ...x, nombre: e.target.value }))} maxLength={120} placeholder="Ej. Colegio Belén 3.º primaria" className="mt-1 w-full rounded border px-3 py-2" /></label>
        <label className="block">Compradores esperados <span className="text-gray-500">(opcional: con esto «Qué comprar» calcula lo que falta)</span><input type="number" min="1" value={f.esperados} onChange={(e) => setF((x) => ({ ...x, esperados: e.target.value }))} className="mt-1 w-32 rounded border px-3 py-2 text-right" /></label>
      </div>}
    </Modal>
  )
}

/** Listas reutilizables abiertas: cuántas veces se han vendido. */
function ListasReutilizables({ version, onAbrir }) {
  const [listas, setListas] = useState([])
  useEffect(() => { api.get('/ventas/listas/reutilizables').then(({ data }) => setListas(data.data ?? [])).catch(() => setListas([])) }, [version])
  if (!listas.length) return null
  return (
    <section className="mt-3 rounded-xl border bg-white p-3" aria-label="Listas reutilizables">
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><ListChecks className="h-4 w-4 text-green-700" /> Listas reutilizables</h3>
      <ul className="flex flex-wrap gap-2">
        {listas.map((l) => (
          <li key={l.id}><button type="button" onClick={() => onAbrir(l.id)} className="rounded-lg border px-3 py-2 text-left text-sm hover:bg-green-50">
            <span className="block font-medium">{l.nombreLista || `${l.serie}-${l.numero}`}</span>
            <span className="text-xs text-gray-500">{l.lineas} productos · {Q(l.total)} · vendida {l.usos}{l.compradoresEsperados ? ` de ${l.compradoresEsperados}` : ''} {l.usos === 1 ? 'vez' : 'veces'}</span>
          </button></li>
        ))}
      </ul>
    </section>
  )
}
