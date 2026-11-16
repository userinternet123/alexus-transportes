// ─────────────────────────────────────────────────────────────────────────────
// GASTOS FUERA DE CAJA: alquiler, luz, internet, servicios… pagados por transferencia, tarjeta, cheque, débito o con
// efectivo que no sale de la caja. Lo pagado con el efectivo de la caja se registra como egreso en la caja.
// Todo entra al análisis financiero (Salud financiera).
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react'
import { Plus, Receipt } from 'lucide-react'
import api from '../../services/api'
import { usePermisos } from '../../hooks/usePermisos'
import { useValidacion } from '../../hooks/useValidacion'
import { showToast } from '../../utils/showToast'
import { Q, errorApi } from '../pos/formato'
import Campo from '../comun/Campo'
import Modal from '../comun/Modal'
import ResumenErrores from '../forms/ResumenErrores'

const MEDIOS = { TRANSFERENCIA: 'Transferencia', TARJETA: 'Tarjeta', CHEQUE: 'Cheque', DEBITO: 'Débito automático', EFECTIVO_FUERA_CAJA: 'Efectivo (no de la caja)' }
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(new Date())
const CAMPOS = [
  { name: 'fecha', label: 'Fecha', type: 'date', required: true },
  { name: 'categoriaId', label: 'Categoría', type: 'select', required: true },
  { name: 'concepto', label: 'Concepto', type: 'text', required: true, minLength: 3 },
  { name: 'monto', label: 'Monto', type: 'number', required: true, min: 0.01 },
  { name: 'medioPago', label: 'Cómo se pagó', type: 'select', required: true },
]
const ent = 'mt-1 w-full rounded border px-3 py-2'

function RegistrarGasto({ categorias, onNuevaCategoria, onListo, onCerrar }) {
  const [f, setF] = useState({ fecha: hoy(), categoriaId: '', concepto: '', monto: '', medioPago: 'TRANSFERENCIA', documento: '' })
  const [nueva, setNueva] = useState(null) // nombre de categoría nueva mientras se escribe
  const [enviando, setEnviando] = useState(false)
  const v = useValidacion(CAMPOS)
  const set = (k) => (e) => { v.alCambiar(k); setF((x) => ({ ...x, [k]: e.target.value })) }
  const crearCategoria = async () => {
    try { const { data } = await api.post('/gastos/categorias', { nombre: nueva }); await onNuevaCategoria(); v.alCambiar('categoriaId'); setF((x) => ({ ...x, categoriaId: String(data.data.id) })); setNueva(null); showToast({ type: 'success', message: data.message }) }
    catch (e) { showToast({ type: 'error', message: errorApi(e).mensaje }) }
  }
  const guardar = async () => {
    const r = v.validar(f)
    if (!r.ok) return
    setEnviando(true)
    try {
      const { data } = await api.post('/gastos', { fecha: f.fecha, categoriaId: Number(f.categoriaId), concepto: r.valores.concepto, monto: Number(f.monto), medioPago: f.medioPago, documento: f.documento.trim() || null })
      onListo(data.message)
    } catch (e) { v.delServidor(e); showToast({ type: 'error', message: errorApi(e).mensaje }) } finally { setEnviando(false) }
  }
  return (
    <Modal abierto titulo="Registrar gasto" onCerrar={onCerrar} ancho="max-w-lg"
      pie={<><button type="button" onClick={onCerrar} className="rounded-lg border px-3 py-2">Cancelar</button><button type="button" disabled={enviando} onClick={guardar} className="rounded-lg bg-green-700 px-4 py-2 text-white disabled:opacity-50">{enviando ? 'Guardando…' : 'Registrar'}</button></>}>
      <ResumenErrores lista={v.lista} />
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <Campo etiqueta="Fecha" id="fecha" requerido error={v.error('fecha')}><input type="date" max={hoy()} value={f.fecha} onChange={set('fecha')} className={ent} /></Campo>
        <Campo etiqueta="Monto (Q)" id="monto" requerido error={v.error('monto')}><input type="number" min="0" step="0.01" value={f.monto} onChange={set('monto')} className={`${ent} text-right`} /></Campo>
        <Campo etiqueta="Categoría" id="categoriaId" requerido error={v.error('categoriaId')} className="sm:col-span-2">
          <select value={f.categoriaId} onChange={(e) => { if (e.target.value === 'nueva') { setNueva(''); return } set('categoriaId')(e) }} className={ent}>
            <option value="">Elija…</option>{categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}<option value="nueva">+ Nueva categoría…</option>
          </select>
        </Campo>
        {nueva !== null && <div className="flex gap-2 sm:col-span-2"><input autoFocus value={nueva} onChange={(e) => setNueva(e.target.value)} maxLength={60} placeholder="Nombre de la categoría" aria-label="Nombre de la categoría nueva" className="min-w-0 flex-1 rounded border px-3 py-2" /><button type="button" disabled={nueva.trim().length < 3} onClick={crearCategoria} className="rounded border px-3 py-2 disabled:opacity-50">Crear</button><button type="button" onClick={() => setNueva(null)} className="px-2 text-gray-500">Cancelar</button></div>}
        <Campo etiqueta="Concepto" id="concepto" requerido error={v.error('concepto')} className="sm:col-span-2"><input value={f.concepto} onChange={set('concepto')} maxLength={200} placeholder="Ej. Alquiler del local, noviembre" className={ent} /></Campo>
        <Campo etiqueta="Cómo se pagó" id="medioPago" requerido error={v.error('medioPago')}><select value={f.medioPago} onChange={set('medioPago')} className={ent}>{Object.entries(MEDIOS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></Campo>
        <Campo etiqueta="Factura o referencia" id="documento"><input value={f.documento} onChange={(e) => setF((x) => ({ ...x, documento: e.target.value }))} maxLength={60} placeholder="Opcional" className={ent} /></Campo>
      </div>
      <p className="mt-3 text-xs text-gray-500">Lo pagado con el efectivo de la caja regístrelo como egreso en «Apertura y cuadre de caja», para que el cuadre cuadre.</p>
    </Modal>
  )
}

function Anular({ gasto, onListo, onCerrar }) {
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const anular = async () => {
    setEnviando(true)
    try { const { data } = await api.put(`/gastos/${gasto.id}/anular`, { motivo }); onListo(data.message) } catch (e) { showToast({ type: 'error', message: errorApi(e).mensaje }) } finally { setEnviando(false) }
  }
  return (
    <Modal abierto titulo={`Anular gasto de ${Q(gasto.monto)}`} onCerrar={onCerrar} ancho="max-w-md"
      pie={<><button type="button" onClick={onCerrar} className="rounded-lg border px-3 py-2">Cancelar</button><button type="button" disabled={enviando || motivo.trim().length < 10} onClick={anular} className="rounded-lg bg-red-600 px-4 py-2 text-white disabled:opacity-50">Anular</button></>}>
      <p className="text-sm text-gray-600">{gasto.concepto} · {gasto.fecha}</p>
      <label className="mt-3 block text-sm">Motivo <span className="text-gray-500">(al menos 10 caracteres)</span><textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} maxLength={300} className={ent} /></label>
    </Modal>
  )
}

export default function Gastos() {
  const { puede } = usePermisos()
  const [mes, setMes] = useState(hoy().slice(0, 7))
  const [categoriaId, setCategoriaId] = useState('')
  const [anulados, setAnulados] = useState(false)
  const [datos, setDatos] = useState(null)
  const [categorias, setCategorias] = useState([])
  const [registrando, setRegistrando] = useState(false)
  const [anulando, setAnulando] = useState(null)
  const cargarCategorias = useCallback(() => api.get('/gastos/categorias').then(({ data }) => setCategorias(data.data)).catch(() => {}), [])
  const cargar = useCallback(() => api.get('/gastos', { params: { mes, categoriaId: categoriaId || undefined, incluirAnulados: anulados || undefined } }).then(({ data }) => setDatos(data.data)).catch((e) => showToast({ type: 'error', message: errorApi(e).mensaje })), [mes, categoriaId, anulados])
  useEffect(() => { cargarCategorias() }, [cargarCategorias])
  useEffect(() => { cargar() }, [cargar])
  const listo = (mensaje) => { showToast({ type: 'success', message: mensaje }); setRegistrando(false); setAnulando(null); cargar() }
  const max = Math.max(1, ...(datos?.porCategoria ?? []).map((c) => c.monto))
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <p className="rounded-control bg-amber-50 px-4 py-2.5 text-sm text-amber-900">Aquí van los gastos pagados <b>fuera de la caja</b> (alquiler, luz, internet, servicios…). Lo pagado con el efectivo de la caja se registra como egreso en «Apertura y cuadre de caja».</p>
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label>Mes<input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="mt-1 block rounded border px-2 py-1.5" /></label>
        <label>Categoría<select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} className="mt-1 block rounded border px-2 py-1.5"><option value="">Todas</option>{categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label>
        <label className="flex items-center gap-2 pb-2"><input type="checkbox" checked={anulados} onChange={(e) => setAnulados(e.target.checked)} className="accent-green-600" /> Ver anulados</label>
        {puede('gastos.registrar') && <button type="button" onClick={() => setRegistrando(true)} className="ml-auto inline-flex items-center gap-1.5 rounded-control bg-green-600 px-4 py-2 font-medium text-white"><Plus className="h-4 w-4" aria-hidden /> Registrar gasto</button>}
      </div>
      {datos && <>
        <section className="grid gap-3 md:grid-cols-[14rem_1fr]">
          <div className="rounded-superficie border bg-white p-4"><p className="text-sm text-gray-500">Total del mes</p><p className="cifra mt-1 text-3xl font-semibold" aria-label="Total del mes">{Q(datos.total)}</p></div>
          <ul className="space-y-1.5 rounded-superficie border bg-white p-4 text-sm" aria-label="Por categoría">
            {datos.porCategoria.map((c) => <li key={c.categoria}><div className="flex justify-between gap-2"><span>{c.categoria}</span><span className="cifra">{Q(c.monto)}</span></div><div className="mt-0.5 h-1.5 rounded-full bg-gray-100"><div className="h-1.5 rounded-full bg-amber-500" style={{ width: `${(c.monto / max) * 100}%` }} /></div></li>)}
            {!datos.porCategoria.length && <li className="text-gray-500">Sin gastos en este mes.</li>}
          </ul>
        </section>
        <ul className="divide-y rounded-superficie border bg-white">
          {datos.gastos.map((g) => (
            <li key={g.id} className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm ${g.estado === 'ANULADO' ? 'text-gray-400' : ''}`}>
              <Receipt className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
              <span className="min-w-0 flex-1 basis-60"><span className={`block font-medium ${g.estado === 'ANULADO' ? 'line-through' : ''}`}>{g.concepto}</span>
                <span className="text-xs text-gray-500">{g.fecha} · {g.categoria} · {MEDIOS[g.medioPago]}{g.documento ? ` · ${g.documento}` : ''}{g.estado === 'ANULADO' ? ` · ANULADO: ${g.motivoAnulacion}` : ''}</span></span>
              <span className="cifra font-semibold">{Q(g.monto)}</span>
              {g.estado === 'REGISTRADO' && puede('gastos.anular') && <button type="button" onClick={() => setAnulando(g)} className="rounded px-2 py-1 text-red-700 hover:bg-red-50">Anular</button>}
            </li>
          ))}
          {!datos.gastos.length && <li className="px-4 py-8 text-center text-sm text-gray-500">No hay gastos registrados en este mes.</li>}
        </ul>
      </>}
      {registrando && <RegistrarGasto categorias={categorias} onNuevaCategoria={cargarCategorias} onListo={listo} onCerrar={() => setRegistrando(false)} />}
      {anulando && <Anular gasto={anulando} onListo={listo} onCerrar={() => setAnulando(null)} />}
    </div>
  )
}
