// Raíz de la app: sesión + conexión + navegación. Sin sesión => pantalla de ingreso.
import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useEffect } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { ProveedorConexion } from '../src/offline/conexion'
import { ProveedorSesion, useSesion } from '../src/sesion'
import { color } from '../src/tema'

function Guardia() {
  const { perfil, cargando } = useSesion()
  const segmentos = useSegments()
  const router = useRouter()

  useEffect(() => {
    if (cargando) return
    const enLogin = segmentos[0] === 'login'
    if (!perfil && !enLogin) router.replace('/login')
    if (perfil && enLogin) router.replace('/')
  }, [perfil, cargando, segmentos, router])

  if (cargando) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: color.fondo }}><ActivityIndicator color={color.acento} /></View>
  }
  const modal = { presentation: 'modal' as const, headerTintColor: color.acento }
  return (
    <Stack screenOptions={{ headerTintColor: color.acento, contentStyle: { backgroundColor: color.fondo } }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="reportar" options={{ ...modal, title: 'Reportar' }} />
      <Stack.Screen name="inspeccion" options={{ ...modal, title: 'Inspección pre viaje' }} />
      <Stack.Screen name="combustible" options={{ ...modal, title: 'Carga de combustible' }} />
      <Stack.Screen name="gasto" options={{ ...modal, title: 'Gasto del viaje' }} />
      <Stack.Screen name="caso" options={{ ...modal, title: 'Reportar un problema' }} />
    </Stack>
  )
}

export default function Raiz() {
  return (
    <ProveedorSesion>
      <ProveedorConexion>
        <StatusBar style="dark" />
        <Guardia />
      </ProveedorConexion>
    </ProveedorSesion>
  )
}
