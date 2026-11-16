// ─────────────────────────────────────────────────────────────────────────────
// VIAJES: programar → en ruta → finalizar → liquidar (o cancelar), con los costos del viaje.
// La lista muestra siempre los viajes abiertos y, por mes, los cerrados. Al tocar uno se abre
// la hoja con sus costos, cargas de combustible, inspecciones y la liquidación.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Plus, Route as RouteIcon, Trash2 } from 'lucide-react'
import api from '../../services/api'
import { usePermisos } from '../../hooks/usePermisos'
import { useValidacion } from '../../hooks/useValidacion'
import { showToast } from '../../utils/showToast'
import { Q, errorApi } from '../comun/formato'
import Campo from '../comun/Campo'
import Modal from '../comun/Modal'
import Hoja, { Grupo, Fila } from '../comun/Hoja'
import ResumenErrores from '../forms/ResumenErrores'
import { confirmar } from '../comun/Confirmacion'
import { SubirFoto, VerAdjunto } from '../comun/Adjunto'
import { ahora, hoy, fh, km, ent, TIPOS_COSTO } from './comun'
import { Etiqueta, Boton, BotonBorde } from './Ui'

const CAMPOS = [
  { name: 'clienteId', label: 'Cliente', type: 'select', required: true },
  { name: 'cabezalId', label: 'Cabezal', type: 'select', required: true },
  { name: 'pilotoId', label: 'Piloto', type: 'select', required: true },
  { name: 'fechaSalida', label: 'Fecha de salida', type: 'text', required: true },
]
const num = (v) => (v === '' || (v === null || v === undefined) ? null : Number(v))

/** Programar o editar un viaje. */
function FormViaje({ opciones, viaje, onListo, onCerrar }) {
  const [f, setF] = useState(() => viaje
    ? { clienteId: String(viaje.clienteId), rutaId: viaje.rutaId ? String(viaje.rutaId) : '', tarifaId: viaje.tarifaId ? String(viaje.tarifaId) : '', cabezalId: String(viaje.cabezalId), remolqueId: viaje.remolqueId ? String(viaje.remolqueId) : '', pilotoId: String(viaje.pilotoId), origen: viaje.origen, destino: viaje.destino, carga: viaje.carga ?? '', toneladas: viaje.toneladas ?? '', referencia: viaje.referencia ?? '', fechaSalida: viaje.fechaSalida.slice(0, 16), fechaCompromiso: viaje.fechaCompromiso ? viaje.fechaCompromiso.slice(0, 16) : '', montoCobrado: viaje.montoCobrado, anticipoPiloto: viaje.anticipoPiloto, pagoPiloto: viaje.pagoPiloto, observaciones: viaje.observaciones ?? '' }
    : { clienteId: '', rutaId: '', tarifaId: '', cabezalId: '', remolqueId: '', pilotoId: '', origen: '', destino: '', carga: '', toneladas: '', referencia: '', fechaSalida: ahora(), fechaCompromiso: '', montoCobrado: '', anticipoPiloto: '', pagoPiloto: '', observaciones: '' })
  const [enviando, setEnviando] = useState(false)
  const v = useValidacion(CAMPOS)
  const set = (k) => (e) => { v.alCambiar(k); setF((x) => ({ ...x, [k]: e.target.value })) }
  const ruta = opciones.rutas.find((r) => String(r.id) === f.rutaId)
  const tarifas = opciones.tarifas.filter((t) => String(t.clienteId) === f.clienteId && (!t.rutaId || String(t.rutaId) === f.rutaId))
  const tarifa = tarifas.find((t) => String(t.id) === f.tarifaId)
  const sugerido = tarifa ? (tarifa.tipo === 'POR_KM' ? tarifa.monto * (ruta?.kmEstimados ?? 0) : tarifa.tipo === 'POR_TONELADA' ? tarifa.monto * (Number(f.toneladas) || 0) : tarifa.monto) : null
  const elegirCabezal = (e) => { set('cabezalId')(e); const c = opciones.cabezales.find((x) => String(x.id) === e.target.value); if (c?.pilotoAsignadoId && !f.pilotoId) setF((x) => ({ ...x, cabezalId: e.target.value, pilotoId: String(c.pilotoAsignadoId) })) }
  const elegirPiloto = (e) => { set('pilotoId')(e); const p = opciones.pilotos.find((x) => String(x.id) === e.target.value); if (p && f.pagoPiloto === '') setF((x) => ({ ...x, pilotoId: e.target.value, pagoPiloto: p.pagoPorViaje })) }
  const guardar = async () => {
    const r = v.validar(f)
    if (!r.ok) return
    setEnviando(true)
    const cuerpo = { clienteId: num(f.clienteId), rutaId: num(f.rutaId), tarifaId: num(f.tarifaId), cabezalId: num(f.cabezalId), remolqueId: num(f.remolqueId), pilotoId: num(f.pilotoId), origen: f.origen.trim() || null, destino: f.destino.trim() || null, carga: f.carga.trim() || null, toneladas: num(f.toneladas), referencia: f.referencia.trim() || null, fechaSalida: f.fechaSalida, fechaCompromiso: f.fechaCompromiso || null, montoCobrado: num(f.montoCobrado), anticipoPiloto: num(f.anticipoPiloto), pagoPiloto: num(f.pagoPiloto), observaciones: f.observaciones.trim() || null }
    try { const { data } = viaje ? await api.put(`/viajes/${viaje.id}`, cuerpo) : await api.post('/viajes', cuerpo); onListo(data.message) }
    catch (e) { v.delServidor(e); showToast({ type: 'error', message: errorApi(e).mensaje }) } finally { setEnviando(false) }
  }
  return (
    <Modal abierto titulo={viaje ? `Editar viaje ${viaje.numero}` : 'Programar viaje'} onCerrar={onCerrar} ancho="max-w-3xl"
      pie={<><BotonBorde onClick={onCerrar}>Cancelar</BotonBorde><Boton disabled={enviando} onClick={guardar}>{enviando ? 'Guardando…' : viaje ? 'Guardar' : 'Programar'}</Boton></>}>
      <ResumenErrores lista={v.lista} />
      <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <Campo etiqueta="Cliente" id="clienteId" requerido error={v.error('clienteId')}><select value={f.clienteId} onChange={(e) => { set('clienteId')(e); setF((x) => ({ ...x, clienteId: e.target.value, tarifaId: '' })) }} className={ent}><option value="">Elija…</option>{opciones.clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></Campo>
        <Campo etiqueta="Ruta" id="rutaId"><select value={f.rutaId} onChange={(e) => { const r = opciones.rutas.find((x) => String(x.id) === e.target.value); setF((x) => ({ ...x, rutaId: e.target.value, tarifaId: '', origen: r ? r.origen : x.origen, destino: r ? r.destino : x.destino })) }} className={ent}><option value="">Sin ruta (origen y destino libres)</option>{opciones.rutas.map((r) => <option key={r.id} value={r.id}>{r.nombre} · {r.kmEstimados} km</option>)}</select></Campo>
        <Campo etiqueta="Tarifa" id="tarifaId"><select value={f.tarifaId} onChange={set('tarifaId')} className={ent} disabled={!f.clienteId}><option value="">{tarifas.length ? 'Vigente del cliente (automática)' : 'Sin tarifa: escriba el monto'}</option>{tarifas.map((t) => <option key={t.id} value={t.id}>{t.descripcion || (t.rutaId ? 'Por ruta' : 'General')} · {Q(t.monto)} {t.tipo === 'POR_KM' ? '/km' : t.tipo === 'POR_TONELADA' ? '/ton' : '/viaje'}</option>)}</select></Campo>
        <Campo etiqueta="Origen" id="origen"><input value={f.origen} onChange={set('origen')} maxLength={120} className={ent} /></Campo>
        <Campo etiqueta="Destino" id="destino"><input value={f.destino} onChange={set('destino')} maxLength={120} className={ent} /></Campo>
        <Campo etiqueta="Referencia (orden, BL, contenedor)" id="referencia"><input value={f.referencia} onChange={set('referencia')} maxLength={80} className={ent} /></Campo>
        <Campo etiqueta="Cabezal" id="cabezalId" requerido error={v.error('cabezalId')}><select value={f.cabezalId} onChange={elegirCabezal} className={ent}><option value="">Elija…</option>{opciones.cabezales.map((c) => <option key={c.id} value={c.id} disabled={Boolean(c.enRuta) || c.estado !== 'ACTIVO'}>{c.codigo} · {c.placa}{c.enRuta ? ` (en ${c.enRuta})` : c.estado !== 'ACTIVO' ? ` (${c.estado.toLowerCase().replace('_', ' ')})` : ''}</option>)}</select></Campo>
        <Campo etiqueta="Remolque" id="remolqueId"><select value={f.remolqueId} onChange={set('remolqueId')} className={ent}><option value="">Sin remolque</option>{opciones.remolques.map((r) => <option key={r.id} value={r.id}>{r.codigo} · {r.placa}</option>)}</select></Campo>
        <Campo etiqueta="Piloto" id="pilotoId" requerido error={v.error('pilotoId')}><select value={f.pilotoId} onChange={elegirPiloto} className={ent}><option value="">Elija…</option>{opciones.pilotos.map((p) => <option key={p.id} value={p.id} disabled={Boolean(p.enRuta) || p.licenciaVencida}>{p.nombre}{p.enRuta ? ` (en ${p.enRuta})` : p.licenciaVencida ? ' (licencia vencida)' : ''}</option>)}</select></Campo>
        <Campo etiqueta="Carga" id="carga"><input value={f.carga} onChange={set('carga')} maxLength={200} placeholder="Ej. Contenedor 40' con azúcar" className={ent} /></Campo>
        <Campo etiqueta="Toneladas" id="toneladas"><input type="number" min="0" step="0.01" value={f.toneladas} onChange={set('toneladas')} className={`${ent} text-right`} /></Campo>
        <Campo etiqueta="Salida programada" id="fechaSalida" requerido error={v.error('fechaSalida')}><input type="datetime-local" value={f.fechaSalida} onChange={set('fechaSalida')} className={ent} /></Campo>
        <Campo etiqueta="Compromiso de entrega" id="fechaCompromiso"><input type="datetime-local" value={f.fechaCompromiso} onChange={set('fechaCompromiso')} className={ent} /></Campo>
        <Campo etiqueta={`Cobro al cliente (Q)${(sugerido !== null && sugerido !== undefined) && f.montoCobrado === '' ? ` · tarifa: ${Q(sugerido)}` : ''}`} id="montoCobrado"><input type="number" min="0" step="0.01" value={f.montoCobrado} onChange={set('montoCobrado')} placeholder={(sugerido !== null && sugerido !== undefined) ? String(sugerido) : 'Según tarifa vigente'} className={`${ent} text-right`} /></Campo>
        <Campo etiqueta="Anticipo al piloto (Q)" id="anticipoPiloto"><input type="number" min="0" step="0.01" value={f.anticipoPiloto} onChange={set('anticipoPiloto')} className={`${ent} text-right`} /></Campo>
        <Campo etiqueta="Pago al piloto por el viaje (Q)" id="pagoPiloto"><input type="number" min="0" step="0.01" value={f.pagoPiloto} onChange={set('pagoPiloto')} placeholder="Bono del piloto" className={`${ent} text-right`} /></Campo>
        <Campo etiqueta="Observaciones" id="observaciones" className="sm:col-span-2 lg:col-span-3"><textarea rows={2} value={f.observaciones} onChange={set('observaciones')} maxLength={500} className={ent} /></Campo>
      </div>
    </Modal>
  )
}

function Iniciar({ viaje, onListo, onCerrar }) {
  const [kmSalida, setKmSalida] = useState(viaje.odometroCabezal ?? '')
  const [fecha, setFecha] = useState(ahora())
  const [enviando, setEnviando] = useState(false)
  const ir = async () => { setEnviando(true); try { const { data } = await api.put(`/viajes/${viaje.id}/iniciar`, { kmSalida: num(kmSalida), fechaSalida: fecha }); onListo(data.message) } catch (e) { showToast({ type: 'error', message: errorApi(e).mensaje }) } finally { setEnviando(false) } }
  return (
    <Modal abierto titulo={`Salir: viaje ${viaje.numero}`} onCerrar={onCerrar} ancho="max-w-md" pie={<><BotonBorde onClick={onCerrar}>Cancelar</BotonBorde><Boton disabled={enviando} onClick={ir}>Iniciar viaje</Boton></>}>
      <p className="text-sm text-gray-600">{viaje.cabezal} · {viaje.piloto} · {viaje.origen} → {viaje.destino}</p>
      <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <Campo etiqueta="Odómetro de salida (km)" id="kmSalida" requerido><input type="number" min="0" step="0.1" value={kmSalida} onChange={(e) => setKmSalida(e.target.value)} className={`${ent} text-right`} /></Campo>
        <Campo etiqueta="Hora de salida" id="fechaSalidaReal"><input type="datetime-local" value={fecha} onChange={(e) => setFecha(e.target.value)} className={ent} /></Campo>
      </div>
    </Modal>
  )
}

function Finalizar({ viaje, onListo, onCerrar }) {
  const [f, setF] = useState({ kmLlegada: '', fechaLlegada: ahora(), kmVacios: viaje.kmVacios || '', observaciones: '' })
  const [enviando, setEnviando] = useState(false)
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const recorrido = f.kmLlegada !== '' && (viaje.kmSalida !== null && viaje.kmSalida !== undefined) ? Number(f.kmLlegada) - viaje.kmSalida : null
  const ir = async () => { setEnviando(true); try { const { data } = await api.put(`/viajes/${viaje.id}/finalizar`, { kmLlegada: num(f.kmLlegada), fechaLlegada: f.fechaLlegada, kmVacios: num(f.kmVacios), observaciones: f.observaciones.trim() || null }); onListo(data.message) } catch (e) { showToast({ type: 'error', message: errorApi(e).mensaje }) } finally { setEnviando(false) } }
  return (
    <Modal abierto titulo={`Finalizar viaje ${viaje.numero}`} onCerrar={onCerrar} ancho="max-w-md" pie={<><BotonBorde onClick={onCerrar}>Cancelar</BotonBorde><Boton disabled={enviando || f.kmLlegada === ''} onClick={ir}>Finalizar</Boton></>}>
      <p className="text-sm text-gray-600">Salió con {km(viaje.kmSalida)} el {fh(viaje.fechaSalida)}</p>
      <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <Campo etiqueta="Odómetro de llegada (km)" id="kmLlegada" requerido><input type="number" min={viaje.kmSalida ?? 0} step="0.1" value={f.kmLlegada} onChange={set('kmLlegada')} className={`${ent} text-right`} /></Campo>
        <Campo etiqueta="Hora de llegada" id="fechaLlegada"><input type="datetime-local" value={f.fechaLlegada} onChange={set('fechaLlegada')} className={ent} /></Campo>
        <Campo etiqueta="Km vacíos (sin carga)" id="kmVacios"><input type="number" min="0" step="0.1" value={f.kmVacios} onChange={set('kmVacios')} className={`${ent} text-right`} /></Campo>
        <div className="self-end pb-2 text-sm">{(recorrido !== null && recorrido !== undefined) && <span className={recorrido < 0 ? 'text-red-700' : 'font-medium'}>Recorrido: {km(recorrido)}</span>}</div>
        <Campo etiqueta="Observaciones" id="obsFin" className="sm:col-span-2"><textarea rows={2} value={f.observaciones} onChange={set('observaciones')} maxLength={500} className={ent} /></Campo>
      </div>
    </Modal>
  )
}

function AgregarCosto({ viaje, onListo, onCerrar }) {
  const [f, setF] = useState({ tipo: 'PEAJE', descripcion: '', monto: '', fecha: hoy(), pagadoPorPiloto: true, archivoId: null })
  const [enviando, setEnviando] = useState(false)
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const ir = async () => { setEnviando(true); try { const { data } = await api.post(`/viajes/${viaje.id}/costos`, { ...f, monto: Number(f.monto), descripcion: f.descripcion.trim() || null }); onListo(data.message) } catch (e) { showToast({ type: 'error', message: errorApi(e).mensaje }) } finally { setEnviando(false) } }
  return (
    <Modal abierto titulo={`Costo del viaje ${viaje.numero}`} onCerrar={onCerrar} ancho="max-w-md" pie={<><BotonBorde onClick={onCerrar}>Cancelar</BotonBorde><Boton disabled={enviando || !(Number(f.monto) > 0)} onClick={ir}>Agregar</Boton></>}>
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <Campo etiqueta="Tipo" id="tipoCosto" requerido><select value={f.tipo} onChange={set('tipo')} className={ent}>{Object.entries(TIPOS_COSTO).filter(([k]) => k !== 'COMBUSTIBLE').map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></Campo>
        <Campo etiqueta="Monto (Q)" id="montoCosto" requerido><input type="number" min="0.01" step="0.01" value={f.monto} onChange={set('monto')} className={`${ent} text-right`} /></Campo>
        <Campo etiqueta="Fecha" id="fechaCosto"><input type="date" max={hoy()} value={f.fecha} onChange={set('fecha')} className={ent} /></Campo>
        <Campo etiqueta="Detalle" id="descCosto"><input value={f.descripcion} onChange={set('descripcion')} maxLength={200} placeholder="Ej. Peaje Palín" className={ent} /></Campo>
        <label className="flex items-center gap-2 sm:col-span-2"><input type="checkbox" checked={f.pagadoPorPiloto} onChange={set('pagadoPorPiloto')} className="accent-green-600" /> Lo pagó el piloto (se rinde contra el anticipo)</label>
        <div className="sm:col-span-2"><SubirFoto value={f.archivoId} onChange={(id) => setF((x) => ({ ...x, archivoId: id }))} etiqueta="Foto del recibo" /></div>
        <p className="text-xs text-gray-500 sm:col-span-2">El combustible se registra en <b>Combustible › Cargas</b> indicando el viaje: entra solo como costo.</p>
      </div>
    </Modal>
  )
}

function Liquidar({ viaje, onListo, onCerrar }) {
  const [f, setF] = useState({ montoCobrado: viaje.montoCobrado, pagoPiloto: viaje.pagoPiloto, anticipoPiloto: viaje.anticipoPiloto })
  const [enviando, setEnviando] = useState(false)
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const l = viaje.liquidacion
  const saldo = Number(f.pagoPiloto || 0) + l.rendidoPiloto - Number(f.anticipoPiloto || 0)
  const utilidad = Number(f.montoCobrado || 0) - l.costos - Number(f.pagoPiloto || 0)
  const ir = async () => { setEnviando(true); try { const { data } = await api.put(`/viajes/${viaje.id}/liquidar`, { montoCobrado: num(f.montoCobrado), pagoPiloto: num(f.pagoPiloto), anticipoPiloto: num(f.anticipoPiloto) }); onListo(data.message) } catch (e) { showToast({ type: 'error', message: errorApi(e).mensaje }) } finally { setEnviando(false) } }
  return (
    <Modal abierto titulo={`Liquidar viaje ${viaje.numero}`} onCerrar={onCerrar} ancho="max-w-lg" pie={<><BotonBorde onClick={onCerrar}>Cancelar</BotonBorde><Boton disabled={enviando} onClick={ir}>Liquidar</Boton></>}>
      <div className="grid gap-3 text-sm sm:grid-cols-3">
        <Campo etiqueta="Cobro al cliente (Q)" id="liqCobro" requerido><input type="number" min="0" step="0.01" value={f.montoCobrado} onChange={set('montoCobrado')} className={`${ent} text-right`} /></Campo>
        <Campo etiqueta="Pago al piloto (Q)" id="liqPago"><input type="number" min="0" step="0.01" value={f.pagoPiloto} onChange={set('pagoPiloto')} className={`${ent} text-right`} /></Campo>
        <Campo etiqueta="Anticipo entregado (Q)" id="liqAnticipo"><input type="number" min="0" step="0.01" value={f.anticipoPiloto} onChange={set('anticipoPiloto')} className={`${ent} text-right`} /></Campo>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-gray-50 p-3 text-sm">
        <dt>Costos del viaje</dt><dd className="cifra text-right">{Q(l.costos)}</dd>
        <dt className="pl-3 text-gray-500">de los cuales rindió el piloto</dt><dd className="cifra text-right text-gray-500">{Q(l.rendidoPiloto)}</dd>
        <dt className="font-medium">Saldo a pagar al piloto</dt><dd className={`cifra text-right font-semibold ${saldo < 0 ? 'text-red-700' : ''}`}>{Q(saldo)}</dd>
        <dd className="col-span-2 text-xs text-gray-500">bono + gastos rendidos − anticipo {saldo < 0 && '(el piloto debe devolver)'}</dd>
        <dt className="font-medium">Utilidad del viaje</dt><dd className={`cifra text-right font-semibold ${utilidad < 0 ? 'text-red-700' : 'text-green-700'}`}>{Q(utilidad)}</dd>
      </dl>
    </Modal>
  )
}

function Cancelar({ viaje, onListo, onCerrar }) {
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const ir = async () => { setEnviando(true); try { const { data } = await api.put(`/viajes/${viaje.id}/cancelar`, { motivo }); onListo(data.message) } catch (e) { showToast({ type: 'error', message: errorApi(e).mensaje }) } finally { setEnviando(false) } }
  return (
    <Modal abierto titulo={`Cancelar viaje ${viaje.numero}`} onCerrar={onCerrar} ancho="max-w-md" pie={<><BotonBorde onClick={onCerrar}>Volver</BotonBorde><Boton color="bg-red-600" disabled={enviando || motivo.trim().length < 10} onClick={ir}>Cancelar viaje</Boton></>}>
      <label className="block text-sm">Motivo <span className="text-gray-500">(al menos 10 caracteres)</span><textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} maxLength={300} className={ent} /></label>
    </Modal>
  )
}

/** Hoja con el detalle del viaje, sus costos y las acciones según el estado. */
function DetalleViaje({ id, opciones, onCambio, onCerrar }) {
  const { puede } = usePermisos()
  const [v, setV] = useState(null)
  const [accion, setAccion] = useState(null)
  const cargar = useCallback(() => api.get(`/viajes/${id}`).then(({ data }) => setV(data.data)).catch((e) => showToast({ type: 'error', message: errorApi(e).mensaje })), [id])
  useEffect(() => { cargar() }, [cargar])
  const listo = (m) => { showToast({ type: 'success', message: m }); setAccion(null); cargar(); onCambio() }
  const quitarCosto = async (c) => { if (!(await confirmar({ titulo: 'Quitar costo', mensaje: `${c.tipoNombre} de ${Q(c.monto)}`, confirmar: 'Quitar', peligro: true }))) return; try { const { data } = await api.delete(`/viajes/${id}/costos/${c.id}`); listo(data.message) } catch (e) { showToast({ type: 'error', message: errorApi(e).mensaje }) } }
  const cabezal = v && opciones?.cabezales.find((c) => c.id === v.cabezalId)
  const abierto = v && ['PROGRAMADO', 'EN_RUTA', 'FINALIZADO'].includes(v.estado)
  const veCostos = puede('finanzas.costos')
  return (
    <Hoja abierta titulo={v ? `Viaje ${v.numero}` : 'Viaje'} onCerrar={onCerrar}
      pie={v && <div className="flex flex-wrap gap-2">
        {v.estado === 'PROGRAMADO' && puede('viajes.crear') && <Boton onClick={() => setAccion('iniciar')}>Salir ahora</Boton>}
        {v.estado === 'EN_RUTA' && puede('viajes.cerrar') && <Boton onClick={() => setAccion('finalizar')}>Finalizar</Boton>}
        {v.estado === 'FINALIZADO' && puede('viajes.liquidar') && <Boton onClick={() => setAccion('liquidar')}>Liquidar</Boton>}
        {['PROGRAMADO', 'EN_RUTA'].includes(v.estado) && puede('viajes.editar') && <BotonBorde onClick={() => setAccion('editar')}>Editar</BotonBorde>}
        {abierto && puede('viajes.anular') && <BotonBorde onClick={() => setAccion('cancelar')} className="text-red-700">Cancelar viaje</BotonBorde>}
      </div>}>
      {!v ? <p className="text-sm text-gray-500">Cargando…</p> : <>
        <div className="mb-4 flex items-center gap-2"><Etiqueta estado={v.estado} />{v.atrasado && <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700">Entrega atrasada</span>}</div>
        <Grupo titulo="Viaje">
          <Fila etiqueta="Cliente">{v.cliente}</Fila>
          <Fila etiqueta="Trayecto">{v.origen} → {v.destino}{v.ruta ? <span className="block text-xs text-gray-500">{v.ruta}</span> : null}</Fila>
          {v.carga && <Fila etiqueta="Carga">{v.carga}{v.toneladas ? ` · ${v.toneladas} t` : ''}</Fila>}
          {v.referencia && <Fila etiqueta="Referencia">{v.referencia}</Fila>}
          <Fila etiqueta="Cabezal">{v.cabezal} · {v.placa}{v.remolque ? ` + ${v.remolque}` : ''}</Fila>
          <Fila etiqueta="Piloto">{v.piloto}</Fila>
          <Fila etiqueta="Salida">{fh(v.fechaSalida)}{(v.kmSalida !== null && v.kmSalida !== undefined) ? ` · ${km(v.kmSalida)}` : ''}</Fila>
          {v.fechaCompromiso && <Fila etiqueta="Compromiso">{fh(v.fechaCompromiso)}</Fila>}
          {v.fechaLlegada && <Fila etiqueta="Llegada">{fh(v.fechaLlegada)} · {km(v.kmLlegada)}</Fila>}
          {(v.km !== null && v.km !== undefined) && <Fila etiqueta="Recorrido">{km(v.km)}{v.kmVacios ? ` (${km(v.kmVacios)} vacíos, ${v.liquidacion.porcentajeVacios}%)` : ''}</Fila>}
          {v.observaciones && <Fila etiqueta="Notas"><span className="whitespace-pre-line">{v.observaciones}</span></Fila>}
        </Grupo>
        <Grupo titulo="Costos del viaje" nota={abierto && puede('viajes.editar') ? undefined : null}>
          {v.costos.map((c) => <div key={c.id} className="flex items-center gap-2 px-4 py-2 text-sm"><span className="min-w-0 flex-1"><span className="font-medium">{c.tipoNombre}</span>{c.descripcion ? <span className="text-gray-600"> · {c.descripcion}</span> : null}<span className="block text-xs text-gray-500">{c.fecha} · {c.pagadoPorPiloto ? 'pagó el piloto' : 'pagó la empresa'} · {c.registro}{c.archivoId ? <> · <VerAdjunto id={c.archivoId} texto="recibo" /></> : null}</span></span><span className="cifra">{Q(c.monto)}</span>{abierto && puede('viajes.editar') && !c.cargaId && <button type="button" onClick={() => quitarCosto(c)} aria-label="Quitar" className="rounded p-1 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>}</div>)}
          {!v.costos.length && <p className="px-4 py-3 text-sm text-gray-500">Sin costos registrados.</p>}
          <div className="flex items-center justify-between px-4 py-2 text-sm"><span className="font-medium">Total costos</span><span className="cifra font-semibold">{Q(v.totalCostos)}</span></div>
          {abierto && puede('viajes.editar') && <div className="px-4 py-2"><BotonBorde onClick={() => setAccion('costo')}><Plus className="h-4 w-4" aria-hidden /> Agregar costo</BotonBorde></div>}
        </Grupo>
        {v.cargas.length > 0 && <Grupo titulo="Combustible del viaje">{v.cargas.map((c) => <div key={c.id} className="flex justify-between px-4 py-2 text-sm"><span>{c.fecha} · {c.galones} gal{c.estacion ? ` · ${c.estacion}` : ''} · {km(c.odometro)}</span><span className="cifra">{Q(c.total)}</span></div>)}</Grupo>}
        {v.inspecciones.length > 0 && <Grupo titulo="Inspección pre viaje">{v.inspecciones.map((i) => <div key={i.id} className="flex justify-between px-4 py-2 text-sm"><span>{fh(i.fecha)}</span><span className={i.resultado === 'RECHAZADA' ? 'text-red-700' : i.resultado === 'CON_OBSERVACIONES' ? 'text-amber-700' : 'text-green-700'}>{i.resultado.replace('_', ' ').toLowerCase()}{i.fallas ? ` (${i.fallas})` : ''}</span></div>)}</Grupo>}
        <Grupo titulo="Liquidación">
          <Fila etiqueta="Cobro al cliente"><span className="cifra">{Q(v.montoCobrado)}</span></Fila>
          <Fila etiqueta="Costos"><span className="cifra">{Q(v.liquidacion.costos)}</span></Fila>
          <Fila etiqueta="Pago al piloto"><span className="cifra">{Q(v.pagoPiloto)}</span></Fila>
          <Fila etiqueta="Anticipo / rendido"><span className="cifra">{Q(v.anticipoPiloto)} / {Q(v.liquidacion.rendidoPiloto)}</span></Fila>
          <Fila etiqueta="Saldo al piloto"><span className={`cifra font-semibold ${v.liquidacion.saldoPiloto < 0 ? 'text-red-700' : ''}`}>{Q(v.liquidacion.saldoPiloto)}</span></Fila>
          {veCostos && <Fila etiqueta="Utilidad"><span className={`cifra font-semibold ${v.liquidacion.utilidad < 0 ? 'text-red-700' : 'text-green-700'}`}>{Q(v.liquidacion.utilidad)} ({v.liquidacion.margen}%)</span></Fila>}
          {veCostos && (v.liquidacion.costoPorKm !== null && v.liquidacion.costoPorKm !== undefined) && <Fila etiqueta="Por km">costo {Q(v.liquidacion.costoPorKm)} · ingreso {Q(v.liquidacion.ingresoPorKm)}</Fila>}
        </Grupo>
      </>}
      {accion === 'iniciar' && <Iniciar viaje={{ ...v, odometroCabezal: cabezal?.odometro }} onListo={listo} onCerrar={() => setAccion(null)} />}
      {accion === 'finalizar' && <Finalizar viaje={v} onListo={listo} onCerrar={() => setAccion(null)} />}
      {accion === 'costo' && <AgregarCosto viaje={v} onListo={listo} onCerrar={() => setAccion(null)} />}
      {accion === 'liquidar' && <Liquidar viaje={v} onListo={listo} onCerrar={() => setAccion(null)} />}
      {accion === 'cancelar' && <Cancelar viaje={v} onListo={listo} onCerrar={() => setAccion(null)} />}
      {accion === 'editar' && opciones && <FormViaje opciones={opciones} viaje={v} onListo={listo} onCerrar={() => setAccion(null)} />}
    </Hoja>
  )
}

export default function Viajes() {
  const { puede } = usePermisos()
  const location = useLocation()
  const [mes, setMes] = useState(hoy().slice(0, 7))
  const [estado, setEstado] = useState('')
  const [datos, setDatos] = useState(null)
  const [opciones, setOpciones] = useState(null)
  const [programando, setProgramando] = useState(false)
  const [abierto, setAbierto] = useState(location.state?.viajeId ?? null)
  const cargarOpciones = useCallback(() => api.get('/viajes/opciones').then(({ data }) => setOpciones(data.data)).catch(() => {}), [])
  const cargar = useCallback(() => api.get('/viajes', { params: { mes, estado: estado || undefined } }).then(({ data }) => setDatos(data.data)).catch((e) => showToast({ type: 'error', message: errorApi(e).mensaje })), [mes, estado])
  useEffect(() => { cargarOpciones() }, [cargarOpciones])
  useEffect(() => { cargar() }, [cargar])
  const listo = (m) => { showToast({ type: 'success', message: m }); setProgramando(false); cargar(); cargarOpciones() }
  const t = datos?.totales
  const veCostos = puede('finanzas.costos')
  const grupos = useMemo(() => {
    const abiertos = (datos?.viajes ?? []).filter((v) => ['PROGRAMADO', 'EN_RUTA'].includes(v.estado))
    const cerrados = (datos?.viajes ?? []).filter((v) => !['PROGRAMADO', 'EN_RUTA'].includes(v.estado))
    return [['En operación', abiertos], [`Cerrados en ${mes}`, cerrados]]
  }, [datos, mes])
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label>Mes<input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="mt-1 block rounded border px-2 py-1.5" /></label>
        <label>Estado<select value={estado} onChange={(e) => setEstado(e.target.value)} className="mt-1 block rounded border px-2 py-1.5"><option value="">Todos</option>{['PROGRAMADO', 'EN_RUTA', 'FINALIZADO', 'LIQUIDADO', 'CANCELADO'].map((e) => <option key={e} value={e}>{e.replace('_', ' ').toLowerCase()}</option>)}</select></label>
        {puede('viajes.crear') && opciones && <Boton onClick={() => setProgramando(true)} className="ml-auto"><Plus className="h-4 w-4" aria-hidden /> Programar viaje</Boton>}
      </div>
      {t && <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[['Programados', t.programados], ['En ruta', t.enRuta], ['Cerrados', t.cerrados], ['Km recorridos', km(t.km)], ['Ingresos', Q(t.ingresos)], veCostos ? ['Utilidad', `${Q(t.utilidad)} (${t.margen}%)`] : ['Km vacíos', km(t.kmVacios)]].map(([k, val]) => <div key={k} className="rounded-superficie border bg-white p-3"><p className="text-xs text-gray-500">{k}</p><p className="cifra mt-0.5 text-lg font-semibold">{val}</p></div>)}
      </section>}
      {grupos.map(([titulo, lista]) => <section key={titulo}>
        <h2 className="mb-1.5 px-1 text-sm font-medium text-gray-600">{titulo}</h2>
        <ul className="divide-y rounded-superficie border bg-white">
          {lista.map((v) => <li key={v.id}><button type="button" onClick={() => setAbierto(v.id)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-left text-sm hover:bg-gray-50">
            <RouteIcon className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
            <span className="min-w-0 flex-1 basis-64"><span className="font-medium">{v.numero} · {v.cliente}</span><span className="block text-xs text-gray-500">{v.origen} → {v.destino} · {v.cabezal} · {v.piloto} · {fh(v.fechaSalida)}</span></span>
            <span className="text-xs text-gray-600">{(v.km !== null && v.km !== undefined) ? km(v.km) : ''}</span>
            <span className="cifra font-semibold">{Q(v.montoCobrado)}</span>
            {v.atrasado && <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700">atrasado</span>}
            <Etiqueta estado={v.estado} />
          </button></li>)}
          {!lista.length && <li className="px-4 py-6 text-center text-sm text-gray-500">Sin viajes.</li>}
        </ul>
      </section>)}
      {programando && opciones && <FormViaje opciones={opciones} onListo={listo} onCerrar={() => setProgramando(false)} />}
      {abierto && <DetalleViaje id={abierto} opciones={opciones} onCambio={() => { cargar(); cargarOpciones() }} onCerrar={() => setAbierto(null)} />}
    </div>
  )
}
