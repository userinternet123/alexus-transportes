import { AnfitrionExperiencia } from '../components/comun/Experiencia'
import { useState, useContext, useEffect } from 'react'
import { useNavigate, Outlet, useLocation } from 'react-router-dom'
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

/*CONFIGURACIONES */
import formConfigJson from '../data/solicitud-tc-nueva.json'
import listadoSolicitudes from '../data/newForm.json'
import listadoSolicitudesModal from '../data/solicitud-tc-list-modal.json'
/* ROLES */
import rolesList from '../data/security/rol/roles-list.json'
import rolesModal from '../data/security/rol/roles-form-modal.json'

/*ASIGNACIONES */
import rolFormModal from '../data/security/rolConfiguration/asignacion-rol-form-modal.json'
import rolForm from '../data/security/rolConfiguration/rol-form.json'

/*USUARIO- ROL */
import userRolForm from '../data/security/rolAssignment/rol-user-from.json'
import userRolModal from '../data/security/rolAssignment/rol-user-form-modal.json'

/*FORMULARIOS */
import formList from '../data/security/form/form-list.json'
import formModal from '../data/security/form/form-form.json'

/*Marcas */
import marcasList from '../data/spvi/marcas-list.json'
import marcasForm from '../data/spvi/marcas-form.json'
import { MODULOS_SPVI } from '../config/moduleRegistry'
//import userRolList from '../data/security/user/user-rol.json'

function Home() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  //const [currentForm, setCurrentForm] = useState('')
  const location = useLocation()
  const [showLogout, setShowLogout] = useState(false)
  const [paleta, setPaleta] = useState(false)
  const [moduleData, setModuleData] = useState([])
  const { logout } = useContext(AuthContext)
  const navigate = useNavigate()
  // formulario
  //const [formType, setFormType] = useState(null)
  //const [formConfig, setFormConfig] = useState(formConfigJson)
  const formConfig = formConfigJson
  const FormListConfig = listadoSolicitudes
  const userString = sessionStorage.getItem('user')
  const user = userString ? JSON.parse(userString) : null
  const currentModule = location.pathname
  const [refreshKey, setRefreshKey] = useState(0)

  //const type = location.state?.type || ''
  const savedForm = JSON.parse(sessionStorage.getItem('selectedForm') || '{}')
  const type = location.state?.type || savedForm.type || ''
  const filtro = location.state?.filtro
  const dataState = location.state?.data || {}

  //const baseURL = 'http://10.160.110.61:4000'
  const baseURL = null
  //const [formData, setFormData] = useState({})

  const COMPONENT_CONFIGS = {
    // Catálogos SPVI generados (scripts/generar-configs.mjs) — /home/<clave>
    // productos y clientes tienen pantalla propia (tarjetas): no se precargan aquí
    ...Object.fromEntries(Object.entries(MODULOS_SPVI).filter(([ruta]) => !['/home/productos', '/home/clientes'].includes(ruta))),
    '/home/marcas':{
      type,
      config: marcasList,
      modalConfig: marcasForm,
      path: '/catalogos/marcas',
      params: { limit: 0, activo: 'todos'},
    },
    '/home/formulario': {
      type,
      config: formConfig,
      sourceForPath: dataState,
      path: (data) => `/solicitudesID/${data?.id_solicitud}`,
      valid: true,
    },
    '/home/listadosolicitudes': {
      type,
      config: FormListConfig,
      modalConfig: listadoSolicitudesModal,
      sourceForPath: user?.data,
      // path: (user) => `/api/v1/agentes/${user.data.usuario}/ventas`,
      // `/api/v1/agencia/${user?.usuario?.agencia}/region/${user?.usuario?.region}/macroregion/${user?.usuario?.macro}/usuario/${user?.usuario?.usuario}/ventas`,
      path: (user) =>
        `/api/v1/agencia/${user?.usuario?.oficina}/region/${user?.usuario?.region}/macroregion/${user?.usuario?.macro}/usuario/${user?.usuario?.usuario}/ventas`,
      params: { page: 1, limit: 0 },
    },
    // '/home/roles' ahora es la pantalla dedicada Roles y permisos (components/admin)

    '/home/asignaciones': {
      type,
      config: rolForm,
      modalConfig: rolFormModal,
      path: {
        rolesDisponibles: '/roles/catalogo',
        //roles/relaciones/rol-formulario
        formularioAsignado: '/roles/relaciones/rol-formulario',
        formulariosDisponibles: '/formularios',
      },
    },
    '/home/rol-usuario': {
      type,
      config: userRolForm,
      modalConfig: userRolModal,
      path: {
        //userrol: (user) => `/usuarios/${user?.usuario.usuario}/roles`,
        rolesAsignados: '/roles/relaciones/usuario-rol',
        rolesDisponibles: '/roles/catalogo',
      },
    },

    '/home/formularios': {
      type,
      config: formList,
      modalConfig: formModal,
      path: '/formularios',
      formData: [
        {
          codigo: '123',
          nombre: 'Colocación de Tarjeta de Crédito',
          descripcion: 'Interfaz de solicitud a PTC',
          fechaCreacion: '25/07/2026',
          estado: 'ACTIVO',
        },
      ],
    },
  }
  const refreshModule = () => {
    setRefreshKey((prev) => prev + 1)
  }

  useEffect(() => {
    const endpointConfig = COMPONENT_CONFIGS[currentModule]
    //http://localhost:4000/api/v1/agencia/919/region/45/macroregion/BANCA%20CORPORATIVA/usuario/usr043860/ventas?page=1&limit=0&estado=
    let parametros = { ...endpointConfig?.params }
    if (filtro) {
      parametros = { ...endpointConfig?.params, estado: filtro }
    }

    if (!endpointConfig?.path) {
      setModuleData([])
      return
    }

    // Endpoint dinámico (función)
    if (typeof endpointConfig?.path === 'function') {
      requestApi({
        baseURL,
        endpoint: endpointConfig.path(endpointConfig.sourceForPath),
        //params: endpointConfig.params,
        params: parametros,
      })
        .then(({ status, data }) => {
          if (status >= 200 && status < 300) {
            if (endpointConfig.valid) {
              setModuleData(data.data[0])
            } else {
              setModuleData(data.data)
            }
          }
        })
        .catch((error) => {
          setModuleData([])
          console.error('error', error)
        })

      return
    }

    // Múltiples endpoints
    if (typeof endpointConfig?.path === 'object' && !Array.isArray(endpointConfig.path)) {
      const requests = Object.entries(endpointConfig.path).map(([key, endpoint]) =>
        requestApi({
          baseURL,
          endpoint: typeof endpoint === 'function' ? endpoint(user) : endpoint,
        }).then((response) => ({
          key,
          ...response,
        }))
      )

      Promise.all(requests)
        .then((responses) => {
          const result = {}

          responses.forEach(({ key, status, data }) => {
            if (status >= 200 && status < 300) {
              result[key] = data.data || data
            } else {
              result[key] = []
            }
          })

          setModuleData(result)
        })
        .catch((error) => {
          setModuleData([])
          console.error('error', error)
        })

      return
    }

    // Endpoint simple
    requestApi({
      baseURL,
      endpoint: endpointConfig.path,
      params: parametros,
    })
      .then(({ status, data }) => {
        if (status >= 200 && status < 300) {
          setModuleData(data.data || data)
        }
      })
      .catch((error) => {
        setModuleData([])
        console.error('error', error)
      })
  }, [currentModule, refreshKey])

  const isHome = location.pathname === '/home'

  const handleFormSelected = (formName) => {}

  /*useEffect(() => {
  //setFormConfig(formConfigJson)
  /*Persistencia despues del refresco */
  //localStorage.setItem('formData', JSON.stringify(formData))
  //}, [formData])

  const selectedConfig = COMPONENT_CONFIGS[location.pathname] ?? {}

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
              <Outlet
                context={{
                  type: selectedConfig.type,
                  formConfig: selectedConfig.config,
                  formData: moduleData,
                  modalConfig: selectedConfig?.modalConfig,
                  refreshModule,
                }}
              />
            </div>
          ) : (
            <Outlet
              context={{
                type: selectedConfig.type,
                formConfig: selectedConfig.config,
                formData: moduleData,
                modalConfig: selectedConfig?.modalConfig,
                refreshModule,
              }}
            />
          )}
        </div>
      </main>
      <BarraInferior onMenu={() => setSidebarOpen(true)} />
      <AnfitrionExperiencia />
      <PaletaComandos abierta={paleta} onAbrir={() => setPaleta(true)} onCerrar={() => setPaleta(false)} />
      <section>
        <Toaster
          position="top-right"
          toastOptions={{
            success: {
              duration: 5000,
            },
            error: {
              duration: 7000,
            },

            className: 'text-[15px] px-4 py-3',
            style: {
              borderRadius: '12px',
            },
          }}
        />
        {/*children,
  show,
  title = 'Confirma esta acción',
  message = '¿Seguro que deseas continuar?',
  icon: Icon,
  variant = 'warning', // warning | danger | success | info
  confirmLabel = 'Enviar',
  onClose,
  onConfirm,
        */}

        <LogoutModal
          show={showLogout}
          message="Guarde sus cambios antes de continuar"
          title="¿Confirma Cerrar Sesión ?"
          confirmLabel="Salir"
          onClose={() => setShowLogout(false)}
          onConfirm={() => {
            logout()
            navigate('/')
          }}
        />
      </section>
    </div>
  )
}

export default Home
