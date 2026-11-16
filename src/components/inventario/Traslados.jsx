// ─────────────────────────────────────────────────────────────────────────────
// TRASLADOS entre bodegas y sucursales, en dos pasos:
//   ENVIAR: sale de la bodega de origen y queda "en tránsito" (se imprime la guía).
//   RECIBIR: entra a la bodega destino lo que realmente llegó; lo que falte queda registrado.
// Mientras está en tránsito, el origen puede anularlo y la mercadería regresa.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowRight, PackageCheck, Plus, Printer, Trash2, Truck, XCircle } from 'lucide-react'
import api from '../../services/api'
import { usePermisos } from '../../hooks/usePermisos'
import { showToast } from '../../utils/showToast'
import { imprimirGuia } from '../../utils/guiaTraslado'
import { errorApi } from '../pos/formato'
import Modal from '../comun/Modal'
import BuscadorProducto from '../comun/BuscadorProducto'

const num = (n) => Number(n ?? 0).toLocaleString('es-GT', { maximumFractionDigits: 3 })
const fecha = (f) => (f ? new Date(f).toLocaleString('es-GT', { dateStyle: 'medium', timeStyle: 'short' }) : '—')
const VISTAS = [['por-recibir', 'Por recibir'], ['enviados', 'Enviados'], ['todos', 'Todos']]

function Estado({ t }) {
  const [texto, color] = t.estado === 'EN_TRANSITO' ? ['En tránsito', 'bg-amber-50 text-amber-700']
    : t.estado === 'ANULADO' ? ['Anulado', 'bg-gray-100 text-gray-600']
    : t.conDiferencias ? ['Recibido con diferencias', 'bg-red-50 text-red-700'] : ['Recibido', 'bg-green-50 text-green-700']
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>{texto}</span>
}

export default function Traslados() {
  const { puede } = usePermisos()
  const [params, setParams] = useSearchParams()
  const vista = VISTAS.some(([v]) => v === params.get('vista')) ? params.get('vista') : 'por-recibir'
  const [lista, setLista] = useState([])
  const [cargando, setCargando] = useState(true)
  const [nuevo, setNuevo] = useState(false)
  const [recibiendo, setRecibiendo] = useState(null)
  const [anulando, setAnulando] = useState(null)

  const cargar = useCallback(() => {
    setCargando(true)
    return api.get('/inventario/traslados', { params: { vista } })
      .then(({ data }) => setLista(data.data))
      .catch((e) => showToast({ type: 'error', message: errorApi(e).mensaje }))
      .finally(() => setCargando(false))
  }, [vista])
  useEffect(() => { cargar() }, [cargar])

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-control bg-gray-200 p-0.5 text-sm" role="tablist">
          {VISTAS.map(([v, t]) => (
            <button key={v} type="button" role="tab" aria-selected={vista === v} onClick={() => setParams({ vista: v }, { replace: true })}
              className={`rounded-[6px] px-3 py-1.5 ${vista === v ? 'bg-white font-medium shadow-sm' : 'text-gray-600'}`}>{t}</button>
          ))}
        </div>
        {puede('inventario.trasladar') && <button type="button" onClick={() => setNuevo(true)} className="inline-flex items-center gap-1 rounded-control bg-green-600 px-3 py-2 text-sm font-medium text-white"><Plus className="h-4 w-4" /> Nuevo traslado</button>}
      </div>

      <ul className="space-y-3">
        {lista.map((t) => (
          <li key={t.id} className="rounded-tarjeta border bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold">Traslado #{t.id}</p>
                <p className="flex flex-wrap items-center gap-1 text-sm text-gray-700">
                  {t.sucursalOrigen?.nombre} · {t.bodegaOrigen} <ArrowRight className="h-3.5 w-3.5 text-gray-400" aria-label="hacia" /> {t.sucursalDestino?.nombre} · {t.bodegaDestino}
                </p>
                <p className="text-xs text-gray-500">Enviado {fecha(t.fechaEnvio)} por {t.usuarioEnvia}{t.fechaRecepcion ? ` · Recibido ${fecha(t.fechaRecepcion)} por ${t.usuarioRecibe}` : ''}</p>
              </div>
              <Estado t={t} />
            </div>
            <ul className="mt-3 divide-y divide-gray-100 text-sm">
              {t.detalles.map((d) => {
                const falta = d.cantidadRecibida != null && Number(d.cantidadRecibida) < Number(d.cantidad)
                return (
                  <li key={d.id} className="flex justify-between gap-3 py-1.5">
                    <span className="min-w-0 truncate">{d.producto.nombre} <span className="text-xs text-gray-500">{d.producto.sku}</span></span>
                    <span className="cifra shrink-0">{num(d.cantidad)}{falta && <span className="ml-2 font-medium text-red-600">llegaron {num(d.cantidadRecibida)}</span>}</span>
                  </li>
                )
              })}
            </ul>
            {t.observacion && <p className="mt-2 text-sm text-gray-600"><b>Nota del envío:</b> {t.observacion}</p>}
            {t.observacionRecepcion && <p className="mt-1 text-sm text-red-700"><b>Al recibir:</b> {t.observacionRecepcion}</p>}
            {t.motivoAnulacion && <p className="mt-1 text-sm text-gray-600"><b>Anulado:</b> {t.motivoAnulacion}</p>}
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => imprimirGuia(t)} className="inline-flex items-center gap-1 rounded-control border px-3 py-1.5 text-sm"><Printer className="h-4 w-4" /> Guía</button>
              {t.estado === 'EN_TRANSITO' && t.esOrigen && puede('inventario.trasladar') && <button type="button" onClick={() => setAnulando(t)} className="inline-flex items-center gap-1 rounded-control border px-3 py-1.5 text-sm text-red-700"><XCircle className="h-4 w-4" /> Anular</button>}
              {t.estado === 'EN_TRANSITO' && t.esDestino && puede('inventario.trasladar') && <button type="button" onClick={() => setRecibiendo(t)} className="inline-flex items-center gap-1 rounded-control bg-green-600 px-3 py-1.5 text-sm font-medium text-white"><PackageCheck className="h-4 w-4" /> Recibir</button>}
            </div>
          </li>
        ))}
        {!lista.length && !cargando && (
          <li className="rounded-tarjeta border bg-white px-4 py-12 text-center text-sm text-gray-500">
            <Truck className="mx-auto mb-2 h-8 w-8 text-gray-300" aria-hidden />
            {vista === 'por-recibir' ? 'No hay traslados por recibir.' : 'Aún no hay traslados.'}
          </li>
        )}
      </ul>

      {nuevo && <NuevoTraslado onCerrar={() => setNuevo(false)} onEnviado={(t) => { setNuevo(false); setParams({ vista: 'enviados' }, { replace: true }); cargar(); if (t) imprimirGuia(t) }} />}
      {recibiendo && <Recibir t={recibiendo} onCerrar={() => setRecibiendo(null)} onListo={() => { setRecibiendo(null); cargar() }} />}
      {anulando && <Anular t={anulando} onCerrar={() => setAnulando(null)} onListo={() => { setAnulando(null); cargar() }} />}
    </div>
  )
}

function NuevoTraslado({ onCerrar, onEnviado }) {
  const [origenes, setOrigenes] = useState([])
  const [destinos, setDestinos] = useState([])
  const [f, setF] = useState({ bodegaOrigenId: '', bodegaDestinoId: '', observacion: '' })
  const [lineas, setLineas] = useState([])
  const [enviando, setEnviando] = useState(false)
  const [imprimir, setImprimir] = useState(true)

  useEffect(() => {
    api.get('/catalogos/bodegas', { params: { limit: 0 } }).then(({ data }) => {
      const activas = data.data.filter((b) => b.activo !== false)
      setOrigenes(activas)
      setF((x) => ({ ...x, bodegaOrigenId: x.bodegaOrigenId || String(activas[0]?.id ?? '') }))
    }).catch(() => {})
    api.get('/inventario/traslados/destinos').then(({ data }) => setDestinos(data.data)).catch((e) => showToast({ type: 'error', message: errorApi(e).mensaje }))
  }, [])

  // Destinos agrupados por sucursal (sin la bodega de origen)
  const grupos = useMemo(() => {
    const g = new Map()
    for (const b of destinos) {
      if (String(b.id) === String(f.bodegaOrigenId)) continue
      if (!g.has(b.sucursal.nombre)) g.set(b.sucursal.nombre, [])
      g.get(b.sucursal.nombre).push(b)
    }
    return [...g.entries()]
  }, [destinos, f.bodegaOrigenId])

  const agregar = (p) => setLineas((ls) => (ls.some((l) => l.productoId === p.id) ? ls : [...ls, { productoId: p.id, nombre: p.nombre, sku: p.sku, existencia: p.existencia, cantidad: '' }]))
  const valido = f.bodegaOrigenId && f.bodegaDestinoId && lineas.length && lineas.every((l) => Number(l.cantidad) > 0)

  const enviar = async () => {
    setEnviando(true)
    try {
      const { data } = await api.post('/inventario/traslados', {
        bodegaOrigenId: Number(f.bodegaOrigenId), bodegaDestinoId: Number(f.bodegaDestinoId), observacion: f.observacion || undefined,
        lineas: lineas.map((l) => ({ productoId: l.productoId, cantidad: Number(l.cantidad) })),
      })
      showToast({ type: 'success', message: data.message })
      let completo = null
      if (imprimir) {
        // La guía lleva nombres de bodegas y usuario: se toma del listado ya armado por el API
        const lista = await api.get('/inventario/traslados', { params: { vista: 'enviados' } })
        completo = lista.data.data.find((t) => t.id === data.data.id) ?? null
      }
      onEnviado(completo)
    } catch (e) { showToast({ type: 'error', message: errorApi(e).mensaje }) } finally { setEnviando(false) }
  }

  return (
    <Modal abierto titulo="Nuevo traslado" onCerrar={onCerrar} ancho="max-w-3xl"
      pie={<>
        <label className="mr-auto flex items-center gap-2 text-sm"><input type="checkbox" checked={imprimir} onChange={(e) => setImprimir(e.target.checked)} /> Imprimir la guía al enviar</label>
        <button type="button" onClick={onCerrar} className="rounded-control border px-4 py-2">Cancelar</button>
        <button type="button" disabled={!valido || enviando} onClick={enviar} className="rounded-control bg-green-600 px-4 py-2 font-medium text-white disabled:opacity-50">{enviando ? 'Enviando…' : 'Enviar'}</button>
      </>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Sale de (esta sucursal)
          <select value={f.bodegaOrigenId} onChange={(e) => setF((x) => ({ ...x, bodegaOrigenId: e.target.value, bodegaDestinoId: '' }))} className="mt-1 w-full rounded-control border px-3 py-2">
            {origenes.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
          </select>
        </label>
        <label className="text-sm">Va para
          <select value={f.bodegaDestinoId} onChange={(e) => setF((x) => ({ ...x, bodegaDestinoId: e.target.value }))} className="mt-1 w-full rounded-control border px-3 py-2">
            <option value="">Elegir…</option>
            {grupos.map(([sucursal, bodegas]) => <optgroup key={sucursal} label={sucursal}>{bodegas.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}</optgroup>)}
          </select>
        </label>
      </div>
      <div className="mt-4"><BuscadorProducto onSelect={agregar} placeholder="Agregar producto por nombre, SKU o código de barras" autoFocus={false} /></div>
      <ul className="mt-3 divide-y divide-gray-100">
        {lineas.map((l, i) => (
          <li key={l.productoId} className="flex items-center gap-3 py-2">
            <span className="min-w-0 flex-1"><span className="block truncate font-medium">{l.nombre}</span><span className="text-xs text-gray-500">{l.sku}{l.existencia != null ? ` · Existencia en la sucursal: ${num(l.existencia)}` : ''}</span></span>
            <input type="number" min="0" step="any" inputMode="decimal" value={l.cantidad} onChange={(e) => setLineas((ls) => ls.map((x, j) => (j === i ? { ...x, cantidad: e.target.value } : x)))} placeholder="Cantidad" className="cifra w-28 rounded-control border px-3 py-2 text-right" aria-label={`Cantidad de ${l.nombre}`} />
            <button type="button" onClick={() => setLineas((ls) => ls.filter((_, j) => j !== i))} className="rounded p-1.5 text-gray-400 hover:text-red-600" aria-label={`Quitar ${l.nombre}`}><Trash2 className="h-4 w-4" /></button>
          </li>
        ))}
        {!lineas.length && <li className="py-6 text-center text-sm text-gray-500">Agregue los productos que va a enviar.</li>}
      </ul>
      <label className="mt-3 block text-sm">Nota (opcional)<input value={f.observacion} onChange={(e) => setF((x) => ({ ...x, observacion: e.target.value }))} maxLength={300} placeholder="Por ejemplo: lo lleva Juan en el pick-up" className="mt-1 w-full rounded-control border px-3 py-2" /></label>
    </Modal>
  )
}

function Recibir({ t, onCerrar, onListo }) {
  const [cant, setCant] = useState(() => Object.fromEntries(t.detalles.map((d) => [d.productoId, String(Number(d.cantidad))])))
  const [observacion, setObservacion] = useState('')
  const [enviando, setEnviando] = useState(false)
  const diferencias = t.detalles.filter((d) => Number(cant[d.productoId] || 0) !== Number(d.cantidad))
  const excede = t.detalles.some((d) => Number(cant[d.productoId] || 0) > Number(d.cantidad))
  const valido = !excede && (!diferencias.length || observacion.trim().length >= 5)

  const recibir = async () => {
    setEnviando(true)
    try {
      const { data } = await api.post(`/inventario/traslados/${t.id}/recibir`, {
        lineas: t.detalles.map((d) => ({ productoId: d.productoId, cantidadRecibida: Number(cant[d.productoId] || 0) })),
        observacion: observacion.trim() || undefined,
      })
      showToast({ type: diferencias.length ? 'warning' : 'success', message: data.message })
      onListo()
    } catch (e) { showToast({ type: 'error', message: errorApi(e).mensaje }) } finally { setEnviando(false) }
  }

  return (
    <Modal abierto titulo={`Recibir traslado #${t.id}`} onCerrar={onCerrar} ancho="max-w-2xl"
      pie={<><button type="button" onClick={onCerrar} className="rounded-control border px-4 py-2">Cancelar</button><button type="button" disabled={!valido || enviando} onClick={recibir} className="rounded-control bg-green-600 px-4 py-2 font-medium text-white disabled:opacity-50">{enviando ? 'Recibiendo…' : diferencias.length ? 'Recibir con diferencias' : 'Recibir todo'}</button></>}>
      <p className="mb-3 text-sm text-gray-600">Cuente lo que llegó y corrija la cantidad si no coincide con lo enviado. Entra a {t.bodegaDestino}.</p>
      <table className="w-full text-sm">
        <thead className="text-left text-[13px] text-gray-500"><tr><th className="py-1">Producto</th><th className="text-right">Enviado</th><th className="text-right">Llegó</th></tr></thead>
        <tbody className="divide-y divide-gray-100">
          {t.detalles.map((d) => {
            const v = cant[d.productoId]
            const mal = Number(v || 0) > Number(d.cantidad)
            const falta = Number(v || 0) < Number(d.cantidad)
            return (
              <tr key={d.id}>
                <td className="py-2 pr-2">{d.producto.nombre}<span className="block text-xs text-gray-500">{d.producto.sku}</span></td>
                <td className="cifra text-right">{num(d.cantidad)}</td>
                <td className="py-2 pl-3 text-right">
                  <input type="number" min="0" step="any" inputMode="decimal" value={v} onChange={(e) => setCant((c) => ({ ...c, [d.productoId]: e.target.value }))}
                    className={`cifra w-24 rounded-control border px-2 py-1.5 text-right ${mal ? 'border-red-500' : falta ? 'border-amber-500' : ''}`} aria-label={`Llegó de ${d.producto.nombre}`} />
                  {mal && <span className="block text-xs text-red-600">Más de lo enviado</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {diferencias.length > 0 && !excede && (
        <label className="mt-4 block text-sm text-amber-800">Hay {diferencias.length} diferencia(s). ¿Qué pasó? (obligatorio)
          <textarea value={observacion} onChange={(e) => setObservacion(e.target.value)} rows={2} maxLength={300} className="mt-1 w-full rounded-control border px-3 py-2 text-gray-900" placeholder="Por ejemplo: llegaron 2 cajas golpeadas, se devuelven" />
        </label>
      )}
    </Modal>
  )
}

function Anular({ t, onCerrar, onListo }) {
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const anular = async () => {
    setEnviando(true)
    try {
      const { data } = await api.post(`/inventario/traslados/${t.id}/anular`, { motivo })
      showToast({ type: 'success', message: data.message })
      onListo()
    } catch (e) { showToast({ type: 'error', message: errorApi(e).mensaje }) } finally { setEnviando(false) }
  }
  return (
    <Modal abierto titulo={`Anular traslado #${t.id}`} onCerrar={onCerrar} ancho="max-w-md"
      pie={<><button type="button" onClick={onCerrar} className="rounded-control border px-4 py-2">Volver</button><button type="button" disabled={motivo.trim().length < 5 || enviando} onClick={anular} className="rounded-control bg-red-600 px-4 py-2 font-medium text-white disabled:opacity-50">Anular traslado</button></>}>
      <p className="text-sm text-gray-700">La mercadería regresa a {t.bodegaOrigen} con el mismo costo. Use esto solo si el envío no salió o regresó completo.</p>
      <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} maxLength={300} placeholder="Motivo (obligatorio)" className="mt-3 w-full rounded-control border px-3 py-2 text-sm" />
    </Modal>
  )
}
