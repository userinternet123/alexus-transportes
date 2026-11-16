// Captura de errores del portal (navegador): se guardan los últimos para adjuntarlos
// a un ticket de soporte y se informan al API, que los agrupa y envía a ALEXUS Central.
import api, { leerToken } from '../services/api'

const recientes = []
const enviados = new Map() // mensaje -> última vez (evita repetir el mismo error)

export const erroresRecientes = () => recientes.slice(-5)

function registrar(mensaje, stack) {
  if (!mensaje) return
  const texto = String(mensaje).slice(0, 500)
  recientes.push(`${new Date().toLocaleTimeString('es-GT')} ${texto}`)
  if (recientes.length > 10) recientes.shift()
  // Ignora ruido del navegador que no es del sistema
  if (/ResizeObserver loop|Script error\.?$|extension:\/\//i.test(texto)) return
  const ultima = enviados.get(texto) ?? 0
  if (Date.now() - ultima < 60_000 || !leerToken()) return
  enviados.set(texto, Date.now())
  api.post('/central/errores-web', { mensaje: texto, stack: stack ? String(stack).slice(0, 8000) : undefined, ruta: window.location.pathname }).catch(() => {})
}

export function instalarCapturaErrores() {
  window.addEventListener('error', (e) => registrar(e.message, e.error?.stack))
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason
    // Los rechazos de llamadas al API (400/403/409…) ya se muestran al usuario: no son fallas del sistema
    if (r?.isAxiosError && r.response && r.response.status < 500) return
    registrar(r?.message ?? String(r), r?.stack)
  })
}
