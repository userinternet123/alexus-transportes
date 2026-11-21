// Envíos: todo lo que el piloto reportó y en qué quedó (por enviar, enviado, por revisar), con su motivo.
import { Ionicons } from '@expo/vector-icons'
import { Alert, StyleSheet, Text, View } from 'react-native'
import { Boton, Etiqueta, Pantalla, Tarjeta } from '../../src/componentes/ui'
import { useConexion } from '../../src/offline/conexion'
import { haceCuanto, paraReintentar, type Pendiente } from '../../src/offline/logica'
import { color } from '../../src/tema'

const ESTADO = {
  pendiente: { texto: 'Por enviar', fondo: color.alertaSuave, tinta: color.alerta, icono: 'time-outline' as const },
  enviada: { texto: 'Enviado', fondo: color.acentoSuave, tinta: color.acentoOscuro, icono: 'checkmark-circle-outline' as const },
  rechazada: { texto: 'Por revisar', fondo: color.peligroSuave, tinta: color.peligro, icono: 'alert-circle-outline' as const },
}

export default function Envios() {
  const { cola, sincronizar, sincronizando, guardar, descartar, enLinea } = useConexion()
  const orden = { rechazada: 0, pendiente: 1, enviada: 2 }
  const lista = [...cola].sort((a, b) => orden[a.estado] - orden[b.estado] || b.creado - a.creado)
  const confirmarDescartar = (p: Pendiente) => Alert.alert('Descartar este reporte', `«${p.titulo}» y sus fotos se borran del teléfono. No llegará al servidor.`, [
    { text: 'Cancelar', style: 'cancel' }, { text: 'Descartar', style: 'destructive', onPress: () => { descartar(p) } },
  ])
  return (
    <Pantalla refrescar={sincronizar} refrescando={sincronizando}>
      {!lista.length && <Tarjeta><Text style={s.vacio}>Aquí verá lo que reporte: se envía solo, con o sin señal.</Text></Tarjeta>}
      {lista.some((p) => p.estado === 'pendiente') && <Boton texto={sincronizando ? 'Enviando…' : enLinea === false ? 'Sin señal: reintentar' : 'Enviar ahora'} icono="cloud-upload" variante="secundario" onPress={sincronizar} cargando={sincronizando} />}
      {lista.map((p) => {
        const e = ESTADO[p.estado]
        return (
          <View key={p.clave} style={s.fila}>
            <View style={s.arriba}>
              <Ionicons name={e.icono} size={22} color={e.tinta} />
              <Text style={s.titulo}>{p.titulo}</Text>
            </View>
            <View style={s.arriba}>
              <Etiqueta texto={e.texto} colorFondo={e.fondo} colorTexto={e.tinta} />
              <Text style={s.sub}>{haceCuanto(p.creado)}{p.fotos.length ? ` · ${p.fotos.length} foto(s)${p.estado === 'pendiente' && p.fotos.some((f) => f.archivoId) ? `, ${p.fotos.filter((f) => f.archivoId).length} ya subidas` : ''}` : ''}</Text>
            </View>
            {p.resultado && <Text style={s.mensaje}>{p.resultado.mensaje}</Text>}
            {p.error && <Text style={[s.mensaje, { color: p.estado === 'rechazada' ? color.peligro : color.alerta }]}>{p.error}</Text>}
            {p.estado === 'rechazada' && (
              <View style={{ gap: 8 }}>
                {p.codigoError === 'SALTO_ODOMETRO' && <Boton texto="El odómetro es correcto, reenviar" onPress={() => guardar(paraReintentar(p, { confirmarSalto: true }))} />}
                <Boton texto="Reintentar (ya lo corregí)" variante="secundario" onPress={() => guardar(paraReintentar(p))} />
                <Boton texto="Descartar" variante="secundario" onPress={() => confirmarDescartar(p)} />
              </View>
            )}
          </View>
        )
      })}
    </Pantalla>
  )
}

const s = StyleSheet.create({
  vacio: { fontSize: 16, color: color.secundario, textAlign: 'center' },
  fila: { backgroundColor: color.superficie, borderRadius: 16, padding: 14, gap: 8 },
  arriba: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  titulo: { fontSize: 16, fontWeight: '600', color: color.texto, flex: 1 },
  sub: { fontSize: 13, color: color.secundario },
  mensaje: { fontSize: 14, color: color.texto },
})
