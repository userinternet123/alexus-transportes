import { useContext } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from '../components/ProtectedRoute'
import CustomModal from '../components/ui/CustomModal'
import { AuthContext } from '../context/AuthContext'

import Login from '../pages/Login'
import CambiarPassword from '../pages/CambiarPassword'
import Home from '../pages/Home'
import DynamicPage from '../pages/DynamicPage'

import { PuntoVenta, CuadreCaja, CierreDiario, CentroReportes } from '../components/pos'
import { VentasDelDia, IngresoCompra, Existencias } from '../components/operacion'
import QueComprar from '../components/operacion/QueComprar'
import Gastos from '../components/operacion/Gastos'
import ConteoFisico from '../components/inventario/ConteoFisico'
import Clasificacion from '../components/catalogo/Clasificacion'
import CamposProducto from '../components/catalogo/CamposProducto'
import Traslados from '../components/inventario/Traslados'
import Ubicaciones from '../components/inventario/Ubicaciones'
import Cobros from '../components/operacion/Cobros'
import { RolesPermisos, Usuarios, Parametros, ConfigNegocio, Licencia } from '../components/admin'
import DashboardAnalitico from '../components/analitica/DashboardAnalitico'
import AsistenteDatos from '../components/analitica/AsistenteDatos'
import AnalisisGuardados from '../components/analitica/AnalisisGuardados'
import Temporadas from '../components/analitica/Temporadas'
import SaludFinanciera from '../components/analitica/SaludFinanciera'
import DisenadorDocumentos from '../components/documentos/DisenadorDocumentos'
import PantallaCompleta from '../components/comun/PantallaCompleta'
import indice from '../data/spvi/_indice.json'
import Productos from '../components/catalogo/Productos'
import Clientes from '../components/catalogo/Clientes'

// Catálogos con pantalla propia (tarjetas); el resto usa el motor de formularios JSON
const DEDICADOS = new Set(['productos', 'clientes'])

function AppRouter() {
  const { showSessionModal, extendSession, logout, timeLeft } = useContext(AuthContext)

  return (
    <>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/cambiar-password" element={<CambiarPassword />} />

        {/* Pantalla completa configurable: /pantalla/pos, /pantalla/caja, /pantalla/dashboard… */}
        <Route path="/pantalla/:vista" element={<ProtectedRoute><PantallaCompleta /></ProtectedRoute>} />

        <Route path="/home" element={<ProtectedRoute><Home /></ProtectedRoute>}>
          {/* Catálogos por configuración JSON (generados): /home/<clave> */}
          {Object.keys(indice).filter((clave) => !DEDICADOS.has(clave)).map((clave) => (
            <Route key={clave} path={clave} element={<DynamicPage />} />
          ))}

          <Route path="productos" element={<Productos />} />
          <Route path="clientes" element={<Clientes />} />

          {/* Operación */}
          <Route path="pos" element={<PuntoVenta />} />
          <Route path="ventas" element={<VentasDelDia />} />
          <Route path="caja" element={<CuadreCaja />} />
          <Route path="cierre" element={<CierreDiario />} />
          <Route path="existencias" element={<Existencias />} />
          <Route path="compras" element={<IngresoCompra />} />
          <Route path="que-comprar" element={<QueComprar />} />
          <Route path="gastos" element={<Gastos />} />
          <Route path="conteos" element={<ConteoFisico />} />
          <Route path="clasificacion" element={<Clasificacion />} />
          <Route path="campos-producto" element={<CamposProducto />} />
          <Route path="traslados" element={<Traslados />} />
          <Route path="ubicaciones" element={<Ubicaciones />} />
          <Route path="cobros" element={<Cobros />} />

          {/* Reportes y análisis */}
          <Route path="dashboard" element={<DashboardAnalitico />} />
          <Route path="asistente-datos" element={<AsistenteDatos />} />
          <Route path="analisis" element={<AnalisisGuardados />} />
          <Route path="temporadas" element={<Temporadas />} />
          <Route path="salud-financiera" element={<SaludFinanciera />} />
          <Route path="reportes" element={<CentroReportes />} />

          {/* Administración */}
          <Route path="usuarios" element={<Usuarios />} />
          <Route path="roles" element={<RolesPermisos />} />
          <Route path="parametros" element={<Parametros />} />
          <Route path="negocio" element={<ConfigNegocio />} />
          <Route path="formato-documentos" element={<DisenadorDocumentos />} />
          <Route path="licencia" element={<Licencia />} />

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
          <p className="text-sm text-gray-500">Las ventas en proceso del punto de venta se conservan.</p>
        </div>
      </CustomModal>
    </>
  )
}

export default AppRouter
