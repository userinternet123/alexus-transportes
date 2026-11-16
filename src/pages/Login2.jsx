import { useContext, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { AuthContext } from '../context/AuthContext'

function Login() {
  const {login} = useContext(AuthContext)
  const navigate = useNavigate()

  const [codigo, setCodigo] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = (e)=>{
    e.preventDefault()

    if(codigo && password){
      login({nombre: 'Juan', codigo})
      navigate('/home')
    }
  }
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      
      <div className="bg-white w-full max-w-md p-10 rounded-xl shadow-lg">
        
        <h2 className="text-2xl font-bold mb-6 text-gray-800">
          ¡Bienvenido!
        </h2>

        <form className="space-y-5">

          {/* Código */}
          <div>
            <label className="block text-sm text-gray-600 mb-2">
              Código de colaborador
            </label>

            <div className="relative">
              
              {/* SVG usuario */}
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              >
                <path d="M8 7a4 4 0 1 0 8 0" />
                <path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
              </svg>

              <input
                type="text"
                placeholder="Ingrese su código"
                className="w-full h-11 pl-10 pr-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600"
              />
            </div>
          </div>

          {/* Contraseña */}
          <div>
            <label className="block text-sm text-gray-600 mb-2">
              Contraseña
            </label>

            <div className="relative">

              {/* SVG contraseña */}
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              >
                <path d="M12 17v.01" />
                <path d="M15 9V7a3 3 0 1 0-6 0v2" />
                <rect x="5" y="9" width="14" height="12" rx="2" />
              </svg>

              <input
                type="password"
                placeholder="Ingrese su contraseña"
                className="w-full h-11 pl-10 pr-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600"
              />
            </div>
          </div>

          {/* Botón */}
          <button className="w-full h-11 bg-green-700 text-white rounded-lg hover:bg-green-800 transition">
            Ingresar
          </button>

        </form>

        {/* Ayuda */}
        <div className="mt-6 text-center text-xs text-gray-500">
          <p>¿Problemas con tu contraseña?</p>
          <p><strong>Guatemala:</strong> 200120, 300644, 800612</p>
          <p><strong>Honduras:</strong> 499415</p>
        </div>

      </div>
    </div>
  )
}

export default Login