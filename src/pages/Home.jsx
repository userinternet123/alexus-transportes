import { useState, useContext, useEffect } from 'react'
import { useLocation, useNavigate, Outlet } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'

import Navegacion from '../components/layout/shell/Navegacion'
import BarraSuperior from '../components/layout/shell/BarraSuperior'
import BarraInferior from '../components/layout/shell/BarraInferior'
import PaletaComandos from '../components/layout/shell/PaletaComandos'
import '../styles/index.css'

import LogoutModal from '../components/ui/CustomModal'
import Inicio from '../components/dashboard/Inicio'
import { AuthContext } from '../context/AuthContext'

import { requestApi } from '../services/consulta'
import { MODULOS_TRANSPORTE } from '../config/moduleRegistry'

/**
 * Cascarón del portal: navegación, barra superior y el contenido de cada ruta.
 * Los catálogos (cabezales, pilotos, rutas…) se arman desde los JSON generados
 * (src/data/transporte) y se cargan aquí; las pantallas dedicadas usan su propio
 * componente y consultan el API por su cuenta.
 */
function Home() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  const [showLogout, setShowLogout] = useState(false)
  const [paleta, setPaleta] = useState(false)
  const [moduleData, setModuleData] = useState([])
  const { logout } = useContext(AuthContext)
  const navigate = useNavigate()
  const currentModule = location.pathname
  const [refreshKey, setRefreshKey] = useState(0)

  const savedForm = JSON.parse(sessionStorage.getItem('selectedForm') || '{}')
  const type = location.state?.type || savedForm.type || ''
  const filtro = location.state?.filtro

  const COMPONENT_CONFIGS = MODULOS_TRANSPORTE
  const refreshModule = () => setRefreshKey((prev) => prev + 1)

  useEffect(() => {
    const endpointConfig = COMPONENT_CONFIGS[currentModule]
    let parametros = { ...endpointConfig?.params }
    if (filtro) parametros = { ...endpointConfig?.params, estado: filtro }

    if (!endpointConfig?.path) {
      setModuleData([])
      return
    }

    requestApi({ baseURL: null, endpoint: endpointConfig.path, params: parametros })
      .then(({ status, data }) => {
        if (status >= 200 && status < 300) setModuleData(data.data || data)
      })
      .catch((error) => {
        setModuleData([])
        console.error('error', error)
      })
  }, [currentModule, refreshKey])

  const isHome = location.pathname === '/home'
  const selectedConfig = COMPONENT_CONFIGS[location.pathname] ?? {}
  const contexto = {
    type: selectedConfig.type ?? type,
    formConfig: selectedConfig.config,
    formData: moduleData,
    modalConfig: selectedConfig?.modalConfig,
    refreshModule,
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      <Navegacion
        abierta={sidebarOpen}
        onCerrar={() => setSidebarOpen(false)}
        onSalir={() => setShowLogout(true)}
        onBuscar={() => setPaleta(true)}
      />
      <main className="flex min-w-0 flex-1 flex-col">
        <BarraSuperior onMenu={() => setSidebarOpen(true)} onBuscar={() => setPaleta(true)} />
        {/* Contenido (deja espacio para las pestañas inferiores en el celular) */}
        <div key={location.pathname} className="mac-pagina flex-1 overflow-y-auto pb-20 md:pb-0">
          {isHome ? (
            <Inicio />
          ) : selectedConfig.type ? (
            // Catálogos del motor JSON: mismo relleno y ancho que las demás pantallas
            <div className="mx-auto max-w-7xl p-4">
              <Outlet context={contexto} />
            </div>
          ) : (
            <Outlet context={contexto} />
          )}
        </div>
      </main>
      <BarraInferior onMenu={() => setSidebarOpen(true)} />
      <PaletaComandos abierta={paleta} onAbrir={() => setPaleta(true)} onCerrar={() => setPaleta(false)} />
      <section>
        <Toaster
          position="top-right"
          toastOptions={{
            success: { duration: 5000 },
            error: { duration: 7000 },
            className: 'text-[15px] px-4 py-3',
            style: { borderRadius: '12px' },
          }}
        />
        <LogoutModal
          show={showLogout}
          message="Guarde sus cambios antes de continuar"
          title="¿Desea cerrar la sesión?"
          variant="warning"
          confirmLabel="Cerrar sesión"
          onClose={() => setShowLogout(false)}
          onConfirm={() => {
            setShowLogout(false)
            logout()
            navigate('/')
          }}
        />
      </section>
    </div>
  )
}

export default Home
