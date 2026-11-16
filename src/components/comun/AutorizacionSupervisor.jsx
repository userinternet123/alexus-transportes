// ─────────────────────────────────────────────────────────────────────────────
// AUTORIZACIÓN DE ENCARGADO ("override")
// Cuando el usuario no tiene un permiso (anular, devolver, quitar producto),
// un encargado escribe SUS credenciales y autoriza esa acción puntual.
// El API emite un token de un solo uso (5 min) y audita quién autorizó.
//
// Uso:
//   const { pedirAutorizacion, modalAutorizacion } = useAutorizacion()
//   const token = await pedirAutorizacion('ventas.anular', 'Anular V-DEN-15')
//   if (!token) return           // canceló
//   ...{ ..., autorizacion: token }
//   return <>{...}{modalAutorizacion}</>
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import api from '../../services/api'
import Modal from './Modal'

const DESCRIPCION = {
  'ventas.anular': 'anular un documento',
  'ventas.devolver': 'registrar una devolución',
  'ventas.quitar_linea': 'quitar o reducir productos del carrito',
}

function AutorizacionSupervisor({ permiso, detalle, onListo, onCancelar }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const enviar = async (e) => {
    e.preventDefault()
    setEnviando(true)
    setError('')
    try {
      const { data } = await api.post('/auth/autorizar', { username, password, permiso, detalle })
      onListo(data.autorizacion, data.supervisor)
    } catch (err) {
      setError(err.response?.data?.message ?? err.message)
      setPassword('')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal abierto titulo="Autorización de encargado" onCerrar={onCancelar} ancho="max-w-sm">
      <form onSubmit={enviar}>
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-green-700" aria-hidden />
          <p className="text-sm text-gray-700">
            Para <strong>{DESCRIPCION[permiso] ?? permiso}</strong> se necesita la autorización de un encargado.
            {detalle && <span className="mt-1 block text-gray-500">{detalle}</span>}
          </p>
        </div>
        <label htmlFor="sup-user" className="mt-4 block text-sm">Usuario del encargado</label>
        <input id="sup-user" autoFocus autoComplete="off" value={username} onChange={(e) => setUsername(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" />
        <label htmlFor="sup-pass" className="mt-3 block text-sm">Contraseña</label>
        <input id="sup-pass" type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" />
        {error && <p className="mt-2 text-sm text-red-600" role="alert">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancelar} className="rounded-lg border px-3 py-2">Cancelar</button>
          <button disabled={!username || !password || enviando} className="rounded-lg bg-green-700 px-4 py-2 font-semibold text-white disabled:opacity-50">
            {enviando ? 'Verificando…' : 'Autorizar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export function useAutorizacion() {
  const [solicitud, setSolicitud] = useState(null)
  const pedirAutorizacion = (permiso, detalle) => new Promise((resolve) => setSolicitud({ permiso, detalle, resolve }))
  const modalAutorizacion = solicitud && (
    <AutorizacionSupervisor
      permiso={solicitud.permiso}
      detalle={solicitud.detalle}
      onListo={(token) => { solicitud.resolve(token); setSolicitud(null) }}
      onCancelar={() => { solicitud.resolve(null); setSolicitud(null) }}
    />
  )
  return { pedirAutorizacion, modalAutorizacion }
}

export default AutorizacionSupervisor

/**
 * Ejecuta una acción del API; si responde AUTORIZACION_REQUERIDA, pide la
 * autorización del encargado y la reintenta con el token.
 * Devuelve el resultado, o null si el usuario canceló la autorización.
 *   await conAutorizacion((autorizacion) => api.post(url, { ...datos, autorizacion }), { permiso, detalle, pedir })
 */
export async function conAutorizacion(accion, { permiso, detalle, pedir }) {
  try {
    return await accion(undefined)
  } catch (e) {
    if (e.response?.data?.codigo !== 'AUTORIZACION_REQUERIDA') throw e
    const token = await pedir(permiso, detalle)
    if (!token) return null
    return accion(token)
  }
}
