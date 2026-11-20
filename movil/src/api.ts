// Cliente del API de ALEXUS Transportes para la app del piloto.
// - Servidor configurable (dirección de Tailscale o HTTPS de la empresa).
// - Tokens en el almacén seguro del teléfono (Android Keystore).
// - Renovación automática del token, compartida entre peticiones simultáneas.
import axios, { AxiosError, AxiosRequestConfig } from 'axios'
import * as SecureStore from 'expo-secure-store'
import type { Perfil } from './permisos'

const K = { servidor: 'alexus_piloto_servidor', access: 'alexus_piloto_access', refresh: 'alexus_piloto_refresh', sucursal: 'alexus_piloto_sucursal', perfil: 'alexus_piloto_perfil' }

export const almacen = {
  servidor: () => SecureStore.getItemAsync(K.servidor),
  setServidor: (url: string) => SecureStore.setItemAsync(K.servidor, url.replace(/\/+$/, '')),
  sucursal: () => SecureStore.getItemAsync(K.sucursal),
  setSucursal: (id: number | string) => SecureStore.setItemAsync(K.sucursal, String(id)),
  async guardarTokens(t: { accessToken: string; refreshToken: string }) {
    await SecureStore.setItemAsync(K.access, t.accessToken)
    await SecureStore.setItemAsync(K.refresh, t.refreshToken)
  },
  async limpiar() {
    await Promise.all([K.access, K.refresh, K.sucursal, K.perfil].map((k) => SecureStore.deleteItemAsync(k)))
  },
  access: () => SecureStore.getItemAsync(K.access),
  refresh: () => SecureStore.getItemAsync(K.refresh),
  /** Último perfil conocido (nombre, permisos, sedes): permite abrir la app sin señal. */
  guardarPerfil: (p: Perfil) => SecureStore.setItemAsync(K.perfil, JSON.stringify(p)),
  async perfilGuardado(): Promise<Perfil | null> {
    const t = await SecureStore.getItemAsync(K.perfil)
    try { return t ? (JSON.parse(t) as Perfil) : null } catch { return null }
  },
}

export const api = axios.create({ timeout: 15000 })
let alExpirar: (() => void) | null = null
export const alCerrarSesion = (fn: () => void) => { alExpirar = fn }

api.interceptors.request.use(async (cfg) => {
  const servidor = await almacen.servidor()
  cfg.baseURL = `${servidor}/api/v1`
  const token = await almacen.access()
  const suc = await almacen.sucursal()
  if (token) cfg.headers.set('Authorization', `Bearer ${token}`)
  // Lo capturado sin conexión se envía a la sede donde se capturó (aunque el usuario ya haya cambiado de sede)
  if (suc && !cfg.headers.has('X-Sucursal-Id')) cfg.headers.set('X-Sucursal-Id', suc)
  return cfg
})

let renovando: Promise<string | null> | null = null
async function renovar(): Promise<string | null> {
  const refreshToken = await almacen.refresh()
  if (!refreshToken) return null
  try {
    const servidor = await almacen.servidor()
    const { data } = await axios.post(`${servidor}/api/v1/auth/refresh`, { refreshToken }, { timeout: 15000 })
    await almacen.guardarTokens(data)
    return data.accessToken as string
  } catch {
    return null
  }
}

api.interceptors.response.use(undefined, async (e: AxiosError) => {
  const original = e.config as (AxiosRequestConfig & { _reintento?: boolean }) | undefined
  if (e.response?.status === 401 && original && !original._reintento && !original.url?.includes('/auth/')) {
    original._reintento = true
    renovando = renovando ?? renovar().finally(() => { renovando = null })
    const nuevo = await renovando
    if (nuevo) return api(original)
    await almacen.limpiar()
    alExpirar?.()
  }
  throw e
})

/** Mensaje legible para el usuario a partir de un error del API. */
export function mensajeError(e: unknown): string {
  const ax = e as AxiosError<{ message?: string }>
  if (ax?.response?.data?.message) return ax.response.data.message
  if (ax?.code === 'ECONNABORTED' || ax?.message === 'Network Error') {
    return 'No hay conexión con el servidor. Lo que capture se guarda en el teléfono y se envía cuando haya señal.'
  }
  return 'Ocurrió un error inesperado'
}
