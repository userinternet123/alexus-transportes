import { AnfitrionConfirmacion } from './components/comun/Confirmacion'
import ReactDOM from 'react-dom/client'
import { AuthProvider } from './context/AuthContext.jsx'
import AppRouter from './routes/AppRouter.jsx'
import { Toaster } from 'react-hot-toast'
import { BrowserRouter } from 'react-router-dom'
import { AplicarTema } from './hooks/useTema'
import { instalarCapturaErrores } from './utils/erroresWeb'
import './styles/temas.css'
import './styles/movimiento.css'
import { aplicarMovimiento } from './utils/movimiento'

aplicarMovimiento() // preferencia de animaciones guardada en este equipo

// Errores del navegador → soporte y monitoreo (SPVI Central)
instalarCapturaErrores()

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <AuthProvider>
      <AplicarTema />
      <Toaster position="top-right" />
      <AnfitrionConfirmacion />
      <AppRouter />
    </AuthProvider>
  </BrowserRouter>
)
