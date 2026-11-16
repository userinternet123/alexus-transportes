// Escáner de códigos de barras con la cámara del teléfono.
import { CameraView, useCameraPermissions } from 'expo-camera'
import { useRouter } from 'expo-router'
import { useRef } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { entregarCodigo } from '../src/escaneo'
import { color, radio } from '../src/tema'

export default function Escaner() {
  const router = useRouter()
  const [permiso, pedirPermiso] = useCameraPermissions()
  const leido = useRef(false)

  if (!permiso) return <View style={s.centro} />
  if (!permiso.granted) {
    return (
      <View style={s.centro}>
        <Text style={s.texto}>SPVI necesita la cámara para leer códigos de barras.</Text>
        <Pressable onPress={pedirPermiso} style={s.boton}><Text style={s.botonTexto}>Permitir cámara</Text></Pressable>
      </View>
    )
  }
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'qr'] }}
        onBarcodeScanned={({ data }) => {
          if (leido.current) return // evita lecturas repetidas mientras se cierra
          leido.current = true
          entregarCodigo(data)
          router.back()
        }}
      />
      <View style={s.marco} pointerEvents="none" />
      <Text style={s.ayuda}>Centre el código de barras en el recuadro</Text>
    </View>
  )
}

const s = StyleSheet.create({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: color.fondo },
  texto: { fontSize: 17, textAlign: 'center', color: color.texto, marginBottom: 16 },
  boton: { backgroundColor: color.acento, borderRadius: radio.tarjeta, paddingHorizontal: 20, paddingVertical: 14 },
  botonTexto: { color: '#fff', fontSize: 17, fontWeight: '600' },
  marco: { position: 'absolute', top: '35%', left: '10%', right: '10%', height: 160, borderWidth: 3, borderColor: '#fff', borderRadius: radio.tarjeta },
  ayuda: { position: 'absolute', bottom: 48, left: 0, right: 0, textAlign: 'center', color: '#fff', fontSize: 15 },
})
