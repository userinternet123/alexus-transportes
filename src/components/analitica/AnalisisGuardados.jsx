// ─────────────────────────────────────────────────────────────────────────────
// MIS ANÁLISIS Y TABLEROS: consultas guardadas con períodos relativos ("este mes", "últimos 12 meses").
// Se ejecutan al instante y SIN IA (gratis); la explicación con IA es opcional. Son personales y su dueño
// las comparte con usuarios o con roles completos. Un tablero junta varios análisis con un período común.
// ─────────────────────────────────────────────────────────────────────────────
import { UtilWidget } from '../comun/Experiencia'
import { confirmar } from '../comun/Confirmacion'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Copy, Eye, Layers, Pencil, Plus, Share2, Sparkles, Trash2, Users } from 'lucide-react'
import api from '../../services/api'
import { usePermisos } from '../../hooks/usePermisos'
import { showToast } from '../../utils/showToast'
import { errorApi } from '../pos/formato'
import Modal from '../comun/Modal'
import EditorAnalisis from './EditorAnalisis'
import RespuestaAnalitica from './RespuestaAnalitica'

const usaPeriodo = (def) => def.pasos.some((p) => p.entrada.periodo || p.entrada.a) && !def.pasos.some((p) => p.herramienta === 'proyectar')
const etiquetaDe = (def, periodos) => {
  const p = def.pasos.find((x) => x.entrada.periodo || x.entrada.a)
  if (!p) return 'Sin período'
  if (typeof p.entrada.periodo === 'string') return periodos.periodos.find((x) => x.token === p.entrada.periodo)?.etiqueta ?? p.entrada.periodo
  return 'Fechas fijas'
}

function SelectorPeriodo({ periodos, valor, onChange, disabled }) {
  return (
    <label className="flex items-center gap-2 text-sm text-gray-600">Período
      <select value={valor} onChange={(e) => onChange(e.target.value)} disabled={disabled} className="rounded-control border bg-white px-2 py-1.5 text-gray-900 disabled:opacity-50" aria-label="Período">
        <option value="">Como está guardado</option>
        {periodos.periodos.map((x) => <option key={x.token} value={x.token}>{x.etiqueta}</option>)}
      </select>
    </label>
  )
}

// ───────────────────────── Un análisis ─────────────────────────
function TarjetaAnalisis({ p, periodos, puedeExplicar, onEditar, onCompartir, onEliminar, onCopiar }) {
  const [abierta, setAbierta] = useState(false)
  const [periodo, setPeriodo] = useState('')
  const [res, setRes] = useState(null)
  const [error, setError] = useState(null)
  const [cargando, setCargando] = useState(false)

  const ejecutar = async ({ per = periodo, explicar = false } = {}) => {
    setCargando(true); setError(null)
    try {
      const { data } = await api.post(`/analisis/plantillas/${p.id}/ejecutar`, { periodo: per || null, explicar }, { timeout: 130000 })
      setRes(data.data)
    } catch (e) { setError(errorApi(e).mensaje); setRes(null) } finally { setCargando(false) }
  }
  const alternar = () => { const abrir = !abierta; setAbierta(abrir); if (abrir && !res) ejecutar() }
  const comp = p.compartidaCon ?? []

  return (
    <li className="rounded-superficie border bg-white">
      <div className="flex flex-wrap items-center gap-3 p-4">
        <button type="button" onClick={alternar} className="flex min-w-0 flex-1 items-start gap-3 text-left" aria-expanded={abierta}>
          <Eye className="mt-0.5 h-5 w-5 shrink-0 text-green-700" aria-hidden />
          <span className="min-w-0">
            <span className="block font-semibold leading-snug">{p.nombre}</span>
            {p.descripcion && <span className="block text-sm text-gray-600">{p.descripcion}</span>}
            <span className="mt-1 flex flex-wrap gap-1.5 text-xs">
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">{etiquetaDe(p.definicion, periodos)}</span>
              {!p.esMia && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-sky-700">Compartido por {p.propietario.nombre}</span>}
              {p.esMia && comp.length > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-green-700"><Users className="h-3 w-3" aria-hidden /> Compartido con {comp.length}</span>}
            </span>
          </span>
        </button>
        <div className="flex shrink-0 gap-1">
          {p.esMia ? <>
            <button type="button" onClick={() => onCompartir(p)} className="rounded p-2 text-gray-500 hover:bg-gray-100" aria-label={`Compartir ${p.nombre}`} title="Compartir"><Share2 className="h-4 w-4" /></button>
            <button type="button" onClick={() => onEditar(p)} className="rounded p-2 text-gray-500 hover:bg-gray-100" aria-label={`Editar ${p.nombre}`} title="Editar"><Pencil className="h-4 w-4" /></button>
            <button type="button" onClick={() => onEliminar(p)} className="rounded p-2 text-gray-500 hover:bg-red-50 hover:text-red-600" aria-label={`Eliminar ${p.nombre}`} title="Eliminar"><Trash2 className="h-4 w-4" /></button>
          </> : (
            <button type="button" onClick={() => onCopiar(p)} className="inline-flex items-center gap-1 rounded-control border px-3 py-1.5 text-sm hover:bg-gray-50" title="Guardar una copia propia que usted pueda editar"><Copy className="h-4 w-4" aria-hidden /> Guardar copia</button>
          )}
        </div>
      </div>
      {abierta && (
        <div className="space-y-3 border-t bg-gray-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {usaPeriodo(p.definicion) ? <SelectorPeriodo periodos={periodos} valor={periodo} disabled={cargando} onChange={(v) => { setPeriodo(v); ejecutar({ per: v }) }} /> : <span className="text-xs text-gray-500">Este análisis usa su propio período.</span>}
            {puedeExplicar && <button type="button" disabled={cargando} onClick={() => ejecutar({ explicar: true })} className="inline-flex items-center gap-1.5 rounded-control border bg-white px-3 py-1.5 text-sm font-medium text-green-800 hover:bg-green-50 disabled:opacity-50"><Sparkles className="h-4 w-4" aria-hidden /> Explicar con IA</button>}
          </div>
          {cargando && <p className="text-sm text-gray-600" role="status">Calculando…</p>}
          {error && <p className="rounded-control bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{error}</p>}
          {res && !cargando && <RespuestaAnalitica r={res} />}
        </div>
      )}
    </li>
  )
}

// ───────────────────────── Compartir ─────────────────────────
function CompartirDialogo({ ruta, titulo, actuales, onCerrar, onListo }) {
  const [destinos, setDestinos] = useState(null)
  const [sel, setSel] = useState(() => new Set(actuales.map((a) => `${a.tipo}:${a.id}`)))
  const [filtro, setFiltro] = useState('')
  const [guardando, setGuardando] = useState(false)
  useEffect(() => { api.get('/analisis/destinos').then(({ data }) => setDestinos(data.data)).catch((e) => showToast({ type: 'error', message: errorApi(e).mensaje })) }, [])
  const alternar = (k) => setSel((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })
  const usuarios = useMemo(() => (destinos?.usuarios ?? []).filter((u) => u.nombre.toLowerCase().includes(filtro.trim().toLowerCase())), [destinos, filtro])
  const guardar = async () => {
    setGuardando(true)
    try {
      const { data } = await api.put(`${ruta}/compartir`, { destinos: [...sel].map((k) => { const [tipo, id] = k.split(':'); return { tipo, id: Number(id) } }) })
      showToast({ type: 'success', message: data.message }); onListo()
    } catch (e) { showToast({ type: 'error', message: errorApi(e).mensaje }) } finally { setGuardando(false) }
  }
  return (
    <Modal abierto titulo={`Compartir «${titulo}»`} onCerrar={onCerrar} ancho="max-w-lg"
      pie={<><button type="button" onClick={onCerrar} className="rounded-control border px-4 py-2">Cancelar</button>
        <button type="button" disabled={guardando || !destinos} onClick={guardar} className="rounded-control bg-green-600 px-4 py-2 font-medium text-white disabled:opacity-50">Guardar</button></>}>
      <p className="mb-3 text-sm text-gray-600">Quienes lo reciban podrán verlo y ejecutarlo, pero <b>con sus propios permisos</b>: si usted incluyó costos y ellos no pueden verlos, se les avisará. Solo usted puede modificarlo.</p>
      {!destinos ? <p className="text-sm text-gray-500">Cargando…</p> : <>
        <p className="text-sm font-medium">Roles completos</p>
        <ul className="mb-4 mt-1 grid gap-1 sm:grid-cols-2">
          {destinos.roles.map((r) => <li key={r.id}><label className="flex items-center gap-2 rounded-control px-2 py-1.5 text-sm hover:bg-gray-50"><input type="checkbox" checked={sel.has(`ROL:${r.id}`)} onChange={() => alternar(`ROL:${r.id}`)} className="accent-green-600" /> {r.nombre}</label></li>)}
        </ul>
        <p className="text-sm font-medium">Usuarios</p>
        <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Buscar usuario" className="mt-1 w-full rounded-control border px-3 py-2 text-sm" aria-label="Buscar usuario" />
        <ul className="mt-1 max-h-48 overflow-auto">
          {usuarios.map((u) => <li key={u.id}><label className="flex items-center gap-2 rounded-control px-2 py-1.5 text-sm hover:bg-gray-50"><input type="checkbox" checked={sel.has(`USUARIO:${u.id}`)} onChange={() => alternar(`USUARIO:${u.id}`)} className="accent-green-600" /> {u.nombre}</label></li>)}
          {!usuarios.length && <li className="px-2 py-3 text-sm text-gray-500">No hay usuarios con ese nombre.</li>}
        </ul>
        <p className="mt-3 text-xs text-gray-500">{sel.size ? `${sel.size} seleccionado${sel.size === 1 ? '' : 's'}` : 'No se comparte con nadie.'}</p>
      </>}
    </Modal>
  )
}

// ───────────────────────── Tableros ─────────────────────────
function EditorTablero({ inicial, plantillas, onCerrar, onGuardar }) {
  const [nombre, setNombre] = useState(inicial?.nombre ?? '')
  const [ids, setIds] = useState(() => new Set(inicial?.plantillaIds ?? []))
  const [guardando, setGuardando] = useState(false)
  const alternar = (id) => setIds((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else if (n.size < 12) n.add(id); return n })
  const guardar = async () => { setGuardando(true); try { await onGuardar({ nombre: nombre.trim(), plantillaIds: [...ids] }) } finally { setGuardando(false) } }
  return (
    <Modal abierto titulo={inicial ? `Editar «${inicial.nombre}»` : 'Nuevo tablero'} onCerrar={onCerrar} ancho="max-w-lg"
      pie={<><button type="button" onClick={onCerrar} className="rounded-control border px-4 py-2">Cancelar</button>
        <button type="button" disabled={!nombre.trim() || !ids.size || guardando} onClick={guardar} className="rounded-control bg-green-600 px-4 py-2 font-medium text-white disabled:opacity-50">Guardar</button></>}>
      <label className="block text-sm">Nombre del tablero<input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80} placeholder="Por ejemplo: Resumen gerencial" className="mt-1 w-full rounded-control border px-3 py-2" /></label>
      <p className="mb-1 mt-4 text-sm font-medium">Análisis que se verán juntos <span className="font-normal text-gray-500">({ids.size} de 12)</span></p>
      <ul className="max-h-64 overflow-auto rounded-control border">
        {plantillas.map((p) => <li key={p.id}><label className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50"><input type="checkbox" checked={ids.has(p.id)} onChange={() => alternar(p.id)} className="accent-green-600" /> <span className="min-w-0 flex-1 truncate">{p.nombre}</span>{!p.esMia && <span className="shrink-0 text-xs text-sky-700">de {p.propietario.nombre}</span>}</label></li>)}
      </ul>
      <p className="mt-2 text-xs text-gray-500">Al compartir un tablero se comparten sus análisis, solo para verlos dentro de él.</p>
    </Modal>
  )
}

function TableroVista({ t, periodos, onVolver, onEditar, onCompartir, onEliminar }) {
  const [periodo, setPeriodo] = useState('')
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(false)
  const cargar = useCallback(async (per) => {
    setCargando(true)
    try { const { data } = await api.post(`/analisis/tableros/${t.id}/ejecutar`, { periodo: per || null }, { timeout: 130000 }); setDatos(data.data) }
    catch (e) { showToast({ type: 'error', message: errorApi(e).mensaje }) } finally { setCargando(false) }
  }, [t.id])
  useEffect(() => { cargar('') }, [cargar])
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={onVolver} className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"><ArrowLeft className="h-4 w-4" aria-hidden /> Volver</button>
        {t.esMio && <div className="flex gap-1">
          <button type="button" onClick={() => onCompartir(t)} className="rounded p-2 text-gray-500 hover:bg-gray-100" aria-label="Compartir tablero" title="Compartir"><Share2 className="h-4 w-4" /></button>
          <button type="button" onClick={() => onEditar(t)} className="rounded p-2 text-gray-500 hover:bg-gray-100" aria-label="Editar tablero" title="Editar"><Pencil className="h-4 w-4" /></button>
          <button type="button" onClick={() => onEliminar(t)} className="rounded p-2 text-gray-500 hover:bg-red-50 hover:text-red-600" aria-label="Eliminar tablero" title="Eliminar"><Trash2 className="h-4 w-4" /></button>
        </div>}
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="text-xl font-semibold">{t.nombre}</h2>{!t.esMio && <p className="text-xs text-sky-700">Compartido por {t.propietario.nombre}</p>}</div>
        <SelectorPeriodo periodos={periodos} valor={periodo} disabled={cargando} onChange={(v) => { setPeriodo(v); cargar(v) }} />
      </div>
      {periodo && <p className="text-xs text-gray-500">Los análisis con proyección o con fechas fijas conservan su propio período.</p>}
      {cargando && !datos && <p className="text-sm text-gray-600" role="status">Calculando el tablero…</p>}
      <div className={`grid gap-4 md:grid-cols-2 ${cargando ? 'opacity-60' : ''}`}>
        {datos?.widgets.map((w) => w.error
          ? <div key={w.plantillaId} className="rounded-superficie border bg-white p-4"><p className="font-semibold">{w.nombre}</p><p className="mt-1 text-sm text-amber-800" role="alert">{w.error}</p></div>
          : <RespuestaAnalitica key={w.plantillaId} r={w.resultado} compacta />)}
      </div>
    </div>
  )
}

// ───────────────────────── Pantalla ─────────────────────────
export default function AnalisisGuardados() {
  const { puede } = usePermisos()
  const puedeIA = puede('reportes.analitica.agente')
  const [pestana, setPestana] = useState('analisis')
  const [plantillas, setPlantillas] = useState(null)
  const [tableros, setTableros] = useState(null)
  const [periodos, setPeriodos] = useState({ periodos: [], contra: [] })
  const [iaLista, setIaLista] = useState(false)
  const [dialogo, setDialogo] = useState(null)
  const [abierto, setAbierto] = useState(null)

  const cargar = useCallback(async () => {
    try {
      const [p, t] = await Promise.all([api.get('/analisis/plantillas'), api.get('/analisis/tableros')])
      setPlantillas(p.data.data); setTableros(t.data.data)
    } catch (e) { showToast({ type: 'error', message: errorApi(e).mensaje }) }
  }, [])
  useEffect(() => {
    cargar()
    api.get('/analisis/periodos').then(({ data }) => setPeriodos(data.data)).catch(() => {})
    if (puedeIA) api.get('/agente/capacidades').then(({ data }) => setIaLista(Boolean(data.data.disponible))).catch(() => setIaLista(false))
  }, [cargar, puedeIA])

  const hecho = (mensaje) => { if (mensaje) showToast({ type: 'success', message: mensaje }); setDialogo(null); cargar() }
  const llamar = async (accion, ok) => { try { const { data } = await accion(); hecho(ok ?? data.message) } catch (e) { showToast({ type: 'error', message: errorApi(e).mensaje }) } }
  const eliminarPlantilla = async (p) => { if (await confirmar({ titulo: 'Eliminar análisis', mensaje: `«${p.nombre}» también se quitará de los tableros y dejará de compartirse.`, confirmar: 'Eliminar', peligro: true })) llamar(() => api.delete(`/analisis/plantillas/${p.id}`)) }
  const eliminarTablero = async (t) => { if (await confirmar({ titulo: 'Eliminar tablero', mensaje: `«${t.nombre}» se eliminará. Sus análisis no se borran.`, confirmar: 'Eliminar', peligro: true })) { setAbierto(null); llamar(() => api.delete(`/analisis/tableros/${t.id}`)) } }
  const copiar = (p) => llamar(() => api.post('/analisis/plantillas', { nombre: `${p.nombre} (copia)`.slice(0, 80), descripcion: p.descripcion, definicion: p.definicion }), 'Copia guardada: ahora puede editarla')

  if (abierto) {
    const t = tableros?.find((x) => x.id === abierto) ?? null
    if (!t) return <div className="p-4"><button type="button" onClick={() => setAbierto(null)} className="text-sm underline">Volver</button></div>
    return (
      <div className="mx-auto max-w-5xl p-4">
        <TableroVista t={t} periodos={periodos} onVolver={() => setAbierto(null)} onEditar={(x) => setDialogo({ tipo: 'tablero', t: x })} onCompartir={(x) => setDialogo({ tipo: 'compartirTablero', t: x })} onEliminar={eliminarTablero} />
        {dialogo?.tipo === 'tablero' && <EditorTablero inicial={dialogo.t} plantillas={plantillas ?? []} onCerrar={() => setDialogo(null)} onGuardar={(d) => llamar(() => api.put(`/analisis/tableros/${dialogo.t.id}`, d))} />}
        {dialogo?.tipo === 'compartirTablero' && <CompartirDialogo ruta={`/analisis/tableros/${dialogo.t.id}`} titulo={dialogo.t.nombre} actuales={dialogo.t.compartidoCon ?? []} onCerrar={() => setDialogo(null)} onListo={() => hecho()} />}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <p className="text-sm text-gray-600">Guarde los análisis que repite (ventas del mes, categorías que más venden, productos por agotarse) y vuelva a abrirlos al instante, sin gastar IA. Puede compartirlos con su equipo.</p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-control bg-gray-200 p-0.5 text-sm" role="tablist">
          {[['analisis', `Análisis${plantillas ? ` (${plantillas.length})` : ''}`], ['tableros', `Tableros${tableros ? ` (${tableros.length})` : ''}`]].map(([k, t]) => (
            <button key={k} type="button" role="tab" aria-selected={pestana === k} onClick={() => setPestana(k)} className={`rounded-[6px] px-4 py-1.5 ${pestana === k ? 'bg-white font-medium shadow-sm' : 'text-gray-600'}`}>{t}</button>
          ))}
        </div>
        {pestana === 'tableros' && <button type="button" disabled={!plantillas?.length} onClick={() => setDialogo({ tipo: 'tablero', t: null })} className="inline-flex items-center gap-1 rounded-control bg-green-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"><Plus className="h-4 w-4" aria-hidden /> Nuevo tablero</button>}
      </div>

      {pestana === 'analisis' && (
        <ul className="space-y-3">
          {plantillas?.map((p) => <TarjetaAnalisis key={p.id} p={p} periodos={periodos} puedeExplicar={puedeIA && iaLista} onEditar={(x) => setDialogo({ tipo: 'editar', p: x })} onCompartir={(x) => setDialogo({ tipo: 'compartir', p: x })} onEliminar={eliminarPlantilla} onCopiar={copiar} />)}
          {plantillas && !plantillas.length && <li className="rounded-superficie border bg-white px-4 py-12 text-center text-sm text-gray-500">Aún no tiene análisis guardados.{puedeIA ? ' Haga una pregunta en «Pregunta a tus datos» y use «Guardar como análisis».' : ''}</li>}
        </ul>
      )}
      {pestana === 'tableros' && (
        <ul className="space-y-3">
          {tableros?.map((t) => (
            <li key={t.id}>
              <button type="button" onClick={() => setAbierto(t.id)} className="flex w-full items-start gap-3 rounded-superficie border bg-white p-4 text-left hover:border-green-600">
                <Layers className="mt-0.5 h-5 w-5 shrink-0 text-green-700" aria-hidden />
                <span className="min-w-0">
                  <span className="block font-semibold">{t.nombre}</span>
                  <span className="block truncate text-sm text-gray-600">{t.plantillas.map((p) => p.nombre).join(' · ')}</span>
                  <span className="mt-1 flex flex-wrap gap-1.5 text-xs">
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">{t.plantillas.length} análisis</span>
                    {!t.esMio && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-sky-700">Compartido por {t.propietario.nombre}</span>}
                    {t.esMio && (t.compartidoCon?.length ?? 0) > 0 && <span className="rounded-full bg-green-50 px-2 py-0.5 text-green-700">Compartido con {t.compartidoCon.length}</span>}
                  </span>
                </span>
              </button>
            </li>
          ))}
          {tableros && !tableros.length && <li className="rounded-superficie border bg-white px-4 py-12 text-center text-sm text-gray-500">Aún no tiene tableros. Un tablero junta varios análisis y deja cambiar el período de todos a la vez.</li>}
        </ul>
      )}

      {dialogo?.tipo === 'editar' && <EditorAnalisis titulo={`Editar «${dialogo.p.nombre}»`} inicial={dialogo.p} onCerrar={() => setDialogo(null)} onGuardar={(d) => llamar(() => api.put(`/analisis/plantillas/${dialogo.p.id}`, d))} />}
      {dialogo?.tipo === 'compartir' && <CompartirDialogo ruta={`/analisis/plantillas/${dialogo.p.id}`} titulo={dialogo.p.nombre} actuales={dialogo.p.compartidaCon ?? []} onCerrar={() => setDialogo(null)} onListo={() => hecho()} />}
      {dialogo?.tipo === 'tablero' && <EditorTablero inicial={dialogo.t} plantillas={plantillas ?? []} onCerrar={() => setDialogo(null)} onGuardar={(d) => llamar(() => (dialogo.t ? api.put(`/analisis/tableros/${dialogo.t.id}`, d) : api.post('/analisis/tableros', d)))} />}
      <UtilWidget pantalla="analisis" />
    </div>
  )
}
