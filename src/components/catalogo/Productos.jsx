// ─────────────────────────────────────────────────────────────────────────────
// PRODUCTOS en tarjetas (foto, nombre, marca, precio, existencia) o en lista.
// Tocar una tarjeta abre la hoja de edición con la foto del producto.
// ─────────────────────────────────────────────────────────────────────────────
import { confirmar } from '../comun/Confirmacion'
import { useCallback, useEffect, useState } from 'react'
import { Camera, ImagePlus, LayoutGrid, List, Plus, Search } from 'lucide-react'
import api from '../../services/api'
import { usePermisos } from '../../hooks/usePermisos'
import { useValidacion } from '../../hooks/useValidacion'
import ResumenErrores from '../forms/ResumenErrores'
import { urlArchivo } from '../../hooks/useMarca'
import { showToast } from '../../utils/showToast'
import { subirArchivo, subirImagen } from '../../utils/imagen'
import { Q, errorApi } from '../pos/formato'
import { ChipsGiro, camposPara, useCamposProducto } from '../../hooks/useCamposProducto'
import { UbicacionesEditor } from '../comun/UbicacionProducto'
import EtiquetaCodigo from './EtiquetaCodigo'
import { cargarArbol, opcionesSubgrupo } from '../../utils/clasificacion'
import Hoja, { Fila, Grupo } from '../comun/Hoja'

/** Datos que se piden al guardar un producto. */
const CAMPOS_PRODUCTO = [
  { name: 'sku', label: 'SKU', type: 'text', required: true },
  { name: 'nombre', label: 'Nombre', type: 'text', required: true, minLength: 2 },
  { name: 'precioVenta', label: 'Precio de venta', type: 'number', required: true, min: 0.01 },
  { name: 'subgrupoId', label: 'Sub-agrupación', type: 'select', required: true },
  { name: 'presentacionId', label: 'Presentación', type: 'select', required: true },
  { name: 'stockMinimo', label: 'Existencia mínima', type: 'number', min: 0 },
]

const POR_PAGINA = 48
const fotoDe = (p) => (p.imagenId ? urlArchivo(`/archivos/publico/${p.imagenId}`) : null)
const iniciales = (t = '') => t.split(' ').filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase()

function Existencia({ p }) {
  if (!p.manejaInventario) return <span className="text-xs text-gray-500">Servicio</span>
  const n = Number(p.existencia ?? 0)
  if (n <= 0) return <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">Agotado</span>
  if (n <= Number(p.stockMinimo ?? 0)) return <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">Quedan {n}</span>
  return <span className="text-xs text-gray-600">{n.toLocaleString('es-GT')} en existencia</span>
}

function Foto({ p, clase }) {
  const src = fotoDe(p)
  return src
    ? <img src={src} alt="" loading="lazy" className={`${clase} object-cover`} />
    : <span className={`${clase} flex items-center justify-center bg-green-50 text-2xl font-semibold text-green-700`} aria-hidden>{iniciales(p.nombre)}</span>
}

export default function Productos() {
  const campos = useCamposProducto() // datos del giro en las tarjetas
  const { puede } = usePermisos()
  const [vista, setVista] = useState(() => localStorage.getItem('spvi_vista_productos') ?? 'tarjetas')
  const [q, setQ] = useState('')
  const [estado, setEstado] = useState('true')
  const [lista, setLista] = useState([])
  const [total, setTotal] = useState(0)
  const [pagina, setPagina] = useState(1)
  const [cargando, setCargando] = useState(false)
  const [editando, setEditando] = useState(null)

  const cargar = useCallback(async (pag = 1, texto = q) => {
    setCargando(true)
    try {
      const { data } = await api.get('/productos', { params: { q: texto || undefined, page: pag, limit: POR_PAGINA, activo: estado } })
      setLista((l) => (pag === 1 ? data.data : [...l, ...data.data]))
      setTotal(data.meta.total)
      setPagina(pag)
    } catch (e) {
      showToast({ type: 'error', message: errorApi(e).mensaje })
    } finally { setCargando(false) }
  }, [q, estado])

  useEffect(() => { cargar(1) }, [estado]) // eslint-disable-line react-hooks/exhaustive-deps
  // Búsqueda mientras escribe (con pausa de 350 ms)
  useEffect(() => { const t = setTimeout(() => cargar(1, q), 350); return () => clearTimeout(t) }, [q]) // eslint-disable-line react-hooks/exhaustive-deps

  const cambiarVista = (v) => { localStorage.setItem('spvi_vista_productos', v); setVista(v) }

  return (
    <div className="mx-auto max-w-7xl p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, SKU o código de barras" aria-label="Buscar productos"
            className="w-full rounded-control border bg-white py-2 pl-9 pr-3 text-[15px]" />
        </div>
        <div className="flex rounded-control bg-gray-200 p-0.5 text-sm" role="radiogroup" aria-label="Estado">
          {[['true', 'Activos'], ['false', 'Inactivos'], ['todos', 'Todos']].map(([v, t]) => (
            <button key={v} type="button" role="radio" aria-checked={estado === v} onClick={() => setEstado(v)} className={`rounded-[6px] px-3 py-1 ${estado === v ? 'bg-white font-medium shadow-sm' : 'text-gray-600'}`}>{t}</button>
          ))}
        </div>
        <div className="flex rounded-control bg-gray-200 p-0.5" role="radiogroup" aria-label="Vista">
          <button type="button" role="radio" aria-checked={vista === 'tarjetas'} onClick={() => cambiarVista('tarjetas')} className={`rounded-[6px] p-1.5 ${vista === 'tarjetas' ? 'bg-white shadow-sm' : 'text-gray-500'}`} aria-label="Tarjetas"><LayoutGrid className="h-4 w-4" /></button>
          <button type="button" role="radio" aria-checked={vista === 'lista'} onClick={() => cambiarVista('lista')} className={`rounded-[6px] p-1.5 ${vista === 'lista' ? 'bg-white shadow-sm' : 'text-gray-500'}`} aria-label="Lista"><List className="h-4 w-4" /></button>
        </div>
        {puede('productos.crear') && (
          <button type="button" onClick={() => setEditando({})} className="inline-flex items-center gap-1 rounded-control bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"><Plus className="h-4 w-4" /> Nuevo producto</button>
        )}
      </div>
      <p className="mt-3 text-sm text-gray-500">{total.toLocaleString('es-GT')} productos</p>

      {vista === 'tarjetas' ? (
        <ul className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {lista.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => setEditando(p)} className={`mac-elevar group flex h-full w-full flex-col overflow-hidden rounded-tarjeta border bg-white text-left hover:border-green-600 ${p.activo ? '' : 'opacity-60'}`}>
                <Foto p={p} clase="aspect-square w-full" />
                <span className="flex flex-1 flex-col gap-1 p-3">
                  <span className="line-clamp-2 text-[15px] font-medium leading-snug">{p.nombre}</span>
                  <span className="truncate text-xs text-gray-500">{[p.marca?.nombre, p.presentacion?.nombre].filter(Boolean).join(', ')}</span>
                  <ChipsGiro atributos={p.atributos} campos={campos} />
                  <span className="mt-auto pt-1">
                    <span className="cifra block text-lg font-semibold">{Q(p.precioVenta)}</span>
                    <Existencia p={p} />
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="separador mt-2 divide-y divide-gray-200 overflow-hidden rounded-tarjeta border bg-white">
          {lista.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => setEditando(p)} className={`flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 ${p.activo ? '' : 'opacity-60'}`}>
                <Foto p={p} clase="h-12 w-12 shrink-0 rounded-control text-sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium">{p.nombre}</span>
                  <span className="block truncate text-xs text-gray-500">{p.sku}{p.marca?.nombre ? `, ${p.marca.nombre}` : ''}</span>
                </span>
                <Existencia p={p} />
                <span className="cifra w-24 text-right font-semibold">{Q(p.precioVenta)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {!lista.length && !cargando && <p className="py-16 text-center text-gray-500">No hay productos que coincidan. Pruebe con otra palabra o el código de barras.</p>}
      {lista.length < total && (
        <div className="mt-4 text-center">
          <button type="button" disabled={cargando} onClick={() => cargar(pagina + 1)} className="rounded-control border bg-white px-4 py-2 text-sm disabled:opacity-50">{cargando ? 'Cargando…' : `Ver más (${total - lista.length})`}</button>
        </div>
      )}

      {editando && <EditorProducto producto={editando} onCerrar={() => setEditando(null)} onGuardado={() => { setEditando(null); cargar(1) }} />}
    </div>
  )
}

function EditorProducto({ producto, onCerrar, onGuardado }) {
  const { puede } = usePermisos()
  const nuevo = !producto.id
  const editable = nuevo ? puede('productos.crear') : puede('productos.editar')
  const [f, setF] = useState({
    nombre: producto.nombre ?? '', descripcion: producto.descripcion ?? '', sku: producto.sku ?? '', codigoBarra: producto.codigoBarra ?? '',
    precioVenta: producto.precioVenta != null ? Number(producto.precioVenta).toFixed(2) : '', exentoIva: producto.exentoIva ?? false,
    subgrupoId: producto.subgrupo?.id ?? '', marcaId: producto.marca?.id ?? '', presentacionId: producto.presentacion?.id ?? '',
    stockMinimo: producto.stockMinimo != null ? Number(producto.stockMinimo) : 0, manejaInventario: producto.manejaInventario ?? true,
    activo: producto.activo ?? true, imagenId: producto.imagenId ?? null,
    atributos: producto.atributos ?? {},
  })
  const todosCampos = useCamposProducto()
  const [generando, setGenerando] = useState(false)
  const [etiqueta, setEtiqueta] = useState(false)
  /** Código de barras propio (EAN-13 interno) para productos que no traen uno. */
  const generarCodigo = async () => {
    if (f.codigoBarra.trim() && !(await confirmar({ titulo: 'Reemplazar código de barras', mensaje: 'Este producto ya tiene código de barras. Las etiquetas ya impresas con el código anterior dejarán de servir.', confirmar: 'Reemplazar', peligro: true }))) return
    setGenerando(true)
    try {
      const { data } = await api.post('/productos/codigo-barra/generar')
      setF((x) => ({ ...x, codigoBarra: data.data.codigo }))
      showToast({ type: 'success', message: 'Código generado. Guarde el producto para conservarlo.' })
    } catch (e) { showToast({ type: 'error', message: errorApi(e).mensaje }) } finally { setGenerando(false) }
  }
  const [vista, setVista] = useState(fotoDe(producto))
  const [cat, setCat] = useState({ subgrupos: [], marcas: [], presentaciones: [] })
  const [rutas, setRutas] = useState([]) // "Categoría › Grupo › Sub › …"
  useEffect(() => { cargarArbol().then((a) => setRutas(opcionesSubgrupo(a))).catch(() => {}) }, [])
  const [subiendo, setSubiendo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const v = useValidacion(CAMPOS_PRODUCTO)
  const set = (k) => (e) => { v.alCambiar(k); setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })) }

  useEffect(() => {
    const lista = (ruta) => api.get(ruta, { params: { limit: 0 } }).then((r) => r.data.data).catch(() => [])
    Promise.all([lista('/catalogos/subgrupos'), lista('/catalogos/marcas'), lista('/catalogos/presentaciones')])
      .then(([subgrupos, marcas, presentaciones]) => setCat({ subgrupos, marcas, presentaciones }))
  }, [])

  const elegirFoto = async (archivo) => {
    if (!archivo) return
    setSubiendo(true)
    try {
      const { id, vista: reducida } = await subirImagen(archivo, { maxLado: 900, calidad: 0.8 })
      setF((x) => ({ ...x, imagenId: id }))
      setVista(reducida) // la vista previa usa la foto reducida: la original no se vuelve a cargar
    } catch (e) {
      showToast({ type: 'error', message: errorApi(e).mensaje })
    } finally { setSubiendo(false) }
  }

  const guardar = async () => {
    // Se revisa TODO antes de enviar: lo que falta o está mal se marca en rojo y el cursor va al primero
    const r = v.validar(f)
    if (!r.ok) { showToast({ type: 'error', message: r.lista.length === 1 ? `Revise: ${r.lista[0].label}` : `Revise los ${r.lista.length} datos marcados en rojo` }); return }
    setGuardando(true)
    const datos = {
      ...r.valores, precioVenta: Number(f.precioVenta), stockMinimo: Number(f.stockMinimo || 0),
      subgrupoId: Number(f.subgrupoId), presentacionId: Number(f.presentacionId), marcaId: f.marcaId ? Number(f.marcaId) : null,
      codigoBarra: f.codigoBarra || null, descripcion: f.descripcion || null,
    }
    try {
      if (nuevo) await api.post('/productos', datos)
      else await api.put(`/productos/${producto.id}`, datos)
      showToast({ type: 'success', message: nuevo ? 'Producto creado' : 'Cambios guardados' })
      onGuardado()
    } catch (e) {
      v.delServidor(e) // lo que el servidor rechazó queda marcado bajo su campo
      showToast({ type: 'error', message: errorApi(e).mensaje })
    } finally { setGuardando(false) }
  }

  return (
    <Hoja abierta titulo={nuevo ? 'Nuevo producto' : producto.nombre} onCerrar={onCerrar}
      pie={editable && <><button type="button" onClick={onCerrar} className="rounded-control border px-4 py-2">Cancelar</button><button type="button" disabled={guardando || subiendo} onClick={guardar} className="rounded-control bg-green-600 px-4 py-2 font-medium text-white disabled:opacity-50">{guardando ? 'Guardando…' : 'Guardar'}</button></>}>
      <fieldset disabled={!editable}>
        <ResumenErrores lista={v.lista} />
        <div className="mb-5 flex flex-col items-center gap-2">
          <div className="h-40 w-40 overflow-hidden rounded-superficie border bg-white">
            {vista ? <img src={vista} alt="Foto del producto" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-4xl font-semibold text-green-700">{iniciales(f.nombre) || '?'}</span>}
          </div>
          {editable && (subiendo ? <span className="text-sm text-gray-500">Procesando la foto…</span> : (
            <div className="flex gap-4 text-sm font-medium text-green-700">
              <label className="inline-flex cursor-pointer items-center gap-1">
                <Camera className="h-4 w-4" /> Tomar foto
                <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => { elegirFoto(e.target.files?.[0]); e.target.value = '' }} />
              </label>
              <label className="inline-flex cursor-pointer items-center gap-1">
                <ImagePlus className="h-4 w-4" /> {vista ? 'Cambiar desde galería' : 'Elegir de la galería'}
                <input type="file" accept="image/*" className="sr-only" onChange={(e) => { elegirFoto(e.target.files?.[0]); e.target.value = '' }} />
              </label>
            </div>
          ))}
        </div>

        <Grupo titulo="Producto">
          <Fila etiqueta="Nombre" id="nombre" requerido error={v.error('nombre')}><input value={f.nombre} onChange={set('nombre')} placeholder="Requerido" /></Fila>
          <Fila etiqueta="Descripción"><input value={f.descripcion} onChange={set('descripcion')} placeholder="Opcional" /></Fila>
          <Fila etiqueta="SKU" id="sku" requerido error={v.error('sku')}><input value={f.sku} onChange={(e) => { v.alCambiar('sku'); setF((x) => ({ ...x, sku: e.target.value.toUpperCase() })) }} placeholder="Requerido" /></Fila>
          <Fila etiqueta="Código de barras"><input value={f.codigoBarra} onChange={set('codigoBarra')} placeholder="Escanee o escriba" /></Fila>
          <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
            <button type="button" onClick={generarCodigo} disabled={generando} className="rounded-control border px-3 py-1.5 text-sm font-medium text-green-800 hover:bg-green-50 disabled:opacity-50">{generando ? 'Generando…' : 'Generar código'}</button>
            <button type="button" onClick={() => setEtiqueta(true)} disabled={!f.codigoBarra.trim()} className="rounded-control border px-3 py-1.5 text-sm font-medium hover:bg-gray-50 disabled:opacity-40">Imprimir etiqueta</button>
            {!f.codigoBarra.trim() && <span className="text-xs text-gray-500">¿No trae código? Genere uno propio e imprima su etiqueta.</span>}
          </div>
          {etiqueta && <EtiquetaCodigo nombre={f.nombre || 'Producto'} codigo={f.codigoBarra} precio={f.precioVenta !== undefined && String(f.precioVenta).trim() !== '' && Number.isFinite(Number(f.precioVenta)) ? Number(f.precioVenta) : null} onCerrar={() => setEtiqueta(false)} />}
        </Grupo>

        <Grupo titulo="Precio" nota={!nuevo && !puede('productos.precios') ? 'Cambiar el precio requiere permiso de precios.' : 'El precio incluye IVA.'}>
          <Fila etiqueta="Precio de venta" id="precioVenta" requerido error={v.error('precioVenta')}><input type="number" min="0" step="0.01" value={f.precioVenta} onChange={set('precioVenta')} disabled={!nuevo && !puede('productos.precios')} className="cifra" /></Fila>
          <Fila etiqueta="Exento de IVA"><input type="checkbox" checked={f.exentoIva} onChange={set('exentoIva')} className="!w-auto" /></Fila>
        </Grupo>

        <Grupo titulo="Clasificación">
          <Fila etiqueta="Sub-agrupación" id="subgrupoId" requerido error={v.error('subgrupoId')}>
            <select value={f.subgrupoId} onChange={set('subgrupoId')}><option value="">Elegir…</option>{(rutas.length ? rutas : cat.subgrupos.map((s) => ({ id: s.id, ruta: `${s.grupo?.nombre} › ${s.nombre}` }))).map((o) => <option key={o.id} value={o.id}>{o.ruta}</option>)}</select>
          </Fila>
          <Fila etiqueta="Marca">
            <select value={f.marcaId} onChange={set('marcaId')}><option value="">Sin marca</option>{cat.marcas.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}</select>
          </Fila>
          <Fila etiqueta="Presentación" id="presentacionId" requerido error={v.error('presentacionId')}>
            <select value={f.presentacionId} onChange={set('presentacionId')}><option value="">Elegir…</option>{cat.presentaciones.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select>
          </Fila>
        </Grupo>

        {/* Datos del giro: los campos que aplican a la categoría de la sub-agrupación elegida */}
        {(() => {
          if (!todosCampos.length) return null // sin campos (o sin el paquete "Campos por giro")
          const categoriaId = rutas.find((o) => String(o.id) === String(f.subgrupoId))?.categoriaId
            ?? cat.subgrupos.find((x) => String(x.id) === String(f.subgrupoId))?.grupo?.categoriaId
          const aplican = f.subgrupoId ? camposPara(todosCampos, categoriaId) : []
          if (!aplican.length) {
            return (
              <Grupo titulo="Datos del giro">
                <p className="px-4 py-3 text-sm text-gray-500">
                  {f.subgrupoId
                    ? 'Los campos por giro configurados no aplican a la categoría de esta sub-agrupación. Puede cambiar a qué categorías aplican en Productos › Campos por giro.'
                    : 'Elija la sub-agrupación del producto para completar sus datos del giro (medida, rin, autor…).'}
                </p>
              </Grupo>
            )
          }
          const setAtributo = (clave, valor) => setF((x) => ({ ...x, atributos: { ...x.atributos, [clave]: valor } }))
          return (
            <Grupo titulo="Datos del giro" nota="Los marcados con * son obligatorios. Los buscables se encuentran al escribirlos en el buscador y en el punto de venta.">
              {aplican.map((c) => {
                const v = f.atributos[c.clave]
                const etiqueta = `${c.etiqueta}${c.unidad ? ` (${c.unidad})` : ''}${c.obligatorio ? ' *' : ''}`
                return (
                  <Fila key={c.clave} etiqueta={etiqueta}>
                    {c.tipo === 'LISTA' ? (
                      <select value={v ?? ''} onChange={(e) => setAtributo(c.clave, e.target.value)} aria-label={c.etiqueta}>
                        <option value="">Elegir…</option>{c.opciones.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : c.tipo === 'SI_NO' ? (
                      <input type="checkbox" checked={v === true} onChange={(e) => setAtributo(c.clave, e.target.checked)} className="!w-auto" aria-label={c.etiqueta} />
                    ) : (
                      <input type={c.tipo === 'NUMERO' ? 'number' : 'text'} inputMode={c.tipo === 'NUMERO' ? 'decimal' : undefined} step="any"
                        value={v ?? ''} onChange={(e) => setAtributo(c.clave, e.target.value)} placeholder={c.ayuda ?? ''} className={c.tipo === 'NUMERO' ? 'cifra' : ''} aria-label={c.etiqueta} />
                    )}
                  </Fila>
                )
              })}
            </Grupo>
          )
        })()}

        {f.manejaInventario && (
          <Grupo titulo="Ubicación en bodega" nota={nuevo ? 'Guarde el producto para asignarle su ubicación.' : 'Si no elige una propia, el producto hereda la ubicación de su clasificación.'}>
            {!nuevo && <UbicacionesEditor productoId={producto.id} editable={puede('inventario.ubicaciones')} />}
          </Grupo>
        )}

        <Grupo titulo="Inventario">
          <Fila etiqueta="Controla existencia"><input type="checkbox" checked={f.manejaInventario} onChange={set('manejaInventario')} className="!w-auto" /></Fila>
          <Fila etiqueta="Existencia mínima" id="stockMinimo" error={v.error('stockMinimo')}><input type="number" min="0" value={f.stockMinimo} onChange={set('stockMinimo')} className="cifra" /></Fila>
          {!nuevo && <Fila etiqueta="Existencia actual"><span className="cifra">{Number(producto.existencia ?? 0).toLocaleString('es-GT')}</span></Fila>}
        </Grupo>

        {!nuevo && (
          <Grupo>
            <Fila etiqueta="Activo"><input type="checkbox" checked={f.activo} onChange={set('activo')} className="!w-auto" /></Fila>
          </Grupo>
        )}
      </fieldset>
    </Hoja>
  )
}
