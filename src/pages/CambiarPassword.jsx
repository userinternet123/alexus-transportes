// Pantalla de cambio de contraseña (obligatoria en el primer ingreso o tras un reset).
// Ruta pública de nivel superior: /cambiar-password
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { KeyRound } from 'lucide-react'
import api, { sesion } from '../services/api'
import { showToast } from '../utils/showToast'

const reglas = [
  { ok: (p) => p.length >= 10, texto: 'Al menos 10 caracteres' },
  { ok: (p) => /[A-Za-z]/.test(p), texto: 'Al menos una letra' },
  { ok: (p) => /\d/.test(p), texto: 'Al menos un número' },
]

export default function CambiarPassword() {
  const navigate = useNavigate()
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [enviando, setEnviando] = useState(false)
  const valida = reglas.every((r) => r.ok(nueva)) && nueva === confirmar && nueva !== actual

  const enviar = async (e) => {
    e.preventDefault()
    setEnviando(true)
    try {
      const { data } = await api.post('/auth/cambiar-password', { actual, nueva })
      sesion.guardar(data)
      showToast({ type: 'success', message: 'Contraseña actualizada' })
      navigate('/home')
    } catch (err) {
      showToast({ type: 'error', message: err.response?.data?.message ?? err.message })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <form onSubmit={enviar} className="w-full max-w-sm rounded-xl border bg-white p-6">
        <KeyRound className="h-8 w-8 text-green-700" aria-hidden />
        <h1 className="mt-2 text-xl font-semibold">Cambie su contraseña</h1>
        <p className="mt-1 text-sm text-gray-600">Por seguridad, defina una contraseña personal antes de continuar.</p>
        {[['actual', 'Contraseña actual', actual, setActual], ['nueva', 'Nueva contraseña', nueva, setNueva], ['confirmar', 'Confirmar nueva contraseña', confirmar, setConfirmar]].map(([id, label, valor, set]) => (
          <div key={id} className="mt-3">
            <label htmlFor={id} className="block text-sm">{label}</label>
            <input id={id} type="password" required value={valor} onChange={(e) => set(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" autoComplete={id === 'actual' ? 'current-password' : 'new-password'} />
          </div>
        ))}
        <ul className="mt-3 space-y-1 text-xs">
          {reglas.map((r) => <li key={r.texto} className={r.ok(nueva) ? 'text-green-700' : 'text-gray-500'}>{r.ok(nueva) ? '✓' : '•'} {r.texto}</li>)}
          {confirmar && nueva !== confirmar && <li className="text-red-600">Las contraseñas no coinciden</li>}
        </ul>
        <button disabled={!valida || enviando} className="mt-5 w-full rounded-lg bg-green-700 py-2 font-semibold text-white disabled:opacity-50">
          {enviando ? 'Guardando…' : 'Guardar y continuar'}
        </button>
      </form>
    </main>
  )
}
