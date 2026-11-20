// Conexión con el servidor y sincronización: envía la cola (fotos primero) y mantiene «mi día» al día.
import axios from 'axios'
import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { almacen, api } from '../api'
import { useSesion } from '../sesion'
import { almacenCola, guardarCache, leerCache, leerFoto, borrarFotos, limpiar } from './almacen'
import { procesarCola, type MiDia, type Pendiente, type PuntoInspeccion, type Transporte } from './logica'

const CADA = 45_000

/** ¿Responde el servidor? No basta con tener internet: puede faltar Tailscale o el servidor estar apagado. */
export async function servidorResponde() {
  const s = await almacen.servidor()
  if (!s) return false
  try { await axios.get(`${s}/api/v1/health`, { timeout: 5000 }); return true } catch { return false }
}

const transporte: Transporte = {
  async subirFoto(f) {
    const base64 = await leerFoto(f.clave)
    if (!base64) throw Object.assign(new Error('La foto ya no está en el teléfono'), { response: { status: 410, data: { message: 'Una foto de este reporte ya no está en el teléfono: descártelo y repórtelo de nuevo' } } })
    const { data } = await api.post('/archivos', { nombre: `${f.clave}.jpg`, mime: 'image/jpeg', base64 }, { timeout: 120_000 })
    return data.data.id as string
  },
  async enviar(ruta, cuerpo) {
    const { data } = await api.post(ruta, cuerpo, { timeout: 30_000 })
    return String(data.message ?? 'Enviado')
  },
}

interface Conexion {
  enLinea: boolean | null
  pendientes: number
  rechazadas: number
  sincronizando: boolean
  cola: Pendiente[]
  miDia: MiDia | null
  miDiaActualizado: number | null
  /** Lista de revisión de la inspección (se guarda para hacerla sin señal) */
  puntos: PuntoInspeccion[]
  /** Cambia cada vez que la cola o «mi día» cambian: las pantallas lo usan para refrescarse */
  version: number
  sincronizar: () => Promise<void>
  /** Agrega un reporte a la cola y trata de enviarlo de inmediato. */
  encolar: (p: Pendiente) => Promise<void>
  guardar: (p: Pendiente) => Promise<void>
  descartar: (p: Pendiente) => Promise<void>
}
const Ctx = createContext<Conexion>(null as unknown as Conexion)
export const useConexion = () => useContext(Ctx)

export function ProveedorConexion({ children }: { children: ReactNode }) {
  const { perfil, sucursalId } = useSesion()
  const [enLinea, setEnLinea] = useState<boolean | null>(null)
  const [cola, setCola] = useState<Pendiente[]>([])
  const [miDia, setMiDia] = useState<{ valor: MiDia; actualizado: number } | null>(null)
  const [puntos, setPuntos] = useState<PuntoInspeccion[]>([])
  const [sincronizando, setSincronizando] = useState(false)
  const [version, setVersion] = useState(0)
  const ocupado = useRef(false)
  const claveDia = sucursalId ? `midia:${sucursalId}` : null

  const recargarLocal = useCallback(async () => {
    if (!perfil || !sucursalId) { setCola([]); setMiDia(null); return }
    setCola(await almacenCola(sucursalId, perfil.id).listar())
    if (claveDia) setMiDia(await leerCache<MiDia>(claveDia))
    setPuntos((await leerCache<PuntoInspeccion[]>('puntos'))?.valor ?? [])
    setVersion((v) => v + 1)
  }, [perfil, sucursalId, claveDia])

  const sincronizar = useCallback(async () => {
    if (!perfil || !sucursalId || ocupado.current) return
    ocupado.current = true
    setSincronizando(true)
    try {
      const ok = await servidorResponde()
      setEnLinea(ok)
      if (!ok) return
      const r = await procesarCola(almacenCola(sucursalId, perfil.id), transporte)
      // Las fotos ya enviadas no se quedan en el teléfono
      await borrarFotos(r.enviados.flatMap((p) => p.fotos.map((f) => f.clave)))
      const { data } = await api.get('/viajes/mi-dia', { headers: { 'X-Sucursal-Id': String(sucursalId) } })
      if (claveDia) await guardarCache(claveDia, data.data)
      await api.get('/inspecciones/puntos', { params: { remolque: 'true' } }).then((x) => guardarCache('puntos', x.data.data)).catch(() => {})
      await limpiar(sucursalId, perfil.id)
    } catch {
      // Se reintenta en la siguiente vuelta (cada 45 s o al volver a la app)
    } finally {
      ocupado.current = false
      setSincronizando(false)
      await recargarLocal().catch(() => {})
    }
  }, [perfil, sucursalId, claveDia, recargarLocal])

  const encolar = useCallback(async (p: Pendiente) => {
    if (!perfil || !sucursalId) throw new Error('Sin sesión')
    await almacenCola(sucursalId, perfil.id).guardar(p)
    await recargarLocal()
    sincronizar()
  }, [perfil, sucursalId, recargarLocal, sincronizar])

  const guardar = useCallback(async (p: Pendiente) => {
    if (!perfil || !sucursalId) return
    await almacenCola(sucursalId, perfil.id).guardar(p)
    await recargarLocal()
    sincronizar()
  }, [perfil, sucursalId, recargarLocal, sincronizar])

  const descartar = useCallback(async (p: Pendiente) => {
    if (!perfil || !sucursalId) return
    await almacenCola(sucursalId, perfil.id).borrar(p.clave)
    await borrarFotos(p.fotos.map((f) => f.clave))
    await recargarLocal()
  }, [perfil, sucursalId, recargarLocal])

  useEffect(() => { recargarLocal().catch(() => {}) }, [recargarLocal])

  useEffect(() => {
    sincronizar()
    let reloj = setInterval(() => sincronizar(), CADA)
    const sub = AppState.addEventListener('change', (estado) => {
      clearInterval(reloj)
      if (estado === 'active') { sincronizar(); reloj = setInterval(() => sincronizar(), CADA) }
    })
    return () => { clearInterval(reloj); sub.remove() }
  }, [sincronizar])

  const valor: Conexion = {
    enLinea, cola, sincronizando, version, sincronizar, encolar, guardar, descartar,
    pendientes: cola.filter((p) => p.estado === 'pendiente').length,
    rechazadas: cola.filter((p) => p.estado === 'rechazada').length,
    miDia: miDia?.valor ?? null, miDiaActualizado: miDia?.actualizado ?? null, puntos,
  }
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}
