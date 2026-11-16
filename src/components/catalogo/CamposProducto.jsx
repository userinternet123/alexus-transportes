// ─────────────────────────────────────────────────────────────────────────────
// CAMPOS POR GIRO: datos propios de cada tipo de negocio en la ficha del producto
// (llantas: medida y rin; librería: autor e ISBN; ferretería: material y calibre…).
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react'
import { confirmar } from '../comun/Confirmacion'
import api from '../../services/api'
import { usePermisos } from '../../hooks/usePermisos'
import { showToast } from '../../utils/showToast'
import { invalidarCampos } from '../../hooks/useCamposProducto'
import { cargarArbol } from '../../utils/clasificacion'
import { errorApi } from '../pos/formato'
import Modal from '../comun/Modal'

const TIPOS = { TEXTO: 'Texto', NUMERO: 'Número', LISTA: 'Lista de opciones', SI_NO: 'Sí / No' }

export default function CamposProducto() {
  const { puede } = usePermisos()
  const [campos, setCampos] = useState([])
  const [plantillas, setPlantillas] = useState([])
  const [categorias, setCategorias] = useState([])
  const [editando, setEditando] = useState(null)
  const [aplicando, setAplicando] = useState(null)
  const [contratado, setContratado] = useState(true)

  /** Quitar un campo: antes se avisa cuántos productos tienen ese dato (se borra de ellos). */
  const quitarCampo = async (c) => {
    try {
      const { data } = await api.get(`/campos-producto/${c.id}/uso`)
      const n = data.data.productos
      const ok = await confirmar({ titulo: `Quitar «${c.etiqueta}»`, confirmar: n ? 'Quitar y borrar datos' : 'Quitar', peligro: true,
        mensaje: n ? `${n} ${n === 1 ? 'producto tiene' : 'productos tienen'} este dato y se borrará de ${n === 1 ? 'él' : 'todos'}.\nSi quiere conservarlo, mejor edite el campo y desactívelo.` : 'El campo dejará de aparecer en la ficha de los productos.' })
      if (!ok) return
      const r = await api.delete(`/campos-producto/${c.id}`, { params: n ? { quitarValores: 1 } : {} })
      showToast({ type: 'success', message: r.data.message }); cambiado() // refresca los campos también en el POS y en productos
    } catch (e) { showToast({ type: 'error', message: errorApi(e).mensaje }) }
  }
  /** Quitar todos los campos de una plantilla de giro (los campos propios no se tocan). */
  const quitarPlantilla = async (p) => {
    try {
      const { data } = await api.get(`/campos-producto/plantillas/${p.clave}/uso`)
      const { campos: nc, productos: n } = data.data
      const ok = await confirmar({ titulo: `Quitar la plantilla «${p.nombre}»`, confirmar: n ? 'Quitar y borrar datos' : 'Quitar', peligro: true,
        mensaje: `Se quitarán sus ${nc} campos.${n ? `\n${n} ${n === 1 ? 'producto tiene' : 'productos tienen'} datos de esta plantilla y se borrarán.` : ''}\nLos campos propios que usted creó no se tocan.` })
      if (!ok) return
      const r = await api.delete(`/campos-producto/plantillas/${p.clave}`, { params: n ? { quitarValores: 1 } : {} })
      showToast({ type: 'success', message: r.data.message }); cambiado() // refresca los campos también en el POS y en productos
    } catch (e) { showToast({ type: 'error', message: errorApi(e).mensaje }) }
  }

  const cargar = useCallback(async () => {
    try {
      const c = await api.get('/campos-producto', { params: { todos: 1 } })
      if (c.data.contratado === false) { setContratado(false); return }
      const [p, arbol] = await Promise.all([api.get('/campos-producto/plantillas'), cargarArbol()])
      setCampos(c.data.data); setPlantillas(p.data.data); setCategorias(arbol.categorias.filter((x) => x.activo !== false))
    } catch (e) { showToast({ type: 'error', message: errorApi(e).mensaje }) }
  }, [])
  useEffect(() => { cargar() }, [cargar])
  const cambiado = () => { invalidarCampos(); cargar() }
  const nombreCategorias = (ids) => (ids?.length ? ids.map((id) => categorias.find((c) => c.id === id)?.nombre ?? `#${id}`).join(', ') : 'Todas las categorías')

  const mover = async (i, d) => {
    const a = campos[i], b = campos[i + d]
    if (!a || !b) return
    try {
      await Promise.all([api.put(`/campos-producto/${a.id}`, { orden: b.orden }), api.put(`/campos-producto/${b.id}`, { orden: a.orden })])
      cambiado()
    } catch (e) { showToast({ type: 'error', message: errorApi(e).mensaje }) }
  }

  if (!contratado) {
    return (
      <div className="mx-auto max-w-xl p-6 text-center">
        <p className="text-lg font-semibold">Campos por giro es un paquete adicional</p>
        <p className="mt-2 text-sm text-gray-600">Permite agregar a sus productos datos propios de su negocio (medida y rin, autor e ISBN, talla y color…). Pida a ALEXUS que lo active en su licencia: se aplica solo, sin reinstalar.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4">
      <p className="text-sm text-gray-600">Agregue a la ficha de sus productos los datos que su negocio necesita. Aparecen en el formulario del producto, en el catálogo y en el punto de venta.</p>

      <section>
        <h2 className="mb-2 font-semibold">Plantillas por giro</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {plantillas.map((p) => (
            <div key={p.clave} className="rounded-tarjeta border bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{p.nombre}</p>
                  <p className="text-sm text-gray-500">{p.campos.join(', ')}</p>
                </div>
                {p.aplicada
                  ? <span className="flex shrink-0 items-center gap-1"><span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">Aplicada</span>{puede('giros.configurar') && <button type="button" onClick={() => quitarPlantilla(p)} className="rounded p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600" aria-label={`Quitar la plantilla ${p.nombre}`} title="Quitar plantilla"><Trash2 className="h-4 w-4" /></button>}</span>
                  : puede('giros.configurar') && <button type="button" onClick={() => setAplicando(p)} className="inline-flex shrink-0 items-center gap-1 rounded-control bg-green-600 px-3 py-1.5 text-sm font-medium text-white"><Sparkles className="h-4 w-4" /> Aplicar</button>}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">Campos ({campos.length})</h2>
          {puede('giros.configurar') && <button type="button" onClick={() => setEditando({})} className="inline-flex items-center gap-1 rounded-control border px-3 py-1.5 text-sm"><Plus className="h-4 w-4" /> Campo propio</button>}
        </div>
        <ul className="separador divide-y divide-gray-200 overflow-hidden rounded-tarjeta border bg-white">
          {campos.map((c, i) => (
            <li key={c.id} className={`flex items-center gap-3 px-4 py-3 ${c.activo ? '' : 'opacity-50'}`}>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{c.etiqueta}{c.unidad ? <span className="font-normal text-gray-500"> ({c.unidad})</span> : null}</p>
                <p className="text-xs text-gray-500">
                  {TIPOS[c.tipo]}{c.tipo === 'LISTA' ? `: ${c.opciones.slice(0, 4).join(', ')}${c.opciones.length > 4 ? '…' : ''}` : ''} · {nombreCategorias(c.categoriaIds)}
                  {c.obligatorio && ' · Obligatorio'}{c.buscable && ' · Buscable'}{c.mostrarEnPos && ' · En el POS'}{!c.activo && ' · Inactivo'}
                </p>
              </div>
              {puede('giros.configurar') && (
                <span className="flex shrink-0 items-center">
                  <button type="button" disabled={i === 0} onClick={() => mover(i, -1)} className="rounded p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-30" aria-label={`Subir ${c.etiqueta}`}><ArrowUp className="h-4 w-4" /></button>
                  <button type="button" disabled={i === campos.length - 1} onClick={() => mover(i, 1)} className="rounded p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-30" aria-label={`Bajar ${c.etiqueta}`}><ArrowDown className="h-4 w-4" /></button>
                  <button type="button" onClick={() => setEditando(c)} className="rounded p-1.5 text-gray-500 hover:bg-gray-100" aria-label={`Editar ${c.etiqueta}`}><Pencil className="h-4 w-4" /></button>
                  <button type="button" onClick={() => quitarCampo(c)} className="rounded p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600" aria-label={`Quitar ${c.etiqueta}`} title="Quitar campo"><Trash2 className="h-4 w-4" /></button>
                </span>
              )}
            </li>
          ))}
          {!campos.length && <li className="px-4 py-10 text-center text-sm text-gray-500">Aún no hay campos. Aplique una plantilla de su giro o cree un campo propio.</li>}
        </ul>
      </section>

      {aplicando && <AplicarPlantilla plantilla={aplicando} categorias={categorias} onCerrar={() => setAplicando(null)} onListo={() => { setAplicando(null); cambiado() }} />}
      {editando && <EditorCampo campo={editando} categorias={categorias} onCerrar={() => setEditando(null)} onGuardado={() => { setEditando(null); cambiado() }} />}
    </div>
  )
}

function SelectorCategorias({ categorias, valor, onChange }) {
  const alternar = (id) => onChange(valor.includes(id) ? valor.filter((x) => x !== id) : [...valor, id])
  return (
    <div>
      <p className="text-sm font-medium">¿En qué categorías aplica?</p>
      <p className="mb-2 text-xs text-gray-500">Si no marca ninguna, aplica a todos los productos.</p>
      <div className="flex flex-wrap gap-2">
        {categorias.map((c) => (
          <button key={c.id} type="button" onClick={() => alternar(c.id)} aria-pressed={valor.includes(c.id)}
            className={`rounded-full border px-3 py-1 text-sm ${valor.includes(c.id) ? 'border-green-600 bg-green-50 text-green-800' : 'text-gray-600'}`}>{c.nombre}</button>
        ))}
      </div>
    </div>
  )
}

function AplicarPlantilla({ plantilla, categorias, onCerrar, onListo }) {
  const [categoriaIds, setCategoriaIds] = useState([])
  const [enviando, setEnviando] = useState(false)
  const aplicar = async () => {
    setEnviando(true)
    try {
      const { data } = await api.post(`/campos-producto/plantillas/${plantilla.clave}`, { categoriaIds })
      showToast({ type: 'success', message: data.message })
      onListo()
    } catch (e) { showToast({ type: 'error', message: errorApi(e).mensaje }) } finally { setEnviando(false) }
  }
  return (
    <Modal abierto titulo={`Aplicar plantilla: ${plantilla.nombre}`} onCerrar={onCerrar} ancho="max-w-lg"
      pie={<><button type="button" onClick={onCerrar} className="rounded-control border px-4 py-2">Cancelar</button><button type="button" disabled={enviando} onClick={aplicar} className="rounded-control bg-green-600 px-4 py-2 font-medium text-white disabled:opacity-50">Aplicar</button></>}>
      <p className="mb-4 text-sm text-gray-700">Se agregarán: {plantilla.campos.join(', ')}. Los campos que ya existan se conservan como están.</p>
      <SelectorCategorias categorias={categorias} valor={categoriaIds} onChange={setCategoriaIds} />
    </Modal>
  )
}

function EditorCampo({ campo, categorias, onCerrar, onGuardado }) {
  const nuevo = !campo.id
  const [f, setF] = useState({
    etiqueta: campo.etiqueta ?? '', tipo: campo.tipo ?? 'TEXTO', opciones: (campo.opciones ?? []).join('\n'), unidad: campo.unidad ?? '', ayuda: campo.ayuda ?? '',
    obligatorio: campo.obligatorio ?? false, buscable: campo.buscable ?? false, mostrarEnPos: campo.mostrarEnPos ?? false,
    categoriaIds: campo.categoriaIds ?? [], activo: campo.activo ?? true,
  })
  const [enviando, setEnviando] = useState(false)
  const [quitando, setQuitando] = useState(null) // { productos } mientras se confirma
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const pedirQuitar = async () => {
    try { const { data } = await api.get(`/campos-producto/${campo.id}/uso`); setQuitando(data.data) } catch (e) { showToast({ type: 'error', message: errorApi(e).mensaje }) }
  }
  const quitar = async (borrarValores) => {
    setEnviando(true)
    try {
      const { data } = await api.delete(`/campos-producto/${campo.id}`, { params: borrarValores ? { quitarValores: 1 } : {} })
      showToast({ type: 'success', message: data.message })
      onGuardado()
    } catch (e) { showToast({ type: 'error', message: errorApi(e).mensaje }) } finally { setEnviando(false) }
  }
  const desactivar = async () => {
    setEnviando(true)
    try { await api.put(`/campos-producto/${campo.id}`, { activo: false }); showToast({ type: 'success', message: 'Campo desactivado: los datos se conservan' }); onGuardado() }
    catch (e) { showToast({ type: 'error', message: errorApi(e).mensaje }) } finally { setEnviando(false) }
  }
  const opciones = f.opciones.split('\n').map((o) => o.trim()).filter(Boolean)
  const valido = f.etiqueta.trim() && (f.tipo !== 'LISTA' || opciones.length >= 2)
  const guardar = async () => {
    setEnviando(true)
    const cuerpo = { ...f, opciones: f.tipo === 'LISTA' ? opciones : [], unidad: f.unidad || null, ayuda: f.ayuda || null }
    try {
      const { data } = nuevo ? await api.post('/campos-producto', cuerpo) : await api.put(`/campos-producto/${campo.id}`, cuerpo)
      showToast({ type: 'success', message: data.message })
      onGuardado()
    } catch (e) { showToast({ type: 'error', message: errorApi(e).mensaje }) } finally { setEnviando(false) }
  }
  return (
    <Modal abierto titulo={nuevo ? 'Campo propio' : `Editar «${campo.etiqueta}»`} onCerrar={onCerrar} ancho="max-w-lg"
      pie={<>{!nuevo && <button type="button" onClick={pedirQuitar} disabled={enviando} className="mr-auto rounded-control px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50">Quitar campo</button>}<button type="button" onClick={onCerrar} className="rounded-control border px-4 py-2">Cancelar</button><button type="button" disabled={!valido || enviando} onClick={guardar} className="rounded-control bg-green-600 px-4 py-2 font-medium text-white disabled:opacity-50">Guardar</button></>}>
      {quitando && (
        <div className="mb-4 rounded-tarjeta border border-red-200 bg-red-50 p-3 text-sm text-red-900" role="alert">
          {quitando.productos > 0 ? (
            <>
              <p><b>{quitando.productos} productos</b> tienen «{campo.etiqueta}». Si lo quita, ese dato se borra de todos ellos y no se puede recuperar.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" disabled={enviando} onClick={desactivar} className="rounded-control border border-red-300 bg-white px-3 py-1.5">Mejor desactivarlo (conserva los datos)</button>
                <button type="button" disabled={enviando} onClick={() => quitar(true)} className="rounded-control bg-red-600 px-3 py-1.5 font-medium text-white">Quitar y borrar el dato</button>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p>Ningún producto usa «{campo.etiqueta}». ¿Quitarlo?</p>
              <button type="button" disabled={enviando} onClick={() => quitar(false)} className="rounded-control bg-red-600 px-3 py-1.5 font-medium text-white">Quitar</button>
            </div>
          )}
        </div>
      )}
      <div className="space-y-3 text-sm">
        <label className="block">Nombre del campo<input value={f.etiqueta} onChange={set('etiqueta')} maxLength={60} placeholder="Por ejemplo: Medida" className="mt-1 w-full rounded-control border px-3 py-2" /></label>
        <label className="block">Tipo
          <select value={f.tipo} onChange={set('tipo')} className="mt-1 w-full rounded-control border px-3 py-2">{Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          {!nuevo && <span className="text-xs text-gray-500">Si ya hay productos con este dato, el tipo no se puede cambiar.</span>}
        </label>
        {f.tipo === 'LISTA' && <label className="block">Opciones (una por línea)<textarea value={f.opciones} onChange={set('opciones')} rows={5} className="mt-1 w-full rounded-control border px-3 py-2" /></label>}
        <div className="grid grid-cols-2 gap-3">
          <label className="block">Unidad (opcional)<input value={f.unidad} onChange={set('unidad')} maxLength={20} placeholder="mm, pulg., días" className="mt-1 w-full rounded-control border px-3 py-2" /></label>
          <label className="block">Ejemplo (opcional)<input value={f.ayuda} onChange={set('ayuda')} maxLength={60} placeholder="205/55R16" className="mt-1 w-full rounded-control border px-3 py-2" /></label>
        </div>
        {[['obligatorio', 'Obligatorio en el formulario del producto'], ['buscable', 'Buscable: se encuentra al escribirlo en el buscador y el POS'], ['mostrarEnPos', 'Mostrar junto al nombre en el punto de venta'], ['activo', 'Activo']].map(([k, t]) => (
          <label key={k} className="flex items-center gap-2"><input type="checkbox" checked={f[k]} onChange={set(k)} /> {t}</label>
        ))}
        <SelectorCategorias categorias={categorias} valor={f.categoriaIds} onChange={(categoriaIds) => setF((x) => ({ ...x, categoriaIds }))} />
      </div>
    </Modal>
  )
}
