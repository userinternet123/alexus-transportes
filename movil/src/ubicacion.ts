// Ubicación del celular para los reportes. Nunca detiene un reporte: si no hay permiso o tarda, se envía sin ubicación.
import * as Location from 'expo-location'

export interface Ubicacion { latitud: number; longitud: number; precisionM: number | null }

const conTiempo = <T>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))])

export async function ubicacionActual(espera = 8000): Promise<Ubicacion | null> {
  try {
    const permiso = await Location.getForegroundPermissionsAsync()
    const ok = permiso.granted || (permiso.canAskAgain && (await Location.requestForegroundPermissionsAsync()).granted)
    if (!ok) return null
    const pos = (await conTiempo(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), espera))
      ?? (await Location.getLastKnownPositionAsync({ maxAge: 10 * 60_000 }))
    if (!pos) return null
    return { latitud: Number(pos.coords.latitude.toFixed(6)), longitud: Number(pos.coords.longitude.toFixed(6)), precisionM: pos.coords.accuracy != null ? Math.round(pos.coords.accuracy) : null }
  } catch {
    return null
  }
}
