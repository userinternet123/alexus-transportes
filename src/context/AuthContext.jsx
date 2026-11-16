// ─────────────────────────────────────────────────────────────────────────────
// SESIÓN DEL PORTAL
// • Cierre por INACTIVIDAD: cada clic/tecla renueva el plazo. Minutos y aviso
//   se configuran en Administración › Parámetros (módulo Seguridad).
// • Un solo reloj (cada segundo) calcula lo que falta a partir de la hora real:
//   no se desincroniza aunque el navegador duerma la pestaña.
// • Al recargar la página se renuevan token y permisos desde el servidor.
// • Cerrar sesión NO borra las ventas en proceso del POS (quedan para el
//   mismo usuario hasta que las guarde).
// ─────────────────────────────────────────────────────────────────────────────
import { createContext, useCallback, useEffect, useRef, useState } from 'react'
import { logout as logoutApi, refrescarPerfil } from '../services/authService'

export const AuthContext = createContext()

const CLAVE = 'user'
const POR_DEFECTO = { minutos: 30, avisoSegundos: 60 }

const leer = () => {
  try {
    const p = JSON.parse(sessionStorage.getItem(CLAVE) || 'null')
    return p?.data && p?.expires ? p : null
  } catch {
    return null
  }
}
const configDe = (data) => ({
  minutos: Number(data?.usuario?.sesion?.minutos) || POR_DEFECTO.minutos,
  avisoSegundos: Number(data?.usuario?.sesion?.avisoSegundos) || POR_DEFECTO.avisoSegundos,
})
const guardar = (data, expires) => sessionStorage.setItem(CLAVE, JSON.stringify({ data, expires }))

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const p = leer()
    if (!p) return null
    if (p.expires <= Date.now()) { sessionStorage.removeItem(CLAVE); return null }
    return p.data
  })
  const [showSessionModal, setShowSessionModal] = useState(false)
  const [timeLeft, setTimeLeft] = useState(0) // SEGUNDOS restantes (para el contador)
  const modalRef = useRef(false)
  modalRef.current = showSessionModal

  const logout = useCallback(() => {
    logoutApi().catch(() => {}) // revoca el refresh token en el servidor (sin esperar)
    setShowSessionModal(false)
    setTimeLeft(0)
    setUser(null)
    sessionStorage.clear() // solo la sesión; el localStorage (ventas en proceso) se conserva
  }, [])

  const login = useCallback((data) => {
    guardar(data, Date.now() + configDe(data).minutos * 60_000)
    setUser(data)
  }, [])

  const extendSession = useCallback(() => {
    const p = leer()
    if (!p) return logout()
    guardar(p.data, Date.now() + configDe(p.data).minutos * 60_000)
    setShowSessionModal(false)
  }, [logout])

  // Reloj único: aviso y cierre calculados desde la hora real
  useEffect(() => {
    if (!user) return
    const tick = () => {
      const p = leer()
      if (!p) return logout()
      const restante = p.expires - Date.now()
      const { avisoSegundos } = configDe(p.data)
      if (restante <= 0) return logout()
      if (restante <= avisoSegundos * 1000) {
        setTimeLeft(Math.ceil(restante / 1000))
        if (!modalRef.current) setShowSessionModal(true)
      } else if (modalRef.current) {
        setShowSessionModal(false) // se extendió desde otra pestaña
      }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [user, logout])

  // Actividad del usuario => renueva el plazo (máximo una escritura cada 15 s).
  // Con el aviso visible NO se extiende solo: debe confirmarlo.
  useEffect(() => {
    if (!user) return
    let ultima = 0
    const actividad = () => {
      if (modalRef.current || Date.now() - ultima < 15_000) return
      ultima = Date.now()
      const p = leer()
      if (p) guardar(p.data, Date.now() + configDe(p.data).minutos * 60_000)
    }
    const eventos = ['mousedown', 'keydown', 'touchstart', 'scroll']
    eventos.forEach((e) => window.addEventListener(e, actividad, { passive: true }))
    return () => eventos.forEach((e) => window.removeEventListener(e, actividad))
  }, [user])

  // Al cargar/recargar: permisos, sucursales y parámetros de sesión vigentes
  useEffect(() => {
    if (!user) return
    refrescarPerfil()
      .then((perfil) => {
        if (!perfil) return
        const p = leer()
        const data = { ...(p?.data ?? user), usuario: perfil, permisos: perfil.permisos }
        guardar(data, Date.now() + configDe(data).minutos * 60_000)
        setUser(data)
      })
      .catch((e) => console.warn('No se pudo actualizar el perfil:', e?.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <AuthContext.Provider value={{ user, login, logout, showSessionModal, extendSession, timeLeft }}>
      {children}
    </AuthContext.Provider>
  )
}
