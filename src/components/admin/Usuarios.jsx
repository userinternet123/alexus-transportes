// ─────────────────────────────────────────────────────────────────────────────
// USUARIOS en tarjetas: roles, sucursales, estado y empleado vinculado
// (el código del empleado sirve como código de vendedor en el POS).
// La contraseña temporal se muestra una sola vez.
// ─────────────────────────────────────────────────────────────────────────────
import { confirmar } from '../comun/Confirmacion'
import { useEffect, useMemo, useState } from 'react'
import { KeyRound, Plus, Search } from 'lucide-react'
import api from '../../services/api'
import { usePermisos } from '../../hooks/usePermisos'
import { useValidacion } from '../../hooks/useValidacion'
import ResumenErrores from '../forms/ResumenErrores'
import { showToast } from '../../utils/showToast'
import { errorApi } from '../pos/formato'
import Modal from '../comun/Modal'
import Hoja, { Avatar, Fila, Grupo } from '../comun/Hoja'

/** Datos que se piden al guardar un usuario (el usuario solo al crearlo). */
const camposUsuario = (nuevo) => [
  ...(nuevo ? [{ name: 'username', label: 'Usuario', type: 'text', required: true, pattern: '^[a-z0-9._-]{3,40}$', patternMensaje: 'De 3 a 40 caracteres: minúsculas, números, punto, guion o guion bajo (ej. juan.perez)' }] : []),
  { name: 'nombre', label: 'Nombre', type: 'text', required: true, minLength: 3 },
  { name: 'email', label: 'Correo', type: 'text' },
  { name: 'roles', label: 'Roles', type: 'select', required: true, mensajeObligatorio: 'Marque al menos un rol' },
  { name: 'sucursales', label: 'Sucursales', type: 'select', required: true, mensajeObligatorio: 'Marque al menos una sucursal' },
]

const vacio = { username: '', nombre: '', email: '', roles: [], sucursales: [], sucursalPredeterminada: '', empleadoId: '', activo: true }

function Estado({ u }) {
  if (!u.activo) return <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">Inactivo</span>
  if (u.bloqueadoHasta && new Date(u.bloqueadoHasta) > new Date()) return <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700">Bloqueado</span>
  if (u.debeCambiarPassword) return <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">Cambio de clave pendiente</span>
  return <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700">Activo</span>
}

export default function Usuarios() {
  const { puede } = usePermisos()
  const editable = puede('seguridad.usuarios.gestionar')
  const [usuarios, setUsuarios] = useState([])
  const [roles, setRoles] = useState([])
  const [sucursales, setSucursales] = useState([])
  const [empleados, setEmpleados] = useState(null) // null = sin permiso de RRHH
  const [q, setQ] = useState('')
  const [form, setForm] = useState(null)
  const [temporal, setTemporal] = useState(null)

  const cargar = () => api.get('/seguridad/usuarios', { params: { limit: 0, q: q || undefined } }).then(({ data }) => setUsuarios(data.data))
  useEffect(() => {
    api.get('/seguridad/roles').then(({ data }) => setRoles(data.data.filter((r) => r.activo)))
    api.get('/catalogos/sucursales', { params: { limit: 0 } }).then(({ data }) => setSucursales(data.data)).catch(() => {})
    api.get('/rrhh/empleados', { params: { limit: 0 } }).then(({ data }) => setEmpleados(data.data)).catch(() => setEmpleados(null))
  }, [])
  useEffect(() => { const t = setTimeout(cargar, 300); return () => clearTimeout(t) }, [q]) // eslint-disable-line react-hooks/exhaustive-deps

  const editar = (u) => setForm({
    id: u.id, username: u.username, nombre: u.nombre, email: u.email ?? '', activo: u.activo, empleadoId: u.empleadoId ?? '',
    roles: u.roles.map((r) => r.rol.id), sucursales: u.sucursales.map((s) => s.sucursal.id),
    sucursalPredeterminada: u.sucursales.find((s) => s.predeterminada)?.sucursal.id ?? '',
  })
  const campos = useMemo(() => camposUsuario(!form?.id), [form?.id])
  const v = useValidacion(campos)
  useEffect(() => { v.limpiar() }, [form?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const alternarEn = (campo, id) => { v.alCambiar(campo); setForm((f) => ({ ...f, [campo]: f[campo].includes(id) ? f[campo].filter((x) => x !== id) : [...f[campo], id] })) }

  const guardar = async () => {
    const r = v.validar(form) // lo que falta queda marcado en su campo y el cursor va al primero
    if (!r.ok) { showToast({ type: 'error', message: r.lista.length === 1 ? `Revise: ${r.lista[0].label}` : `Revise los ${r.lista.length} datos marcados en rojo` }); return }
    const cuerpo = {
      nombre: r.valores.nombre, email: r.valores.email || null, roles: form.roles, sucursales: form.sucursales, activo: form.activo,
      sucursalPredeterminada: form.sucursalPredeterminada ? Number(form.sucursalPredeterminada) : undefined,
      empleadoId: form.empleadoId ? Number(form.empleadoId) : null,
    }
    try {
      if (form.id) {
        await api.put(`/seguridad/usuarios/${form.id}`, cuerpo)
        showToast({ type: 'success', message: 'Cambios guardados' })
      } else {
        const { data } = await api.post('/seguridad/usuarios', { ...cuerpo, username: r.valores.username })
        setTemporal({ usuario: data.data.username, clave: data.data.passwordTemporal })
      }
      setForm(null)
      cargar()
    } catch (e) {
      v.delServidor(e) // lo que el servidor rechazó queda marcado bajo su campo
      showToast({ type: 'error', message: errorApi(e).mensaje })
    }
  }

  const resetear = async () => {
    if (!(await confirmar({ titulo: 'Restablecer contraseña', mensaje: `¿Restablecer la contraseña de ${form.nombre}? Se cerrarán sus sesiones abiertas.`, confirmar: 'Restablecer', peligro: true }))) return
    try {
      const { data } = await api.post(`/seguridad/usuarios/${form.id}/reset-password`)
      setTemporal({ usuario: form.username, clave: data.data.passwordTemporal })
      setForm(null)
      cargar()
    } catch (e) {
      showToast({ type: 'error', message: errorApi(e).mensaje })
    }
  }

  const empleadoDe = (id) => empleados?.find((e) => e.id === id)

  return (
    <div className="mx-auto max-w-6xl p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por usuario o nombre" aria-label="Buscar usuarios" className="w-full rounded-control border bg-white py-2 pl-9 pr-3 text-[15px]" />
        </div>
        {editable && <button type="button" onClick={() => setForm({ ...vacio })} className="inline-flex items-center gap-1 rounded-control bg-green-600 px-3 py-2 text-sm font-medium text-white"><Plus className="h-4 w-4" /> Nuevo usuario</button>}
      </div>

      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {usuarios.map((u) => {
          const emp = empleadoDe(u.empleadoId)
          return (
            <li key={u.id}>
              <button type="button" onClick={() => editable && editar(u)} className={`flex h-full w-full flex-col gap-3 rounded-tarjeta border bg-white p-4 text-left ${editable ? 'hover:border-green-600' : ''} ${u.activo ? '' : 'opacity-60'}`}>
                <span className="flex items-center gap-3">
                  <Avatar nombre={u.nombre} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold">{u.nombre}</span>
                    <span className="block truncate text-sm text-gray-500">{u.username}{emp ? `, vendedor ${emp.codigo}` : ''}</span>
                  </span>
                </span>
                <span className="flex flex-wrap gap-1">
                  {u.roles.map((r) => <span key={r.rol.id} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">{r.rol.nombre}</span>)}
                </span>
                <span className="mt-auto flex items-center justify-between gap-2 text-xs text-gray-500">
                  <span className="truncate">{u.sucursales.map((s) => s.sucursal.nombre).join(', ')}</span>
                  <Estado u={u} />
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      {form && (
        <Hoja abierta titulo={form.id ? form.nombre : 'Nuevo usuario'} onCerrar={() => setForm(null)}
          pie={<>
            {form.id && <button type="button" onClick={resetear} className="mr-auto inline-flex items-center gap-1 rounded-control px-3 py-2 text-sm text-amber-700"><KeyRound className="h-4 w-4" /> Restablecer contraseña</button>}
            <button type="button" onClick={() => setForm(null)} className="rounded-control border px-4 py-2">Cancelar</button>
            <button type="button" onClick={guardar} className="rounded-control bg-green-600 px-4 py-2 font-medium text-white disabled:opacity-50">Guardar</button>
          </>}>
          <ResumenErrores lista={v.lista} />
          <Grupo titulo="Cuenta">
            {!form.id && <Fila etiqueta="Usuario" id="username" requerido error={v.error('username')}><input value={form.username} onChange={(e) => { v.alCambiar('username'); setForm((f) => ({ ...f, username: e.target.value.toLowerCase() })) }} placeholder="juan.perez" /></Fila>}
            <Fila etiqueta="Nombre" id="nombre" requerido error={v.error('nombre')}><input value={form.nombre} onChange={(e) => { v.alCambiar('nombre'); setForm((f) => ({ ...f, nombre: e.target.value })) }} placeholder="Nombre completo" /></Fila>
            <Fila etiqueta="Correo" id="email" error={v.error('email')}><input type="email" value={form.email} onChange={(e) => { v.alCambiar('email'); setForm((f) => ({ ...f, email: e.target.value })) }} placeholder="Opcional" /></Fila>
            {form.id && <Fila etiqueta="Activo"><input type="checkbox" checked={form.activo} onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))} className="!w-auto" /></Fila>}
          </Grupo>
          {empleados && (
            <Grupo titulo="Empleado" nota="Vincule al empleado para que su código funcione como código de vendedor en el punto de venta y sus ventas cuenten para comisiones.">
              <Fila etiqueta="Empleado">
                <select value={form.empleadoId} onChange={(e) => setForm((f) => ({ ...f, empleadoId: e.target.value }))}>
                  <option value="">Sin vincular</option>
                  {empleados.filter((e) => e.estado === 'ACTIVO').map((e) => <option key={e.id} value={e.id}>{e.codigo}, {e.nombres} {e.apellidos}</option>)}
                </select>
              </Fila>
            </Grupo>
          )}
          <Grupo titulo="Roles" id="roles" requerido error={v.error('roles')}>
            {roles.map((r) => (
              <Fila key={r.id} etiqueta={r.nombre}><input type="checkbox" checked={form.roles.includes(r.id)} onChange={() => alternarEn('roles', r.id)} className="!w-auto" /></Fila>
            ))}
          </Grupo>
          <Grupo titulo="Sucursales" id="sucursales" requerido error={v.error('sucursales')}>
            {sucursales.filter((s) => s.activo).map((s) => (
              <Fila key={s.id} etiqueta={s.nombre}><input type="checkbox" checked={form.sucursales.includes(s.id)} onChange={() => alternarEn('sucursales', s.id)} className="!w-auto" /></Fila>
            ))}
            {form.sucursales.length > 1 && (
              <Fila etiqueta="Predeterminada">
                <select value={form.sucursalPredeterminada} onChange={(e) => setForm((f) => ({ ...f, sucursalPredeterminada: e.target.value }))}>
                  <option value="">La primera marcada</option>
                  {sucursales.filter((s) => form.sucursales.includes(s.id)).map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              </Fila>
            )}
          </Grupo>
        </Hoja>
      )}

      <Modal abierto={Boolean(temporal)} titulo="Contraseña temporal" onCerrar={() => setTemporal(null)} ancho="max-w-sm"
        pie={<button type="button" onClick={() => setTemporal(null)} className="rounded-control bg-green-600 px-4 py-2 text-white">Listo</button>}>
        {temporal && (
          <>
            <p className="text-sm">Entregue estos datos en persona. No se volverán a mostrar.</p>
            <p className="mt-3 text-sm">Usuario: <code className="rounded bg-gray-100 px-1.5">{temporal.usuario}</code></p>
            <p className="mt-1 text-sm">Contraseña: <code className="rounded bg-gray-100 px-1.5 text-base">{temporal.clave}</code></p>
            <p className="mt-3 text-xs text-gray-500">Al ingresar, el sistema le pedirá definir su propia contraseña.</p>
          </>
        )}
      </Modal>
    </div>
  )
}
