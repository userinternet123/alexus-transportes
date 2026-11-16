// ─────────────────────────────────────────────────────────────────────────────
// COMBUSTIBLE: cargas por cabezal con foto del vale y rendimiento km/gal "tanque lleno a
// tanque lleno". Una carga ligada a un viaje entra sola como costo de ese viaje.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react'
import { Fuel, Plus } from 'lucide-react'
import api from '../../services/api'
import { usePermisos } from '../../hooks/usePermisos'
import { useValidacion } from '../../hooks/useValidacion'
import { showToast } from '../../utils/showToast'
import { Q, errorApi } from '../comun/formato'
import Campo from '../comun/Campo'
import Modal from '../comun/Modal'
import ResumenErrores from '../forms/ResumenErrores'
import { SubirFoto, VerAdjunto } from '../comun/Adjunto'
import { ahora, hoy, fh, km, ent } from './comun'
import { Boton, BotonBorde } from './Ui'

const CAMPOS = [
  { name: 'cabezalId', label: 'Cabezal', type: 'select', required: true },
  { name: 'odometro', label: 'Odómetro', type: 'number', required: true, min: 1 },
  { name: 'galones', label: 'Galones', type: 'number', required: true, min: 0.1 },
]
const n = (v) => (v === '' || (v === null || v === undefined) ? null : Number(v))

function RegistrarCarga({ opciones, viajes, onListo, onCerrar }) {
  const [f, setF] = useState({ cabezalId: '', pilotoId: '', viajeId: '', fecha: ahora(), odometro: '', galones: '', precioGalon: '', total: '', tanqueLleno: true, estacion: '', documento: '', pagadoPorPiloto: false, archivoId: null })
  const [enviando, setEnviando] = useState(false)
  const v = useValidacion(CAMPOS)
  const set = (k) => (e) => { v.alCambiar(k); setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })) }
  const elegirCabezal = (e) => { v.alCambiar('cabezalId'); const c = opciones.cabezales.find((x) => String(x.id) === e.target.value); const viaje = viajes.find((x) => x.cabezalId === c?.id && x.estado === 'EN_RUTA'); setF((x) => ({ ...x, cabezalId: e.target.value, odometro: c ? c.odometro : '', pilotoId: viaje ? String(viaje.pilotoId) : c?.pilotoAsignadoId ? String(c.pilotoAsignadoId) : x.pilotoId, viajeId: viaje ? String(viaje.id) : '' })) }
  const total = f.total !== '' ? Number(f.total) : Number(f.galones || 0) * Number(f.precioGalon || 0)
  const guardar = async () => {
    const r = v.validar(f)
    if (!r.ok) return
    setEnviando(true)
    try { const { data } = await api.post('/combustible/cargas', { cabezalId: n(f.cabezalId), pilotoId: n(f.pilotoId), viajeId: n(f.viajeId), fecha: f.fecha, odometro: n(f.odometro), galones: n(f.galones), precioGalon: n(f.precioGalon), total: n(f.total), tanqueLleno: f.tanqueLleno, estacion: f.estacion.trim() || null, documento: f.documento.trim() || null, pagadoPorPiloto: f.pagadoPorPiloto, archivoId: f.archivoId }); onListo(data.message) }
    catch (e) { v.delServidor(e); showToast({ type: 'error', message: errorApi(e).mensaje }) } finally { setEnviando(false) }
  }
  const viajesCabezal = viajes.filter((x) => String(x.cabezalId) === f.cabezalId)
  return (
    <Modal abierto titulo="Registrar carga de combustible" onCerrar={onCerrar} ancho="max-w-2xl"
      pie={<><BotonBorde onClick={onCerrar}>Cancelar</BotonBorde><Boton disabled={enviando} onClick={guardar}>{enviando ? 'Guardando…' : 'Registrar'}</Boton></>}>
      <ResumenErrores lista={v.lista} />
      <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <Campo etiqueta="Cabezal" id="cabezalId" requerido error={v.error('cabezalId')}><select value={f.cabezalId} onChange={elegirCabezal} className={ent}><option value="">Elija…</option>{opciones.cabezales.map((c) => <option key={c.id} value={c.id}>{c.codigo} · {c.placa}</option>)}</select></Campo>
        <Campo etiqueta="Piloto" id="pilotoId"><select value={f.pilotoId} onChange={set('pilotoId')} className={ent}><option value="">—</option>{opciones.pilotos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></Campo>
        <Campo etiqueta="Viaje (entra como costo)" id="viajeId"><select value={f.viajeId} onChange={set('viajeId')} className={ent}><option value="">Sin viaje</option>{viajesCabezal.map((x) => <option key={x.id} value={x.id}>{x.numero} · {x.destino} ({x.estado.toLowerCase().replace('_', ' ')})</option>)}</select></Campo>
        <Campo etiqueta="Fecha y hora" id="fechaCarga" requerido><input type="datetime-local" value={f.fecha} onChange={set('fecha')} max={ahora()} className={ent} /></Campo>
        <Campo etiqueta="Odómetro (km)" id="odometro" requerido error={v.error('odometro')}><input type="number" min="0" step="0.1" value={f.odometro} onChange={set('odometro')} className={`${ent} text-right`} /></Campo>
        <Campo etiqueta="Galones" id="galones" requerido error={v.error('galones')}><input type="number" min="0" step="0.001" value={f.galones} onChange={set('galones')} className={`${ent} text-right`} /></Campo>
        <Campo etiqueta="Precio por galón (Q)" id="precioGalon"><input type="number" min="0" step="0.0001" value={f.precioGalon} onChange={set('precioGalon')} placeholder="Parámetro" className={`${ent} text-right`} /></Campo>
        <Campo etiqueta={`Total (Q)${f.total === '' && total > 0 ? ` · ${Q(total)}` : ''}`} id="totalCarga"><input type="number" min="0" step="0.01" value={f.total} onChange={set('total')} placeholder="Galones × precio" className={`${ent} text-right`} /></Campo>
        <Campo etiqueta="Estación" id="estacion"><input value={f.estacion} onChange={set('estacion')} maxLength={120} className={ent} /></Campo>
        <Campo etiqueta="Factura o vale" id="documento"><input value={f.documento} onChange={set('documento')} maxLength={60} className={ent} /></Campo>
        <label className="flex items-center gap-2 self-end pb-2"><input type="checkbox" checked={f.tanqueLleno} onChange={set('tanqueLleno')} className="accent-green-600" /> Tanque lleno (para el rendimiento)</label>
        <label className="flex items-center gap-2 self-end pb-2"><input type="checkbox" checked={f.pagadoPorPiloto} onChange={set('pagadoPorPiloto')} className="accent-green-600" /> Lo pagó el piloto</label>
        <div className="sm:col-span-2 lg:col-span-3"><SubirFoto value={f.archivoId} onChange={(id) => setF((x) => ({ ...x, archivoId: id }))} etiqueta="Foto del vale" /></div>
      </div>
    </Modal>
  )
}

function Anular({ carga, onListo, onCerrar }) {
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const ir = async () => { setEnviando(true); try { const { data } = await api.put(`/combustible/cargas/${carga.id}/anular`, { motivo }); onListo(data.message) } catch (e) { showToast({ type: 'error', message: errorApi(e).mensaje }) } finally { setEnviando(false) } }
  return (
    <Modal abierto titulo={`Anular carga de ${carga.galones} gal`} onCerrar={onCerrar} ancho="max-w-md" pie={<><BotonBorde onClick={onCerrar}>Cancelar</BotonBorde><Boton color="bg-red-600" disabled={enviando || motivo.trim().length < 10} onClick={ir}>Anular</Boton></>}>
      <p className="text-sm text-gray-600">{carga.cabezal} · {fh(carga.fecha)} · {Q(carga.total)}{carga.viaje ? ` · se quita del viaje ${carga.viaje}` : ''}</p>
      <label className="mt-3 block text-sm">Motivo <span className="text-gray-500">(al menos 10 caracteres)</span><textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} maxLength={300} className={ent} /></label>
    </Modal>
  )
}

export default function Combustible() {
  const { puede } = usePermisos()
  const [mes, setMes] = useState(hoy().slice(0, 7))
  const [cabezalId, setCabezalId] = useState('')
  const [anuladas, setAnuladas] = useState(false)
  const [datos, setDatos] = useState(null)
  const [opciones, setOpciones] = useState(null)
  const [viajes, setViajes] = useState([])
  const [registrando, setRegistrando] = useState(false)
  const [anulando, setAnulando] = useState(null)
  const cargarOpciones = useCallback(() => Promise.all([api.get('/viajes/opciones'), api.get('/viajes')]).then(([o, vi]) => { setOpciones(o.data.data); setViajes(vi.data.data.viajes.filter((x) => ['PROGRAMADO', 'EN_RUTA', 'FINALIZADO'].includes(x.estado))) }).catch(() => {}), [])
  const cargar = useCallback(() => api.get('/combustible/cargas', { params: { mes, cabezalId: cabezalId || undefined, incluirAnuladas: anuladas || undefined } }).then(({ data }) => setDatos(data.data)).catch((e) => showToast({ type: 'error', message: errorApi(e).mensaje })), [mes, cabezalId, anuladas])
  useEffect(() => { cargarOpciones() }, [cargarOpciones])
  useEffect(() => { cargar() }, [cargar])
  const listo = (m) => { showToast({ type: 'success', message: m }); setRegistrando(false); setAnulando(null); cargar(); cargarOpciones() }
  const t = datos?.totales
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label>Mes<input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="mt-1 block rounded border px-2 py-1.5" /></label>
        <label>Cabezal<select value={cabezalId} onChange={(e) => setCabezalId(e.target.value)} className="mt-1 block rounded border px-2 py-1.5"><option value="">Todos</option>{(opciones?.cabezales ?? []).map((c) => <option key={c.id} value={c.id}>{c.codigo}</option>)}</select></label>
        <label className="flex items-center gap-2 pb-2"><input type="checkbox" checked={anuladas} onChange={(e) => setAnuladas(e.target.checked)} className="accent-green-600" /> Ver anuladas</label>
        {puede('combustible.registrar') && opciones && <Boton onClick={() => setRegistrando(true)} className="ml-auto"><Plus className="h-4 w-4" aria-hidden /> Registrar carga</Boton>}
      </div>
      {t && <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[['Cargas', t.cargas], ['Galones', t.galones], ['Gastado', Q(t.total)], ['Rendimiento', (t.kmPorGalon !== null && t.kmPorGalon !== undefined) ? `${t.kmPorGalon} km/gal` : '—'], ['Costo por km', (t.costoPorKm !== null && t.costoPorKm !== undefined) ? Q(t.costoPorKm) : '—']].map(([k, val]) => <div key={k} className="rounded-superficie border bg-white p-3"><p className="text-xs text-gray-500">{k}</p><p className="cifra mt-0.5 text-lg font-semibold">{val}</p></div>)}
      </section>}
      {datos?.porCabezal.length > 0 && <section className="overflow-x-auto rounded-superficie border bg-white">
        <table className="w-full text-sm"><thead><tr className="text-left text-xs text-gray-500"><th className="px-4 py-2">Cabezal</th><th className="px-2 py-2 text-right">Cargas</th><th className="px-2 py-2 text-right">Galones</th><th className="px-2 py-2 text-right">Gastado</th><th className="px-2 py-2 text-right">km/gal</th><th className="px-2 py-2 text-right">Esperado</th><th className="px-4 py-2 text-right">Q/km</th></tr></thead>
          <tbody>{datos.porCabezal.map((c) => <tr key={c.cabezalId} className={`border-t ${c.alerta ? 'bg-amber-50' : ''}`}><td className="px-4 py-1.5 font-medium">{c.cabezal}{c.alerta && <span className="ml-2 text-xs text-amber-800">rinde menos de lo esperado</span>}</td><td className="cifra px-2 py-1.5 text-right">{c.cargas}</td><td className="cifra px-2 py-1.5 text-right">{c.galones}</td><td className="cifra px-2 py-1.5 text-right">{Q(c.total)}</td><td className="cifra px-2 py-1.5 text-right font-semibold">{c.kmPorGalon ?? '—'}</td><td className="cifra px-2 py-1.5 text-right text-gray-500">{c.esperado ?? '—'}</td><td className="cifra px-4 py-1.5 text-right">{(c.costoPorKm !== null && c.costoPorKm !== undefined) ? Q(c.costoPorKm) : '—'}</td></tr>)}</tbody></table>
      </section>}
      {datos && <ul className="divide-y rounded-superficie border bg-white">
        {datos.cargas.map((c) => <li key={c.id} className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm ${c.anulada ? 'text-gray-400' : ''}`}>
          <Fuel className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
          <span className="min-w-0 flex-1 basis-64"><span className={`font-medium ${c.anulada ? 'line-through' : ''}`}>{c.cabezal} · {c.galones} gal{c.tanqueLleno ? '' : ' (parcial)'}</span>
            <span className="block text-xs text-gray-500">{fh(c.fecha)} · {km(c.odometro)}{c.piloto ? ` · ${c.piloto}` : ''}{c.viaje ? ` · viaje ${c.viaje}` : ''}{c.estacion ? ` · ${c.estacion}` : ''}{c.documento ? ` · ${c.documento}` : ''}{c.pagadoPorPiloto ? ' · pagó el piloto' : ''}{c.archivoId ? <> · <VerAdjunto id={c.archivoId} texto="vale" /></> : null}{c.anulada ? ` · ANULADA: ${c.motivoAnulacion}` : ''}</span></span>
          <span className="text-xs text-gray-600">{(c.kmPorGalon !== null && c.kmPorGalon !== undefined) ? `${c.kmPorGalon} km/gal (${c.kmTramo} km)` : ''}</span>
          <span className="cifra font-semibold">{Q(c.total)}</span>
          {!c.anulada && puede('combustible.anular') && <button type="button" onClick={() => setAnulando(c)} className="rounded px-2 py-1 text-red-700 hover:bg-red-50">Anular</button>}
        </li>)}
        {!datos.cargas.length && <li className="px-4 py-8 text-center text-sm text-gray-500">No hay cargas en este mes.</li>}
      </ul>}
      {registrando && opciones && <RegistrarCarga opciones={opciones} viajes={viajes} onListo={listo} onCerrar={() => setRegistrando(false)} />}
      {anulando && <Anular carga={anulando} onListo={listo} onCerrar={() => setAnulando(null)} />}
    </div>
  )
}
