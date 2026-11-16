import { Navigate } from 'react-router-dom'
import { useContext, useEffect, useState } from 'react'
import { AuthContext } from '../context/AuthContext'
import LicenciaRequerida from './admin/LicenciaRequerida'

/**
 * Rutas con sesión. Sin licencia válida no se muestra nada del sistema: solo la pantalla para activarla.
 * Se detecta al entrar (perfil) y también si el API responde LICENCIA_REQUERIDA a mitad del trabajo
 * (por ejemplo, la licencia venció y pasó la gracia mientras el sistema estaba abierto).
 */
function ProtectedRoute({ children }) {
  const { user } = useContext(AuthContext)
  const [bloqueo, setBloqueo] = useState(null)
  useEffect(() => {
    const alBloquear = (e) => setBloqueo(e.detail || 'Este equipo necesita una licencia de ALEXUS Transportes.')
    window.addEventListener('spvi:licencia-requerida', alBloquear)
    return () => window.removeEventListener('spvi:licencia-requerida', alBloquear)
  }, [])
  if (!user) return <Navigate to="/" replace />
  const lic = user.usuario?.licencia
  if (bloqueo || lic?.bloqueado) return <LicenciaRequerida motivo={bloqueo ?? lic?.motivo} />
  return children
}

export default ProtectedRoute
