// Aviso arriba de las pantallas: sin conexión con el servidor, lo que falta por enviar y lo rechazado.
import { useRouter } from 'expo-router'
import { Pressable, StyleSheet, Text } from 'react-native'
import { useConexion } from '../offline/conexion'
import { color } from '../tema'

export function BarraConexion() {
  const router = useRouter()
  const { enLinea, pendientes, rechazadas, sincronizando, sincronizar } = useConexion()
  if (enLinea !== false && !pendientes && !rechazadas) return null
  const sinRed = enLinea === false
  const partes = [
    sinRed ? 'Sin señal con el servidor' : null,
    pendientes ? `${pendientes} por enviar` : null,
    rechazadas ? `${rechazadas} por revisar` : null,
  ].filter(Boolean)
  return (
    <Pressable onPress={() => (rechazadas ? router.push('/envios') : sincronizar())} accessibilityRole="button"
      style={[s.barra, { backgroundColor: rechazadas ? color.peligroSuave : sinRed ? color.alertaSuave : color.acentoSuave }]}>
      <Text style={[s.texto, { color: rechazadas ? color.peligro : sinRed ? color.alerta : color.acentoOscuro }]}>{partes.join(' · ')}</Text>
      <Text style={[s.accion, { color: rechazadas ? color.peligro : sinRed ? color.alerta : color.acento }]}>{sincronizando ? 'Enviando…' : rechazadas ? 'Revisar' : 'Reintentar'}</Text>
    </Pressable>
  )
}

const s = StyleSheet.create({
  barra: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  texto: { flex: 1, fontSize: 15 },
  accion: { fontSize: 15, fontWeight: '600' },
})
