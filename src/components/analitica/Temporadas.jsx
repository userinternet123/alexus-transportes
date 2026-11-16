// ─────────────────────────────────────────────────────────────────────────────
// TEMPORADAS: períodos del año que se repiten (inicio de clases, Navidad…) con más ventas de ciertos productos.
// Las define el dueño o las propone el motor analítico al revisar 3 años de ventas; el dueño las confirma.
// Con ellas el sistema avisa con anticipación qué comprar, según lo vendido en temporadas anteriores.
// ─────────────────────────────────────────────────────────────────────────────
import { UtilWidget } from '../comun/Experiencia'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarRange, Check, Download, Pause, Pencil, Play, Plus, Search, ShoppingCart, Sparkles, Trash2, X } from 'lucide-react'
import api from '../../services/api'
import { showToast } from '../../utils/showToast'
import { cargarArbol, opcionesSubgrupo } from '../../utils/clasificacion'
import { descargarCsv } from '../../utils/grafica'
import { errorApi } from '../pos/formato'
import { confirmar } from '../comun/Confirmacion'
import Modal from '../comun/Modal'

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const INICIALES = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
const DIAS_MES = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] // febrero 29: en años no bisiestos se usa el 28
const TIPOS = { CATEGORIA: 'Categoría', GRUPO: 'Grupo', SUBGRUPO: 'Subgrupo', PRODUCTO: 'Producto' }
const CONFIANZA = { alta: 'bg-green-50 text-green-700', media: 'bg-amber-50 text-amber-700', baja: 'bg-red-50 text-red-700' }
const fecha = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '')
const campo = 'mt-1 w-full rounded-control border px-3 py-2'

/** Los 12 meses del año: qué tanto se vende en cada uno respecto al promedio (los de la temporada, en verde). */
function Patron({ indices, meses }) {
  if (!Array.isArray(indices) || indices.length !== 12) return null
  const max = Math.max(...indices, 1)
  return (
    <figure className="mt-2" aria-label={`Ventas por mes respecto al promedio: ${indices.map((v, i) => `${MESES[i]} ${v.toFixed(1)}`).join(', ')}`}>
      <svg viewBox="0 0 240 52" className="h-14 w-full max-w-xs" role="img">
        <line x1="0" x2="240" y1={40 - (1 / max) * 36} y2={40 - (1 / max) * 36} stroke="currentColor" className="text-gray-300" strokeDasharray="3 3" />
        {indices.map((v, i) => {
          const h = Math.max(1.5, (v / max) * 36)
          return <rect key={i} x={i * 20 + 3} y={40 - h} width="14" height={h} rx="2" className={meses.includes(i + 1) ? 'fill-green-600' : 'fill-gray-300'} />
        })}
        {INICIALES.map((l, i) => <text key={i} x={i * 20 + 10} y="51" textAnchor="middle" className="fill-gray-500" style={{ fontSize: 8 }}>{l}</text>)}
      </svg>
      <figcaption className="text-xs text-gray-500">La línea punteada es el promedio del año.</figcaption>
    </figure>
  )
}

const Alcance = ({ alcance }) => (
  <ul className="mt-2 flex flex-wrap gap-1.5">
    {alcance.map((a) => <li key={`${a.tipo}:${a.refId}`} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700"><span className="text-gray-500">{TIPOS[a.tipo]}:</span> {a.nombre}</li>)}
  </ul>
)

function Situacion({ t }) {
  const s = t.situacion
  if (s.enCurso) return <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">En curso hasta el {fecha(s.ventana.fin)}</span>
  const avisa = s.diasParaInicio <= t.anticipacionDias
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${avisa ? 'bg-amber-50 text-amber-800' : 'bg-gray-100 text-gray-600'}`}>Empieza en {s.diasParaInicio} días ({fecha(s.ventana.inicio)})</span>
}

// ───────────────────────── Editor ─────────────────────────
function SelectorAlcance({ valor, onChange }) {
  const [tipo, setTipo] = useState('CATEGORIA')
  const [arbol, setArbol] = useState(null)
  const [texto, setTexto] = useState('')
  const [productos, setProductos] = useState([])
  useEffect(() => { cargarArbol().then(setArbol).catch(() => setArbol({ categorias: [], grupos: [], subgrupos: [] })) }, [])
  useEffect(() => {
    if (tipo !== 'PRODUCTO' || texto.trim().length < 2) { setProductos([]); return undefined }
    const t = setTimeout(() => api.get('/productos', { params: { q: texto.trim(), limit: 12, activo: 'true' } }).then(({ data }) => setProductos(data.data ?? [])).catch(() => setProductos([])), 300)
    return () => clearTimeout(t)
  }, [tipo, texto])
  const candidatos = useMemo(() => {
    if (!arbol) return []
    const cat = new Map(arbol.categorias.map((c) => [c.id, c.nombre]))
    const lista = tipo === 'CATEGORIA' ? arbol.categorias.map((c) => ({ refId: c.id, nombre: c.nombre }))
      : tipo === 'GRUPO' ? arbol.grupos.map((g) => ({ refId: g.id, nombre: `${cat.get(g.categoriaId) ?? ''} › ${g.nombre}` }))
        : tipo === 'SUBGRUPO' ? opcionesSubgrupo(arbol).map((s) => ({ refId: s.id, nombre: s.ruta }))
          : productos.map((p) => ({ refId: p.id, nombre: p.nombre }))
    const f = texto.trim().toLowerCase()
    return (tipo === 'PRODUCTO' || !f ? lista : lista.filter((x) => x.nombre.toLowerCase().includes(f))).slice(0, 40)
  }, [arbol, tipo, texto, productos])
  const tiene = (refId) => valor.some((a) => a.tipo === tipo && a.refId === refId)
  return (
    <div>
      <p className="text-sm">¿Qué productos son de esta temporada? <span className="text-gray-500">(una categoría incluye todos sus productos)</span></p>
      {valor.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {valor.map((a) => (
            <li key={`${a.tipo}:${a.refId}`} className="flex items-center gap-1 rounded-full bg-green-50 py-0.5 pl-2 pr-1 text-xs text-green-800">
              <span><span className="text-green-700/70">{TIPOS[a.tipo]}:</span> {a.nombre}</span>
              <button type="button" onClick={() => onChange(valor.filter((x) => !(x.tipo === a.tipo && x.refId === a.refId)))} className="rounded-full p-0.5 hover:bg-green-100" aria-label={`Quitar ${a.nombre}`}><X className="h-3 w-3" /></button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        <select value={tipo} onChange={(e) => { setTipo(e.target.value); setTexto('') }} className="rounded-control border px-2 py-2 text-sm" aria-label="Tipo de alcance">
          {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" aria-hidden />
          <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={tipo === 'PRODUCTO' ? 'Escriba al menos 2 letras' : 'Filtrar'} className="w-full rounded-control border py-2 pl-8 pr-2 text-sm" aria-label="Buscar" />
        </label>
      </div>
      <ul className="mt-1 max-h-44 overflow-auto rounded-control border" role="listbox" aria-label="Opciones">
        {candidatos.map((c) => (
          <li key={c.refId}>
            <button type="button" disabled={tiene(c.refId)} onClick={() => onChange([...valor, { tipo, refId: c.refId, nombre: c.nombre }])}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 disabled:opacity-50">
              <span className="min-w-0 truncate">{c.nombre}</span>{tiene(c.refId) ? <Check className="h-4 w-4 shrink-0 text-green-600" aria-label="Agregado" /> : <Plus className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />}
            </button>
          </li>
        ))}
        {!candidatos.length && <li className="px-3 py-3 text-sm text-gray-500">{tipo === 'PRODUCTO' && texto.trim().length < 2 ? 'Escriba el nombre del producto.' : 'Sin resultados.'}</li>}
      </ul>
    </div>
  )
}

function EditorTemporada({ inicial, titulo, textoGuardar = 'Guardar', onCerrar, onGuardar }) {
  const [f, setF] = useState(() => ({ nombre: '', inicioMes: 12, inicioDia: 15, finMes: 2, finDia: 15, anticipacionDias: 45, notas: '', alcance: [], ...inicial }))
  const [guardando, setGuardando] = useState(false)
  const poner = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'number' || k.endsWith('Mes') ? Number(e.target.value) : e.target.value }))
  const errores = []
  if (!f.nombre.trim()) errores.push('Escriba un nombre.')
  if (f.inicioDia < 1 || f.inicioDia > DIAS_MES[f.inicioMes - 1]) errores.push(`El ${f.inicioDia} de ${MESES[f.inicioMes - 1]} no existe.`)
  if (f.finDia < 1 || f.finDia > DIAS_MES[f.finMes - 1]) errores.push(`El ${f.finDia} de ${MESES[f.finMes - 1]} no existe.`)
  if (f.inicioMes === f.finMes && f.inicioDia === f.finDia) errores.push('La temporada debe durar más de un día.')
  if (!f.alcance.length) errores.push('Elija al menos una categoría, grupo, subgrupo o producto.')
  const cruza = f.finMes < f.inicioMes || (f.finMes === f.inicioMes && f.finDia < f.inicioDia)
  const guardar = async () => {
    setGuardando(true)
    try { await onGuardar({ nombre: f.nombre.trim(), inicioMes: f.inicioMes, inicioDia: f.inicioDia, finMes: f.finMes, finDia: f.finDia, anticipacionDias: f.anticipacionDias, notas: f.notas?.trim() || null, alcance: f.alcance.map(({ tipo, refId }) => ({ tipo, refId })) }) }
    finally { setGuardando(false) }
  }
  const Fecha = ({ pref, etiqueta }) => (
    <fieldset className="min-w-0"><legend className="text-sm">{etiqueta}</legend>
      <div className="mt-1 flex gap-2">
        <input type="number" min="1" max="31" inputMode="numeric" value={f[`${pref}Dia`]} onChange={poner(`${pref}Dia`)} className="cifra w-16 rounded-control border px-2 py-2 text-right" aria-label={`Día de ${etiqueta.toLowerCase()}`} />
        <select value={f[`${pref}Mes`]} onChange={poner(`${pref}Mes`)} className="min-w-0 flex-1 rounded-control border px-2 py-2" aria-label={`Mes de ${etiqueta.toLowerCase()}`}>{MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
      </div>
    </fieldset>
  )
  return (
    <Modal abierto titulo={titulo} onCerrar={onCerrar} ancho="max-w-xl"
      pie={<><button type="button" onClick={onCerrar} className="rounded-control border px-4 py-2">Cancelar</button>
        <button type="button" disabled={errores.length > 0 || guardando} onClick={guardar} className="rounded-control bg-green-600 px-4 py-2 font-medium text-white disabled:opacity-50">{guardando ? 'Guardando…' : textoGuardar}</button></>}>
      <div className="space-y-4">
        <label className="block text-sm">Nombre<input value={f.nombre} onChange={poner('nombre')} maxLength={80} placeholder="Ej. Temporada escolar" className={campo} /></label>
        <div className="grid gap-3 sm:grid-cols-2">{Fecha({ pref: 'inicio', etiqueta: 'Empieza' })}{Fecha({ pref: 'fin', etiqueta: 'Termina' })}</div>
        <p className="-mt-2 text-xs text-gray-500">Se repite cada año{cruza ? ' y cruza de un año al siguiente' : ''}.</p>
        <label className="block text-sm">Avisar con anticipación (días)
          <input type="number" min="0" max="365" inputMode="numeric" value={f.anticipacionDias} onChange={poner('anticipacionDias')} className={`${campo} cifra max-w-[8rem] text-right`} />
          <span className="mt-1 block text-xs text-gray-500">Desde ese día, la campana avisa qué comprar. Considere lo que tardan sus proveedores en entregar.</span>
        </label>
        <SelectorAlcance valor={f.alcance} onChange={(alcance) => setF((x) => ({ ...x, alcance }))} />
        <label className="block text-sm">Notas (opcional)<input value={f.notas ?? ''} onChange={poner('notas')} maxLength={500} className={campo} /></label>
        {errores.length > 0 && <ul className="rounded-control bg-amber-50 px-3 py-2 text-sm text-amber-900" role="alert">{errores.map((e) => <li key={e}>{e}</li>)}</ul>}
      </div>
    </Modal>
  )
}

// ───────────────────────── Qué comprar ─────────────────────────
function Compras({ t, onCerrar }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)
  const [soloFaltan, setSoloFaltan] = useState(true)
  useEffect(() => { api.get(`/temporadas/${t.id}/compras`, { timeout: 90000 }).then(({ data }) => setDatos(data.data)).catch((e) => setError(errorApi(e).mensaje)) }, [t.id])
  const filas = (datos?.productos ?? []).filter((p) => !soloFaltan || p.sugerido > 0)
  const anios = (datos?.ventanas ?? []).map((v) => v.inicio.slice(0, 4))
  const exportar = () => descargarCsv(`Compras ${t.nombre}`,
    [{ clave: 'sku', etiqueta: 'Código' }, { clave: 'nombre', etiqueta: 'Producto' }, ...anios.map((a, i) => ({ clave: `h${i}`, etiqueta: `Vendido ${a}` })), { clave: 'existencia', etiqueta: 'Existencia' }, { clave: 'esperado', etiqueta: 'Se espera vender' }, { clave: 'sugerido', etiqueta: 'Comprar' }, { clave: 'confianza', etiqueta: 'Confianza' }],
    filas.map((p) => ({ ...p, ...Object.fromEntries((p.historial ?? []).map((h, i) => [`h${i}`, h])) })))
  return (
    <Modal abierto titulo={`Qué comprar para «${t.nombre}»`} onCerrar={onCerrar} ancho="max-w-4xl"
      pie={<><button type="button" disabled={!filas.length} onClick={exportar} className="inline-flex items-center gap-1.5 rounded-control border px-4 py-2 disabled:opacity-50"><Download className="h-4 w-4" aria-hidden /> Descargar para Excel</button><button type="button" onClick={onCerrar} className="rounded-control bg-green-600 px-4 py-2 font-medium text-white">Cerrar</button></>}>
      {error && <p className="rounded-control bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{error}</p>}
      {!datos && !error && <p className="text-sm text-gray-600" role="status">Calculando con las temporadas anteriores…</p>}
      {datos && <>
        <p className="text-sm text-gray-600">{datos.ventanas.length ? `Según lo vendido en esta sucursal en las temporadas de ${anios.join(', ')}. Se sugiere 15 % más de lo esperado como margen de seguridad.` : 'Todavía no hay temporadas anteriores terminadas para calcular.'}</p>
        <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={soloFaltan} onChange={(e) => setSoloFaltan(e.target.checked)} className="accent-green-600" /> Solo los productos que no alcanzarían</label>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="border-b text-left text-xs text-gray-500"><th className="py-2 pr-2">Producto</th>{anios.map((a) => <th key={a} className="px-2 text-right">{a}</th>)}<th className="px-2 text-right">Existencia</th><th className="px-2 text-right">Se espera</th><th className="px-2 text-right">Comprar</th><th className="pl-2">Confianza</th></tr></thead>
            <tbody>
              {filas.map((p) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="py-2 pr-2"><span className="block font-medium">{p.nombre}</span>{p.sku && <span className="text-xs text-gray-500">{p.sku}</span>}</td>
                  {anios.map((_, i) => <td key={i} className="cifra px-2 text-right text-gray-600">{p.historial?.[i] ?? 0}</td>)}
                  <td className="cifra px-2 text-right">{p.existencia}</td>
                  <td className="cifra px-2 text-right">{p.esperado ?? '—'}{p.tendencia === 'sube' ? ' ↑' : p.tendencia === 'baja' ? ' ↓' : ''}</td>
                  <td className={`cifra px-2 text-right font-semibold ${p.sugerido > 0 ? 'text-green-700' : 'text-gray-400'}`}>{p.sugerido}</td>
                  <td className="pl-2"><span className={`rounded-full px-2 py-0.5 text-xs ${CONFIANZA[p.confianza] ?? 'bg-gray-100 text-gray-600'}`}>{p.confianza}</span></td>
                </tr>
              ))}
              {!filas.length && <tr><td colSpan={5 + anios.length} className="py-6 text-center text-gray-500">{soloFaltan ? 'Con la existencia actual alcanza para la temporada.' : 'Sin productos con ventas en temporadas anteriores.'}</td></tr>}
            </tbody>
          </table>
        </div>
      </>}
    </Modal>
  )
}

// ───────────────────────── Pantalla ─────────────────────────
export default function Temporadas() {
  const navigate = useNavigate()
  const [lista, setLista] = useState(null)
  const [detectando, setDetectando] = useState(false)
  const [editor, setEditor] = useState(null) // { t?, modo: 'nueva' | 'editar' | 'ajustar' }
  const [compras, setCompras] = useState(null)
  const cargar = useCallback(() => api.get('/temporadas').then(({ data }) => setLista(data.data)).catch((e) => showToast({ type: 'error', message: errorApi(e).mensaje })), [])
  useEffect(() => { cargar() }, [cargar])
  // Primero se actualiza la lista y después se avisa: lo que dice el mensaje coincide con lo que se ve
  const accion = async (fn, ok) => { try { const { data } = await fn(); await cargar(); showToast({ type: 'success', message: ok ?? data.message }); return true } catch (e) { showToast({ type: 'error', message: errorApi(e).mensaje }); return false } }
  const detectar = async () => { setDetectando(true); try { await accion(() => api.post('/temporadas/detectar', null, { timeout: 120000 })) } finally { setDetectando(false) } }
  const estado = (t, e) => accion(() => api.put(`/temporadas/${t.id}/estado`, { estado: e }))
  const eliminar = async (t) => { if (await confirmar({ titulo: 'Eliminar temporada', mensaje: `«${t.nombre}» se eliminará. Si solo quiere dejar de recibir avisos, mejor póngala en pausa.`, confirmar: 'Eliminar', peligro: true })) accion(() => api.delete(`/temporadas/${t.id}`)) }
  const guardarEditor = async (dto) => {
    const t = editor.t
    if (editor.modo === 'nueva') { if (await accion(() => api.post('/temporadas', dto))) setEditor(null); return }
    if (!(await accion(() => api.put(`/temporadas/${t.id}`, dto), editor.modo === 'ajustar' ? 'Temporada ajustada y activada' : undefined))) return
    if (editor.modo === 'ajustar') await accion(() => api.put(`/temporadas/${t.id}/estado`, { estado: 'ACTIVA' }), 'Temporada ajustada y activada')
    setEditor(null)
  }
  const de = (e) => (lista ?? []).filter((t) => t.estado === e)
  const propuestas = de('PROPUESTA'); const activas = de('ACTIVA'); const otras = [...de('INACTIVA'), ...de('DESCARTADA')]
  const avisos = activas.filter((t) => !t.situacion.enCurso && t.situacion.diasParaInicio <= t.anticipacionDias)

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-xl text-sm text-gray-600">Períodos del año en que ciertos productos se venden mucho más (inicio de clases, Navidad…). Con ellos el sistema le avisa con anticipación qué comprar, y en «Baja rotación» no se confunden con productos que no se venden.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={detectando} onClick={detectar} className="inline-flex items-center gap-1.5 rounded-control border bg-white px-3 py-2 text-sm font-medium text-green-800 hover:bg-green-50 disabled:opacity-50"><Sparkles className="h-4 w-4" aria-hidden /> {detectando ? 'Revisando 3 años de ventas…' : 'Detectar temporadas'}</button>
          <button type="button" onClick={() => setEditor({ modo: 'nueva' })} className="inline-flex items-center gap-1.5 rounded-control bg-green-600 px-3 py-2 text-sm font-medium text-white"><Plus className="h-4 w-4" aria-hidden /> Nueva temporada</button>
        </div>
      </div>

      {avisos.map((t) => (
        <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-tarjeta border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">
          <span><b>«{t.nombre}»</b> empieza en {t.situacion.diasParaInicio} días ({fecha(t.situacion.ventana.inicio)}). Es momento de revisar las compras.</span>
          <button type="button" onClick={() => navigate(`/home/que-comprar?temporada=${t.id}`)} className="inline-flex items-center gap-1.5 rounded-control bg-amber-600 px-3 py-1.5 font-medium text-white"><ShoppingCart className="h-4 w-4" aria-hidden /> Qué comprar</button>
        </div>
      ))}

      {lista === null && <p className="py-10 text-center text-sm text-gray-500" role="status">Cargando…</p>}

      {propuestas.length > 0 && (
        <section aria-labelledby="t-propuestas">
          <h2 id="t-propuestas" className="font-semibold">Encontradas en sus ventas <span className="font-normal text-gray-500">({propuestas.length})</span></h2>
          <p className="text-sm text-gray-600">Revíselas: confírmelas tal cual, ajuste las fechas o descártelas (no se volverán a proponer).</p>
          <ul className="mt-3 grid gap-3 md:grid-cols-2">
            {propuestas.map((t) => (
              <li key={t.id} className="rounded-superficie border border-green-200 bg-white p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold leading-snug">{t.nombre}</h3>
                  {t.confianza && <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${CONFIANZA[t.confianza]}`}>Confianza {t.confianza}</span>}
                </div>
                <p className="text-sm text-gray-600">{t.fechas}</p>
                {t.notas && <p className="mt-1 text-sm">{t.notas.charAt(0).toUpperCase() + t.notas.slice(1)}</p>}
                <Patron indices={t.indices} meses={t.meses} />
                <Alcance alcance={t.alcance} />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => estado(t, 'ACTIVA')} className="inline-flex items-center gap-1 rounded-control bg-green-600 px-3 py-1.5 text-sm font-medium text-white"><Check className="h-4 w-4" aria-hidden /> Confirmar</button>
                  <button type="button" onClick={() => setEditor({ t, modo: 'ajustar' })} className="inline-flex items-center gap-1 rounded-control border px-3 py-1.5 text-sm"><Pencil className="h-4 w-4" aria-hidden /> Ajustar</button>
                  <button type="button" onClick={() => estado(t, 'DESCARTADA')} className="inline-flex items-center gap-1 rounded-control px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"><X className="h-4 w-4" aria-hidden /> Descartar</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {lista && (
        <section aria-labelledby="t-activas">
          <h2 id="t-activas" className="font-semibold">Temporadas activas <span className="font-normal text-gray-500">({activas.length})</span></h2>
          <ul className="mt-3 space-y-3">
            {activas.map((t) => (
              <li key={t.id} className="rounded-superficie border bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="flex items-center gap-2 font-semibold"><CalendarRange className="h-4 w-4 text-green-700" aria-hidden /> {t.nombre}</h3>
                    <p className="text-sm text-gray-600">{t.fechas} · avisa {t.anticipacionDias} días antes</p>
                  </div>
                  <Situacion t={t} />
                </div>
                <Alcance alcance={t.alcance} />
                <div className="mt-3 flex flex-wrap gap-1">
                  <button type="button" onClick={() => navigate(`/home/que-comprar?temporada=${t.id}`)} className="inline-flex items-center gap-1 rounded-control border px-3 py-1.5 text-sm font-medium text-green-800 hover:bg-green-50"><ShoppingCart className="h-4 w-4" aria-hidden /> Qué comprar</button>
                  <button type="button" onClick={() => setEditor({ t, modo: 'editar' })} className="rounded p-2 text-gray-500 hover:bg-gray-100" aria-label={`Editar ${t.nombre}`} title="Editar"><Pencil className="h-4 w-4" /></button>
                  <button type="button" onClick={() => estado(t, 'INACTIVA')} className="rounded p-2 text-gray-500 hover:bg-gray-100" aria-label={`Pausar ${t.nombre}`} title="Pausar (deja de avisar)"><Pause className="h-4 w-4" /></button>
                  <button type="button" onClick={() => eliminar(t)} className="rounded p-2 text-gray-500 hover:bg-red-50 hover:text-red-600" aria-label={`Eliminar ${t.nombre}`} title="Eliminar"><Trash2 className="h-4 w-4" /></button>
                </div>
              </li>
            ))}
            {!activas.length && <li className="rounded-superficie border bg-white px-4 py-8 text-center text-sm text-gray-500">Aún no hay temporadas activas. Pulse «Detectar temporadas» para que el sistema las busque en sus ventas, o cree una.</li>}
          </ul>
        </section>
      )}

      {otras.length > 0 && (
        <details className="rounded-superficie border bg-white">
          <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">En pausa y descartadas ({otras.length})</summary>
          <ul className="divide-y border-t">
            {otras.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <span className="min-w-0"><span className="font-medium">{t.nombre}</span> <span className="text-gray-500">· {t.fechas} · {t.estado === 'INACTIVA' ? 'en pausa' : 'descartada'}</span></span>
                <span className="flex gap-1">
                  <button type="button" onClick={() => estado(t, 'ACTIVA')} className="inline-flex items-center gap-1 rounded-control border px-2.5 py-1 text-xs"><Play className="h-3.5 w-3.5" aria-hidden /> Activar</button>
                  <button type="button" onClick={() => eliminar(t)} className="rounded p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600" aria-label={`Eliminar ${t.nombre}`}><Trash2 className="h-4 w-4" /></button>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {editor && <EditorTemporada titulo={editor.modo === 'nueva' ? 'Nueva temporada' : editor.modo === 'ajustar' ? `Ajustar «${editor.t.nombre}»` : `Editar «${editor.t.nombre}»`}
        textoGuardar={editor.modo === 'ajustar' ? 'Guardar y activar' : 'Guardar'}
        inicial={editor.t ? { nombre: editor.t.nombre, inicioMes: editor.t.inicioMes, inicioDia: editor.t.inicioDia, finMes: editor.t.finMes, finDia: editor.t.finDia, anticipacionDias: editor.t.anticipacionDias, notas: editor.t.notas ?? '', alcance: editor.t.alcance } : undefined}
        onCerrar={() => setEditor(null)} onGuardar={guardarEditor} />}
      {compras && <Compras t={compras} onCerrar={() => setCompras(null)} />}
      <UtilWidget pantalla="temporadas" />
    </div>
  )
}
