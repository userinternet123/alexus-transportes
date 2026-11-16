// ─────────────────────────────────────────────────────────────────────────────
// QUÉ COMPRAR: productos sin existencia, bajo el mínimo o con N o menos; cada uno con su proveedor (el elegido por el
// negocio o el de la última compra) y una cantidad sugerida. El negocio decide con una lista de verificación, puede
// cambiar proveedor y cantidad, y se arma UN PEDIDO POR PROVEEDOR para enviarlo en PDF por WhatsApp o correo.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronDown, ChevronUp, FileText, Mail, MessageCircle, PackageCheck, Search, Send, ShoppingCart, Truck } from 'lucide-react'
import api from '../../services/api'
import { usePermisos } from '../../hooks/usePermisos'
import { showToast } from '../../utils/showToast'
import { archivoDesdeBlob, correoValido, descargar, enlaceCorreo, enlaceWhatsApp, puedeCompartirArchivos, telefonoWhatsApp } from '../../utils/compartir'
import { errorApi } from '../pos/formato'
import { confirmar } from '../comun/Confirmacion'
import Modal from '../comun/Modal'

const CRITERIOS = [['sin-existencia', 'Sin existencia'], ['bajo-minimo', 'Bajo el mínimo'], ['hasta-cantidad', 'Con poca existencia'], ['por-conseguir', 'Por conseguir (cotizados)'], ['para-listas', 'Para listas reutilizables']]
const ESTADOS = { BORRADOR: ['Por enviar', 'bg-amber-50 text-amber-800'], ENVIADO: ['Enviado', 'bg-sky-50 text-sky-800'], RECIBIDO_PARCIAL: ['Recibido en parte', 'bg-orange-50 text-orange-800'], RECIBIDO: ['Recibido', 'bg-green-50 text-green-800'], ANULADO: ['Anulado', 'bg-gray-100 text-gray-500'] }
const num = (n) => Number(n ?? 0).toLocaleString('es-GT', { maximumFractionDigits: 3 })
const fechaCorta = (f) => (f ? new Date(f).toLocaleDateString('es-GT', { day: '2-digit', month: 'short', year: 'numeric' }) : '')
const campo = 'rounded-control border px-2 py-1.5'

/** Buscar cualquier proveedor (para productos sin historial o para cambiar de proveedor). */
function BuscarProveedor({ onElegir, onCerrar }) {
  const [q, setQ] = useState('')
  const [lista, setLista] = useState([])
  useEffect(() => {
    const t = setTimeout(() => api.get('/terceros/proveedores', { params: { q: q.trim() || undefined, limit: 20 } }).then(({ data }) => setLista(data.data ?? [])).catch(() => setLista([])), 250)
    return () => clearTimeout(t)
  }, [q])
  const nombre = (p) => p.razonSocial || p.nombreComercial || [p.nombres, p.apellidos].filter(Boolean).join(' ') || `Proveedor ${p.id}`
  return (
    <Modal abierto titulo="Elegir proveedor" onCerrar={onCerrar} ancho="max-w-md">
      <label className="relative block"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" aria-hidden />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre o NIT" className="w-full rounded-control border py-2 pl-8 pr-2" aria-label="Buscar proveedor" /></label>
      <ul className="mt-2 max-h-72 divide-y overflow-auto rounded-control border" role="listbox">
        {lista.map((p) => <li key={p.id}><button type="button" onClick={() => onElegir({ id: p.id, nombre: nombre(p), telefono: p.telefono, email: p.email })} className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50">{nombre(p)} <span className="text-xs text-gray-500">NIT {p.nit}</span></button></li>)}
        {!lista.length && <li className="px-3 py-3 text-sm text-gray-500">Sin resultados.</li>}
      </ul>
    </Modal>
  )
}

const MEDIOS = [['WHATSAPP', 'WhatsApp'], ['CORREO', 'Correo'], ['TELEFONO', 'Teléfono'], ['PERSONA', 'En persona'], ['OTRO', 'Otro']]
const RECIBIBLE = ['BORRADOR', 'ENVIADO', 'RECIBIDO_PARCIAL']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const diaGt = (f) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(new Date(f)) // AAAA-MM-DD
const LARGO = { anio: 4, mes: 7, dia: 10 }
const mayuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1)
const etiquetaGrupo = (clave, por) => mayuscula(por === 'anio' ? `Año ${clave}` : por === 'mes' ? `${MESES[Number(clave.slice(5, 7)) - 1]} ${clave.slice(0, 4)}` : new Date(`${clave}T12:00:00`).toLocaleDateString('es-GT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))
async function abrirPdf(ruta, params) {
  const r = await api.get(ruta, { params, responseType: 'blob', timeout: 60000 })
  const url = URL.createObjectURL(r.data); window.open(url, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(url), 60000)
}

/** «Ya lo envié»: marca el pedido como enviado (y por qué medio). Avisa en la campana. */
function MarcarEnviado({ p, onListo, onCerrar }) {
  const [medio, setMedio] = useState('WHATSAPP')
  const [enviando, setEnviando] = useState(false)
  const guardar = async () => {
    setEnviando(true)
    try { const { data } = await api.put(`/pedidos/${p.id}/estado`, { estado: 'ENVIADO', medio }); onListo(data.message) } catch (e) { showToast({ type: 'error', message: errorApi(e).mensaje }) } finally { setEnviando(false) }
  }
  return (
    <Modal abierto titulo={`Pedido ${p.numero} enviado`} onCerrar={onCerrar} ancho="max-w-sm"
      pie={<><button type="button" onClick={onCerrar} className="rounded-lg border px-3 py-2">Cancelar</button><button type="button" disabled={enviando} onClick={guardar} className="rounded-lg bg-green-700 px-4 py-2 text-white disabled:opacity-50">Marcar como enviado</button></>}>
      <p className="text-sm text-gray-600">¿Cómo se lo envió a {p.proveedor.nombre}?</p>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm" role="radiogroup" aria-label="Medio de envío">
        {MEDIOS.map(([k, t]) => <label key={k} className={`flex items-center gap-2 rounded-control border px-3 py-2 ${medio === k ? 'border-green-600 bg-green-50' : ''}`}><input type="radio" name="medio" value={k} checked={medio === k} onChange={() => setMedio(k)} className="accent-green-600" /> {t}</label>)}
      </div>
    </Modal>
  )
}

/** Lista de verificación de lo que llegó: completo o en parte (y cuánto). Lo que falte puede llegar después. */
function Recepcion({ p, onListo, onCerrar }) {
  const [det, setDet] = useState(null)
  const [filas, setFilas] = useState({})
  const [nota, setNota] = useState('')
  const [enviando, setEnviando] = useState(false)
  useEffect(() => {
    api.get(`/pedidos/${p.id}`).then(({ data }) => {
      setDet(data.data)
      setFilas(Object.fromEntries(data.data.lineas.map((l) => [l.productoId, { llego: l.recibida < l.cantidad, cantidad: Math.max(Math.round((l.cantidad - l.recibida) * 1000) / 1000, 0) }])))
    }).catch((e) => showToast({ type: 'error', message: errorApi(e).mensaje }))
  }, [p.id])
  const set = (id, c) => setFilas((x) => ({ ...x, [id]: { ...x[id], ...c } }))
  const pendientes = (det?.lineas ?? []).filter((l) => l.recibida < l.cantidad)
  const quedaran = pendientes.filter((l) => { const f = filas[l.productoId]; return !f?.llego || Number(f.cantidad) < l.cantidad - l.recibida })
  const guardar = async () => {
    const lineas = pendientes.map((l) => ({ productoId: l.productoId, recibido: filas[l.productoId]?.llego ? Number(filas[l.productoId].cantidad) || 0 : 0 }))
    if (lineas.some((l) => l.recibido < 0)) { showToast({ type: 'error', message: 'Hay cantidades negativas' }); return }
    if (!lineas.some((l) => l.recibido > 0)) { showToast({ type: 'error', message: 'Marque al menos un producto que haya llegado' }); return }
    setEnviando(true)
    try { const { data } = await api.put(`/pedidos/${p.id}/recepcion`, { lineas, nota: nota.trim() || undefined }); onListo(data.message) } catch (e) { showToast({ type: 'error', message: errorApi(e).mensaje }) } finally { setEnviando(false) }
  }
  return (
    <Modal abierto titulo={`¿Qué llegó del pedido ${p.numero}?`} onCerrar={onCerrar} ancho="max-w-xl"
      pie={<><button type="button" onClick={onCerrar} className="rounded-lg border px-3 py-2">Cancelar</button><button type="button" disabled={enviando || !det} onClick={guardar} className="rounded-lg bg-green-700 px-4 py-2 text-white disabled:opacity-50">Registrar lo que llegó</button></>}>
      {!det ? <p className="py-6 text-center text-sm text-gray-500" role="status">Cargando…</p> : <>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <p className="text-gray-600">{p.proveedor.nombre} · marque lo que llegó y corrija la cantidad si vino menos.</p>
          <button type="button" onClick={() => pendientes.forEach((l) => set(l.productoId, { llego: true, cantidad: Math.round((l.cantidad - l.recibida) * 1000) / 1000 }))} className="rounded-control border px-2.5 py-1 text-xs">Llegó todo</button>
        </div>
        <ul className="mt-2 max-h-80 divide-y overflow-auto rounded-lg border">
          {det.lineas.map((l) => {
            const completo = l.recibida >= l.cantidad
            const f = filas[l.productoId] ?? {}
            return (
              <li key={l.productoId} className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm ${completo ? 'text-gray-400' : ''}`}>
                <input type="checkbox" disabled={completo} checked={completo || Boolean(f.llego)} onChange={(e) => set(l.productoId, { llego: e.target.checked })} aria-label={`Llegó ${l.nombre}`} className="accent-green-600" />
                <span className="min-w-0 flex-1 basis-48"><span className="block">{l.nombre}</span><span className="text-xs text-gray-500">Pedido {num(l.cantidad)}{l.recibida > 0 ? ` · ya llegaron ${num(l.recibida)}` : ''}{completo ? ' · completo' : ''}</span></span>
                {!completo && <label className="text-xs">Llegaron<input type="number" min="0" step="any" disabled={!f.llego} value={f.llego ? f.cantidad : 0} onChange={(e) => set(l.productoId, { cantidad: e.target.value })} aria-label={`Cantidad que llegó de ${l.nombre}`} className="ml-1 w-20 rounded border px-2 py-1 text-right disabled:bg-gray-50" /></label>}
              </li>
            )
          })}
        </ul>
        <p className={`mt-2 text-sm ${quedaran.length ? 'text-orange-700' : 'text-green-700'}`} aria-live="polite">{quedaran.length ? `Quedará recibido EN PARTE: faltarán ${quedaran.length} ${quedaran.length === 1 ? 'producto' : 'productos'} (pueden llegar después).` : 'Quedará recibido COMPLETO.'}</p>
        <label className="mt-2 block text-sm">Nota (opcional)<input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={500} placeholder="Ej. el resto llega el lunes" className="mt-1 w-full rounded border px-3 py-2" /></label>
      </>}
    </Modal>
  )
}

/** Lo que tiene el pedido (y lo que ya llegó). */
function DetallePedido({ id }) {
  const [d, setD] = useState(null)
  useEffect(() => { api.get(`/pedidos/${id}`).then(({ data }) => setD(data.data)).catch(() => setD({ lineas: [] })) }, [id])
  if (!d) return <p className="mt-2 text-xs text-gray-500" role="status">Cargando…</p>
  const conRecibido = d.lineas.some((l) => l.recibida > 0)
  return (
    <div className="mt-2 overflow-x-auto rounded-lg border">
      <table className="w-full text-sm"><thead className="bg-gray-50 text-xs text-gray-500"><tr><th className="px-3 py-1.5 text-left">Producto</th><th className="px-3 py-1.5 text-right">Pedido</th>{conRecibido && <th className="px-3 py-1.5 text-right">Llegó</th>}</tr></thead>
        <tbody>{d.lineas.map((l) => <tr key={l.productoId} className="border-t"><td className="px-3 py-1.5">{l.nombre}<span className="text-xs text-gray-500"> · {l.sku}{l.presentacion ? ` · ${l.presentacion}` : ''}</span></td><td className="px-3 py-1.5 text-right tabular-nums">{num(l.cantidad)}</td>{conRecibido && <td className={`px-3 py-1.5 text-right tabular-nums ${l.recibida < l.cantidad ? 'text-orange-700' : 'text-green-700'}`}>{num(l.recibida)}</td>}</tr>)}</tbody>
      </table>
      {d.nota && <p className="border-t px-3 py-1.5 text-xs text-gray-600">Nota: {d.nota}</p>}
      {d.notaRecepcion && <p className="border-t px-3 py-1.5 text-xs text-gray-600">Al recibir: {d.notaRecepcion}</p>}
    </div>
  )
}

/** Acciones de un pedido: ver PDF, WhatsApp, correo, «ya lo envié», registrar lo que llegó y anular. */
function AccionesPedido({ p, puedeEditar, onCambio, onEnviado, onRecibir }) {
  const [ocupado, setOcupado] = useState(false)
  const traerPdf = async () => {
    const r = await api.get(`/pedidos/${p.id}/pdf`, { responseType: 'blob', timeout: 60000 })
    const h = (k) => { try { return decodeURIComponent(r.headers?.[k] ?? '') } catch { return '' } }
    return { archivo: archivoDesdeBlob(r.data, `Pedido-${p.numero}.pdf`, 'application/pdf'), whatsapp: h('x-mensaje-whatsapp'), asunto: h('x-mensaje-asunto'), cuerpo: h('x-mensaje-cuerpo') }
  }
  // Al compartirlo, queda marcado como enviado por ese medio (y avisa en la campana)
  const enviado = async (medio) => { if (p.estado === 'BORRADOR' && puedeEditar) { await api.put(`/pedidos/${p.id}/estado`, { estado: 'ENVIADO', medio }).catch(() => {}); onCambio() } }
  const hacer = (fn) => async () => { setOcupado(true); try { await fn() } catch (e) { showToast({ type: 'error', message: errorApi(e).mensaje }) } finally { setOcupado(false) } }
  const verPdf = hacer(async () => { const { archivo } = await traerPdf(); const url = URL.createObjectURL(archivo); window.open(url, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(url), 60000) })
  const porWhatsApp = hacer(async () => {
    const { archivo, whatsapp } = await traerPdf()
    if (puedeCompartirArchivos()) { await navigator.share({ files: [archivo], text: whatsapp }).catch(() => {}) } // en el teléfono: el PDF va adjunto
    else { descargar(archivo); window.open(enlaceWhatsApp(telefonoWhatsApp(p.proveedor.telefono), `${whatsapp}\n(Adjunte el PDF descargado: ${archivo.name})`), '_blank', 'noopener') }
    await enviado('WHATSAPP')
  })
  const porCorreo = hacer(async () => {
    const { archivo, asunto, cuerpo } = await traerPdf()
    descargar(archivo)
    window.location.href = enlaceCorreo(correoValido(p.proveedor.email), asunto, `${cuerpo}\n\n(Adjunte el PDF descargado: ${archivo.name})`)
    await enviado('CORREO')
  })
  const anular = hacer(async () => {
    if (!(await confirmar({ titulo: 'Anular pedido', mensaje: `¿Anular el pedido ${p.numero} a ${p.proveedor.nombre}?`, confirmar: 'Anular', peligro: true }))) return
    const { data } = await api.put(`/pedidos/${p.id}/estado`, { estado: 'ANULADO' }); showToast({ type: 'success', message: data.message }); onCambio()
  })
  const btn = 'inline-flex items-center gap-1 rounded-control border px-2.5 py-1.5 text-sm disabled:opacity-50'
  return (
    <div className="flex flex-wrap gap-1.5">
      <button type="button" disabled={ocupado} onClick={verPdf} className={btn}><FileText className="h-4 w-4" aria-hidden /> PDF</button>
      {p.estado !== 'ANULADO' && <>
        <button type="button" disabled={ocupado} onClick={porWhatsApp} className={`${btn} text-green-800`}><MessageCircle className="h-4 w-4" aria-hidden /> WhatsApp</button>
        <button type="button" disabled={ocupado} onClick={porCorreo} className={btn}><Mail className="h-4 w-4" aria-hidden /> Correo</button>
      </>}
      {puedeEditar && p.estado === 'BORRADOR' && <button type="button" disabled={ocupado} onClick={() => onEnviado(p)} className={btn}><Send className="h-4 w-4" aria-hidden /> Ya lo envié</button>}
      {puedeEditar && RECIBIBLE.includes(p.estado) && <button type="button" disabled={ocupado} onClick={() => onRecibir(p)} className={`${btn} border-green-600 text-green-800`}><PackageCheck className="h-4 w-4" aria-hidden /> {p.estado === 'RECIBIDO_PARCIAL' ? 'Registrar lo que faltaba' : 'Registrar lo que llegó'}</button>}
      {puedeEditar && ['BORRADOR', 'ENVIADO'].includes(p.estado) && <button type="button" disabled={ocupado} onClick={anular} className="rounded-control px-2.5 py-1.5 text-sm text-red-700 hover:bg-red-50">Anular</button>}
    </div>
  )
}

function Pedidos({ resaltar, recargar }) {
  const { puede } = usePermisos()
  const [lista, setLista] = useState(null)
  const [por, setPor] = useState('mes') // agrupar por año, mes o día en que se generó
  const [estado, setEstado] = useState('')
  const [abiertos, setAbiertos] = useState({})
  const [accion, setAccion] = useState(null) // { tipo: 'enviado' | 'recibir', p }
  const cargar = useCallback(() => api.get('/pedidos', { params: { estado: estado || undefined } }).then(({ data }) => setLista(data.data)).catch((e) => showToast({ type: 'error', message: errorApi(e).mensaje })), [estado])
  useEffect(() => { cargar() }, [cargar, recargar])
  const grupos = useMemo(() => {
    const g = new Map()
    for (const p of lista ?? []) { const k = diaGt(p.creadoEn).slice(0, LARGO[por]); g.set(k, [...(g.get(k) ?? []), p]) }
    return [...g].sort((a, b) => b[0].localeCompare(a[0]))
  }, [lista, por])
  const pdf = (ids, titulo) => abrirPdf('/pedidos/pdf', { ids: ids.join(','), titulo }).catch((e) => showToast({ type: 'error', message: errorApi(e).mensaje }))
  const listo = (mensaje) => { showToast({ type: 'success', message: mensaje }); setAccion(null); cargar() }
  if (!lista) return <p className="py-10 text-center text-sm text-gray-500" role="status">Cargando…</p>
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 rounded-superficie border bg-white p-3 text-sm">
        <span className="text-gray-600">Agrupar por</span>
        <div className="flex gap-1 rounded-control bg-gray-100 p-0.5" role="radiogroup" aria-label="Agrupar por">
          {[['anio', 'Año'], ['mes', 'Mes'], ['dia', 'Día']].map(([k, t]) => <button key={k} type="button" role="radio" aria-checked={por === k} onClick={() => setPor(k)} className={`rounded-[6px] px-3 py-1 ${por === k ? 'bg-white font-medium shadow-sm' : 'text-gray-600'}`}>{t}</button>)}
        </div>
        <select value={estado} onChange={(e) => setEstado(e.target.value)} aria-label="Filtrar por estado" className="rounded-control border px-2 py-1.5"><option value="">Todos los estados</option>{Object.entries(ESTADOS).map(([k, [t]]) => <option key={k} value={k}>{t}</option>)}</select>
        {lista.length > 0 && <button type="button" onClick={() => pdf(lista.map((p) => p.id), estado ? `${ESTADOS[estado][0]} · todos` : 'Todos los pedidos')} className="ml-auto inline-flex items-center gap-1 rounded-control border px-2.5 py-1.5"><FileText className="h-4 w-4" aria-hidden /> PDF de todo ({lista.length})</button>}
      </div>
      {!lista.length && <p className="rounded-superficie border bg-white px-4 py-10 text-center text-sm text-gray-500">{estado ? 'No hay pedidos con ese estado.' : 'Todavía no hay pedidos. Arme el primero en «Qué comprar».'}</p>}
      {grupos.map(([clave, pedidos]) => (
        <section key={clave} className="rounded-superficie border bg-white" aria-label={etiquetaGrupo(clave, por)}>
          <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
            <h3 className="font-semibold">{etiquetaGrupo(clave, por)} <span className="text-sm font-normal text-gray-500">· {pedidos.length} {pedidos.length === 1 ? 'pedido' : 'pedidos'}</span></h3>
            <button type="button" onClick={() => pdf(pedidos.map((p) => p.id), etiquetaGrupo(clave, por))} className="inline-flex items-center gap-1 rounded-control border px-2.5 py-1 text-sm"><FileText className="h-4 w-4" aria-hidden /> PDF del grupo</button>
          </header>
          <ul className="divide-y">
            {pedidos.map((p) => {
              const [et, cls] = ESTADOS[p.estado] ?? [p.estado, '']
              return (
                <li key={p.id} className={`p-3 ${resaltar?.includes(p.id) ? 'bg-green-50/60' : ''}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0"><p className="font-medium">{p.proveedor.nombre} <span className="text-sm font-normal text-gray-500">· {p.numero}</span></p>
                      <p className="text-sm text-gray-600">{p.lineas} {p.lineas === 1 ? 'producto' : 'productos'} · {fechaCorta(p.creadoEn)} · {p.solicita}</p></div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{et}</span>
                      <button type="button" onClick={() => setAbiertos((a) => ({ ...a, [p.id]: !a[p.id] }))} aria-expanded={Boolean(abiertos[p.id])} className="inline-flex items-center gap-0.5 rounded px-2 py-1 text-sm text-gray-600 hover:bg-gray-100">{abiertos[p.id] ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />} Ver</button>
                    </div>
                  </div>
                  {abiertos[p.id] && <DetallePedido id={p.id} />}
                  <div className="mt-2"><AccionesPedido p={p} puedeEditar={puede('compras.crear')} onCambio={cargar} onEnviado={(x) => setAccion({ tipo: 'enviado', p: x })} onRecibir={(x) => setAccion({ tipo: 'recibir', p: x })} /></div>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
      {accion?.tipo === 'enviado' && <MarcarEnviado p={accion.p} onListo={listo} onCerrar={() => setAccion(null)} />}
      {accion?.tipo === 'recibir' && <Recepcion p={accion.p} onListo={listo} onCerrar={() => setAccion(null)} />}
    </div>
  )
}

export default function QueComprar() {
  const { puede } = usePermisos()
  const [params] = useSearchParams()
  const temporadaUrl = Number(params.get('temporada')) || null
  const [pestana, setPestana] = useState(params.get('pestana') === 'pedidos' ? 'pedidos' : 'comprar')
  const [modo, setModo] = useState(temporadaUrl ? 'temporada' : 'existencias') // por existencias y ventas | por temporada (modelo)
  const [temporadas, setTemporadas] = useState([])
  const [temporadaId, setTemporadaId] = useState(temporadaUrl)
  const [criterio, setCriterio] = useState({ criterio: 'sin-existencia', cantidad: 5, conVentas: true })
  const [periodo, setPeriodo] = useState('60') // días de ventas o 'rango'
  const [rango, setRango] = useState({ desde: '', hasta: '' })
  const [cobertura, setCobertura] = useState('30') // días o 'otro'
  const [coberturaOtra, setCoberturaOtra] = useState('120')
  const [datos, setDatos] = useState(null)
  const [lineas, setLineas] = useState({}) // productoId → { marcado, cantidad, proveedorId }
  const [extra, setExtra] = useState({}) // proveedores elegidos con el buscador
  const [buscando, setBuscando] = useState(null) // productoId que está eligiendo proveedor
  const [recordar, setRecordar] = useState(true)
  const [nota, setNota] = useState('')
  const [cargando, setCargando] = useState(false)
  const [creando, setCreando] = useState(false)
  const [creados, setCreados] = useState(null)
  const [recargar, setRecargar] = useState(0)
  const [faltaProveedor, setFaltaProveedor] = useState(false)

  const parametros = (m = modo, tId = temporadaId) => (m === 'temporada'
    ? { criterio: 'temporada', temporadaId: tId }
    : { ...criterio, ...(periodo === 'rango' ? { ventasDesde: rango.desde, ventasHasta: rango.hasta } : { diasVentas: Number(periodo) }), diasCobertura: cobertura === 'otro' ? Number(coberturaOtra) : Number(cobertura) })
  const buscar = async (m = modo, tId = temporadaId) => {
    if (m === 'temporada' && !tId) { setDatos(null); return }
    if (m !== 'temporada' && periodo === 'rango' && (!rango.desde || !rango.hasta)) { showToast({ type: 'error', message: 'Elija las dos fechas del rango de ventas' }); return }
    if (m !== 'temporada' && cobertura === 'otro' && !(Number(coberturaOtra) >= 1)) { showToast({ type: 'error', message: 'Indique para cuántos días pedir' }); return }
    setCargando(true); setFaltaProveedor(false)
    try {
      const { data } = await api.get('/pedidos/sugerido', { params: parametros(m, tId) })
      setDatos(data.data)
      setLineas(Object.fromEntries(data.data.productos.map((p) => [p.id, { marcado: true, cantidad: p.sugerido, proveedorId: p.proveedorId }])))
    } catch (e) { showToast({ type: 'error', message: errorApi(e).mensaje }) } finally { setCargando(false) }
  }
  useEffect(() => { api.get('/temporadas').then(({ data }) => setTemporadas((data.data ?? []).filter((t) => t.estado === 'ACTIVA'))).catch(() => {}) }, [])
  // Al llegar desde Temporadas o desde la campana (…?temporada=ID) se abre en modo temporada con esa temporada
  useEffect(() => {
    if (temporadaUrl) { setModo('temporada'); setTemporadaId(temporadaUrl); setPestana('comprar'); buscar('temporada', temporadaUrl) } else buscar()
  }, [temporadaUrl]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (params.get('pestana') === 'pedidos') setPestana('pedidos') }, [params])

  const proveedores = useMemo(() => new Map([...(datos?.proveedores ?? []).map((p) => [p.id, p]), ...Object.values(extra).map((p) => [p.id, p])]), [datos, extra])
  const grupos = useMemo(() => {
    const g = new Map()
    for (const p of datos?.productos ?? []) { const k = lineas[p.id]?.proveedorId ?? 0; g.set(k, [...(g.get(k) ?? []), p]) }
    return [...g].sort((a, b) => (a[0] === 0 ? 1 : b[0] === 0 ? -1 : (proveedores.get(a[0])?.nombre ?? '').localeCompare(proveedores.get(b[0])?.nombre ?? '')))
  }, [datos, lineas, proveedores])
  const marcados = Object.entries(lineas).filter(([, l]) => l.marcado)
  const sinProveedor = marcados.filter(([, l]) => !l.proveedorId).length
  const nProveedores = new Set(marcados.map(([, l]) => l.proveedorId).filter(Boolean)).size
  const set = (id, cambio) => setLineas((x) => ({ ...x, [id]: { ...x[id], ...cambio } }))
  const elegirProveedor = (productoId, valor) => { if (valor === 'otro') { setBuscando(productoId); return } set(productoId, { proveedorId: valor ? Number(valor) : null }) }

  const crear = async () => {
    if (!marcados.length) { showToast({ type: 'error', message: 'Marque al menos un producto' }); return }
    if (sinProveedor) { setFaltaProveedor(true); showToast({ type: 'error', message: `Elija el proveedor de ${sinProveedor} ${sinProveedor === 1 ? 'producto' : 'productos'} (o desmárquelos)` }); document.getElementById('grupo-sin-proveedor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return }
    const malas = marcados.filter(([, l]) => !(Number(l.cantidad) > 0))
    if (malas.length) { showToast({ type: 'error', message: 'Hay cantidades vacías o en cero: corríjalas o desmarque esos productos' }); document.getElementById(`cant-${malas[0][0]}`)?.focus(); return }
    setCreando(true)
    try {
      const existencia = Object.fromEntries((datos?.productos ?? []).map((p) => [p.id, p.existencia]))
      const { data } = await api.post('/pedidos', { nota: nota.trim() || undefined, recordarProveedor: recordar, lineas: marcados.map(([id, l]) => ({ productoId: Number(id), proveedorId: l.proveedorId, cantidad: Number(l.cantidad), existencia: existencia[id] })) })
      showToast({ type: 'success', message: data.message })
      setCreados(data.data.map((c) => c.id)); setRecargar((n) => n + 1); setPestana('pedidos')
      buscar()
    } catch (e) { showToast({ type: 'error', message: errorApi(e).mensaje }) } finally { setCreando(false) }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <div className="flex flex-wrap gap-1 rounded-control bg-gray-200 p-0.5 text-sm" role="tablist">
        {[['comprar', 'Qué comprar'], ['pedidos', 'Pedidos a proveedores']].map(([k, t]) => <button key={k} type="button" role="tab" aria-selected={pestana === k} onClick={() => setPestana(k)} className={`rounded-[6px] px-3 py-1.5 ${pestana === k ? 'bg-white font-medium shadow-sm' : 'text-gray-600'}`}>{t}</button>)}
      </div>

      {pestana === 'pedidos' ? <Pedidos resaltar={creados} recargar={recargar} /> : <>
        <section className="rounded-superficie border bg-white p-4" aria-label="Qué buscar">
          <div className="mb-3 flex flex-wrap gap-1 rounded-control bg-gray-100 p-0.5 text-sm" role="tablist" aria-label="Cómo calcular">
            {[['existencias', 'Por existencias y ventas'], ['temporada', 'Por temporada (modelo)']].map(([k, t]) => <button key={k} type="button" role="tab" aria-selected={modo === k} onClick={() => { setModo(k); setDatos(null); if (k === 'temporada' && temporadaId) buscar('temporada', temporadaId); if (k === 'existencias') buscar('existencias') }} className={`rounded-[6px] px-3 py-1.5 ${modo === k ? 'bg-white font-medium shadow-sm' : 'text-gray-600'}`}>{t}</button>)}
          </div>
          {modo === 'temporada' ? (
            <div className="flex flex-wrap items-end gap-3 text-sm">
              <label>Temporada<select value={temporadaId ?? ''} onChange={(e) => setTemporadaId(Number(e.target.value) || null)} aria-label="Temporada" className={`${campo} ml-2 min-w-[14rem]`}><option value="">Elija…</option>{temporadas.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}</select></label>
              <button type="button" disabled={cargando || !temporadaId} onClick={() => buscar('temporada')} className="inline-flex items-center gap-1.5 rounded-control bg-green-600 px-3 py-2 font-medium text-white disabled:opacity-50"><Search className="h-4 w-4" aria-hidden /> {cargando ? 'Calculando…' : 'Calcular'}</button>
              <p className="w-full text-xs text-gray-500">Cuánto pedir según lo que se vendió en esa temporada los años anteriores (lo calcula el motor analítico), menos lo que hay. {!temporadas.length && 'No hay temporadas activas: configúrelas en Reportes › Temporadas.'}</p>
            </div>
          ) : <>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Criterio">
              {CRITERIOS.map(([k, t]) => <button key={k} type="button" role="radio" aria-checked={criterio.criterio === k} onClick={() => setCriterio((c) => ({ ...c, criterio: k }))} className={`rounded-full border px-3 py-1.5 text-sm ${criterio.criterio === k ? 'border-green-600 bg-green-50 font-medium text-green-800' : 'text-gray-700'}`}>{t}</button>)}
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-3 text-sm">
              {criterio.criterio === 'hasta-cantidad' && <label>Existencia de<input type="number" min="0" value={criterio.cantidad} onChange={(e) => setCriterio((c) => ({ ...c, cantidad: e.target.value }))} className={`${campo} ml-2 w-20 text-right`} /> o menos</label>}
              <label>Ventas de<select value={periodo} onChange={(e) => setPeriodo(e.target.value)} aria-label="Periodo de ventas" className={`${campo} ml-2`}>{[['30', 'los últimos 30 días'], ['60', 'los últimos 60 días'], ['90', 'los últimos 90 días'], ['180', 'los últimos 6 meses'], ['365', 'el último año'], ['rango', 'un rango de fechas…']].map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
              {periodo === 'rango' && <><label>Desde<input type="date" value={rango.desde} onChange={(e) => setRango((r) => ({ ...r, desde: e.target.value }))} aria-label="Ventas desde" className={`${campo} ml-2`} /></label><label>Hasta<input type="date" value={rango.hasta} onChange={(e) => setRango((r) => ({ ...r, hasta: e.target.value }))} aria-label="Ventas hasta" className={`${campo} ml-2`} /></label></>}
              <label>Pedir para<select value={cobertura} onChange={(e) => setCobertura(e.target.value)} aria-label="Pedir para" className={`${campo} ml-2`}>{[['7', '7 días'], ['15', '15 días'], ['30', '30 días'], ['45', '45 días'], ['60', '60 días'], ['90', '90 días'], ['otro', 'otro…']].map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>{cobertura === 'otro' && <input type="number" min="1" max="365" value={coberturaOtra} onChange={(e) => setCoberturaOtra(e.target.value)} aria-label="Días a cubrir" className={`${campo} ml-2 w-20 text-right`} />}{cobertura === 'otro' && ' días'}</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={criterio.conVentas} onChange={(e) => setCriterio((c) => ({ ...c, conVentas: e.target.checked }))} className="accent-green-600" /> Solo productos que se han vendido</label>
              <button type="button" disabled={cargando} onClick={() => buscar('existencias')} className="inline-flex items-center gap-1.5 rounded-control bg-green-600 px-3 py-2 font-medium text-white disabled:opacity-50"><Search className="h-4 w-4" aria-hidden /> {cargando ? 'Buscando…' : 'Buscar'}</button>
            </div>
            <p className="mt-2 text-xs text-gray-500">Cantidad sugerida: lo necesario para los días indicados al ritmo de venta del periodo elegido, y nunca menos que el mínimo. «Por conseguir» pide lo cotizado; «Para listas», lo que falta para los compradores esperados. Puede cambiarla.</p>
          </>}
        </section>

        {datos?.temporada && <p className="rounded-control bg-amber-50 px-4 py-2 text-sm text-amber-900">Calculado con el modelo de la temporada <b>{datos.temporada.nombre}</b>.</p>}
        {datos && !datos.productos.length && <p className="rounded-superficie border bg-white px-4 py-10 text-center text-sm text-gray-500">{datos.temporada ? 'Con lo que hay alcanzaría para la temporada, según los años anteriores. 🎉' : 'Ningún producto cumple ese criterio. 🎉'}</p>}

        {grupos.map(([provId, productos]) => {
          const prov = proveedores.get(provId)
          const todos = productos.every((p) => lineas[p.id]?.marcado)
          const sin = provId === 0
          return (
            <section key={provId} id={sin ? 'grupo-sin-proveedor' : undefined} className={`rounded-superficie border bg-white ${sin && faltaProveedor ? 'ring-2 ring-red-400' : ''}`} aria-label={sin ? 'Sin proveedor' : prov?.nombre}>
              <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
                <label className="flex items-center gap-2 font-medium"><input type="checkbox" checked={todos} onChange={(e) => productos.forEach((p) => set(p.id, { marcado: e.target.checked }))} className="accent-green-600" aria-label={`Marcar todos de ${sin ? 'sin proveedor' : prov?.nombre}`} />
                  {sin ? <span className="text-amber-800">Sin proveedor: elíjalo en cada producto</span> : <span className="inline-flex items-center gap-1.5"><Truck className="h-4 w-4 text-green-700" aria-hidden /> {prov?.nombre ?? `Proveedor ${provId}`}</span>}</label>
                <span className="text-xs text-gray-500">{productos.filter((p) => lineas[p.id]?.marcado).length} de {productos.length} marcados</span>
              </header>
              <ul className="divide-y">
                {productos.map((p) => {
                  const l = lineas[p.id] ?? {}
                  return (
                    <li key={p.id} className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 ${l.marcado ? '' : 'opacity-60'}`}>
                      <label className="flex min-w-0 flex-1 basis-56 items-start gap-2">
                        <input type="checkbox" checked={Boolean(l.marcado)} onChange={(e) => set(p.id, { marcado: e.target.checked })} className="mt-1 accent-green-600" aria-label={`Comprar ${p.nombre}`} />
                        <span className="min-w-0"><span className="block font-medium">{p.nombre}</span><span className="text-xs text-gray-500">{p.sku}{p.presentacion ? ` · ${p.presentacion}` : ''} · hay {num(p.existencia)}{p.minimo ? ` · mínimo ${num(p.minimo)}` : ''}{p.esperado !== undefined ? ` · se esperan vender ${num(p.esperado)} en la temporada` : ` · vendió ${num(p.vendido)} en ${datos.parametros.diasVentas} días`}{p.cotizado > 0 ? ` · cotizado ${num(p.cotizado)}` : ''}{p.porListas > 0 ? ` · faltan ${num(p.porListas)} para listas` : ''}</span>{p.porConseguir && <span className="ml-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">Por conseguir</span>}</span>
                      </label>
                      <label className="text-sm">Pedir<input id={`cant-${p.id}`} type="number" min="0" step="any" value={l.cantidad ?? ''} onChange={(e) => set(p.id, { cantidad: e.target.value })} className={`${campo} ml-2 w-24 text-right ${l.marcado && !(Number(l.cantidad) > 0) ? 'border-red-500 bg-red-50' : ''}`} /></label>
                      <select value={l.proveedorId ?? ''} onChange={(e) => elegirProveedor(p.id, e.target.value)} aria-label={`Proveedor de ${p.nombre}`} className={`${campo} max-w-[16rem] text-sm ${l.marcado && !l.proveedorId && faltaProveedor ? 'border-red-500 bg-red-50' : ''}`}>
                        <option value="">Elegir proveedor…</option>
                        {p.opciones.map((o) => <option key={o.proveedorId} value={o.proveedorId}>{proveedores.get(o.proveedorId)?.nombre ?? o.proveedorId}{o.ultimaCompra ? ` · última ${o.ultimaCompra}` : ''}{o.ultimoCosto != null ? ` · Q${o.ultimoCosto.toFixed(2)}` : ''}</option>)}
                        {l.proveedorId && !p.opciones.some((o) => o.proveedorId === l.proveedorId) && <option value={l.proveedorId}>{proveedores.get(l.proveedorId)?.nombre}</option>}
                        <option value="otro">Otro proveedor…</option>
                      </select>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}

        {datos?.productos.length > 0 && puede('compras.crear') && (
          <section className="sticky bottom-2 z-10 rounded-superficie border bg-white p-3 shadow-lg" aria-label="Crear pedidos">
            <div className="flex flex-wrap items-center gap-3">
              <input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={500} placeholder="Nota para el proveedor (opcional)" className={`${campo} min-w-0 flex-1 basis-56 text-sm`} aria-label="Nota para el proveedor" />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={recordar} onChange={(e) => setRecordar(e.target.checked)} className="accent-green-600" /> Recordar el proveedor elegido</label>
              <button type="button" disabled={creando} onClick={crear} className="inline-flex items-center gap-1.5 rounded-control bg-green-600 px-4 py-2 font-medium text-white disabled:opacity-50"><ShoppingCart className="h-4 w-4" aria-hidden />
                {creando ? 'Creando…' : `Crear ${nProveedores || ''} ${nProveedores === 1 ? 'pedido' : 'pedidos'} (${marcados.length} ${marcados.length === 1 ? 'producto' : 'productos'})`}</button>
            </div>
          </section>
        )}
      </>}

      {buscando && <BuscarProveedor onCerrar={() => setBuscando(null)} onElegir={(p) => { setExtra((x) => ({ ...x, [p.id]: p })); set(buscando, { proveedorId: p.id }); setBuscando(null) }} />}
    </div>
  )
}
