import { Ionicons } from '@expo/vector-icons'
import { Tabs } from 'expo-router'
import { useSesion } from '../../src/sesion'
import { puede } from '../../src/permisos'
import { color } from '../../src/tema'

type Icono = keyof typeof Ionicons.glyphMap
const icono = (nombre: Icono) => ({ color: c, size }: { color: string; size: number }) => <Ionicons name={nombre} color={c} size={size} />

export default function Pestanas() {
  const { perfil } = useSesion()
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: color.acento, headerTitleStyle: { fontWeight: '600' } }}>
      <Tabs.Screen name="index" options={{ title: 'Inicio', tabBarIcon: icono('home-outline') }} />
      <Tabs.Screen name="existencias" options={{ title: 'Existencias', tabBarIcon: icono('cube-outline'), href: puede(perfil, 'productos.ver') ? undefined : null }} />
      <Tabs.Screen name="ventas" options={{ title: 'Ventas', tabBarIcon: icono('receipt-outline'), href: puede(perfil, 'ventas.ver') ? undefined : null }} />
      <Tabs.Screen name="mas" options={{ title: 'Más', tabBarIcon: icono('ellipsis-horizontal') }} />
    </Tabs>
  )
}
