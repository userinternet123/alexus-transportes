// Ingreso: dirección del servidor (Tailscale o HTTPS de la empresa), usuario y contraseña.
import axios from 'axios'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { almacen, mensajeError } from '../src/api'
import { clasificarServidor, servidorPermitido } from '../src/seguridad/servidor'
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

  const conexion = clasificarServidor(servidor)
  const probar = async () => {
    setEstado(null)
    if (!servidorPermitido(servidor)) { setEstado({ tipo: 'error', texto: conexion.mensaje }); return }
    try {
      await axios.get(`${servidor.replace(/\/+$/, '')}/api/v1/health`, { timeout: 8000 })
      setEstado({ tipo: 'ok', texto: 'Conexión correcta con el servidor' })
    } catch (e) {
      setEstado({ tipo: 'error', texto: mensajeError(e) })
    }
  }

  const entrar = async () => {
    // La contraseña NO se envía a una dirección que la mandaría sin cifrar por internet
    if (!servidorPermitido(servidor)) { setEstado({ tipo: 'error', texto: conexion.mensaje }); return }
    setEnviando(true)
    setEstado(null)
    try {
      const { debeCambiar } = await ingresar(servidor, usuario, clave)
      if (debeCambiar) setEstado({ tipo: 'error', texto: 'Debe cambiar su contraseña: pídale al despacho que lo haga con usted en el portal y vuelva a ingresar.' })
    } catch (e) {
      setEstado({ tipo: 'error', texto: mensajeError(e) })
    } finally { setEnviando(false) }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.pantalla}>
      <Image source={require('../assets/icon.png')} style={s.logo} accessibilityLabel="ALEXUS" />
      <Text style={s.marca}>ALEXUS Piloto · Transportes</Text>
      <Text style={s.titulo}>Ingresar</Text>

      <View style={s.grupo}>
        <Text style={s.etiqueta}>Servidor</Text>
        <TextInput value={servidor} onChangeText={setServidor} autoCapitalize="none" autoCorrect={false} keyboardType="url"
          placeholder="http://100.101.102.103:8080" style={s.campo} accessibilityLabel="Dirección del servidor" />
        {servidor.trim().length > 8 && conexion.nivel !== 'invalida' && (
          <Text style={{ fontSize: 13, marginTop: 6, color: conexion.nivel === 'insegura' ? color.peligro : conexion.nivel === 'red-local' ? color.alerta : color.acento }}>{conexion.mensaje}</Text>
        )}
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
      <Text style={s.ayuda}>En el camino, active Tailscale en el teléfono y use la dirección 100.x.x.x del servidor. Su usuario se lo da el despacho.</Text>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  pantalla: { flex: 1, padding: 24, justifyContent: 'center', backgroundColor: color.fondo },
  logo: { width: 72, height: 72, borderRadius: 18, alignSelf: 'center' },
  marca: { fontSize: 13, color: color.secundario, textAlign: 'center', marginTop: 8, letterSpacing: 0.3 },
  titulo: { fontSize: 28, fontWeight: '700', color: color.texto, textAlign: 'center', marginTop: 12, marginBottom: 24 },
  grupo: { backgroundColor: color.superficie, borderRadius: radio.tarjeta, padding: 16, marginBottom: 16 },
  etiqueta: { fontSize: 13, color: color.secundario, marginBottom: 6 },
  campo: { fontSize: 17, color: color.texto, borderWidth: 1, borderColor: color.separador, borderRadius: radio.control, paddingHorizontal: 12, paddingVertical: 10 },
  enlace: { color: color.acento, marginTop: 10, fontSize: 15 },
  mensaje: { textAlign: 'center', marginBottom: 12, fontSize: 15 },
  boton: { backgroundColor: color.acento, borderRadius: radio.tarjeta, height: 52, alignItems: 'center', justifyContent: 'center' },
  botonTexto: { color: '#fff', fontSize: 17, fontWeight: '600' },
  ayuda: { color: color.secundario, fontSize: 13, textAlign: 'center', marginTop: 16 },
})
