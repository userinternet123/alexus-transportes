// ─────────────────────────────────────────────────────────────────────────────
// ROLES Y PERMISOS
// El CÓDIGO de cada permiso (ej. ventas.crear) es el mismo que va en `tag` del
// sidebar: así se relaciona cada opción del menú con un permiso. La columna
// "En el menú" muestra qué opciones del sidebar controla cada código.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react'
import { Copy, Plus, Save, ShieldCheck } from 'lucide-react'
import api from '../../services/api'
import { usePermisos } from '../../hooks/usePermisos'
import { showToast } from '../../utils/showToast'
import { errorApi } from '../comun/formato'
import { MENU_ITEMS } from '../layout/sidebar/config/sidebarMenu'
import Modal from '../comun/Modal'

/** codigo -> ['Ventas › Vender', …] a partir del menú real */
function mapaMenu() {
  const mapa = {}
  for (const m of MENU_ITEMS.menu) {
    if (typeof m.tag === 'string') (mapa[m.tag] ??= []).push(m.label)
    for (const s of m.submenu ?? []) if (typeof s.tag === 'string') (mapa[s.tag] ??= []).push(`${m.label} › ${s.label}`)
  }
  return mapa
}

export default function RolesPermisos() {
  const { puede } = usePermisos()
  const editable = puede('seguridad.roles.gestionar')
  const [roles, setRoles] = useState([])
  const [permisos, setPermisos] = useState([])
  const [rolId, setRolId] = useState(null)
  const [marcados, setMarcados] = useState(new Set())
  const [original, setOriginal] = useState(new Set())
  const [filtro, setFiltro] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [nuevoRol, setNuevoRol] = useState(null)
  const enMenu = useMemo(mapaMenu, [])

  const cargarRoles = () => api.get('/seguridad/roles').then(({ data }) => setRoles(data.data))
  useEffect(() => {
    cargarRoles()
    api.get('/seguridad/permisos').then(({ data }) => setPermisos(data.data))
  }, [])

  const rol = roles.find((r) => r.id === rolId)
  const elegir = async (id) => {
    setRolId(id)
    const { data } = await api.get(`/seguridad/roles/${id}/permisos`)
    setMarcados(new Set(data.data))
    setOriginal(new Set(data.data))
  }

  const porModulo = useMemo(() => {
    const f = filtro.trim().toLowerCase()
    return permisos
      .filter((p) => !f || p.codigo.includes(f) || p.descripcion.toLowerCase().includes(f) || p.modulo.toLowerCase().includes(f))
      .reduce((acc, p) => ({ ...acc, [p.modulo]: [...(acc[p.modulo] ?? []), p] }), {})
  }, [permisos, filtro])

  const alternar = (id) => setMarcados((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const alternarModulo = (lista, marcar) => setMarcados((s) => { const n = new Set(s); lista.forEach((p) => (marcar ? n.add(p.id) : n.delete(p.id))); return n })
  const cambios = [...marcados].filter((x) => !original.has(x)).length + [...original].filter((x) => !marcados.has(x)).length

  const guardar = async () => {
    setGuardando(true)
    try {
      const { data } = await api.put(`/seguridad/roles/${rolId}/permisos`, { permisoIds: [...marcados] })
      setOriginal(new Set(marcados))
      showToast({ type: 'success', message: data.message })
      cargarRoles()
    } catch (e) {
      showToast({ type: 'error', message: errorApi(e).mensaje })
    } finally { setGuardando(false) }
  }

  const crearRol = async () => {
    try {
      const { data } = await api.post('/seguridad/roles', nuevoRol)
      showToast({ type: 'success', message: 'Rol creado' })
      setNuevoRol(null)
      await cargarRoles()
      elegir(data.data.id)
    } catch (e) {
      showToast({ type: 'error', message: errorApi(e).mensaje })
    }
  }

  const copiar = (codigo) => navigator.clipboard?.writeText(codigo).then(() => showToast({ type: 'success', message: `Copiado: ${codigo}` }))

  return (
    <div className="grid gap-4 p-4 lg:grid-cols-[280px_1fr]">
      <aside className="rounded-xl border bg-white p-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">Roles</h2>
          {editable && <button type="button" onClick={() => setNuevoRol({ nombre: '', descripcion: '' })} className="inline-flex items-center gap-1 rounded border px-2 py-1 text-sm"><Plus className="h-4 w-4" /> Nuevo</button>}
        </div>
        <ul className="space-y-1">
          {roles.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => elegir(r.id)} className={`w-full rounded-lg px-3 py-2 text-left text-sm ${rolId === r.id ? 'bg-green-100 text-green-900' : 'hover:bg-gray-50'} ${r.activo ? '' : 'opacity-50'}`}>
                <span className="font-medium">{r.nombre}</span>
                <span className="block text-xs text-gray-500">{r.esSistema ? 'Acceso total (*)' : `${r.permisos} permisos`} · {r.usuarios} usuarios</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="rounded-xl border bg-white p-4">
        {!rol ? (
          <div className="text-sm text-gray-600">
            <p>Elija un rol para ver y asignar sus permisos.</p>
            <p className="mt-2">Cada permiso tiene un <strong>código</strong> (por ejemplo <code className="rounded bg-gray-100 px-1">ventas.crear</code>). Ese mismo código se escribe en <code className="rounded bg-gray-100 px-1">tag</code> de cada opción del menú lateral para que solo la vean los roles que tienen ese permiso.</p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-xl font-semibold"><ShieldCheck className="h-5 w-5 text-green-700" /> {rol.nombre}</h2>
                <p className="text-sm text-gray-600">{rol.descripcion}</p>
              </div>
              <div className="flex items-center gap-2">
                <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Filtrar por código, módulo o descripción" className="w-64 rounded border px-3 py-1.5 text-sm" />
                {editable && !rol.esSistema && (
                  <button type="button" disabled={!cambios || guardando} onClick={guardar} className="inline-flex items-center gap-1 rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                    <Save className="h-4 w-4" /> Guardar {cambios ? `(${cambios} cambios)` : ''}
                  </button>
                )}
              </div>
            </div>
            {rol.esSistema && <p className="mt-3 rounded bg-amber-50 p-2 text-sm text-amber-800">Rol del sistema: tiene acceso total y no se modifica.</p>}

            {Object.entries(porModulo).map(([modulo, lista]) => {
              const todos = lista.every((p) => marcados.has(p.id))
              return (
                <fieldset key={modulo} className="mt-4" disabled={!editable || rol.esSistema}>
                  <legend className="flex w-full items-center justify-between border-b pb-1">
                    <span className="font-medium">{modulo}</span>
                    <label className="flex items-center gap-1 text-xs text-gray-600"><input type="checkbox" checked={todos} onChange={(e) => alternarModulo(lista, e.target.checked)} /> Todo el módulo</label>
                  </legend>
                  <table className="mt-1 w-full text-sm">
                    <thead className="text-left text-xs text-gray-500"><tr><th className="w-8" /><th>Código (tag del menú)</th><th>Descripción</th><th>En el menú</th></tr></thead>
                    <tbody>
                      {lista.map((p) => (
                        <tr key={p.id} className="border-t">
                          <td className="py-1.5"><input type="checkbox" aria-label={p.codigo} checked={rol.esSistema || marcados.has(p.id)} onChange={() => alternar(p.id)} /></td>
                          <td>
                            <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">{p.codigo}</code>
                            <button type="button" onClick={() => copiar(p.codigo)} className="ml-1 align-middle text-gray-400 hover:text-gray-700" aria-label={`Copiar ${p.codigo}`}><Copy className="inline h-3 w-3" /></button>
                          </td>
                          <td className="text-gray-700">{p.descripcion}</td>
                          <td className="text-xs text-gray-500">{(enMenu[p.codigo] ?? []).join(' · ') || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </fieldset>
              )
            })}
            <p className="mt-4 text-xs text-gray-500">Los cambios aplican cuando cada usuario recarga la página o vuelve a iniciar sesión.</p>
          </>
        )}
      </section>

      <Modal abierto={Boolean(nuevoRol)} titulo="Nuevo rol" onCerrar={() => setNuevoRol(null)} ancho="max-w-md"
        pie={<><button type="button" onClick={() => setNuevoRol(null)} className="rounded-lg border px-3 py-2">Cancelar</button><button type="button" disabled={!nuevoRol?.nombre?.trim()} onClick={crearRol} className="rounded-lg bg-green-700 px-3 py-2 text-white disabled:opacity-50">Crear</button></>}>
        {nuevoRol && (
          <>
            <label htmlFor="rol-nombre" className="block text-sm">Nombre (se guarda en mayúsculas)</label>
            <input id="rol-nombre" value={nuevoRol.nombre} onChange={(e) => setNuevoRol((r) => ({ ...r, nombre: e.target.value }))} className="mt-1 w-full rounded-lg border px-3 py-2" placeholder="ADMINISTRADOR DE SISTEMAS" />
            <label htmlFor="rol-desc" className="mt-3 block text-sm">Descripción</label>
            <input id="rol-desc" value={nuevoRol.descripcion} onChange={(e) => setNuevoRol((r) => ({ ...r, descripcion: e.target.value }))} className="mt-1 w-full rounded-lg border px-3 py-2" />
          </>
        )}
      </Modal>
    </div>
  )
}
