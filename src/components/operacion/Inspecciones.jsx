// ─────────────────────────────────────────────────────────────────────────────
// INSPECCIÓN PRE VIAJE: checklist del cabezal y remolque antes de salir. Una falla crítica
// impide salir y abre sola una orden de trabajo correctiva; una falla menor deja salir con
// observaciones. Pensada para el celular del piloto: botones grandes, todo OK por defecto.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react'
import { ClipboardCheck, Plus } from 'lucide-react'
import api from '../../services/api'
import { usePermisos } from '../../hooks/usePermisos'
import { showToast } from '../../utils/showToast'
import { errorApi } from '../comun/formato'
import Campo from '../comun/Campo'
import Modal from '../comun/Modal'
import Hoja, { Grupo, Fila } from '../comun/Hoja'
import { SubirFoto, VerAdjunto } from '../comun/Adjunto'
import { hoy, fh, km, ent } from './comun'
import { Boton, BotonBorde } from './Ui'

const RES = { APROBADA: ['Aprobada', 'bg-green-50 text-green-800'], CON_OBSERVACIONES: ['Con observaciones', 'bg-amber-50 text-amber-800'], RECHAZADA: ['Rechazada', 'bg-red-50 text-red-700'] }
const Resultado = ({ r }) => <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${RES[r]?.[1] ?? ''}`}>{RES[r]?.[0] ?? r}</span>
const n = (v) => (v === '' || (v === null || v === undefined) ? null : Number(v))

function Registrar({ opciones, checklist, viajes, onListo, onCerrar }) {
  const [f, setF] = useState({ cabezalId: '', remolqueId: '', pilotoId: '', viajeId: '', odometro: '', observaciones: '' })
  const [marcas, setMarcas] = useState({}) // clave → { ok, observacion, archivoId }
  const [enviando, setEnviando] = useState(false)
  const elegirCabezal = (e) => { const c = opciones.cabezales.find((x) => String(x.id) === e.target.value); const viaje = viajes.find((x) => x.cabezalId === c?.id); setF((x) => ({ ...x, cabezalId: e.target.value, odometro: c ? c.odometro : '', pilotoId: viaje ? String(viaje.pilotoId) : c?.pilotoAsignadoId ? String(c.pilotoAsignadoId) : x.pilotoId, viajeId: viaje ? String(viaje.id) : '', remolqueId: viaje?.remolqueId ? String(viaje.remolqueId) : x.remolqueId })) }
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const items = checklist.filter((i) => i.aplicaA !== 'REMOLQUE' || f.remolqueId)
  const grupos = [...new Set(items.map((i) => i.grupo))]
  const marcar = (clave, ok) => setMarcas((m) => ({ ...m, [clave]: { ...(m[clave] ?? {}), ok } }))
  const fallas = items.filter((i) => marcas[i.clave]?.ok === false)
  const criticas = fallas.filter((i) => i.critico)
  const guardar = async () => {
    setEnviando(true)
    try { const { data } = await api.post('/inspecciones', { cabezalId: n(f.cabezalId), remolqueId: n(f.remolqueId), pilotoId: n(f.pilotoId), viajeId: n(f.viajeId), odometro: n(f.odometro), observaciones: f.observaciones.trim() || null, items: items.map((i) => ({ clave: i.clave, ok: marcas[i.clave]?.ok !== false, observacion: marcas[i.clave]?.observacion || null, archivoId: marcas[i.clave]?.archivoId ?? null })) }); onListo(data) }
    catch (e) { showToast({ type: 'error', message: errorApi(e).mensaje }) } finally { setEnviando(false) }
  }
  return (
    <Modal abierto titulo="Inspección pre viaje" onCerrar={onCerrar} ancho="max-w-3xl"
      pie={<><span className={`mr-auto self-center text-sm ${criticas.length ? 'font-medium text-red-700' : fallas.length ? 'text-amber-700' : 'text-green-700'}`}>{criticas.length ? `${criticas.length} falla(s) crítica(s): no puede salir` : fallas.length ? `${fallas.length} observación(es): sale y se programa reparación` : 'Todo en orden'}</span><BotonBorde onClick={onCerrar}>Cancelar</BotonBorde><Boton disabled={enviando || !f.cabezalId || !f.pilotoId} onClick={guardar} color={criticas.length ? 'bg-red-600' : 'bg-green-600'}>{enviando ? 'Guardando…' : 'Registrar inspección'}</Boton></>}>
      <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <Campo etiqueta="Cabezal" id="iCabezal" requerido><select value={f.cabezalId} onChange={elegirCabezal} className={ent}><option value="">Elija…</option>{opciones.cabezales.map((c) => <option key={c.id} value={c.id}>{c.codigo} · {c.placa}</option>)}</select></Campo>
        <Campo etiqueta="Remolque" id="iRemolque"><select value={f.remolqueId} onChange={set('remolqueId')} className={ent}><option value="">Sin remolque</option>{opciones.remolques.map((r) => <option key={r.id} value={r.id}>{r.codigo} · {r.placa}</option>)}</select></Campo>
        <Campo etiqueta="Piloto" id="iPiloto" requerido><select value={f.pilotoId} onChange={set('pilotoId')} className={ent}><option value="">Elija…</option>{opciones.pilotos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></Campo>
        <Campo etiqueta="Viaje" id="iViaje"><select value={f.viajeId} onChange={set('viajeId')} className={ent}><option value="">Sin viaje</option>{viajes.filter((x) => String(x.cabezalId) === f.cabezalId).map((x) => <option key={x.id} value={x.id}>{x.numero} · {x.destino}</option>)}</select></Campo>
        <Campo etiqueta="Odómetro (km)" id="iOdometro"><input type="number" min="0" step="0.1" value={f.odometro} onChange={set('odometro')} className={`${ent} text-right`} /></Campo>
      </div>
      <p className="mt-4 text-xs text-gray-500">Todo empieza en <b>OK</b>. Toque <b>Falla</b> en lo que no esté bien y anote qué vio. Los ítems marcados con ● son críticos.</p>
      {grupos.map((g) => <section key={g} className="mt-3">
        <h3 className="mb-1 px-1 text-[13px] text-gray-500">{g}</h3>
        <ul className="divide-y overflow-hidden rounded-tarjeta border bg-white">
          {items.filter((i) => i.grupo === g).map((i) => { const m = marcas[i.clave]; const falla = m?.ok === false; return (
            <li key={i.clave} className={`px-3 py-2 text-sm ${falla ? 'bg-red-50' : ''}`}>
              <div className="flex items-center gap-2"><span className="min-w-0 flex-1">{i.critico && <span className="mr-1 text-red-600" title="Crítico" aria-label="Crítico">●</span>}{i.nombre}</span>
                <div className="flex overflow-hidden rounded-lg border text-xs"><button type="button" onClick={() => marcar(i.clave, true)} className={`px-3 py-1.5 ${!falla ? 'bg-green-600 text-white' : 'bg-white text-gray-600'}`}>OK</button><button type="button" onClick={() => marcar(i.clave, false)} className={`px-3 py-1.5 ${falla ? 'bg-red-600 text-white' : 'bg-white text-gray-600'}`}>Falla</button></div></div>
              {falla && <div className="mt-2 flex flex-wrap items-center gap-2"><input value={m?.observacion ?? ''} onChange={(e) => setMarcas((x) => ({ ...x, [i.clave]: { ...x[i.clave], observacion: e.target.value } }))} maxLength={200} placeholder="¿Qué vio?" aria-label={`Observación de ${i.nombre}`} className="min-w-0 flex-1 rounded border px-2 py-1 text-sm" /><SubirFoto value={m?.archivoId ?? null} onChange={(id) => setMarcas((x) => ({ ...x, [i.clave]: { ...x[i.clave], archivoId: id } }))} etiqueta="Foto" /></div>}
            </li>) })}
        </ul>
      </section>)}
      <Campo etiqueta="Observaciones generales" id="iObs" className="mt-4 text-sm"><textarea rows={2} value={f.observaciones} onChange={set('observaciones')} maxLength={500} className={ent} /></Campo>
    </Modal>
  )
}

function Detalle({ id, onCerrar }) {
  const [i, setI] = useState(null)
  useEffect(() => { api.get(`/inspecciones/${id}`).then(({ data }) => setI(data.data)).catch((e) => showToast({ type: 'error', message: errorApi(e).mensaje })) }, [id])
  const grupos = i ? [...new Set(i.items.map((x) => x.grupo))] : []
  return (
    <Hoja abierta titulo="Inspección" onCerrar={onCerrar}>
      {!i ? <p className="text-sm text-gray-500">Cargando…</p> : <>
        <div className="mb-4"><Resultado r={i.resultado} /></div>
        <Grupo titulo="Datos">
          <Fila etiqueta="Cabezal">{i.cabezal} · {i.placa}{i.remolque ? ` + ${i.remolque}` : ''}</Fila>
          <Fila etiqueta="Piloto">{i.piloto}</Fila>
          <Fila etiqueta="Fecha">{fh(i.fecha)}{(i.odometro !== null && i.odometro !== undefined) ? ` · ${km(i.odometro)}` : ''}</Fila>
          {i.viaje && <Fila etiqueta="Viaje">{i.viaje}</Fila>}
          {i.orden && <Fila etiqueta="Orden de taller">{i.orden.numero} ({i.orden.estado.toLowerCase().replace('_', ' ')})</Fila>}
          {i.observaciones && <Fila etiqueta="Notas">{i.observaciones}</Fila>}
          <Fila etiqueta="Registró">{i.registro}</Fila>
        </Grupo>
        {grupos.map((g) => <Grupo key={g} titulo={g}>{i.items.filter((x) => x.grupo === g).map((x) => <div key={x.id} className={`flex items-start gap-2 px-4 py-2 text-sm ${x.ok ? '' : 'bg-red-50'}`}><span className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${x.ok ? 'bg-green-500' : 'bg-red-500'}`} aria-label={x.ok ? 'OK' : 'Falla'} /><span className="min-w-0 flex-1">{x.nombre}{x.critico && <span className="ml-1 text-xs text-gray-500">(crítico)</span>}{!x.ok && x.observacion && <span className="block text-xs text-red-800">{x.observacion}</span>}{!x.ok && x.archivoId && <span className="block text-xs"><VerAdjunto id={x.archivoId} texto="Ver foto" /></span>}</span></div>)}</Grupo>)}
      </>}
    </Hoja>
  )
}

export default function Inspecciones() {
  const { puede } = usePermisos()
  const [mes, setMes] = useState(hoy().slice(0, 7))
  const [resultado, setResultado] = useState('')
  const [datos, setDatos] = useState(null)
  const [opciones, setOpciones] = useState(null)
  const [checklist, setChecklist] = useState([])
  const [viajes, setViajes] = useState([])
  const [registrando, setRegistrando] = useState(false)
  const [abierta, setAbierta] = useState(null)
  const cargarOpciones = useCallback(() => Promise.all([api.get('/viajes/opciones'), api.get('/inspecciones/checklist'), api.get('/viajes', { params: { estado: 'PROGRAMADO' } })]).then(([o, c, v]) => { setOpciones(o.data.data); setChecklist(c.data.data); setViajes(v.data.data.viajes) }).catch(() => {}), [])
  const cargar = useCallback(() => api.get('/inspecciones', { params: { mes, resultado: resultado || undefined } }).then(({ data }) => setDatos(data.data)).catch((e) => showToast({ type: 'error', message: errorApi(e).mensaje })), [mes, resultado])
  useEffect(() => { cargarOpciones() }, [cargarOpciones])
  useEffect(() => { cargar() }, [cargar])
  const listo = (data) => { showToast({ type: data.data.resultado === 'RECHAZADA' ? 'error' : 'success', message: data.message }); setRegistrando(false); cargar(); cargarOpciones() }
  const lista = datos?.inspecciones ?? []
  const cuenta = (r) => lista.filter((i) => i.resultado === r).length
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label>Mes<input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="mt-1 block rounded border px-2 py-1.5" /></label>
        <label>Resultado<select value={resultado} onChange={(e) => setResultado(e.target.value)} className="mt-1 block rounded border px-2 py-1.5"><option value="">Todos</option>{Object.entries(RES).map(([k, [t]]) => <option key={k} value={k}>{t}</option>)}</select></label>
        {puede('inspecciones.registrar') && opciones && <Boton onClick={() => setRegistrando(true)} className="ml-auto"><Plus className="h-4 w-4" aria-hidden /> Nueva inspección</Boton>}
      </div>
      {datos && <section className="grid gap-3 sm:grid-cols-3">
        {Object.entries(RES).map(([k, [t, clase]]) => <div key={k} className={`rounded-superficie border p-3 ${clase}`}><p className="text-xs">{t}</p><p className="cifra mt-0.5 text-lg font-semibold">{cuenta(k)}</p></div>)}
      </section>}
      <ul className="divide-y rounded-superficie border bg-white">
        {lista.map((i) => <li key={i.id}><button type="button" onClick={() => setAbierta(i.id)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-left text-sm hover:bg-gray-50">
          <ClipboardCheck className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
          <span className="min-w-0 flex-1 basis-64"><span className="font-medium">{i.cabezal}{i.remolque ? ` + ${i.remolque}` : ''} · {i.piloto}</span><span className="block text-xs text-gray-500">{fh(i.fecha)}{(i.odometro !== null && i.odometro !== undefined) ? ` · ${km(i.odometro)}` : ''}{i.viaje ? ` · viaje ${i.viaje}` : ''}{i.orden ? ` · orden ${i.orden}` : ''} · {i.registro}</span></span>
          {i.fallas > 0 && <span className="text-xs text-gray-600">{i.fallas} falla(s)</span>}
          <Resultado r={i.resultado} />
        </button></li>)}
        {!lista.length && <li className="px-4 py-8 text-center text-sm text-gray-500">Sin inspecciones en este mes.</li>}
      </ul>
      {registrando && opciones && <Registrar opciones={opciones} checklist={checklist} viajes={viajes} onListo={listo} onCerrar={() => setRegistrando(false)} />}
      {abierta && <Detalle id={abierta} onCerrar={() => setAbierta(null)} />}
    </div>
  )
}
