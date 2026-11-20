// ─────────────────────────────────────────────────────────────────────────────
// CASOS Y REQUERIMIENTOS: lo que hay que atender en la flota, ordenado por urgencia y plazo. Nacen de las
// inspecciones o se reportan a mano; cada cambio de estado o prioridad queda en su seguimiento.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import { AlertOctagon, Clock, MessageSquarePlus, Plus } from 'lucide-react'
import { usePermisos } from '../../hooks/usePermisos'
import Campo from '../comun/Campo'
import Hoja from '../comun/Hoja'
import Modal from '../comun/Modal'
import { Boton, BotonPrimario, Cifra, Etiqueta } from './comun'
import { enlaceMapa, ent, enviar, fechaHora, pedirUbicacion, PRIORIDAD, TIPO_CASO, paraEnviar, useCatalogos, useConsulta } from './util'
import { CapturaFotos, Galeria } from './Evidencias'

const ESTADO = { ABIERTO: { texto: 'Abierto', color: 'azul' }, EN_PROCESO: { texto: 'En proceso', color: 'ambar' }, RESUELTO: { texto: 'Resuelto', color: 'verde' }, ANULADO: { texto: 'Anulado', color: 'gris' } }
const SEMAFORO = { VENCIDO: { texto: 'Vencido', color: 'rojo' }, POR_VENCER: { texto: 'Por vencer', color: 'ambar' }, A_TIEMPO: { texto: 'A tiempo', color: 'verde' } }

const restante = (venceEn) => {
  const min = Math.round((new Date(venceEn) - Date.now()) / 60000)
  const abs = Math.abs(min)
  const t = abs < 60 ? `${abs} min` : abs < 48 * 60 ? `${Math.round(abs / 60)} h` : `${Math.round(abs / 1440)} días`
  return min < 0 ? `venció hace ${t}` : `vence en ${t}`
}

function ReportarCaso({ onListo, onCerrar }) {
  const { cabezales, remolques } = useCatalogos()
  const [f, setF] = useState({ tipo: 'MECANICO', prioridad: 'MODERADA', titulo: '', descripcion: '', cabezalId: '', remolqueId: '', impideSalir: false })
  const [enviando, setEnviando] = useState(false)
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const [fotos, setFotos] = useState([])
  const ir = async () => {
    setEnviando(true)
    const u = await pedirUbicacion()
    const r = await enviar('post', '/casos', { ...f, cabezalId: f.cabezalId || null, remolqueId: f.remolqueId || null, latitud: u?.latitud ?? null, longitud: u?.longitud ?? null, uuidCliente: crypto.randomUUID(), evidencias: paraEnviar(fotos) })
    setEnviando(false)
    if (r) { onListo() }
  }
  return (
    <Modal abierto titulo="Reportar caso" onCerrar={onCerrar} ancho="max-w-lg"
      pie={<><Boton onClick={onCerrar}>Cancelar</Boton><button type="button" disabled={enviando || f.titulo.trim().length < 5} onClick={ir} className="rounded-control bg-green-700 px-4 py-2 font-medium text-white disabled:opacity-50">{enviando ? 'Guardando…' : 'Reportar'}</button></>}>
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <Campo etiqueta="Qué pasa" id="titulo" requerido className="sm:col-span-2"><input value={f.titulo} onChange={set('titulo')} maxLength={150} placeholder="Ej. ruido en el diferencial al frenar" className={ent} /></Campo>
        <Campo etiqueta="Tipo" id="tipo" requerido><select value={f.tipo} onChange={set('tipo')} className={ent}>{Object.entries(TIPO_CASO).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></Campo>
        <Campo etiqueta="Prioridad" id="prioridad" requerido><select value={f.prioridad} onChange={set('prioridad')} className={ent}>{Object.entries(PRIORIDAD).map(([k, v]) => <option key={k} value={k}>{v.texto}</option>)}</select></Campo>
        <Campo etiqueta="Cabezal" id="cabezalId"><select value={f.cabezalId} onChange={set('cabezalId')} className={ent}><option value="">—</option>{cabezales.map((c) => <option key={c.id} value={c.id}>{c.codigo} · {c.placa}</option>)}</select></Campo>
        <Campo etiqueta="Remolque" id="remolqueId"><select value={f.remolqueId} onChange={set('remolqueId')} className={ent}><option value="">—</option>{remolques.map((r) => <option key={r.id} value={r.id}>{r.codigo}</option>)}</select></Campo>
        <Campo etiqueta="Detalle" id="descripcion" className="sm:col-span-2"><textarea rows={3} value={f.descripcion} onChange={set('descripcion')} maxLength={1000} className={ent} /></Campo>
        <label className="flex items-center gap-2 sm:col-span-2"><input type="checkbox" checked={f.impideSalir} onChange={set('impideSalir')} className="accent-red-600" /> Impide que la unidad salga a viaje hasta resolverlo</label>
      </div>
      <div className="mt-3 text-sm"><p className="mb-1">Fotos de evidencia</p><CapturaFotos valor={fotos} onCambio={setFotos} /></div>
      {['MECANICO', 'LLANTAS'].includes(f.tipo) && <p className="mt-3 text-xs text-gray-500">Los casos mecánicos y de llantas abren también una orden de taller.</p>}
    </Modal>
  )
}

function Detalle({ id, onCerrar, onCambio }) {
  const { puede } = usePermisos()
  const { datos: c, recargar } = useConsulta(id ? `/casos/${id}` : null)
  const { datos: responsables } = useConsulta(id && puede('casos.gestionar') ? '/casos/responsables' : null)
  const [comentario, setComentario] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [nuevas, setNuevas] = useState([])
  if (!id) { return null }
  const gestiona = puede('casos.gestionar')
  const cerrado = c && ['RESUELTO', 'ANULADO'].includes(c.estado)
  const hecho = () => { setComentario(''); recargar(); onCambio() }
  const agregarFotos = async () => { setEnviando(true); if (await enviar('post', `/casos/${c.id}/evidencias`, { evidencias: paraEnviar(nuevas) })) { setNuevas([]); hecho() } setEnviando(false) }
  const estado = async (nuevo) => { setEnviando(true); if (await enviar('put', `/casos/${c.id}/estado`, { estado: nuevo, comentario })) {hecho()} setEnviando(false) }
  const editar = async (cambio) => { setEnviando(true); if (await enviar('put', `/casos/${c.id}`, { ...cambio, comentario: comentario || null })) {hecho()} setEnviando(false) }
  return (
    <Hoja abierta titulo={c ? `${c.numero} · ${c.titulo}` : 'Caso'} onCerrar={onCerrar}
      pie={c && gestiona && (
        <div className="flex w-full flex-wrap justify-end gap-2">
          {c.estado === 'ABIERTO' && <Boton disabled={enviando} onClick={() => estado('EN_PROCESO')}>En proceso</Boton>}
          {!cerrado && <BotonPrimario disabled={enviando || comentario.trim().length < 5} onClick={() => estado('RESUELTO')} title="Escriba qué se hizo">Resolver</BotonPrimario>}
          {!cerrado && <Boton peligro disabled={enviando || comentario.trim().length < 5} onClick={() => estado('ANULADO')}>Anular</Boton>}
          {c.estado === 'RESUELTO' && <Boton disabled={enviando} onClick={() => estado('ABIERTO')}>Reabrir</Boton>}
        </div>
      )}>
      {!c ? <p className="text-sm text-gray-500">Cargando…</p> : (
        <div className="space-y-4 text-sm">
          <section className="rounded-tarjeta bg-white p-4">
            <div className="flex flex-wrap gap-2"><Etiqueta color={PRIORIDAD[c.prioridad].color}>{PRIORIDAD[c.prioridad].texto}</Etiqueta><Etiqueta color={ESTADO[c.estado].color}>{ESTADO[c.estado].texto}</Etiqueta>{c.semaforo && <Etiqueta color={SEMAFORO[c.semaforo].color}>{restante(c.venceEn)}</Etiqueta>}{c.impideSalir && !cerrado && <Etiqueta color="rojo">Impide salir</Etiqueta>}</div>
            {c.descripcion && <p className="mt-2">{c.descripcion}</p>}
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1">
              <dt className="text-gray-500">Tipo</dt><dd>{TIPO_CASO[c.tipo] ?? c.tipo}</dd>
              <dt className="text-gray-500">Unidad</dt><dd>{[c.cabezal?.codigo, c.remolque?.codigo].filter(Boolean).join(' + ') || '—'}</dd>
              <dt className="text-gray-500">Origen</dt><dd>{c.origen === 'INSPECCION' ? `Inspección del ${fechaHora(c.inspeccion?.fecha)}` : c.origen === 'VIAJE' ? `Viaje ${c.viaje?.numero}` : 'Reporte manual'}</dd>
              <dt className="text-gray-500">Orden de taller</dt><dd>{c.ordenTrabajo ? `${c.ordenTrabajo.numero} · ${c.ordenTrabajo.estado.toLowerCase().replace('_', ' ')}` : '—'}</dd>
              <dt className="text-gray-500">Reportó</dt><dd>{c.creadoPor?.nombre} · {fechaHora(c.creadoEn)}</dd>
              <dt className="text-gray-500">Plazo</dt><dd>{fechaHora(c.venceEn)}</dd>
            </dl>
            {enlaceMapa(c.latitud, c.longitud) && <p className="mt-2 text-xs"><a href={enlaceMapa(c.latitud, c.longitud)} target="_blank" rel="noopener noreferrer" className="text-green-700 underline">Ver dónde se reportó</a></p>}
            {c.resolucion && <p className="mt-2 rounded-control bg-green-50 px-3 py-2 text-green-900">{c.resolucion}</p>}
          </section>
          <section className="rounded-tarjeta bg-white p-4">
            <h3 className="mb-2 font-semibold">Evidencias ({c.evidencias.length})</h3>
            {c.evidencias.length ? <Galeria evidencias={c.evidencias} tamano="h-20 w-20" /> : <p className="text-gray-500">Sin fotos.</p>}
            {c.estado !== 'ANULADO' && <div className="mt-3"><CapturaFotos valor={nuevas} onCambio={setNuevas} etiqueta="Agregar foto" />{nuevas.length > 0 && <BotonPrimario className="mt-2" disabled={enviando} onClick={agregarFotos}>Guardar {nuevas.length} foto(s)</BotonPrimario>}</div>}
          </section>
          {gestiona && !cerrado && (
            <section className="grid gap-3 rounded-tarjeta bg-white p-4 sm:grid-cols-2">
              <Campo etiqueta="Prioridad" id="prioridad"><select value={c.prioridad} disabled={enviando} onChange={(e) => editar({ prioridad: e.target.value })} className={ent}>{Object.entries(PRIORIDAD).map(([k, v]) => <option key={k} value={k}>{v.texto}</option>)}</select></Campo>
              <Campo etiqueta="Responsable" id="responsable"><select value={c.responsable?.id ?? ''} disabled={enviando} onChange={(e) => editar({ responsableId: e.target.value || null })} className={ent}><option value="">Sin asignar</option>{responsables?.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select></Campo>
            </section>
          )}
          <section className="rounded-tarjeta bg-white p-4">
            <h3 className="mb-2 font-semibold">Seguimiento</h3>
            <ol className="space-y-2">{c.notas.map((n) => <li key={n.id} className="border-l-2 border-gray-200 pl-3"><p className="text-xs text-gray-500">{fechaHora(n.fecha)} · {n.usuario}{n.cambio ? ` · ${n.cambio}` : ''}</p>{n.texto && <p>{n.texto}</p>}</li>)}
              {!c.notas.length && <li className="text-gray-500">Sin movimientos todavía.</li>}</ol>
            {gestiona && <div className="mt-3 flex gap-2"><textarea rows={2} value={comentario} onChange={(e) => setComentario(e.target.value)} maxLength={1000} placeholder="Comentario (para resolver o anular, escriba qué se hizo)" aria-label="Comentario" className="min-w-0 flex-1 rounded-control border px-3 py-2" /><Boton disabled={enviando || !comentario.trim()} onClick={() => editar({})} aria-label="Agregar comentario"><MessageSquarePlus className="h-4 w-4" aria-hidden /></Boton></div>}
          </section>
        </div>
      )}
    </Hoja>
  )
}

export default function Casos() {
  const { puede } = usePermisos()
  const [estado, setEstado] = useState('ABIERTOS')
  const [prioridad, setPrioridad] = useState('')
  const [tipo, setTipo] = useState('')
  const [vencidos, setVencidos] = useState(false)
  const [mios, setMios] = useState(false)
  const [nuevo, setNuevo] = useState(false)
  const [abierto, setAbierto] = useState(null)
  const { datos, recargar } = useConsulta('/casos', { estado: estado || undefined, prioridad: prioridad || undefined, tipo: tipo || undefined, vencidos: vencidos || undefined, mios: mios || undefined })
  const ab = datos?.resumen.abiertos ?? {}
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      {datos && <section className="grid gap-3 sm:grid-cols-5">
        <Cifra titulo="Vencidos" valor={datos.resumen.vencidos} tono={datos.resumen.vencidos ? 'malo' : null} />
        {Object.entries(PRIORIDAD).map(([k, v]) => <Cifra key={k} titulo={`${v.texto}s abiertos`} valor={ab[k] ?? 0} tono={k === 'URGENTE' && ab[k] ? 'malo' : null} />)}
      </section>}
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label>Estado<select value={estado} onChange={(e) => setEstado(e.target.value)} className="mt-1 block rounded-control border px-2 py-1.5"><option value="ABIERTOS">Abiertos y en proceso</option>{Object.entries(ESTADO).map(([k, v]) => <option key={k} value={k}>{v.texto}</option>)}<option value="">Todos</option></select></label>
        <label>Prioridad<select value={prioridad} onChange={(e) => setPrioridad(e.target.value)} className="mt-1 block rounded-control border px-2 py-1.5"><option value="">Todas</option>{Object.entries(PRIORIDAD).map(([k, v]) => <option key={k} value={k}>{v.texto}</option>)}</select></label>
        <label>Tipo<select value={tipo} onChange={(e) => setTipo(e.target.value)} className="mt-1 block rounded-control border px-2 py-1.5"><option value="">Todos</option>{Object.entries(TIPO_CASO).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
        <label className="flex items-center gap-2 pb-2"><input type="checkbox" checked={vencidos} onChange={(e) => setVencidos(e.target.checked)} className="accent-red-600" /> Solo vencidos</label>
        {puede('casos.gestionar') && <label className="flex items-center gap-2 pb-2"><input type="checkbox" checked={mios} onChange={(e) => setMios(e.target.checked)} className="accent-green-600" /> Asignados a mí</label>}
        {puede('casos.crear') && <BotonPrimario className="ml-auto" onClick={() => setNuevo(true)}><Plus className="h-4 w-4" aria-hidden /> Reportar caso</BotonPrimario>}
      </div>
      <ul className="divide-y rounded-superficie border bg-white">
        {datos?.casos.map((c) => (
          <li key={c.id}>
            <button type="button" onClick={() => setAbierto(c.id)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left text-sm hover:bg-gray-50">
              {c.semaforo === 'VENCIDO' ? <AlertOctagon className="h-4 w-4 shrink-0 text-red-600" aria-label="Vencido" /> : <Clock className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />}
              <span className="w-24 font-medium">{c.numero}</span>
              <Etiqueta color={PRIORIDAD[c.prioridad].color}>{PRIORIDAD[c.prioridad].texto}</Etiqueta>
              <span className="min-w-0 flex-1 basis-56"><span className="block truncate font-medium">{c.titulo}</span><span className="block truncate text-xs text-gray-500">{TIPO_CASO[c.tipo]} · {[c.cabezal, c.remolque].filter(Boolean).join(' + ') || 'sin unidad'}{c.ordenTrabajo ? ` · ${c.ordenTrabajo}` : ''}{c.responsable ? ` · ${c.responsable}` : ''}</span></span>
              <Etiqueta color={ESTADO[c.estado].color}>{ESTADO[c.estado].texto}</Etiqueta>
              <span className={`w-36 text-right text-xs ${c.semaforo === 'VENCIDO' ? 'font-semibold text-red-700' : c.semaforo === 'POR_VENCER' ? 'text-amber-800' : 'text-gray-500'}`}>{c.semaforo ? restante(c.venceEn) : `cerrado ${fechaHora(c.resueltoEn)}`}</span>
            </button>
          </li>
        ))}
        {datos && !datos.casos.length && <li className="px-4 py-10 text-center text-sm text-gray-500">No hay casos en esta vista.</li>}
      </ul>
      {nuevo && <ReportarCaso onCerrar={() => setNuevo(false)} onListo={() => { setNuevo(false); recargar() }} />}
      <Detalle id={abierto} onCerrar={() => setAbierto(null)} onCambio={recargar} />
    </div>
  )
}
