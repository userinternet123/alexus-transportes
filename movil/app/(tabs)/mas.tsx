// Más: sucursal de trabajo, servidor, plan y cerrar sesión.
import { useEffect, useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { almacen } from '../../src/api'
import { useSesion } from '../../src/sesion'
import { color, radio } from '../../src/tema'

export default function Mas() {
  const { perfil, sucursalId, cambiarSucursal, salir } = useSesion()
  const [servidor, setServidor] = useState('')
  useEffect(() => { almacen.servidor().then((s) => setServidor(s ?? '')) }, [])

  const confirmarSalida = () => Alert.alert('Cerrar sesión', '¿Desea salir de SPVI en este teléfono?', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Cerrar sesión', style: 'destructive', onPress: () => { salir() } },
  ])

  return (
    <ScrollView style={{ backgroundColor: color.fondo }} contentContainerStyle={{ padding: 16, gap: 20 }}>
      <View>
        <Text style={s.titulo}>Cuenta</Text>
        <View style={s.grupo}>
          <Text style={s.fila}>{perfil?.nombre}</Text>
          <Text style={[s.fila, s.sub]}>Usuario {perfil?.username}{perfil?.licencia ? `, plan ${perfil.licencia.plan}` : ''}</Text>
        </View>
      </View>

      {(perfil?.sucursales.length ?? 0) > 1 && (
        <View>
          <Text style={s.titulo}>Sucursal de trabajo</Text>
          <View style={s.grupo}>
            {perfil!.sucursales.map((suc, i) => (
              <Pressable key={suc.id} onPress={() => cambiarSucursal(suc.id)} style={[s.opcion, i > 0 && s.separada]} accessibilityRole="radio" accessibilityState={{ checked: suc.id === sucursalId }}>
                <Text style={s.fila}>{suc.nombre}</Text>
                {suc.id === sucursalId && <Text style={{ color: color.acento, fontSize: 17 }}>✓</Text>}
              </Pressable>
            ))}
          </View>
        </View>
      )}

      <View>
        <Text style={s.titulo}>Servidor</Text>
        <View style={s.grupo}><Text style={[s.fila, s.sub]}>{servidor}</Text></View>
      </View>

      <Pressable onPress={confirmarSalida} style={[s.grupo, { alignItems: 'center', paddingVertical: 14 }]}>
        <Text style={{ color: color.peligro, fontSize: 17 }}>Cerrar sesión</Text>
      </Pressable>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  titulo: { fontSize: 13, color: color.secundario, marginBottom: 6, marginLeft: 4 },
  grupo: { backgroundColor: color.superficie, borderRadius: radio.tarjeta, paddingHorizontal: 16, paddingVertical: 4 },
  fila: { fontSize: 17, color: color.texto, paddingVertical: 8 },
  sub: { fontSize: 15, color: color.secundario },
  opcion: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  separada: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.separador },
})
