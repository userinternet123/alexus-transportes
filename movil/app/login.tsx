// Ingreso: dirección del servidor (red de la tienda o Tailscale), usuario y contraseña.
import axios from 'axios'
import { useEffect, useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { almacen, mensajeError } from '../src/api'
import { useSesion } from '../src/sesion'
import { color, radio } from '../src/tema'

export default function Login() {
  const { ingresar } = useSesion()
  const [servidor, setServidor] = useState('http://')
  const [usuario, setUsuario] = useState('')
  const [clave, setClave] = useState('')
  const [estado, setEstado] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => { almacen.servidor().then((s) => s && setServidor(s)) }, [])

  const probar = async () => {
    setEstado(null)
    try {
      await axios.get(`${servidor.replace(/\/+$/, '')}/api/v1/health`, { timeout: 8000 })
      setEstado({ tipo: 'ok', texto: 'Conexión correcta con el servidor' })
    } catch (e) {
      setEstado({ tipo: 'error', texto: mensajeError(e) })
    }
  }

  const entrar = async () => {
    setEnviando(true)
    setEstado(null)
    try {
      const { debeCambiar } = await ingresar(servidor, usuario, clave)
      if (debeCambiar) setEstado({ tipo: 'error', texto: 'Debe cambiar su contraseña: hágalo una vez en el portal web y vuelva a ingresar.' })
    } catch (e) {
      setEstado({ tipo: 'error', texto: mensajeError(e) })
    } finally { setEnviando(false) }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.pantalla}>
      <View style={s.logo}><Text style={s.logoTexto}>SPVI</Text></View>
      <Text style={s.titulo}>Ingresar</Text>

      <View style={s.grupo}>
        <Text style={s.etiqueta}>Servidor</Text>
        <TextInput value={servidor} onChangeText={setServidor} autoCapitalize="none" autoCorrect={false} keyboardType="url"
          placeholder="http://100.101.102.103:8080" style={s.campo} accessibilityLabel="Dirección del servidor" />
        <Pressable onPress={probar}><Text style={s.enlace}>Probar conexión</Text></Pressable>
      </View>
      <View style={s.grupo}>
        <Text style={s.etiqueta}>Usuario</Text>
        <TextInput value={usuario} onChangeText={setUsuario} autoCapitalize="none" autoCorrect={false} style={s.campo} textContentType="username" />
        <Text style={[s.etiqueta, { marginTop: 12 }]}>Contraseña</Text>
        <TextInput value={clave} onChangeText={setClave} secureTextEntry style={s.campo} textContentType="password" onSubmitEditing={entrar} />
      </View>

      {estado && <Text style={[s.mensaje, { color: estado.tipo === 'ok' ? color.acento : color.peligro }]} accessibilityRole="alert">{estado.texto}</Text>}

      <Pressable onPress={entrar} disabled={enviando || !usuario || !clave} style={({ pressed }) => [s.boton, (enviando || !usuario || !clave) && { opacity: 0.5 }, pressed && { opacity: 0.85 }]}>
        {enviando ? <ActivityIndicator color="#fff" /> : <Text style={s.botonTexto}>Ingresar</Text>}
      </Pressable>
      <Text style={s.ayuda}>Desde fuera de la tienda, active Tailscale en el teléfono y use la dirección 100.x.x.x del servidor.</Text>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  pantalla: { flex: 1, padding: 24, justifyContent: 'center', backgroundColor: color.fondo },
  logo: { width: 64, height: 64, borderRadius: 16, backgroundColor: color.acento, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  logoTexto: { color: '#fff', fontWeight: '700', fontSize: 18 },
  titulo: { fontSize: 28, fontWeight: '700', color: color.texto, textAlign: 'center', marginTop: 16, marginBottom: 24 },
  grupo: { backgroundColor: color.superficie, borderRadius: radio.tarjeta, padding: 16, marginBottom: 16 },
  etiqueta: { fontSize: 13, color: color.secundario, marginBottom: 6 },
  campo: { fontSize: 17, color: color.texto, borderWidth: 1, borderColor: color.separador, borderRadius: radio.control, paddingHorizontal: 12, paddingVertical: 10 },
  enlace: { color: color.acento, marginTop: 10, fontSize: 15 },
  mensaje: { textAlign: 'center', marginBottom: 12, fontSize: 15 },
  boton: { backgroundColor: color.acento, borderRadius: radio.tarjeta, height: 52, alignItems: 'center', justifyContent: 'center' },
  botonTexto: { color: '#fff', fontSize: 17, fontWeight: '600' },
  ayuda: { color: color.secundario, fontSize: 13, textAlign: 'center', marginTop: 16 },
})
