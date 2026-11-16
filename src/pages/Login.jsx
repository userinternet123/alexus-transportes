import { useContext, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AuthContext } from '../context/AuthContext'
import { requestApi } from '../services/consulta'

import { login as loginApi } from '../services/authService'
import { LogIn } from 'lucide-react'
import { useMarca } from '../hooks/useMarca'
import Anuncios from '../components/central/Anuncios'
import FirmaAlexus from '../components/comun/FirmaAlexus'

function Login() {
  const { login } = useContext(AuthContext)
  const marca = useMarca()

  const navigate = useNavigate()

  const [codigo, setCodigo] = useState('')
  const [password, setPassword] = useState('')

  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  /*const [clientInfo, setClientInfo] = useState(false)

  useEffect(() => {
    const info = {
      userAgent: navigator.userAgent,
      language: navigator.language,
      languages: navigator.languages,
      cookieEnabled: navigator.cookieEnabled,
      hardwareConcurrency: navigator.hardwareConcurrency,
      maxTouchPoints: navigator.maxTouchPoints,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
    }

    setClientInfo(info)

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setClientInfo((prev) => ({
          ...prev,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }))
      },
      (error) => {
        console.error('Location denied:', error)
      }
    )
  }, [])*/

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    if (!codigo || !password) {
      setError('Ingrese su usuario y contraseña')
      setLoading(false)
      return
    }

    try {
      // Login real contra SPVI 2.0 (JWT). El perfil trae permisos y sucursales.
      const usuario = await loginApi(codigo.trim(), password)
      login({ usuario, roles: [], permisos: usuario.permisos })
      navigate(usuario.debeCambiarPassword ? '/cambiar-password' : '/home')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-max">
      <img
        src={marca.fondoLogin}
        alt=""
        className="fixed inset-0 w-full h-full pointer-events-none select-none z-0 object-cover"
      />
      <div className=" relative z-10  min-h-screen flex items-center bg-transparent justify-center  p-4">
        <div className="w-full max-w-lg  bg-white/50 backdrop-blur-sm p-9 border rounded-xl shadow-lg">
          <div className="flex items-center justify-center ">
            <img src={marca.logo} className="max-h-28 w-auto object-contain" alt={marca.nombre} />
          </div>
          <h2 className="text-2xl font-bold mb-2 text-gray-800 text-center mt-2">¡Bienvenido!</h2>
          <h3 className="font-semibold mb-6 text-gray-800 text-center">
            {marca.nombre}
            {marca.eslogan && <span className="block text-sm font-normal text-gray-600">{marca.eslogan}</span>}
          </h3>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Código */}
            <div>
              <label className="block mb-2 font-semibold  text-gray-600">
                Usuario
              </label>

              <div className="relative">
                <svg
                  className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                >
                  <path d="M8 7a4 4 0 1 0 8 0" />
                  <path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
                </svg>

                <input
                  type="text"
                  placeholder="Ingrese su usuario"
                  autoComplete="username"
                  className="w-full h-11 pl-10 pr-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600"
                  onChange={(e) => setCodigo(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Contraseña */}
            <div>
              <label className="block mb-2 font-semibold text-gray-600">Contraseña</label>

              <div className="relative">
                <svg
                  className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                >
                  <path d="M12 17v.01" />
                  <path d="M15 9V7a3 3 0 1 0-6 0v2" />
                  <rect x="5" y="9" width="14" height="12" rx="2" />
                </svg>

                <input
                  type="password"
                  placeholder="Ingrese su contraseña"
                  autoComplete="current-password"
                  className="w-full h-11 pl-10 pr-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600"
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            {/* Botón */}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 flex items-center gap-2 justify-center bg-[#013d24] text-white rounded-lg hover:bg-green-1000 transition-all duration-150 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  Ingresar
                </>
              )}
            </button>
          </form>
          {/* Avisos del proveedor (mantenimiento, novedades) */}
          <div className="mt-4"><Anuncios ubicacion="login" /></div>
          <div className="mt-6 flex justify-center"><FirmaAlexus siempre /></div>

          {/* Ayuda */}
          {/*<div className="mt-6 text-center text-xs  border-t border-border py-5 text-gray-500">
            <p>¿Problemas con tu contraseña?</p>
            <p>
              <strong>Guatemala:</strong> 200120, 300644, 800612
            </p>
            <p>
              <strong>Honduras:</strong> 499415
            </p>
          </div>*/}
        </div>
      </div>
    </div>
  )
}

export default Login
