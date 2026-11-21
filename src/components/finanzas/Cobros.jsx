// ─────────────────────────────────────────────────────────────────────────────
// CUENTAS POR COBRAR: cuánto le deben a la empresa, desde cuándo y quién. Facturar los viajes terminados,
// registrar abonos (pagos, retenciones, descuentos), dar seguimiento con promesas de pago y mandar el
// recordatorio al cliente por WhatsApp o correo. Los plazos (30, 60, 90 días…) salen de cada cliente o se eligen.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Copy, Mail, MessageCircle, Plus, Receipt } from 'lucide-react'
import { usePermisos } from '../../hooks/usePermisos'
import { showToast } from '../../utils/showToast'
import { Q } from '../comun/formato'
import Campo from '../comun/Campo'
import Hoja from '../comun/Hoja'
import Modal from '../comun/Modal'
import { Boton, BotonPrimario, Cifra, Etiqueta, Pestanas } from '../operacion/comun'
import { ent, enviar, fecha, fechaHora, hay, hoy, nombreTercero, num, useCatalogos, useConsulta } from '../operacion/util'

const VISTAS = [['ABIERTAS', 'Por cobrar'], ['VENCIDAS', 'Vencidas'], ['POR_VENCER', 'Por vencer'], ['SIN_FACTURAR', 'Sin facturar'], ['PAGADAS', 'Pagadas'], ['ANULADAS', 'Anuladas']]
const ESTADO = { PENDIENTE: ['Pendiente', 'azul'], PARCIAL: ['Abonada', 'morado'], PAGADA: ['Pagada', 'verde'], ANULADA: ['Anulada', 'gris'] }
const MEDIOS = [['TRANSFERENCIA', 'Transferencia'], ['DEPOSITO', 'Depósito'], ['CHEQUE', 'Cheque'], ['EFECTIVO', 'Efectivo'], ['RETENCION_IVA', 'Retención de IVA'], ['RETENCION_ISR', 'Retención de ISR'], ['DESCUENTO', 'Descuento'], ['OTRO', 'Otro']]
const GESTIONES = [['LLAMADA', 'Llamada'], ['WHATSAPP', 'WhatsApp'], ['CORREO', 'Correo'], ['VISITA', 'Visita'], ['PROMESA', 'Promesa de pago'], ['NOTA', 'Nota']]
const PLAZOS = [0, 15, 30, 45, 60, 90, 120]
const DOCUMENTOS = [['FACTURA', 'Factura'], ['RECIBO', 'Recibo'], ['NOTA_DEBITO', 'Nota de débito'], ['OTRO', 'Otro']]
// Del verde (al día) al rojo (lo más viejo)
const COLOR_TRAMO = ['bg-green-500', 'bg-amber-300', 'bg-amber-500', 'bg-orange-600', 'bg-red-600', 'bg-red-800']
const sumarDias = (ymd, dias) => new Date(new Date(`${ymd}T00:00:00Z`).getTime() + Number(dias) * 86_400_000).toISOString().slice(0, 10)
const textoDias = (d) => (d > 0 ? `vencida hace ${d} día${d === 1 ? '' : 's'}` : d === 0 ? 'vence hoy' : `vence en ${-d} día${d === -1 ? '' : 's'}`)

export default function Cobros() {
  const { puede } = usePermisos()
  const [params, setParams] = useSearchParams()
  const vista = VISTAS.some(([k]) => k === params.get('vista')) ? params.get('vista') : 'ABIERTAS'
  const setVista = (v) => setParams((p) => { p.set('vista', v); return p }, { replace: true })
  const [q, setQ] = useState('')
  const [abierta, setAbierta] = useState(null)
  const [cliente, setCliente] = useState(null)
  const [facturar, setFacturar] = useState(null)
  const { datos: r, recargar: recargarResumen } = useConsulta('/cobros/resumen')
  const { datos: cuentas, recargar } = useConsulta(vista === 'SIN_FACTURAR' ? null : '/cobros', { vista, q: q.trim() || undefined })
  const { datos: sinFacturar, recargar: recargarSin } = useConsulta(vista === 'SIN_FACTURAR' ? '/cobros/sin-facturar' : null)
  const todo = () => { recargar(); recargarResumen(); recargarSin() }
  const t = r?.total
  const pctVencido = t && Number(t.saldo) ? (Number(t.vencido) / Number(t.saldo)) * 100 : 0

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      {r && <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Cifra titulo="Por cobrar" valor={Q(t.saldo)} detalle={`${t.cuentas} cuenta(s) abierta(s)`} />
        <Cifra titulo="Vencido" valor={Q(t.vencido)} tono={Number(t.vencido) > 0 ? 'malo' : null} detalle={Number(t.saldo) ? `${num(pctVencido, 0)} % de lo que le deben` : 'Nada vencido'} />
        <Cifra titulo="Días promedio de cobro" valor={hay(r.diasDeCobro) ? `${num(r.diasDeCobro)} días` : '—'} detalle={`Facturado en ${r.dias} días: ${Q(r.facturado.monto)} · cobrado ${Q(r.cobrado)}`} />
        <button type="button" onClick={() => setVista('SIN_FACTURAR')} className="text-left"><Cifra titulo="Viajes sin facturar" valor={Q(r.sinFacturar.monto)} tono={r.sinFacturar.viajes ? 'malo' : null} detalle={`${r.sinFacturar.viajes} viaje(s) terminados · toque para facturar`} /></button>
      </section>}

      {r && Number(t.saldo) > 0 && <Antiguedad r={r} onCliente={setCliente} />}
      {r?.sobreLimite.length > 0 && <p className="rounded-control bg-red-50 px-3 py-2 text-sm text-red-800">Pasan su límite de crédito: {r.sobreLimite.map((c) => `${c.cliente} (debe ${Q(c.saldo)}, límite ${Q(c.limite)})`).join(' · ')}.</p>}

      <div className="flex flex-wrap items-center gap-3">
        <Pestanas opciones={VISTAS} valor={vista} onCambio={setVista} />
        {vista !== 'SIN_FACTURAR' && <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cliente, NIT o número" aria-label="Buscar cuenta" className="min-w-0 flex-1 rounded-control border px-3 py-2 text-sm sm:max-w-xs" />}
        {puede('cobros.facturar') && <BotonPrimario className="ml-auto" onClick={() => setFacturar({ clienteId: '', viajes: [] })}><Plus className="h-4 w-4" aria-hidden /> Cuenta sin viajes</BotonPrimario>}
      </div>

      {vista === 'SIN_FACTURAR'
        ? <SinFacturar grupos={sinFacturar} puedeFacturar={puede('cobros.facturar')} onFacturar={setFacturar} />
        : <ul className="divide-y rounded-superficie border bg-white">
          {cuentas?.map((c) => {
            const [estado, color] = ESTADO[c.estado]
            return (
              <li key={c.id}>
                <button type="button" onClick={() => setAbierta(c.id)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left text-sm hover:bg-gray-50">
                  <span className="min-w-0 flex-1 basis-56"><span className="block truncate font-medium">{c.cliente}</span><span className="block truncate text-xs text-gray-500">{c.numero} · {c.documento} · {c.viajes ? `${c.viajes} viaje(s)` : 'sin viajes'} · emitida {fecha(c.fechaEmision)}</span></span>
                  <Etiqueta color={color}>{estado}</Etiqueta>
                  <span className={`w-40 text-xs ${c.vencida ? 'font-semibold text-red-700' : 'text-gray-500'}`}>{hay(c.diasVencida) ? textoDias(c.diasVencida) : `venció ${fecha(c.fechaVencimiento)}`}<span className="block font-normal text-gray-500">{fecha(c.fechaVencimiento)} · {c.diasCredito} días</span></span>
                  <span className="cifra w-32 text-right"><span className="block font-semibold">{Q(c.saldo)}</span>{Number(c.saldo) !== Number(c.monto) && <span className="block text-xs text-gray-500">de {Q(c.monto)}</span>}</span>
                </button>
              </li>
            )
          })}
          {cuentas && !cuentas.length && <li className="px-4 py-10 text-center text-sm text-gray-500">{vista === 'VENCIDAS' ? 'Ninguna cuenta vencida.' : vista === 'POR_VENCER' ? 'Nada vence en los próximos días.' : 'No hay cuentas en esta vista.'}</li>}
        </ul>}

      {facturar && <Facturar inicial={facturar} onCerrar={() => setFacturar(null)} onListo={() => { setFacturar(null); todo() }} />}
      <Detalle id={abierta} onCerrar={() => setAbierta(null)} onCambio={todo} />
      {cliente && <EstadoCliente id={cliente} onCerrar={() => setCliente(null)} onAbrir={(id) => { setCliente(null); setAbierta(id) }} />}
    </div>
  )
}

function Antiguedad({ r, onCliente }) {
  const total = Number(r.total.saldo) || 1
  return (
    <section className="rounded-superficie border bg-white p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2"><h2 className="font-semibold">Antigüedad de saldos</h2><p className="text-xs text-gray-500">Toque un cliente para ver su estado de cuenta y mandarle el recordatorio</p></div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-100" role="img" aria-label="Saldo por antigüedad">
        {r.tramos.map((tr, i) => Number(r.total.tramos[tr.clave]) > 0 && <span key={tr.clave} className={COLOR_TRAMO[Math.min(i, COLOR_TRAMO.length - 1)]} style={{ width: `${(Number(r.total.tramos[tr.clave]) / total) * 100}%` }} title={`${tr.nombre}: ${Q(r.total.tramos[tr.clave])}`} />)}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">{r.tramos.map((tr, i) => <li key={tr.clave} className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-full ${COLOR_TRAMO[Math.min(i, COLOR_TRAMO.length - 1)]}`} aria-hidden />{tr.nombre}: <span className="cifra font-medium text-gray-900">{Q(r.total.tramos[tr.clave])}</span></li>)}</ul>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-xs text-gray-500"><tr><th className="py-1">Cliente</th><th className="py-1 text-right">Debe</th>{r.tramos.map((tr) => <th key={tr.clave} className="py-1 text-right">{tr.nombre}</th>)}</tr></thead>
          <tbody className="divide-y">{r.clientes.map((c) => (
            <tr key={c.clienteId} className="cursor-pointer hover:bg-gray-50" onClick={() => onCliente(c.clienteId)}>
              <td className="py-1.5"><span className="font-medium">{c.cliente}</span><span className="block text-xs text-gray-500">{c.cuentas} cuenta(s){c.diasMasVieja > 0 ? ` · la más vieja, ${c.diasMasVieja} días vencida` : ''}</span></td>
              <td className="cifra py-1.5 text-right font-semibold">{Q(c.saldo)}</td>
              {r.tramos.map((tr, i) => <td key={tr.clave} className={`cifra py-1.5 text-right ${Number(c.tramos[tr.clave]) > 0 && i >= r.tramos.length - 1 ? 'font-semibold text-red-700' : ''}`}>{Number(c.tramos[tr.clave]) ? Q(c.tramos[tr.clave]) : '—'}</td>)}
            </tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  )
}

function SinFacturar({ grupos, puedeFacturar, onFacturar }) {
  const [marcados, setMarcados] = useState({})
  if (!grupos) { return <p className="text-sm text-gray-500">Cargando…</p> }
  if (!grupos.length) { return <p className="rounded-superficie border bg-white px-4 py-10 text-center text-sm text-gray-500">Todos los viajes terminados ya están facturados.</p> }
  const alternar = (cid, vid) => setMarcados((m) => { const s = new Set(m[cid] ?? []); s.has(vid) ? s.delete(vid) : s.add(vid); return { ...m, [cid]: [...s] } })
  return (
    <div className="space-y-3">
      {grupos.map((g) => {
        const sel = marcados[g.clienteId] ?? []
        const elegidos = g.viajes.filter((v) => sel.includes(v.id))
        const suma = elegidos.reduce((a, v) => a + Number(v.montoCobrado), 0)
        return (
          <section key={g.clienteId} className="rounded-superficie border bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
              <div><h3 className="font-semibold">{g.cliente}</h3><p className="text-xs text-gray-500">{g.viajes.length} viaje(s) sin facturar · {Q(g.monto)} · crédito {g.diasCredito || 'según parámetro'} días</p></div>
              {puedeFacturar && <div className="flex gap-2">
                <Boton onClick={() => setMarcados((m) => ({ ...m, [g.clienteId]: sel.length === g.viajes.length ? [] : g.viajes.map((v) => v.id) }))}>{sel.length === g.viajes.length ? 'Quitar todos' : 'Elegir todos'}</Boton>
                <BotonPrimario disabled={!elegidos.length} onClick={() => onFacturar({ clienteId: g.clienteId, cliente: g.cliente, diasCredito: g.diasCredito, viajes: elegidos })}><Receipt className="h-4 w-4" aria-hidden /> Facturar {elegidos.length ? `${elegidos.length} (${Q(suma)})` : ''}</BotonPrimario>
              </div>}
            </div>
            <ul className="divide-y text-sm">{g.viajes.map((v) => (
              <li key={v.id}><label className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 hover:bg-gray-50">
                {puedeFacturar && <input type="checkbox" checked={sel.includes(v.id)} onChange={() => alternar(g.clienteId, v.id)} className="accent-green-600" aria-label={`Facturar ${v.numero}`} />}
                <span className="w-24 font-medium">{v.numero}</span>
                <span className="min-w-0 flex-1 basis-48 truncate">{v.ruta}{v.referencia ? ` · Ref. ${v.referencia}` : ''}</span>
                <span className={`w-36 text-xs ${v.diasSinFacturar > 3 ? 'text-amber-800' : 'text-gray-500'}`}>terminó {fecha(v.fechaLlegada)}{v.diasSinFacturar ? ` · hace ${v.diasSinFacturar} días` : ''}</span>
                <span className="cifra w-28 text-right">{Q(v.montoCobrado)}</span>
              </label></li>
            ))}</ul>
          </section>
        )
      })}
    </div>
  )
}

function Facturar({ inicial, onCerrar, onListo }) {
  const { clientes } = useCatalogos()
  const conViajes = inicial.viajes.length > 0
  const sumaViajes = inicial.viajes.reduce((a, v) => a + Number(v.montoCobrado), 0)
  const [f, setF] = useState({ clienteId: inicial.clienteId, tipoDocumento: 'FACTURA', serie: '', numeroDocumento: '', autorizacionFel: '', fechaEmision: hoy(), diasCredito: inicial.diasCredito ? String(inicial.diasCredito) : '', monto: conViajes ? sumaViajes.toFixed(2) : '', descripcion: '' })
  const [enviando, setEnviando] = useState(false)
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const clienteSel = clientes.find((c) => String(c.id) === String(f.clienteId))
  const dias = f.diasCredito !== '' ? Number(f.diasCredito) : (clienteSel?.diasCredito || null)
  const listo = f.clienteId && f.fechaEmision && Number(f.monto) > 0
  const ir = async () => {
    setEnviando(true)
    const r = await enviar('post', '/cobros', { ...f, clienteId: Number(f.clienteId), viajeIds: inicial.viajes.map((v) => v.id), diasCredito: f.diasCredito === '' ? undefined : Number(f.diasCredito), monto: Number(f.monto) })
    setEnviando(false)
    if (r) { onListo() }
  }
  return (
    <Modal abierto titulo={conViajes ? `Facturar ${inicial.viajes.length} viaje(s) de ${inicial.cliente}` : 'Cuenta por cobrar sin viajes'} onCerrar={onCerrar} ancho="max-w-lg"
      pie={<><Boton onClick={onCerrar}>Cancelar</Boton><BotonPrimario disabled={enviando || !listo} onClick={ir}>{enviando ? 'Guardando…' : 'Registrar cuenta'}</BotonPrimario></>}>
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        {!conViajes && <Campo etiqueta="Cliente" id="clienteId" requerido className="sm:col-span-2"><select value={f.clienteId} onChange={set('clienteId')} className={ent}><option value="">Elija…</option>{clientes.map((c) => <option key={c.id} value={c.id}>{nombreTercero(c)}</option>)}</select></Campo>}
        <Campo etiqueta="Documento" id="tipoDocumento"><select value={f.tipoDocumento} onChange={set('tipoDocumento')} className={ent}>{DOCUMENTOS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
        <div className="grid grid-cols-[5rem_1fr] gap-2">
          <Campo etiqueta="Serie" id="serie"><input value={f.serie} onChange={set('serie')} maxLength={20} className={ent} /></Campo>
          <Campo etiqueta="Número" id="numeroDocumento"><input value={f.numeroDocumento} onChange={set('numeroDocumento')} maxLength={40} className={ent} /></Campo>
        </div>
        <Campo etiqueta="Autorización FEL (opcional)" id="autorizacionFel" className="sm:col-span-2"><input value={f.autorizacionFel} onChange={set('autorizacionFel')} maxLength={60} placeholder="Número de autorización de la factura electrónica" className={ent} /></Campo>
        <Campo etiqueta="Fecha de emisión" id="fechaEmision" requerido><input type="date" value={f.fechaEmision} max={hoy()} onChange={set('fechaEmision')} className={ent} /></Campo>
        <Campo etiqueta="Crédito" id="diasCredito"><select value={f.diasCredito} onChange={set('diasCredito')} className={ent}><option value="">Del cliente{clienteSel?.diasCredito ? ` (${clienteSel.diasCredito} días)` : ''}</option>{PLAZOS.map((d) => <option key={d} value={d}>{d ? `${d} días` : 'Contado'}</option>)}</select></Campo>
        <Campo etiqueta="Monto a cobrar (Q)" id="monto" requerido><input inputMode="decimal" value={f.monto} onChange={set('monto')} className={`${ent} text-right`} /></Campo>
        <div className="self-end pb-2 text-gray-600">{hay(dias) && f.fechaEmision ? <>Vence el <b>{fecha(sumarDias(f.fechaEmision, dias))}</b></> : 'Vence según los días de crédito del cliente'}</div>
        {conViajes && Math.abs(Number(f.monto) - sumaViajes) > 0.004 && <p className="rounded-control bg-amber-50 px-3 py-2 text-amber-900 sm:col-span-2">Lo cobrado en los viajes suma {Q(sumaViajes)}. Si la factura incluye otros cargos, explíquelo abajo.</p>}
        <Campo etiqueta="Descripción" id="descripcion" className="sm:col-span-2"><textarea rows={2} value={f.descripcion} onChange={set('descripcion')} maxLength={500} placeholder={conViajes ? inicial.viajes.map((v) => v.numero).join(', ') : 'Qué se cobra'} className={ent} /></Campo>
      </div>
    </Modal>
  )
}

function Recordatorio({ r }) {
  if (!r) { return null }
  const copiar = async () => { try { await navigator.clipboard.writeText(r.texto); showToast({ type: 'success', message: 'Mensaje copiado' }) } catch { showToast({ type: 'error', message: 'No se pudo copiar' }) } }
  return (
    <section className="rounded-tarjeta bg-white p-4">
      <h3 className="mb-2 font-semibold">Recordatorio al cliente</h3>
      <pre className="whitespace-pre-wrap rounded-control bg-gray-50 p-3 font-sans text-xs text-gray-700">{r.texto}</pre>
      <div className="mt-2 flex flex-wrap gap-2">
        {r.whatsapp ? <a href={r.whatsapp} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-control bg-green-600 px-3 py-2 font-medium text-white hover:bg-green-700"><MessageCircle className="h-4 w-4" aria-hidden /> WhatsApp</a> : <span className="text-xs text-gray-500">Sin teléfono del cliente para WhatsApp.</span>}
        {r.correo && <a href={r.correo} className="inline-flex items-center gap-1.5 rounded-control border px-3 py-2 hover:bg-gray-50"><Mail className="h-4 w-4" aria-hidden /> Correo</a>}
        <Boton onClick={copiar}><Copy className="h-4 w-4" aria-hidden /> Copiar</Boton>
      </div>
      <p className="mt-2 text-xs text-gray-500">Después de enviarlo, regístrelo en el seguimiento.</p>
    </section>
  )
}

function Detalle({ id, onCerrar, onCambio }) {
  const { puede } = usePermisos()
  const { datos: c, recargar } = useConsulta(id ? `/cobros/${id}` : null)
  const [modo, setModo] = useState(null) // abono | gestion | anular | anularAbono:<id>
  const [enviando, setEnviando] = useState(false)
  const [abono, setAbono] = useState({ fecha: hoy(), monto: '', medio: 'TRANSFERENCIA', referencia: '', banco: '' })
  const [gestion, setGestion] = useState({ tipo: 'LLAMADA', nota: '', promesaFecha: '', promesaMonto: '' })
  const [motivo, setMotivo] = useState('')
  if (!id) { return null }
  const abiertaC = c && ['PENDIENTE', 'PARCIAL'].includes(c.estado)
  const hecho = (ok) => { if (ok) { setModo(null); setMotivo(''); recargar(); onCambio() } setEnviando(false) }
  const enviarAbono = async () => { setEnviando(true); hecho(await enviar('post', `/cobros/${c.id}/abonos`, { ...abono, monto: Number(abono.monto || c.saldo) })) }
  const enviarGestion = async () => { setEnviando(true); const ok = await enviar('post', `/cobros/${c.id}/gestiones`, { ...gestion, promesaFecha: gestion.tipo === 'PROMESA' ? gestion.promesaFecha : null, promesaMonto: gestion.tipo === 'PROMESA' && gestion.promesaMonto ? Number(gestion.promesaMonto) : null }); if (ok) { setGestion({ tipo: 'LLAMADA', nota: '', promesaFecha: '', promesaMonto: '' }) } hecho(ok) }
  const anular = async () => { setEnviando(true); hecho(await enviar('put', modo === 'anular' ? `/cobros/${c.id}/anular` : `/cobros/${c.id}/abonos/${modo.split(':')[1]}/anular`, { motivo })) }
  const [estado, color] = c ? ESTADO[c.estado] : []
  return (
    <Hoja abierta titulo={c ? `${c.numero} · ${c.cliente}` : 'Cuenta por cobrar'} onCerrar={() => { setModo(null); onCerrar() }}
      pie={c && abiertaC && !modo && (
        <div className="flex w-full flex-wrap justify-end gap-2">
          {puede('cobros.anular') && <Boton peligro onClick={() => setModo('anular')}>Anular</Boton>}
          {puede('cobros.gestionar') && <Boton onClick={() => setModo('gestion')}>Seguimiento</Boton>}
          {puede('cobros.abonar') && <BotonPrimario onClick={() => { setAbono((a) => ({ ...a, monto: c.saldo })); setModo('abono') }}>Registrar abono</BotonPrimario>}
        </div>
      )}>
      {!c ? <p className="text-sm text-gray-500">Cargando…</p> : (
        <div className="space-y-4 text-sm">
          <section className="rounded-tarjeta bg-white p-4">
            <div className="flex flex-wrap gap-2"><Etiqueta color={color}>{estado}</Etiqueta>{hay(c.diasVencida) && <Etiqueta color={c.vencida ? 'rojo' : 'gris'}>{textoDias(c.diasVencida)}</Etiqueta>}{c.promesa && <Etiqueta color={c.promesa.estado === 'INCUMPLIDA' ? 'rojo' : c.promesa.estado === 'CUMPLIDA' ? 'verde' : 'ambar'}>Promesa {c.promesa.estado.toLowerCase()} · {fecha(c.promesa.fecha)}</Etiqueta>}</div>
            <p className="mt-3 text-gray-500">Saldo</p>
            <p className="cifra text-3xl font-semibold">{Q(c.saldo)}</p>
            <p className="text-gray-500">de {Q(c.monto)}{Number(c.monto) !== Number(c.saldo) ? ` · abonado ${Q(Number(c.monto) - Number(c.saldo))}` : ''}</p>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1">
              <dt className="text-gray-500">Documento</dt><dd>{c.documento}</dd>
              {c.autorizacionFel && <><dt className="text-gray-500">Autorización FEL</dt><dd className="break-all">{c.autorizacionFel}</dd></>}
              <dt className="text-gray-500">Emitida</dt><dd>{fecha(c.fechaEmision)}</dd>
              <dt className="text-gray-500">Vence</dt><dd>{fecha(c.fechaVencimiento)} ({c.diasCredito} días)</dd>
              <dt className="text-gray-500">Cliente</dt><dd>{c.cliente}{c.clienteDatos.nit ? ` · NIT ${c.clienteDatos.nit}` : ''}</dd>
              {c.clienteDatos.contacto && <><dt className="text-gray-500">Contacto</dt><dd>{c.clienteDatos.contacto}{c.clienteDatos.telefono ? ` · ${c.clienteDatos.telefono}` : ''}</dd></>}
              <dt className="text-gray-500">Registró</dt><dd>{c.creadoPor} · {fechaHora(c.creadoEn)}</dd>
            </dl>
            {c.descripcion && <p className="mt-2 text-gray-600">{c.descripcion}</p>}
            {c.motivoAnulacion && <p className="mt-2 rounded-control bg-gray-100 px-3 py-2">Anulada: {c.motivoAnulacion}</p>}
          </section>

          {modo === 'abono' && (
            <section className="grid gap-3 rounded-tarjeta border-2 border-green-600 bg-white p-4 sm:grid-cols-2">
              <h3 className="font-semibold sm:col-span-2">Registrar abono</h3>
              <Campo etiqueta="Monto (Q)" id="abonoMonto" requerido><input inputMode="decimal" value={abono.monto} onChange={(e) => setAbono((a) => ({ ...a, monto: e.target.value }))} className={`${ent} text-right`} /></Campo>
              <Campo etiqueta="Fecha" id="abonoFecha" requerido><input type="date" max={hoy()} value={abono.fecha} onChange={(e) => setAbono((a) => ({ ...a, fecha: e.target.value }))} className={ent} /></Campo>
              <Campo etiqueta="Forma" id="abonoMedio"><select value={abono.medio} onChange={(e) => setAbono((a) => ({ ...a, medio: e.target.value }))} className={ent}>{MEDIOS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
              <Campo etiqueta={abono.medio.startsWith('RETENCION') ? 'Número de constancia' : 'Referencia (boleta, cheque…)'} id="abonoRef"><input value={abono.referencia} onChange={(e) => setAbono((a) => ({ ...a, referencia: e.target.value }))} maxLength={60} className={ent} /></Campo>
              {['TRANSFERENCIA', 'DEPOSITO', 'CHEQUE'].includes(abono.medio) && <Campo etiqueta="Banco" id="abonoBanco"><input value={abono.banco} onChange={(e) => setAbono((a) => ({ ...a, banco: e.target.value }))} maxLength={60} className={ent} /></Campo>}
              <div className="flex justify-end gap-2 sm:col-span-2"><Boton onClick={() => setModo(null)}>Cancelar</Boton><BotonPrimario disabled={enviando || !(Number(abono.monto) > 0)} onClick={enviarAbono}>{enviando ? 'Guardando…' : `Aplicar ${Q(abono.monto || 0)}`}</BotonPrimario></div>
            </section>
          )}
          {modo === 'gestion' && (
            <section className="grid gap-3 rounded-tarjeta border-2 border-green-600 bg-white p-4 sm:grid-cols-2">
              <h3 className="font-semibold sm:col-span-2">Seguimiento de cobro</h3>
              <Campo etiqueta="Qué se hizo" id="gTipo"><select value={gestion.tipo} onChange={(e) => setGestion((g) => ({ ...g, tipo: e.target.value }))} className={ent}>{GESTIONES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
              {gestion.tipo === 'PROMESA' && <><Campo etiqueta="Paga el" id="gFecha" requerido><input type="date" min={hoy()} value={gestion.promesaFecha} onChange={(e) => setGestion((g) => ({ ...g, promesaFecha: e.target.value }))} className={ent} /></Campo>
                <Campo etiqueta="Monto prometido (Q)" id="gMonto"><input inputMode="decimal" value={gestion.promesaMonto} onChange={(e) => setGestion((g) => ({ ...g, promesaMonto: e.target.value }))} placeholder={String(c.saldo)} className={`${ent} text-right`} /></Campo></>}
              <Campo etiqueta="Nota" id="gNota" requerido className="sm:col-span-2"><textarea rows={2} value={gestion.nota} onChange={(e) => setGestion((g) => ({ ...g, nota: e.target.value }))} maxLength={1000} placeholder="Con quién habló y qué acordaron" className={ent} /></Campo>
              <div className="flex justify-end gap-2 sm:col-span-2"><Boton onClick={() => setModo(null)}>Cancelar</Boton><BotonPrimario disabled={enviando || gestion.nota.trim().length < 3 || (gestion.tipo === 'PROMESA' && !gestion.promesaFecha)} onClick={enviarGestion}>Guardar</BotonPrimario></div>
            </section>
          )}
          {(modo === 'anular' || modo?.startsWith('anularAbono')) && (
            <section className="space-y-2 rounded-tarjeta border-2 border-red-300 bg-white p-4">
              <h3 className="font-semibold">{modo === 'anular' ? 'Anular la cuenta (sus viajes vuelven a «sin facturar»)' : 'Anular el abono'}</h3>
              <textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} placeholder="Motivo" aria-label="Motivo" className={ent} />
              <div className="flex justify-end gap-2"><Boton onClick={() => setModo(null)}>Cancelar</Boton><Boton peligro disabled={enviando || motivo.trim().length < 5} onClick={anular}>Anular</Boton></div>
            </section>
          )}

          {abiertaC && <Recordatorio r={c.recordatorio} />}

          <section className="rounded-tarjeta bg-white p-4">
            <h3 className="mb-2 font-semibold">Abonos</h3>
            <ul className="divide-y">{c.abonos.map((a) => (
              <li key={a.id} className={`flex flex-wrap items-center gap-x-3 py-2 ${a.anulado ? 'text-gray-400 line-through' : ''}`}>
                <span className="min-w-0 flex-1"><span className="block">{a.medioNombre}{a.referencia ? ` · ${a.referencia}` : ''}{a.banco ? ` · ${a.banco}` : ''}</span><span className="block text-xs text-gray-500 no-underline">{fecha(a.fecha)} · {a.registradoPor}{a.anulado ? ` · anulado: ${a.motivoAnulacion}` : ''}</span></span>
                <span className="cifra">{Q(a.monto)}</span>
                {!a.anulado && c.estado !== 'ANULADA' && puede('cobros.anular') && <button type="button" onClick={() => setModo(`anularAbono:${a.id}`)} className="text-xs text-red-700 underline">Anular</button>}
              </li>
            ))}{!c.abonos.length && <li className="py-2 text-gray-500">Sin abonos todavía.</li>}</ul>
          </section>

          {c.viajesDetalle.length > 0 && <section className="rounded-tarjeta bg-white p-4">
            <h3 className="mb-2 font-semibold">Viajes que cobra ({c.viajesDetalle.length})</h3>
            <ul className="divide-y">{c.viajesDetalle.map((v) => <li key={v.id} className="flex items-center gap-3 py-1.5"><span className="w-24 font-medium">{v.numero}</span><span className="min-w-0 flex-1 truncate">{v.ruta}{v.referencia ? ` · ${v.referencia}` : ''}</span><span className="cifra">{Q(v.montoCobrado)}</span></li>)}</ul>
          </section>}

          <section className="rounded-tarjeta bg-white p-4">
            <h3 className="mb-2 font-semibold">Seguimiento</h3>
            <ol className="space-y-2">{c.gestiones.map((g) => <li key={g.id} className="border-l-2 border-gray-200 pl-3"><p className="text-xs text-gray-500">{fechaHora(g.creadoEn)} · {g.usuario} · {GESTIONES.find(([k]) => k === g.tipo)?.[1]}</p><p>{g.nota}</p>{g.promesaFecha && <p className="text-xs text-amber-900">Promete pagar {g.promesaMonto ? Q(g.promesaMonto) : 'el saldo'} el {fecha(g.promesaFecha)}</p>}</li>)}
              {!c.gestiones.length && <li className="text-gray-500">Sin seguimiento todavía.</li>}</ol>
          </section>
        </div>
      )}
    </Hoja>
  )
}

function EstadoCliente({ id, onCerrar, onAbrir }) {
  const { datos: e } = useConsulta(`/cobros/clientes/${id}`)
  const limite = Number(e?.limiteCredito ?? 0)
  const uso = useMemo(() => (limite > 0 && e ? Math.min(100, (Number(e.saldo) / limite) * 100) : null), [e, limite])
  return (
    <Modal abierto titulo={e ? `Estado de cuenta · ${e.cliente}` : 'Estado de cuenta'} onCerrar={onCerrar}>
      {!e ? <p className="text-sm text-gray-500">Cargando…</p> : (
        <div className="space-y-4 text-sm">
          <div className="grid gap-3 sm:grid-cols-3">
            <Cifra titulo="Debe" valor={Q(e.saldo)} />
            <Cifra titulo="Vencido" valor={Q(e.vencido)} tono={Number(e.vencido) > 0 ? 'malo' : null} />
            <Cifra titulo="Límite de crédito" valor={limite ? Q(limite) : 'Sin límite'} detalle={hay(uso) ? `Usa el ${num(uso, 0)} %` : `Crédito de ${e.diasCredito || '—'} días`} tono={hay(uso) && uso >= 100 ? 'malo' : null} />
          </div>
          <ul className="divide-y rounded-tarjeta border">{e.cuentas.map((c) => (
            <li key={c.id}><button type="button" onClick={() => onAbrir(c.id)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-gray-50">
              <span className="min-w-0 flex-1"><span className="block font-medium">{c.documento}</span><span className={`block text-xs ${c.vencida ? 'text-red-700' : 'text-gray-500'}`}>{textoDias(c.diasVencida)} · {fecha(c.fechaVencimiento)}</span></span>
              <span className="cifra font-semibold">{Q(c.saldo)}</span>
            </button></li>
          ))}</ul>
          <Recordatorio r={e.recordatorio} />
        </div>
      )}
    </Modal>
  )
}
