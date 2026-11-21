// Guardar un reporte en la cola (con sus fotos) desde cualquier formulario.
import { useRouter } from 'expo-router'
import { Alert } from 'react-native'
import { borrarVistas } from './fotos'
import type { FotoTomada } from './componentes/Fotos'
import { nuevoId } from './id'
import { useConexion } from './offline/conexion'
import { nuevoPendiente, type TipoEnvio } from './offline/logica'
import { useSesion } from './sesion'

export function useGuardarReporte() {
  const { perfil, sucursalId } = useSesion()
  const { encolar, enLinea } = useConexion()
  const router = useRouter()
  return async (d: { tipo: TipoEnvio; titulo: string; viajeId?: number | null; carga: Record<string, unknown>; fotos?: FotoTomada[] }) => {
    if (!perfil || !sucursalId) throw new Error('Inicie sesión de nuevo')
    const fotos = d.fotos ?? []
    await encolar(nuevoPendiente({ clave: nuevoId(), tipo: d.tipo, sucursal: sucursalId, usuario: perfil.id, titulo: d.titulo, viajeId: d.viajeId ?? null, carga: d.carga, fotos: fotos.map((f) => f.foto) }))
    borrarVistas(fotos.map((f) => f.vista))
    Alert.alert('Guardado', enLinea === false ? 'Se enviará solo en cuanto haya señal. Puede seguir trabajando.' : 'Se está enviando. Si se corta la señal, se envía después solo.')
    router.back()
  }
}
