import { Ionicons } from '@expo/vector-icons'
import { Tabs } from 'expo-router'
import type { ColorValue } from 'react-native'
import { useConexion } from '../../src/offline/conexion'
import { color } from '../../src/tema'

type Icono = keyof typeof Ionicons.glyphMap
const icono = (nombre: Icono) => ({ color: c, size }: { color: ColorValue; size: number }) => <Ionicons name={nombre} color={c as string} size={size} />

export default function Pestanas() {
  const { pendientes, rechazadas } = useConexion()
  const pendiente = pendientes + rechazadas
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: color.acento, headerTitleStyle: { fontWeight: '600' }, tabBarLabelStyle: { fontSize: 13 } }}>
      <Tabs.Screen name="index" options={{ title: 'Mi día', tabBarIcon: icono('today-outline') }} />
      <Tabs.Screen name="envios" options={{ title: 'Envíos', tabBarIcon: icono('cloud-upload-outline'), tabBarBadge: pendiente || undefined, tabBarBadgeStyle: { backgroundColor: rechazadas ? color.peligro : color.alerta } }} />
      <Tabs.Screen name="mas" options={{ title: 'Más', tabBarIcon: icono('ellipsis-horizontal') }} />
    </Tabs>
  )
}
