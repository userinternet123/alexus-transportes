// Raíz de la app: sesión + navegación. Sin sesión => pantalla de ingreso.
import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useEffect } from 'react'
import { ActivityIndicator, View } from 'react-native'
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
  return (
    <Stack screenOptions={{ headerTintColor: color.acento, contentStyle: { backgroundColor: color.fondo } }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="escaner" options={{ presentation: 'modal', title: 'Escanear código' }} />
    </Stack>
  )
}

export default function Raiz() {
  return (
    <ProveedorSesion>
      <StatusBar style="dark" />
      <Guardia />
    </ProveedorSesion>
  )
}
