// ─────────────────────────────────────────────────────────────────────────────
// EQUIPO SIN LICENCIA: sin licencia válida (o vencida y pasada la gracia) SPVI no permite trabajar.
// Aquí el administrador pega o elige su archivo .lic y lo activa; los demás usuarios ven a quién pedírselo.
// ─────────────────────────────────────────────────────────────────────────────
import { useContext, useEffect, useState } from 'react'
import { FileKey, LogOut } from 'lucide-react'
import api from '../../services/api'
import { AuthContext } from '../../context/AuthContext'
import { useMarca } from '../../hooks/useMarca'
import { usePermisos } from '../../hooks/usePermisos'
import { showToast } from '../../utils/showToast'
import { errorApi } from '../pos/formato'
import FirmaAlexus from '../comun/FirmaAlexus'
import CodigoEquipo from './CodigoEquipo'

export default function LicenciaRequerida({ motivo }) {
  const { logout } = useContext(AuthContext)
  const { puede } = usePermisos()
  const marca = useMarca()
  const [token, setToken] = useState('')
  const [error, setError] = useState(null)
  const [activando, setActivando] = useState(false)
  const administra = puede('config.parametros')
  const [codigo, setCodigo] = useState(null)
  useEffect(() => { if (administra) api.get('/licencia').then(({ data }) => setCodigo(data.data?.codigoEquipo ?? null)).catch(() => {}) }, [administra])

  const leerArchivo = (archivo) => {
    if (!archivo) return
    if (archivo.size > 20_000) { setError('Ese archivo no parece una licencia de SPVI.'); return }
    const r = new FileReader()
    r.onload = () => { setToken(String(r.result).trim()); setError(null) }
    r.readAsText(archivo)
  }
  const activar = async () => {
    setActivando(true); setError(null)
    try {
      const { data } = await api.put('/licencia', { token: token.trim() })
      showToast({ type: 'success', message: `${data.message ?? 'Licencia activada'}. Inicie sesión de nuevo para empezar a trabajar.` })
      setTimeout(() => logout(), 1500) // el nuevo inicio de sesión trae los módulos de la licencia recién activada
    } catch (e) { setError(errorApi(e).mensaje) } finally { setActivando(false) }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
      <section className="mac-ventana w-full max-w-lg rounded-2xl bg-white p-6 shadow-lg" aria-labelledby="lic-titulo">
        <div className="flex items-center gap-3">
          <img src={marca.logo} alt="" className="h-10 w-10 rounded-lg object-contain" />
          <div><p className="text-sm text-gray-500">{marca.nombre}</p><h1 id="lic-titulo" className="text-xl font-semibold">Active la licencia de SPVI</h1></div>
        </div>
        <p className="mt-4 rounded-control bg-amber-50 px-3 py-2 text-sm text-amber-900" role="alert">{motivo || 'Este equipo necesita una licencia de SPVI para empezar a trabajar.'}</p>
        {administra ? (
          <div className="mt-4 space-y-3">
            <CodigoEquipo codigo={codigo} />
            <label className="block text-sm">Pegue aquí el texto de la licencia
              <textarea value={token} onChange={(e) => { setToken(e.target.value); setError(null) }} rows={4} spellCheck={false} className="mt-1 w-full rounded-control border px-3 py-2 font-mono text-xs" placeholder="eyJ2IjoxLCJlbXByZXNhIjoi…" />
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-green-800 underline">
              <FileKey className="h-4 w-4" aria-hidden /> o elija el archivo .lic
              <input type="file" accept=".lic,.txt,text/plain" className="sr-only" onChange={(e) => leerArchivo(e.target.files?.[0])} />
            </label>
            {error && <p className="rounded-control bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{error}</p>}
            <button type="button" disabled={!token.trim() || activando} onClick={activar} className="w-full rounded-control bg-green-600 px-4 py-2.5 font-medium text-white disabled:opacity-50">{activando ? 'Verificando…' : 'Activar licencia'}</button>
          </div>
        ) : (
          <p className="mt-4 text-sm text-gray-700">Pida al administrador del sistema que active la licencia de este equipo. Mientras tanto no se puede trabajar en SPVI.</p>
        )}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm">
          <span className="text-gray-500">¿No tiene licencia? Escriba a <a className="underline" href="mailto:ventas@alexusgt.com">ventas@alexusgt.com</a></span>
          <button type="button" onClick={logout} className="inline-flex items-center gap-1.5 rounded-control border px-3 py-1.5 hover:bg-gray-50"><LogOut className="h-4 w-4" aria-hidden /> Cerrar sesión</button>
        </div>
        <div className="mt-4 flex justify-center"><FirmaAlexus siempre /></div>
      </section>
    </main>
  )
}
