// ─────────────────────────────────────────────────────────────────────────────
// Servicios de autenticación — SPVI 2.0
// Conserva la API que ya usa el portal (getUserInfo, hasPermission, isRoot,
// leerToken) y la conecta al login nuevo (JWT + permisos por código).
// ─────────────────────────────────────────────────────────────────────────────
import api, { sesion, leerToken, renovarSesion } from './api'
import { moduloContratado } from '../config/modulos'

// Se re-exporta para que el resto del portal importe todo desde authService
export { leerToken }

/**
 * Login contra SPVI 2.0. Guarda tokens y sucursal predeterminada.
 * Devuelve el perfil: { id, username, nombre, sucursales, roles, permisos, debeCambiarPassword }
 */
export async function login(username, password) {
  try {
    const { data } = await api.post('/auth/login', { username, password })
    sesion.guardar(data)
    const { data: perfil } = await api.get('/auth/me')
    const predeterminada = perfil.sucursales.find((s) => s.predeterminada) ?? perfil.sucursales[0]
    if (predeterminada) sesion.setSucursal(predeterminada.id)
    return { ...perfil, debeCambiarPassword: Boolean(data.usuario?.cp) }
  } catch (err) {
    const status = err.response?.status
    const mensaje = err.response?.data?.message
    if (status === 401) throw new Error('Usuario o contraseña incorrectos. Intente nuevamente')
    if (status === 423) throw new Error(mensaje || 'Usuario bloqueado temporalmente por intentos fallidos')
    if (!err.response) throw new Error('No se pudo conectar con el servidor. ¿Está encendido el API?')
    throw new Error(mensaje || 'Error de conexión con el servidor.')
  }
}

/** Datos guardados del usuario: { usuario: perfil, roles, permisos } */
export function getUserInfo() {
  const datosUser = JSON.parse(sessionStorage.getItem('user') || 'null')
  return datosUser?.data
}

/**
 * Permiso para mostrar un menú/botón.
 *  - Texto (SPVI 2.0): código de permiso, ej. 'ventas.crear'. '*' = superadmin.
 *  - Número (menús heredados de la plantilla): solo superadmin o el comodín 777.
 */
export function hasPermission(clave) {
  const permisos = getUserInfo()?.permisos ?? []
  const esSuper = permisos.includes('*')
  if (clave === undefined || clave === null || clave === '') return true
  if (typeof clave === 'string') {
    // Módulos del plan contratado: aplica también al superadministrador
    if (!moduloContratado(clave, getUserInfo()?.usuario?.licencia?.modulos)) return false
    return esSuper || permisos.includes(clave)
  }
  return esSuper || clave === 777
}

/** Roles que ven el código (tag) de permiso junto a cada opción del menú. */
const ROLES_ADMIN = ['SUPERADMIN', 'ROOT', 'ADMINISTRADOR DE SISTEMAS', 'ADMINISTRADOR_DE_SISTEMAS']
const normalizar = (t) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase()

/**
 * true si el usuario tiene rol root / administrador de sistemas (o el modo
 * diagnóstico activado con localStorage.setItem('spvi_debug_menu', '1')).
 * El Sidebar lo usa para mostrar el código de permiso junto a cada menú.
 */
export function isRoot() {
  if (localStorage.getItem('spvi_debug_menu') === '1') return true
  const roles = getUserInfo()?.usuario?.roles ?? []
  return roles.some((r) => ROLES_ADMIN.includes(normalizar(typeof r === 'string' ? r : r?.nombre ?? r?.rol)))
}

/**
 * Al recargar la página: renueva el token (trae los permisos VIGENTES del
 * servidor) y el perfil. Así un cambio de permisos aplica con solo recargar.
 */
export async function refrescarPerfil() {
  if (!sesion.refresh()) return null
  await renovarSesion()
  const { data: perfil } = await api.get('/auth/me')
  return perfil
}

export async function logout() {
  const refreshToken = sesion.refresh()
  if (refreshToken) await api.post('/auth/logout', { refreshToken }).catch(() => {})
  sesion.limpiar()
  sessionStorage.removeItem('user')
}

export async function cambiarPassword(actual, nueva) {
  const { data } = await api.post('/auth/cambiar-password', { actual, nueva })
  sesion.guardar(data)
  return data
}

export function cambiarSucursal(id) {
  sesion.setSucursal(id)
  window.location.reload()
}
