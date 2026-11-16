// ─────────────────────────────────────────────────────────────────────────────
// CLASIFICACIÓN DE PRODUCTOS — niveles ilimitados
// Categoría › Grupo › Sub-agrupación › Sub-agrupación › …
// Los descuentos de una sub-agrupación se heredan a todas las que tiene dentro.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronRight, FolderTree, MoveRight, Pencil, Plus, Power } from 'lucide-react'
import api from '../../services/api'
import { usePermisos } from '../../hooks/usePermisos'
import { showToast } from '../../utils/showToast'
import { cargarArbol, descendientes, hijosDe, invalidarArbol } from '../../utils/clasificacion'
import { errorApi } from '../pos/formato'
import Modal from '../comun/Modal'

export default function Clasificacion() {
  const { puede } = usePermisos()
  const [arbol, setArbol] = useState(null)
  const [abiertos, setAbiertos] = useState(() => new Set())
  const [dialogo, setDialogo] = useState(null) // { tipo, ... }
  const [verInactivos, setVerInactivos] = useState(false)

  const recargar = useCallback(() => { invalidarArbol(); return cargarArbol().then(setArbol).catch((e) => showToast({ type: 'error', message: errorApi(e).mensaje })) }, [])
  useEffect(() => { recargar() }, [recargar])

  const alternar = (clave) => setAbiertos((a) => { const n = new Set(a); n.has(clave) ? n.delete(clave) : n.add(clave); return n })
  const visible = (x) => verInactivos || x.activo !== false

  // Productos acumulados por nodo (incluye los de sus descendientes)
  const totales = useMemo(() => {
    const t = new Map()
    if (!arbol) return t
    const suma = (s) => {
      if (t.has(s.id)) return t.get(s.id)
      const total = s.productos + arbol.subgrupos.filter((h) => h.padreId === s.id).reduce((a, h) => a + suma(h), 0)
      t.set(s.id, total)
      return total
    }
    arbol.subgrupos.forEach(suma)
    return t
  }, [arbol])

  if (!arbol) return <p className="p-6 text-gray-500">Cargando…</p>

  const Nodo = ({ s, nivel }) => {
    const hijos = hijosDe(arbol.subgrupos, s.grupoId, s.id).filter(visible)
    const clave = `s${s.id}`
    const abierto = abiertos.has(clave)
    return (
      <li>
        <div className={`group flex items-center gap-1 rounded-control py-1.5 pr-2 hover:bg-gray-100 ${s.activo === false ? 'opacity-50' : ''}`} style={{ paddingLeft: 8 + nivel * 20 }}>
          <button type="button" onClick={() => alternar(clave)} disabled={!hijos.length} className="rounded p-0.5 text-gray-400 disabled:invisible" aria-label={abierto ? 'Contraer' : 'Expandir'} aria-expanded={abierto}>
            <ChevronRight className={`h-4 w-4 transition-transform duration-200 ${abierto ? 'rotate-90' : ''}`} />
          </button>
          <span className="min-w-0 flex-1 truncate text-[15px]">{s.nombre}</span>
          <span className="cifra rounded-full bg-gray-100 px-2 text-xs text-gray-600" title="Productos (incluye sus sub-agrupaciones)">{totales.get(s.id)}</span>
          <span className="flex opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            {puede('catalogos.crear') && <Accion titulo="Agregar dentro" onClick={() => setDialogo({ tipo: 'nuevoSub', grupoId: s.grupoId, padreId: s.id, madre: s.nombre })}><Plus className="h-4 w-4" /></Accion>}
            {puede('catalogos.editar') && <>
              <Accion titulo="Renombrar" onClick={() => setDialogo({ tipo: 'renombrar', s })}><Pencil className="h-4 w-4" /></Accion>
              <Accion titulo="Mover" onClick={() => setDialogo({ tipo: 'mover', s })}><MoveRight className="h-4 w-4" /></Accion>
              <Accion titulo={s.activo === false ? 'Activar' : 'Desactivar'} onClick={() => guardarSub(s.id, { activo: s.activo === false })}><Power className="h-4 w-4" /></Accion>
            </>}
          </span>
        </div>
        {abierto && hijos.length > 0 && <ul>{hijos.map((h) => <Nodo key={h.id} s={h} nivel={nivel + 1} />)}</ul>}
      </li>
    )
  }

  const guardarSub = async (id, cambios) => {
    try {
      const { data } = await api.put(`/clasificacion/subgrupos/${id}`, cambios)
      showToast({ type: 'success', message: data.message })
      setDialogo(null)
      recargar()
    } catch (e) { showToast({ type: 'error', message: errorApi(e).mensaje }) }
  }
  const crear = async (ruta, cuerpo, abrir) => {
    try {
      await api.post(ruta, cuerpo)
      showToast({ type: 'success', message: 'Creado' })
      setDialogo(null)
      if (abrir) setAbiertos((a) => new Set(a).add(abrir))
      recargar()
    } catch (e) { showToast({ type: 'error', message: errorApi(e).mensaje }) }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-xl text-sm text-gray-600">Organice sus productos en todos los niveles que necesite. Los descuentos de una sub-agrupación aplican también a las que tiene dentro.</p>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm text-gray-600"><input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} /> Ver inactivas</label>
          {puede('catalogos.crear') && <button type="button" onClick={() => setDialogo({ tipo: 'nuevaCategoria' })} className="inline-flex items-center gap-1 rounded-control bg-green-600 px-3 py-2 text-sm font-medium text-white"><Plus className="h-4 w-4" /> Nueva categoría</button>}
        </div>
      </div>

      {arbol.categorias.filter(visible).map((c) => (
        <section key={c.id} className="rounded-superficie border bg-white p-3">
          <div className="flex items-center gap-2 px-2 pb-2">
            <FolderTree className="h-5 w-5 text-green-700" aria-hidden />
            <h2 className="flex-1 text-[17px] font-semibold">{c.nombre}</h2>
            {puede('catalogos.crear') && <button type="button" onClick={() => setDialogo({ tipo: 'nuevoGrupo', categoriaId: c.id, categoria: c.nombre })} className="text-sm font-medium text-green-700 hover:underline">+ Grupo</button>}
          </div>
          <ul className="separador divide-y divide-gray-100">
            {arbol.grupos.filter((g) => g.categoriaId === c.id && visible(g)).map((g) => {
              const clave = `g${g.id}`
              const subs = hijosDe(arbol.subgrupos, g.id, null).filter(visible)
              return (
                <li key={g.id} className="py-1">
                  <div className="flex items-center gap-1 rounded-control py-1.5 pl-1 pr-2 hover:bg-gray-50">
                    <button type="button" onClick={() => alternar(clave)} className="rounded p-0.5 text-gray-400" aria-label="Expandir grupo" aria-expanded={abiertos.has(clave)}>
                      <ChevronRight className={`h-4 w-4 transition-transform duration-200 ${abiertos.has(clave) ? 'rotate-90' : ''}`} />
                    </button>
                    <span className="flex-1 font-medium">{g.nombre}</span>
                    <span className="text-xs text-gray-500">{subs.length} sub-agrupaciones</span>
                    {puede('catalogos.crear') && <Accion titulo="Agregar sub-agrupación" onClick={() => setDialogo({ tipo: 'nuevoSub', grupoId: g.id, padreId: null, madre: g.nombre })}><Plus className="h-4 w-4" /></Accion>}
                  </div>
                  {abiertos.has(clave) && <ul className="mac-pagina">{subs.map((s) => <Nodo key={s.id} s={s} nivel={1} />)}</ul>}
                </li>
              )
            })}
          </ul>
        </section>
      ))}

      {/* Diálogos */}
      {dialogo?.tipo === 'nuevaCategoria' && <PedirNombre titulo="Nueva categoría" onCerrar={() => setDialogo(null)} onGuardar={(nombre) => crear('/catalogos/categorias', { nombre })} />}
      {dialogo?.tipo === 'nuevoGrupo' && <PedirNombre titulo={`Nuevo grupo en ${dialogo.categoria}`} onCerrar={() => setDialogo(null)} onGuardar={(nombre) => crear('/catalogos/grupos', { nombre, categoriaId: dialogo.categoriaId })} />}
      {dialogo?.tipo === 'nuevoSub' && <PedirNombre titulo={`Nueva sub-agrupación dentro de ${dialogo.madre}`} onCerrar={() => setDialogo(null)}
        onGuardar={(nombre) => crear('/clasificacion/subgrupos', { grupoId: dialogo.grupoId, padreId: dialogo.padreId, nombre }, dialogo.padreId ? `s${dialogo.padreId}` : `g${dialogo.grupoId}`)} />}
      {dialogo?.tipo === 'renombrar' && <PedirNombre titulo="Renombrar" inicial={dialogo.s.nombre} onCerrar={() => setDialogo(null)} onGuardar={(nombre) => guardarSub(dialogo.s.id, { nombre })} />}
      {dialogo?.tipo === 'mover' && <Mover arbol={arbol} s={dialogo.s} onCerrar={() => setDialogo(null)} onGuardar={(padreId) => guardarSub(dialogo.s.id, { padreId })} />}
    </div>
  )
}

function Accion({ titulo, onClick, children }) {
  return <button type="button" onClick={onClick} title={titulo} aria-label={titulo} className="rounded p-1.5 text-gray-500 hover:bg-gray-200 hover:text-gray-800">{children}</button>
}

function PedirNombre({ titulo, inicial = '', onCerrar, onGuardar }) {
  const [nombre, setNombre] = useState(inicial)
  const ok = nombre.trim().length > 0 && nombre.trim() !== inicial
  return (
    <Modal abierto titulo={titulo} onCerrar={onCerrar} ancho="max-w-md"
      pie={<><button type="button" onClick={onCerrar} className="rounded-control border px-4 py-2">Cancelar</button><button type="button" disabled={!ok} onClick={() => onGuardar(nombre.trim())} className="rounded-control bg-green-600 px-4 py-2 font-medium text-white disabled:opacity-50">Guardar</button></>}>
      <input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ok && onGuardar(nombre.trim())} maxLength={120} className="w-full rounded-control border px-3 py-2" aria-label="Nombre" />
    </Modal>
  )
}

function Mover({ arbol, s, onCerrar, onGuardar }) {
  const prohibidos = descendientes(arbol.subgrupos, s.id) // no dentro de sí misma ni de sus hijas
  const opciones = arbol.subgrupos.filter((x) => x.grupoId === s.grupoId && !prohibidos.has(x.id))
  const ruta = (x) => { const r = []; for (let n = x; n; n = arbol.subgrupos.find((y) => y.id === n.padreId)) r.unshift(n.nombre); return r.join(' › ') }
  const [destino, setDestino] = useState(s.padreId ?? '')
  return (
    <Modal abierto titulo={`Mover «${s.nombre}»`} onCerrar={onCerrar} ancho="max-w-md"
      pie={<><button type="button" onClick={onCerrar} className="rounded-control border px-4 py-2">Cancelar</button><button type="button" onClick={() => onGuardar(destino === '' ? null : Number(destino))} className="rounded-control bg-green-600 px-4 py-2 font-medium text-white">Mover</button></>}>
      <p className="mb-2 text-sm text-gray-600">Se mueve con todo lo que tiene dentro, dentro del mismo grupo.</p>
      <select value={destino} onChange={(e) => setDestino(e.target.value)} className="w-full rounded-control border px-3 py-2" aria-label="Destino">
        <option value="">Primer nivel del grupo</option>
        {opciones.map((x) => <option key={x.id} value={x.id}>{ruta(x)}</option>)}
      </select>
    </Modal>
  )
}
