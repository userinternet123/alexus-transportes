// Fotos de evidencia de un formulario: botón grande de cámara y miniaturas con opción de quitar.
import { Ionicons } from '@expo/vector-icons'
import { useState } from 'react'
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { tomarFoto } from '../fotos'
import type { FotoLocal } from '../offline/logica'
import { color, radio } from '../tema'

export interface FotoTomada { foto: FotoLocal; vista: string }

export function Fotos({ valor, onCambio, max = 6, destino, etiqueta = 'Tomar foto' }: { valor: FotoTomada[]; onCambio: (l: FotoTomada[]) => void; max?: number; destino?: string; etiqueta?: string }) {
  const [tomando, setTomando] = useState(false)
  const tomar = async () => {
    setTomando(true)
    try {
      const r = await tomarFoto(destino)
      if (r) onCambio([...valor, r])
    } catch (e) {
      Alert.alert('No se pudo tomar la foto', (e as Error).message)
    } finally { setTomando(false) }
  }
  return (
    <View style={s.fila}>
      {valor.map((f) => (
        <View key={f.foto.clave}>
          <Image source={{ uri: f.vista }} style={s.mini} accessibilityLabel="Foto tomada" />
          {f.foto.latitud != null && <Ionicons name="location" size={14} color={color.acento} style={s.gps} />}
          <Pressable onPress={() => onCambio(valor.filter((x) => x.foto.clave !== f.foto.clave))} style={s.quitar} accessibilityLabel="Quitar foto" hitSlop={10}>
            <Ionicons name="close" size={14} color="#fff" />
          </Pressable>
        </View>
      ))}
      {valor.length < max && (
        <Pressable onPress={tomar} disabled={tomando} style={({ pressed }) => [s.mini, s.boton, pressed && { opacity: 0.7 }]} accessibilityRole="button" accessibilityLabel={etiqueta}>
          {tomando ? <ActivityIndicator color={color.acento} /> : <><Ionicons name="camera" size={28} color={color.acento} /><Text style={s.texto}>{etiqueta}</Text></>}
        </Pressable>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  fila: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  mini: { width: 88, height: 88, borderRadius: radio.control },
  boton: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: color.acento, backgroundColor: color.acentoSuave, alignItems: 'center', justifyContent: 'center', gap: 2, padding: 4 },
  texto: { fontSize: 12, color: color.acento, textAlign: 'center' },
  quitar: { position: 'absolute', top: -6, right: -6, backgroundColor: '#333', borderRadius: 999, padding: 3 },
  gps: { position: 'absolute', bottom: 4, left: 4, backgroundColor: '#fff', borderRadius: 999, padding: 1 },
})
