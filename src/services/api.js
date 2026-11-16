// ─────────────────────────────────────────────────────────────────────────────
// Cliente HTTP del portal para SPVI 2.0 (reemplaza src/services/api.js).
//  - Bearer token + header X-Sucursal-Id (sucursal de trabajo)
//  - Refresh token con ROTACIÓN y cola de peticiones (un solo refresh a la vez)
//  - Errores normalizados: el API responde { ok:false, codigo, error, message }
//
// .env (Vite):  VITE_API_URL=http://localhost:4000/api/v1
// Nunca pongas secretos en variables VITE_* (quedan en el bundle del navegador).
// ─────────────────────────────────────────────────────────────────────────────
import axios from 'axios'

const KEYS = { access: 'spvi_access', refresh: 'spvi_refresh', sucursal: 'spvi_sucursal', user: 'user' }

export const sesion = {
  guardar: ({ accessToken, refreshToken }) => {
    sessionStorage.setItem(KEYS.access, accessToken)
    sessionStorage.setItem(KEYS.refresh, refreshToken)
  },
  access: () => sessionStorage.getItem(KEYS.access),
  refresh: () => sessionStorage.getItem(KEYS.refresh),
  sucursal: () => sessionStorage.getItem(KEYS.sucursal),
  setSucursal: (id) => sessionStorage.setItem(KEYS.sucursal, String(id)),
  limpiar: () => Object.values(KEYS).forEach((k) => sessionStorage.removeItem(k)),
}

// Compatibilidad con el código existente del portal
export const guardarToken = (t) => sessionStorage.setItem(KEYS.access, t)
export const leerToken = () => sesion.access()
export const borrarToken = () => sesion.limpiar()

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL, timeout: 20000 })

api.interceptors.request.use((config) => {
  const token = sesion.access()
  if (token) config.headers.Authorization = `Bearer ${token}`
  const sucursal = sesion.sucursal()
  if (sucursal) config.headers['X-Sucursal-Id'] = sucursal
  return config
})

let refrescando = null // promesa compartida: evita N refresh simultáneos

async function refrescarToken() {
  const refreshToken = sesion.refresh()
  if (!refreshToken) throw new Error('Sin sesión')
  const { data } = await axios.post(`${import.meta.env.VITE_API_URL}/auth/refresh`, { refreshToken })
  sesion.guardar(data)
  return data.accessToken
}

/**
 * Renueva la sesión (rota el refresh token y trae un access token con los
 * permisos VIGENTES). Comparte una sola petición aunque la pidan varios a la
 * vez: dos renovaciones simultáneas con el mismo token revocarían la sesión.
 */
export function renovarSesion() {
  refrescando = refrescando ?? refrescarToken().finally(() => (refrescando = null))
  return refrescando
}

function irAlLogin() {
  sesion.limpiar()
  if (window.location.pathname !== '/') window.location.href = '/'
}

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config
    const status = err.response?.status
    const codigo = err.response?.data?.codigo

    // Sin licencia válida el API no atiende: se muestra la pantalla para activarla (ProtectedRoute)
    if (status === 403 && codigo === 'LICENCIA_REQUERIDA') window.dispatchEvent(new CustomEvent('spvi:licencia-requerida', { detail: err.response?.data?.message }))

    if (status === 401 && !original._reintento && !original.url?.includes('/auth/')) {
      original._reintento = true
      try {
        const nuevo = await renovarSesion()
        original.headers.Authorization = `Bearer ${nuevo}`
        return api(original)
      } catch {
        irAlLogin()
      }
    }
    if (status === 401) irAlLogin()
    if (codigo === 'CAMBIO_PASSWORD_REQUERIDO' && window.location.pathname !== '/cambiar-password') {
      window.location.href = '/cambiar-password'
    }
    // Mensaje legible para showToast / FormActions
    err.message = err.response?.data?.message || err.message
    err.codigo = codigo
    return Promise.reject(err)
  }
)

/** Descarga un archivo (ej. reporte Excel) respetando token y sucursal. */
export async function descargar(url, params, nombrePorDefecto = 'reporte.xlsx') {
  const res = await api.get(url, { params, responseType: 'blob' })
  const dispo = res.headers['content-disposition'] || ''
  const nombre = /filename="([^"]+)"/.exec(dispo)?.[1] || nombrePorDefecto
  const href = URL.createObjectURL(res.data)
  const a = Object.assign(document.createElement('a'), { href, download: nombre })
  a.click()
  URL.revokeObjectURL(href)
}

export default api
