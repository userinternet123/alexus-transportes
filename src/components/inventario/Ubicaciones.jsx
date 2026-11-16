// ─────────────────────────────────────────────────────────────────────────────
// UBICACIONES DE BODEGA: Pasillo › Estante › División › Posición (niveles libres).
// Código completo = códigos de cada nivel unidos: P2E2D2P15.
// Una clasificación asignada a una ubicación la heredan sus productos (salvo los que
// tienen ubicación propia, que se asigna en la ficha del producto).
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronRight, FolderTree, MapPin, Package, Pencil, Plus, Power, Tags } from 'lucide-react'
import api from '../../services/api'
import { usePermisos } from '../../hooks/usePermisos'
import { showToast } from '../../utils/showToast'
import { cargarArbol, opcionesSubgrupo } from '../../utils/clasificacion'
import { errorApi } from '../pos/formato'
import Modal from '../comun/Modal'

export default function Ubicaciones() {
  const { puede } = usePermisos()
  const editar = puede('inventario.ubicaciones')
  const [bodegas, setBodegas] = useState([])
  const [bodegaId, setBodegaId] = useState('')
  const [lista, setLista] = useState([])
  const [abiertos, setAbiertos] = useState(() => new Set())
  const [clasif, setClasif] = useState({ nombres: new Map(), opciones: [] })
  const [dialogo, setDialogo] = useState(null)

  useEffect(() => {
    api.get('/catalogos/bodegas', { params: { limit: 0 } }).then(({ data }) => {
      const activas = data.data.filter((b) => b.activo !== false)
      setBodegas(activas)
      setBodegaId((b) => b || String(activas[0]?.id ?? ''))
    }).catch(() => {})
    cargarArbol().then((a) => {
      const cat = new Map(a.categorias.map((c) => [c.id, c.nombre]))
      const opciones = [
        ...a.categorias.map((c) => ({ v: `CATEGORIA:${c.id}`, t: c.nombre, g: 'Categoría' })),
        ...a.grupos.map((g) => ({ v: `GRUPO:${g.id}`, t: `${cat.get(g.categoriaId) ?? ''} › ${g.nombre}`, g: 'Grupo' })),
        ...opcionesSubgrupo(a).map((o) => ({ v: `SUBGRUPO:${o.id}`, t: o.ruta, g: 'Sub-agrupación' })),
      ]
      setClasif({ nombres: new Map(opciones.map((o) => [o.v, o.t])), opciones })
    }).catch(() => {})
  }, [])

  const cargar = useCallback(() => {
    if (!bodegaId) return
    api.get('/ubicaciones', { params: { bodegaId } }).then(({ data }) => setLista(data.data)).catch((e) => showToast({ type: 'error', message: errorApi(e).mensaje }))
  }, [bodegaId])
  useEffect(() => { cargar() }, [cargar])

  const hijos = useMemo(() => {
    const m = new Map()
    for (const u of lista) { const k = u.padreId ?? 0; if (!m.has(k)) m.set(k, []); m.get(k).push(u) }
    return m
  }, [lista])
  const alternar = (id) => setAbiertos((a) => { const n = new Set(a); n.has(id) ? n.delete(id) : n.add(id); return n })

  const guardar = async (accion) => {
    try { const { data } = await accion(); showToast({ type: 'success', message: data.message }); setDialogo(null); cargar() }
    catch (e) { showToast({ type: 'error', message: errorApi(e).mensaje }) }
  }

  const Nodo = ({ u, nivel }) => {
    const subs = hijos.get(u.id) ?? []
    const abierto = abiertos.has(u.id)
    return (
      <li>
        <div className={`group flex flex-wrap items-center gap-2 rounded-control py-1.5 pr-2 hover:bg-gray-50 ${u.activo ? '' : 'opacity-50'}`} style={{ paddingLeft: 6 + nivel * 20 }}>
          <button type="button" onClick={() => alternar(u.id)} disabled={!subs.length} className="rounded p-0.5 text-gray-400 disabled:invisible" aria-label={abierto ? 'Contraer' : 'Expandir'} aria-expanded={abierto}>
            <ChevronRight className={`h-4 w-4 transition-transform duration-200 ${abierto ? 'rotate-90' : ''}`} />
          </button>
          <span className="cifra font-semibold tracking-wide">{u.codigoCompleto}</span>
          {u.nombre && <span className="text-sm text-gray-500">{u.nombre}</span>}
          {u.productos > 0 && <span className="rounded-full bg-gray-100 px-2 text-xs text-gray-600" title="Productos con esta ubicación propia">{u.productos} prod.</span>}
          {u.clasificaciones.map((c) => <span key={`${c.tipo}:${c.refId}`} className="rounded-full bg-sky-50 px-2 text-xs text-sky-800" title="Clasificación que hereda esta ubicación">{clasif.nombres.get(`${c.tipo}:${c.refId}`) ?? c.tipo}</span>)}
          <span className="ml-auto flex opacity-60 group-hover:opacity-100">
            <Accion titulo="Ver productos" onClick={() => setDialogo({ tipo: 'productos', u })}><Package className="h-4 w-4" /></Accion>
            {editar && <>
              <Accion titulo="Agregar dentro" onClick={() => setDialogo({ tipo: 'nueva', padre: u })}><Plus className="h-4 w-4" /></Accion>
              <Accion titulo="Asignar clasificación" onClick={() => setDialogo({ tipo: 'clasificacion', u })}><Tags className="h-4 w-4" /></Accion>
              <Accion titulo="Editar" onClick={() => setDialogo({ tipo: 'editar', u })}><Pencil className="h-4 w-4" /></Accion>
              <Accion titulo={u.activo ? 'Desactivar' : 'Activar'} onClick={() => guardar(() => api.put(`/ubicaciones/${u.id}`, { activo: !u.activo }))}><Power className="h-4 w-4" /></Accion>
            </>}
          </span>
        </div>
        {abierto && subs.length > 0 && <ul>{subs.map((h) => <Nodo key={h.id} u={h} nivel={nivel + 1} />)}</ul>}
      </li>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <p className="text-sm text-gray-600">Ordene la bodega en niveles (pasillo, estante, división, posición). Cada producto muestra su código, por ejemplo <b className="cifra">P2E2D2P15</b>, para encontrarlo rápido. Si asigna una clasificación a una ubicación, sus productos la heredan.</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">Bodega
          <select value={bodegaId} onChange={(e) => setBodegaId(e.target.value)} className="mt-1 block rounded-control border px-3 py-2">{bodegas.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select>
        </label>
        {editar && <button type="button" onClick={() => setDialogo({ tipo: 'nueva', padre: null })} className="ml-auto inline-flex items-center gap-1 rounded-control bg-green-600 px-3 py-2 text-sm font-medium text-white"><Plus className="h-4 w-4" /> Nuevo pasillo o área</button>}
      </div>
      <section className="rounded-superficie border bg-white p-2">
        <ul>{(hijos.get(0) ?? []).map((u) => <Nodo key={u.id} u={u} nivel={0} />)}</ul>
        {!lista.length && <p className="px-4 py-10 text-center text-sm text-gray-500"><FolderTree className="mx-auto mb-2 h-8 w-8 text-gray-300" aria-hidden />Esta bodega aún no tiene ubicaciones.{editar ? ' Empiece por un pasillo (P1, P2…).' : ''}</p>}
      </section>

      {dialogo?.tipo === 'nueva' && <FormUbicacion titulo={dialogo.padre ? `Nueva ubicación dentro de ${dialogo.padre.codigoCompleto}` : 'Nuevo pasillo o área'} prefijo={dialogo.padre?.codigoCompleto ?? ''}
        onCerrar={() => setDialogo(null)} onGuardar={(d) => guardar(async () => { const r = await api.post('/ubicaciones', { ...d, bodegaId: Number(bodegaId), padreId: dialogo.padre?.id ?? null }); if (dialogo.padre) setAbiertos((a) => new Set(a).add(dialogo.padre.id)); return r })} />}
      {dialogo?.tipo === 'editar' && <FormUbicacion titulo={`Editar ${dialogo.u.codigoCompleto}`} prefijo={dialogo.u.codigoCompleto.slice(0, dialogo.u.codigoCompleto.length - dialogo.u.codigo.length)} inicial={dialogo.u}
        aviso="Si cambia el código, también cambian los códigos de todo lo que tiene dentro." onCerrar={() => setDialogo(null)} onGuardar={(d) => guardar(() => api.put(`/ubicaciones/${dialogo.u.id}`, d))} />}
      {dialogo?.tipo === 'clasificacion' && <AsignarClasificacion u={dialogo.u} opciones={clasif.opciones} onCerrar={() => setDialogo(null)}
        onGuardar={(v, ubicacionId) => { const [tipo, refId] = v.split(':'); return guardar(() => api.put('/ubicaciones/clasificacion', { bodegaId: Number(bodegaId), tipo, refId: Number(refId), ubicacionId })) }} />}
      {dialogo?.tipo === 'productos' && <ProductosEn u={dialogo.u} onCerrar={() => setDialogo(null)} />}
    </div>
  )
}

function Accion({ titulo, onClick, children }) {
  return <button type="button" onClick={onClick} title={titulo} aria-label={titulo} className="rounded p-1.5 text-gray-500 hover:bg-gray-200 hover:text-gray-800">{children}</button>
}

function FormUbicacion({ titulo, prefijo, inicial, aviso, onCerrar, onGuardar }) {
  const [codigo, setCodigo] = useState(inicial?.codigo ?? '')
  const [nombre, setNombre] = useState(inicial?.nombre ?? '')
  const limpio = codigo.trim().toUpperCase().replace(/\s+/g, '')
  const valido = /^[A-Z0-9-]{1,10}$/.test(limpio)
  return (
    <Modal abierto titulo={titulo} onCerrar={onCerrar} ancho="max-w-md"
      pie={<><button type="button" onClick={onCerrar} className="rounded-control border px-4 py-2">Cancelar</button><button type="button" disabled={!valido} onClick={() => onGuardar({ codigo: limpio, nombre: nombre.trim() || null })} className="rounded-control bg-green-600 px-4 py-2 font-medium text-white disabled:opacity-50">Guardar</button></>}>
      <div className="space-y-3 text-sm">
        <label className="block">Código de este nivel<input autoFocus value={codigo} onChange={(e) => setCodigo(e.target.value)} maxLength={10} placeholder="P2, E2, D2, P15" className="cifra mt-1 w-full rounded-control border px-3 py-2 uppercase" /></label>
        <p className="text-gray-600">Código completo: <b className="cifra text-lg">{prefijo}{limpio || '…'}</b></p>
        <label className="block">Nombre (opcional)<input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60} placeholder="Pasillo 2, Estante de cables…" className="mt-1 w-full rounded-control border px-3 py-2" /></label>
        {aviso && <p className="text-xs text-amber-700">{aviso}</p>}
      </div>
    </Modal>
  )
}

function AsignarClasificacion({ u, opciones, onCerrar, onGuardar }) {
  const [v, setV] = useState('')
  const grupos = ['Categoría', 'Grupo', 'Sub-agrupación']
  return (
    <Modal abierto titulo={`Clasificación en ${u.codigoCompleto}`} onCerrar={onCerrar} ancho="max-w-lg"
      pie={<><button type="button" onClick={onCerrar} className="rounded-control border px-4 py-2">Cancelar</button><button type="button" disabled={!v} onClick={() => onGuardar(v, u.id)} className="rounded-control bg-green-600 px-4 py-2 font-medium text-white disabled:opacity-50">Asignar</button></>}>
      <p className="mb-3 text-sm text-gray-600">Los productos de esa clasificación mostrarán <b className="cifra">{u.codigoCompleto}</b>, salvo los que tengan una ubicación propia. Si la clasificación ya estaba en otra ubicación, se cambia a esta.</p>
      <select value={v} onChange={(e) => setV(e.target.value)} className="w-full rounded-control border px-3 py-2 text-sm" aria-label="Clasificación">
        <option value="">Elegir…</option>
        {grupos.map((g) => <optgroup key={g} label={g}>{opciones.filter((o) => o.g === g).map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}</optgroup>)}
      </select>
      {u.clasificaciones.length > 0 && (
        <div className="mt-4 text-sm">
          <p className="font-medium">Ya asignadas aquí</p>
          {u.clasificaciones.map((c) => (
            <p key={`${c.tipo}:${c.refId}`} className="flex items-center justify-between py-1">
              <span>{opciones.find((o) => o.v === `${c.tipo}:${c.refId}`)?.t ?? c.tipo}</span>
              <button type="button" onClick={() => onGuardar(`${c.tipo}:${c.refId}`, null)} className="text-red-700 underline">Quitar</button>
            </p>
          ))}
        </div>
      )}
    </Modal>
  )
}

function ProductosEn({ u, onCerrar }) {
  const [lista, setLista] = useState(null)
  useEffect(() => { api.get(`/ubicaciones/${u.id}/productos`).then(({ data }) => setLista(data.data)).catch(() => setLista([])) }, [u.id])
  return (
    <Modal abierto titulo={`Productos en ${u.codigoCompleto}`} onCerrar={onCerrar} ancho="max-w-2xl">
      {!lista ? <p className="text-gray-500">Cargando…</p> : !lista.length ? <p className="py-6 text-center text-sm text-gray-500">No hay productos en esta ubicación ni en lo que tiene dentro.</p> : (
        <ul className="divide-y divide-gray-100 text-sm">
          {lista.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-2">
              <MapPin className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
              <span className="cifra w-28 shrink-0 font-semibold">{p.ubicacion.codigo}</span>
              <span className="min-w-0 flex-1 truncate">{p.nombre} <span className="text-xs text-gray-500">{p.sku}</span></span>
              <span className={`shrink-0 rounded-full px-2 text-xs ${p.ubicacion.origen === 'producto' ? 'bg-green-50 text-green-700' : 'bg-sky-50 text-sky-800'}`}>{p.ubicacion.origen === 'producto' ? 'Propia' : `Hereda de ${p.ubicacion.via}`}</span>
              <span className="cifra w-14 shrink-0 text-right">{Number(p.cantidad).toLocaleString('es-GT')}</span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
