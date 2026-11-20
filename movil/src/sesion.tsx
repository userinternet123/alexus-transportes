// Estado de sesión de la app: perfil del usuario y sede de trabajo.
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react'
import { alCerrarSesion, almacen, api } from './api'
import { borrarConsultas } from './offline/almacen'
import { clasificarServidor, servidorPermitido } from './seguridad/servidor'
import type { Perfil } from './permisos'

interface Sesion {
  perfil: Perfil | null
  cargando: boolean
  sucursalId: number | null
  ingresar: (servidor: string, usuario: string, clave: string) => Promise<{ debeCambiar: boolean }>
  salir: () => Promise<void>
  cambiarSucursal: (id: number) => Promise<void>
}
const Ctx = createContext<Sesion>(null as unknown as Sesion)
export const useSesion = () => useContext(Ctx)

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [cargando, setCargando] = useState(true)
  const [sucursalId, setSucursalId] = useState<number | null>(null)

  const cargarPerfil = useCallback(async () => {
    const { data } = await api.get<Perfil>('/auth/me')
    const guardada = Number(await almacen.sucursal())
    const suc = data.sucursales.find((s) => s.id === guardada) ?? data.sucursales.find((s) => s.predeterminada) ?? data.sucursales[0]
    if (suc) { await almacen.setSucursal(suc.id); setSucursalId(suc.id) }
    setPerfil(data)
  }, [])

  // Al abrir la app: si hay sesión guardada, se recupera. Sin señal se sigue trabajando con el último perfil conocido.
  useEffect(() => {
    alCerrarSesion(() => setPerfil(null))
    ;(async () => {
      try {
        if (await almacen.access()) await cargarPerfil()
      } catch (e) {
        const sinRed = !(e as { response?: unknown })?.response
        if (sinRed) {
          const copia = await almacen.perfilGuardado()
          if (copia) { setPerfil(copia); setSucursalId(Number(await almacen.sucursal()) || copia.sucursales[0]?.id || null) }
        } else {
          await almacen.limpiar()
        }
      }
      setCargando(false)
    })()
  }, [cargarPerfil])

  useEffect(() => { if (perfil) almacen.guardarPerfil(perfil).catch(() => {}) }, [perfil])

  const ingresar = async (servidor: string, usuario: string, clave: string) => {
    if (!servidorPermitido(servidor)) throw new Error(clasificarServidor(servidor).mensaje)
    await almacen.setServidor(servidor)
    const { data } = await api.post('/auth/login', { username: usuario.trim().toLowerCase(), password: clave })
    await almacen.guardarTokens(data)
    await cargarPerfil()
    return { debeCambiar: Boolean(data.usuario?.cp) }
  }

  const salir = async () => {
    const refreshToken = await almacen.refresh()
    if (refreshToken) await api.post('/auth/logout', { refreshToken }).catch(() => {})
    await almacen.limpiar()
    // Fuera «mi día». Lo que falta por enviar se conserva cifrado para no perderlo.
    await borrarConsultas().catch(() => {})
    setPerfil(null)
  }

  const cambiarSucursal = async (id: number) => {
    await almacen.setSucursal(id)
    setSucursalId(id)
  }

  return <Ctx.Provider value={{ perfil, cargando, sucursalId, ingresar, salir, cambiarSucursal }}>{children}</Ctx.Provider>
}
