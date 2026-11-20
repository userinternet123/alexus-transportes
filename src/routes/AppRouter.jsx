import { useContext } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from '../components/ProtectedRoute'
import CustomModal from '../components/ui/CustomModal'
import { AuthContext } from '../context/AuthContext'

import Login from '../pages/Login'
import CambiarPassword from '../pages/CambiarPassword'
import Home from '../pages/Home'
import DynamicPage from '../pages/DynamicPage'

import Gastos from '../components/finanzas/Gastos'
import Rentabilidad from '../components/finanzas/Rentabilidad'
import Viajes from '../components/operacion/Viajes'
import Cotizador from '../components/operacion/Cotizador'
import Combustible from '../components/operacion/Combustible'
import Inspecciones from '../components/operacion/Inspecciones'
import Casos from '../components/operacion/Casos'
import CentroReportes from '../components/finanzas/CentroReportes'
import { RolesPermisos, Usuarios, Parametros, ConfigNegocio, Licencia } from '../components/admin'
import indice from '../data/transporte/_indice.json'

function AppRouter() {
  const { showSessionModal, extendSession, logout, timeLeft } = useContext(AuthContext)

  return (
    <>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/cambiar-password" element={<CambiarPassword />} />

        <Route path="/home" element={<ProtectedRoute><Home /></ProtectedRoute>}>
          {/* Catálogos por configuración JSON (generados con scripts/generar-configs.mjs): /home/<clave> */}
          {Object.keys(indice).map((clave) => (
            <Route key={clave} path={clave} element={<DynamicPage />} />
          ))}

          {/* Operación */}
          <Route path="viajes" element={<Viajes />} />
          <Route path="cotizador" element={<Cotizador />} />
          <Route path="combustible" element={<Combustible />} />
          <Route path="inspecciones" element={<Inspecciones />} />
          <Route path="casos" element={<Casos />} />

          {/* Finanzas y reportes */}
          <Route path="rentabilidad" element={<Rentabilidad />} />
          <Route path="gastos" element={<Gastos />} />
          <Route path="reportes" element={<CentroReportes />} />

          {/* Administración */}
          <Route path="usuarios" element={<Usuarios />} />
          <Route path="roles" element={<RolesPermisos />} />
          <Route path="negocio" element={<ConfigNegocio />} />
          <Route path="licencia" element={<Licencia />} />
          <Route path="parametros" element={<Parametros />} />

          <Route path="*" element={<Navigate to="/home" replace />} />
        </Route>
      </Routes>

      <CustomModal
        show={showSessionModal}
        variant="warning"
        title="Su sesión está por cerrarse"
        confirmLabel="Seguir trabajando"
        onConfirm={extendSession}
        onClose={logout}
      >
        <div className="space-y-3">
          <p>No hemos detectado actividad. Por seguridad, la sesión se cerrará en:</p>
          <div className="text-7xl font-bold tabular-nums text-orange-600" aria-live="polite">{timeLeft}<span className="ml-2 text-2xl">s</span></div>
        </div>
      </CustomModal>
    </>
  )
}

export default AppRouter
