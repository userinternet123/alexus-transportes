// ─────────────────────────────────────────────────────────────────────────────
// CONTEO FÍSICO
// Lista de conteos → abrir uno (encargado) → contar escaneando (bodega, también
// desde el celular) → revisar faltantes y sobrantes → aprobar (ajusta el kardex).
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, CheckCircle2, ClipboardList, Plus, ScanBarcode, Search, Trash2, XCircle } from 'lucide-react'
import api from '../../services/api'
import { usePermisos } from '../../hooks/usePermisos'
import { showToast } from '../../utils/showToast'
import { Q, errorApi } from '../pos/formato'
import Modal from '../comun/Modal'
import BuscadorProducto from '../comun/BuscadorProducto'
import { cargarArbol, opcionesSubgrupo } from '../../utils/clasificacion'

const ESTADO = { ABIERTO: ['En curso', 'bg-sky-50 text-sky-700'], APROBADO: ['Aprobado', 'bg-green-50 text-green-700'], CANCELADO: ['Cancelado', 'bg-gray-100 text-gray-600'] }
const num = (n) => Number(n ?? 0).toLocaleString('es-GT', { maximumFractionDigits: 3 })

export default function ConteoFisico() {
  const [abierto, setAbierto] = useState(null) // id del conteo en pantalla
  return abierto ? <Conteo id={abierto} onVolver={() => setAbierto(null)} /> : <ListaConteos onAbrir={setAbierto} />
}

function ListaConteos({ onAbrir }) {
  const { puede } = usePermisos()
  const [lista, setLista] = useState([])
  const [nuevo, setNuevo] = useState(null)
  const [bodegas, setBodegas] = useState([])

  const cargar = () => api.get('/inventario/conteos').then(({ data }) => setLista(data.data)).catch((e) => showToast({ type: 'error', message: errorApi(e).mensaje }))
  useEffect(() => { cargar() }, [])

  const [alcances, setAlcances] = useState({ categorias: [], grupos: [], subgrupos: [] })
  const abrirNuevo = async () => {
    const { data } = await api.get('/catalogos/bodegas', { params: { limit: 0 } }).catch(() => ({ data: { data: [] } }))
    setBodegas(data.data.filter((b) => b.activo !== false))
    setNuevo({ bodegaId: data.data[0]?.id ?? '', nombre: `Conteo ${new Date().toLocaleDateString('es-GT')}`, ciego: true, alcance: '' })
    cargarArbol().then((a) => {
      const cat = new Map(a.categorias.map((c) => [c.id, c.nombre]))
      setAlcances({
        categorias: a.categorias.filter((c) => c.activo !== false),
        grupos: a.grupos.filter((g) => g.activo !== false).map((g) => ({ id: g.id, ruta: `${cat.get(g.categoriaId) ?? ''} › ${g.nombre}` })).sort((x, y) => x.ruta.localeCompare(y.ruta, 'es')),
        subgrupos: opcionesSubgrupo(a),
      })
    }).catch(() => {})
  }
  const crear = async () => {
    try {
      const [tipo, idAlcance] = nuevo.alcance ? nuevo.alcance.split(':') : []
      const { data } = await api.post('/inventario/conteos', {
        bodegaId: Number(nuevo.bodegaId), nombre: nuevo.nombre, ciego: nuevo.ciego,
        ...(tipo ? { alcance: { tipo, id: Number(idAlcance) } } : {}),
      })
      showToast({ type: 'success', message: data.message })
      setNuevo(null)
      onAbrir(data.data.id)
    } catch (e) { showToast({ type: 'error', message: errorApi(e).mensaje }) }
  }

  return (
    <div className="mx-auto max-w-4xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-600">Cuente la mercadería por sesiones. Los productos que no se cuenten no se modifican.</p>
        {puede('inventario.ajustar') && <button type="button" onClick={abrirNuevo} className="inline-flex items-center gap-1 rounded-control bg-green-600 px-3 py-2 text-sm font-medium text-white"><Plus className="h-4 w-4" /> Nuevo conteo</button>}
      </div>
      <ul className="separador mt-4 divide-y divide-gray-200 overflow-hidden rounded-tarjeta border bg-white">
        {lista.map((c) => {
          const [etiqueta, color] = ESTADO[c.estado]
          return (
            <li key={c.id}>
              <button type="button" onClick={() => onAbrir(c.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50">
                <ClipboardList className="h-5 w-5 shrink-0 text-gray-400" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{c.nombre}</span>
                  <span className="text-sm text-gray-500">{c.bodega} · {c.alcanceNombre ?? 'Toda la bodega'} · {c.productosContados} productos contados{c.ciego ? ' · ciego' : ''}</span>
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>{etiqueta}</span>
              </button>
            </li>
          )
        })}
        {!lista.length && <li className="px-4 py-10 text-center text-sm text-gray-500">Todavía no hay conteos.{puede('inventario.ajustar') ? ' Abra el primero con "Nuevo conteo".' : ''}</li>}
      </ul>

      <Modal abierto={Boolean(nuevo)} titulo="Nuevo conteo físico" onCerrar={() => setNuevo(null)} ancho="max-w-md"
        pie={<><button type="button" onClick={() => setNuevo(null)} className="rounded-control border px-4 py-2">Cancelar</button><button type="button" onClick={crear} disabled={!nuevo?.bodegaId || (nuevo?.nombre ?? '').trim().length < 3} className="rounded-control bg-green-600 px-4 py-2 font-medium text-white disabled:opacity-50">Abrir conteo</button></>}>
        {nuevo && (
          <div className="space-y-3 text-sm">
            <label className="block">Nombre<input value={nuevo.nombre} onChange={(e) => setNuevo((n) => ({ ...n, nombre: e.target.value }))} className="mt-1 w-full rounded-control border px-3 py-2" /></label>
            <label className="block">Bodega
              <select value={nuevo.bodegaId} onChange={(e) => setNuevo((n) => ({ ...n, bodegaId: e.target.value }))} className="mt-1 w-full rounded-control border px-3 py-2">
                {bodegas.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
              </select>
            </label>
            <label className="block">Qué se cuenta
              <select value={nuevo.alcance} onChange={(e) => setNuevo((n) => ({ ...n, alcance: e.target.value }))} className="mt-1 w-full rounded-control border px-3 py-2">
                <option value="">Toda la bodega</option>
                {alcances.categorias.length > 0 && <optgroup label="Categoría completa">{alcances.categorias.map((c) => <option key={c.id} value={`CATEGORIA:${c.id}`}>{c.nombre}</option>)}</optgroup>}
                {alcances.grupos.length > 0 && <optgroup label="Grupo">{alcances.grupos.map((g) => <option key={g.id} value={`GRUPO:${g.id}`}>{g.ruta}</option>)}</optgroup>}
                {alcances.subgrupos.length > 0 && <optgroup label="Sub-agrupación (incluye las que tiene dentro)">{alcances.subgrupos.map((x) => <option key={x.id} value={`SUBGRUPO:${x.id}`}>{x.ruta}</option>)}</optgroup>}
              </select>
              <span className="text-xs text-gray-500">Contar por partes (un pasillo, una categoría) es más fácil. Solo se podrán contar productos de esa clasificación.</span>
            </label>
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={nuevo.ciego} onChange={(e) => setNuevo((n) => ({ ...n, ciego: e.target.checked }))} className="mt-0.5" />
              <span>Conteo ciego (recomendado): quien cuenta no ve la existencia del sistema, para no influir en lo que cuenta.</span>
            </label>
          </div>
        )}
      </Modal>
    </div>
  )
}

function Conteo({ id, onVolver }) {
  const { puede } = usePermisos()
  const [c, setC] = useState(null)
  const [producto, setProducto] = useState(null)
  const [cantidad, setCantidad] = useState('')
  const [modo, setModo] = useState('sumar')
  const [vista, setVista] = useState('contados') // contados | diferencias
  const [pestana, setPestana] = useState('contar') // contar | lista
  const [aprobando, setAprobando] = useState(false)
  const [cancelando, setCancelando] = useState(false)
  const cantidadRef = useRef(null)

  const cargar = useCallback(() => api.get(`/inventario/conteos/${id}`).then(({ data }) => setC(data.data)).catch((e) => showToast({ type: 'error', message: errorApi(e).mensaje })), [id])
  useEffect(() => { cargar() }, [cargar])

  const elegir = (p) => {
    setProducto(p)
    setCantidad('')
    setTimeout(() => cantidadRef.current?.focus(), 0)
  }
  const guardar = async (e) => {
    e?.preventDefault()
    if (!producto || cantidad === '') return
    try {
      const { data } = await api.post(`/inventario/conteos/${id}/lineas`, { productoId: producto.id, cantidad: Number(cantidad), modo })
      showToast({ type: 'success', message: data.message })
      setProducto(null)
      setCantidad('')
      cargar()
    } catch (err) { showToast({ type: 'error', message: errorApi(err).mensaje }) }
  }
  const quitar = async (productoId) => {
    try { await api.delete(`/inventario/conteos/${id}/lineas/${productoId}`); cargar() } catch (err) { showToast({ type: 'error', message: errorApi(err).mensaje }) }
  }

  if (!c) return <p className="p-6 text-gray-500">Cargando…</p>
  const enCurso = c.estado === 'ABIERTO'
  const lineas = vista === 'diferencias' ? c.lineas.filter((l) => Number(l.diferencia) !== 0) : c.lineas
  const valorFaltante = c.lineas.reduce((a, l) => a + Math.min(0, Number(l.valorCosto ?? 0)), 0)
  const valorSobrante = c.lineas.reduce((a, l) => a + Math.max(0, Number(l.valorCosto ?? 0)), 0)
  const veCostos = puede('finanzas.costos') && c.verSistema

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onVolver} className="text-sm text-green-700 hover:underline">‹ Conteos</button>
        <h2 className="flex-1 text-xl font-semibold">{c.nombre}</h2>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO[c.estado][1]}`}>{ESTADO[c.estado][0]}</span>
      </div>
      <p className="-mt-2 text-sm text-gray-600">{c.alcanceNombre ?? 'Toda la bodega'}{c.ciego ? ' · conteo ciego' : ''}</p>
      <div className="flex rounded-control bg-gray-200 p-0.5 text-sm" role="tablist">
        {[['contar', 'Contar'], ['lista', puede('inventario.cuadre') ? 'Lista y cuadre' : 'Lista de productos']].map(([v, t]) => (
          <button key={v} type="button" role="tab" aria-selected={pestana === v} onClick={() => setPestana(v)} className={`flex-1 rounded-[6px] py-1.5 ${pestana === v ? 'bg-white font-medium shadow-sm' : 'text-gray-600'}`}>{t}</button>
        ))}
      </div>

      {pestana === 'contar' && enCurso && puede('inventario.contar') && (
        <form onSubmit={guardar} className="rounded-superficie border bg-white p-4">
          <p className="mb-2 flex items-center gap-2 text-sm font-medium"><ScanBarcode className="h-4 w-4 text-green-700" aria-hidden /> Escanee o busque el producto y escriba cuántos hay</p>
          {!producto ? (
            <BuscadorProducto onSelect={elegir} placeholder="Escanee el código de barras o escriba el nombre" />
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[17px] font-semibold">{producto.nombre}</p>
                <button type="button" onClick={() => setProducto(null)} className="text-sm text-gray-500 underline">Cambiar producto</button>
              </div>
              <div className="flex rounded-control bg-gray-200 p-0.5 text-sm" role="radiogroup" aria-label="Cómo registrar">
                {[['sumar', 'Sumar a lo contado'], ['reemplazar', 'Corregir total']].map(([v, t]) => (
                  <button key={v} type="button" role="radio" aria-checked={modo === v} onClick={() => setModo(v)} className={`rounded-[6px] px-3 py-1 ${modo === v ? 'bg-white font-medium shadow-sm' : 'text-gray-600'}`}>{t}</button>
                ))}
              </div>
              <label className="text-sm">Cantidad
                <input ref={cantidadRef} type="number" inputMode="decimal" min="0" step="any" value={cantidad} onChange={(e) => setCantidad(e.target.value)} className="cifra mt-1 block w-28 rounded-control border px-3 py-2 text-right text-lg" />
              </label>
              <button disabled={cantidad === ''} className="h-11 rounded-control bg-green-600 px-5 font-medium text-white disabled:opacity-50">Guardar</button>
            </div>
          )}
          <p className="mt-2 text-xs text-gray-500">"Sumar" agrega a lo ya contado (por ejemplo, otro estante del mismo producto). "Corregir total" reemplaza lo contado.</p>
        </form>
      )}

      {pestana === 'contar' && c.verSistema && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[['Contados', c.resumen.contados], ['Exactos', c.resumen.exactos], ['Faltantes', c.resumen.faltantes], ['Sobrantes', c.resumen.sobrantes]].map(([t, v]) => (
            <div key={t} className="rounded-tarjeta border bg-white p-3"><p className="text-sm text-gray-500">{t}</p><p className="cifra text-2xl font-semibold">{v}</p></div>
          ))}
          {veCostos && (
            <div className="col-span-2 rounded-tarjeta border bg-white p-3 sm:col-span-4">
              <p className="text-sm text-gray-500">Impacto a costo promedio</p>
              <p className="cifra text-lg"><span className="text-red-600">{Q(valorFaltante)}</span> faltante, <span className="text-green-700">{Q(valorSobrante)}</span> sobrante. Neto <strong>{Q(valorFaltante + valorSobrante)}</strong></p>
            </div>
          )}
        </div>
      )}

      {pestana === 'contar' && (
      <section className="rounded-superficie border bg-white">
        <div className="separador flex items-center justify-between gap-2 border-b px-4 py-2">
          <p className="font-medium">{c.lineas.length} productos contados</p>
          {c.verSistema && (
            <div className="flex rounded-control bg-gray-200 p-0.5 text-sm" role="radiogroup" aria-label="Mostrar">
              {[['contados', 'Todos'], ['diferencias', 'Solo diferencias']].map(([v, t]) => (
                <button key={v} type="button" role="radio" aria-checked={vista === v} onClick={() => setVista(v)} className={`rounded-[6px] px-3 py-1 ${vista === v ? 'bg-white font-medium shadow-sm' : 'text-gray-600'}`}>{t}</button>
              ))}
            </div>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-[13px] text-gray-500">
              <tr><th className="px-4 py-2">Producto</th><th className="px-4 text-right">Contado</th>{c.verSistema && <><th className="px-4 text-right">Sistema</th><th className="px-4 text-right">Diferencia</th></>}{veCostos && <th className="px-4 text-right">Valor</th>}<th /></tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {lineas.map((l) => {
                const dif = Number(l.diferencia ?? 0)
                return (
                  <tr key={l.productoId}>
                    <td className="px-4 py-2"><p className="font-medium">{l.producto.nombre}</p><p className="text-xs text-gray-500">{l.producto.sku}</p></td>
                    <td className="cifra px-4 text-right text-[15px] font-semibold">{num(l.cantidadFisica)}</td>
                    {c.verSistema && <><td className="cifra px-4 text-right text-gray-600">{num(l.sistemaAlContar)}</td><td className={`cifra px-4 text-right font-medium ${dif < 0 ? 'text-red-600' : dif > 0 ? 'text-green-700' : 'text-gray-400'}`}>{dif > 0 ? '+' : ''}{num(dif)}</td></>}
                    {veCostos && <td className="cifra px-4 text-right">{Q(l.valorCosto)}</td>}
                    <td className="px-2 text-right">{enCurso && <button type="button" onClick={() => quitar(l.productoId)} aria-label={`Quitar ${l.producto.nombre}`} className="rounded p-1.5 text-gray-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>}</td>
                  </tr>
                )
              })}
              {!lineas.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-500">{vista === 'diferencias' ? 'Sin diferencias: todo coincide.' : 'Aún no se ha contado ningún producto.'}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      )}
      {pestana === 'lista' && <ListaAlcance id={id} enCurso={enCurso} onContar={(p) => { elegir(p); setPestana('contar') }} onCambio={cargar} />}

      {enCurso && puede('inventario.ajustar') && (
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={() => setCancelando(true)} className="inline-flex items-center gap-1 rounded-control border px-4 py-2 text-sm"><XCircle className="h-4 w-4" /> Cancelar conteo</button>
          <button type="button" disabled={!c.lineas.length} onClick={() => setAprobando(true)} className="inline-flex items-center gap-1 rounded-control bg-green-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"><CheckCircle2 className="h-4 w-4" /> Aprobar y ajustar inventario</button>
        </div>
      )}
      {aprobando && <Confirmar titulo="Aprobar conteo" texto={`Se ajustará la existencia de ${c.resumen.faltantes + c.resumen.sobrantes} productos con diferencia. Los ${c.resumen.exactos} exactos quedan igual y los productos no contados no se modifican. Esta acción no se puede deshacer.`}
        boton="Aprobar" onCerrar={() => setAprobando(false)} onConfirmar={async (obs) => { const { data } = await api.post(`/inventario/conteos/${id}/aprobar`, { observacion: obs || undefined }); showToast({ type: 'success', message: data.message }); setAprobando(false); cargar() }} />}
      {cancelando && <Confirmar titulo="Cancelar conteo" texto="El inventario no se modificará. Indique el motivo." obligatorio boton="Cancelar conteo" peligro
        onCerrar={() => setCancelando(false)} onConfirmar={async (motivo) => { const { data } = await api.post(`/inventario/conteos/${id}/cancelar`, { motivo }); showToast({ type: 'success', message: data.message }); setCancelando(false); cargar() }} />}
    </div>
  )
}

function Confirmar({ titulo, texto, boton, obligatorio, peligro, onCerrar, onConfirmar }) {
  const [nota, setNota] = useState('')
  const [enviando, setEnviando] = useState(false)
  const confirmar = async () => {
    setEnviando(true)
    try { await onConfirmar(nota.trim()) } catch (e) { showToast({ type: 'error', message: errorApi(e).mensaje }) } finally { setEnviando(false) }
  }
  return (
    <Modal abierto titulo={titulo} onCerrar={onCerrar} ancho="max-w-md"
      pie={<><button type="button" onClick={onCerrar} className="rounded-control border px-4 py-2">Volver</button><button type="button" disabled={enviando || (obligatorio && nota.trim().length < 5)} onClick={confirmar} className={`rounded-control px-4 py-2 font-medium text-white disabled:opacity-50 ${peligro ? 'bg-red-600' : 'bg-green-600'}`}>{enviando ? 'Procesando…' : boton}</button></>}>
      <p className="text-sm text-gray-700">{texto}</p>
      <textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={3} placeholder={obligatorio ? 'Motivo (obligatorio)' : 'Observación (opcional)'} className="mt-3 w-full rounded-control border px-3 py-2 text-sm" />
    </Modal>
  )
}

/**
 * Productos del alcance: qué falta por contar. Con el permiso de cuadre (gerencia) se ve
 * la existencia del sistema y se marca "Cuadra" con un toque, o se escribe otra cantidad.
 */
function ListaAlcance({ id, enCurso, onContar, onCambio }) {
  const { puede } = usePermisos()
  const cuadre = puede('inventario.cuadre') && enCurso
  const [estado, setEstado] = useState('pendientes')
  const [q, setQ] = useState('')
  const [datos, setDatos] = useState(null)
  const [otra, setOtra] = useState(null) // { productoId, valor }

  const cargar = useCallback(() => {
    api.get(`/inventario/conteos/${id}/lista`, { params: { estado, q: q.trim() || undefined } })
      .then(({ data }) => setDatos(data)).catch((e) => showToast({ type: 'error', message: errorApi(e).mensaje }))
  }, [id, estado, q])
  useEffect(() => { const t = setTimeout(cargar, 250); return () => clearTimeout(t) }, [cargar])

  const marcarCuadra = async (productoId) => {
    try { await api.post(`/inventario/conteos/${id}/cuadra`, { productoId }); cargar(); onCambio() }
    catch (e) { showToast({ type: 'error', message: errorApi(e).mensaje }) }
  }
  const guardarOtra = async () => {
    try {
      await api.post(`/inventario/conteos/${id}/lineas`, { productoId: otra.productoId, cantidad: Number(otra.valor), modo: 'reemplazar' })
      setOtra(null); cargar(); onCambio()
    } catch (e) { showToast({ type: 'error', message: errorApi(e).mensaje }) }
  }

  if (!datos) return <p className="p-4 text-gray-500">Cargando…</p>
  const { resumen, verSistema } = datos
  return (
    <section className="rounded-superficie border bg-white">
      <div className="space-y-3 border-b p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm"><b className="cifra">{resumen.contados}</b> de <b className="cifra">{resumen.total}</b> productos contados · <span className="text-amber-700">{resumen.pendientes} pendientes</span></p>
          <div className="flex rounded-control bg-gray-200 p-0.5 text-sm" role="radiogroup" aria-label="Mostrar">
            {[['pendientes', 'Pendientes'], ['contados', 'Contados'], ['todos', 'Todos']].map(([v, t]) => (
              <button key={v} type="button" role="radio" aria-checked={estado === v} onClick={() => setEstado(v)} className={`rounded-[6px] px-3 py-1 ${estado === v ? 'bg-white font-medium shadow-sm' : 'text-gray-600'}`}>{t}</button>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 rounded-control border px-3 py-2"><Search className="h-4 w-4 text-gray-400" aria-hidden /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en la lista" className="min-w-0 flex-1 outline-none" aria-label="Buscar en la lista" /></label>
        {cuadre && <p className="text-xs text-gray-500">Marque <b>Cuadra</b> si lo que hay en el estante coincide con el sistema; si no, escriba la cantidad real.</p>}
      </div>
      <ul className="divide-y divide-gray-100">
        {datos.data.map((f) => {
          const dif = Number(f.diferencia ?? 0)
          return (
            <li key={f.productoId} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <span className="min-w-0 flex-1"><span className="block truncate font-medium">{f.nombre}</span><span className="text-xs text-gray-500">{f.sku}</span></span>
              {verSistema && <span className="cifra text-right text-sm text-gray-600" title="Existencia en el sistema">Sistema {Number(f.sistema).toLocaleString('es-GT')}</span>}
              {f.contado != null
                ? <span className={`cifra rounded-full px-2 py-0.5 text-sm font-medium ${verSistema && dif !== 0 ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>Contado {Number(f.contado).toLocaleString('es-GT')}{verSistema && dif !== 0 ? ` (${dif > 0 ? '+' : ''}${dif})` : ''}</span>
                : <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">Pendiente</span>}
              {enCurso && (cuadre ? (
                otra?.productoId === f.productoId ? (
                  <span className="flex items-center gap-1">
                    <input autoFocus type="number" min="0" step="any" inputMode="decimal" value={otra.valor} onChange={(e) => setOtra({ ...otra, valor: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && otra.valor !== '' && guardarOtra()} className="cifra w-20 rounded-control border px-2 py-1 text-right" aria-label={`Cantidad real de ${f.nombre}`} />
                    <button type="button" disabled={otra.valor === ''} onClick={guardarOtra} className="rounded-control bg-green-600 px-2 py-1 text-sm text-white disabled:opacity-50">Guardar</button>
                    <button type="button" onClick={() => setOtra(null)} className="px-1 text-sm text-gray-500">×</button>
                  </span>
                ) : (
                  <span className="flex gap-1">
                    <button type="button" onClick={() => marcarCuadra(f.productoId)} className="inline-flex items-center gap-1 rounded-control bg-green-600 px-2.5 py-1 text-sm font-medium text-white"><Check className="h-4 w-4" /> Cuadra</button>
                    <button type="button" onClick={() => setOtra({ productoId: f.productoId, valor: '' })} className="rounded-control border px-2.5 py-1 text-sm">Otra cantidad</button>
                  </span>
                )
              ) : puede('inventario.contar') && (
                <button type="button" onClick={() => onContar({ id: f.productoId, nombre: f.nombre, sku: f.sku })} className="rounded-control border px-2.5 py-1 text-sm">Contar</button>
              ))}
            </li>
          )
        })}
        {!datos.data.length && <li className="px-4 py-10 text-center text-sm text-gray-500">{estado === 'pendientes' ? 'No hay pendientes: todo el alcance está contado.' : 'Sin productos en esta vista.'}</li>}
      </ul>
    </section>
  )
}
