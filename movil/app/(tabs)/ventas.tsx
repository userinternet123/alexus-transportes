// Ventas del día de la sucursal.
import { useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { api, mensajeError } from '../../src/api'
import { color, hoyGT, Q, radio } from '../../src/tema'

interface Venta {
  id: number; serie: string; numero: number; fecha: string; total: string; estado: string; felEstado: string
  cliente?: { nit: string; nombres?: string; apellidos?: string; razonSocial?: string }; vendedor?: { nombre: string }
}
const nombreCliente = (c?: Venta['cliente']) => c?.razonSocial || [c?.nombres, c?.apellidos].filter(Boolean).join(' ') || 'Consumidor final'

export default function Ventas() {
  const [ventas, setVentas] = useState<Venta[]>([])
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    setCargando(true)
    setError('')
    try {
      const { data } = await api.get('/ventas', { params: { desde: hoyGT(), hasta: hoyGT(), tipo: 'VENTA', limit: 0 } })
      setVentas(data.data)
    } catch (e) {
      setError(mensajeError(e))
    } finally { setCargando(false) }
  }, [])
  useFocusEffect(useCallback(() => { cargar() }, [cargar]))

  const confirmadas = ventas.filter((v) => v.estado === 'CONFIRMADA')
  const total = confirmadas.reduce((a, v) => a + Number(v.total), 0)

  return (
    <FlatList
      style={{ backgroundColor: color.fondo }}
      contentContainerStyle={{ padding: 16, gap: 8 }}
      data={ventas}
      keyExtractor={(v) => String(v.id)}
      refreshControl={<RefreshControl refreshing={cargando} onRefresh={cargar} tintColor={color.acento} />}
      ListHeaderComponent={
        <View style={s.resumen}>
          <Text style={s.resumenEtiqueta}>Vendido hoy</Text>
          <Text style={s.resumenTotal}>{Q(total)}</Text>
          <Text style={s.resumenNota}>{confirmadas.length} ventas confirmadas</Text>
          {error ? <Text style={{ color: '#FFD7D7', marginTop: 8 }}>{error}</Text> : null}
        </View>
      }
      ListEmptyComponent={!cargando ? <Text style={s.vacio}>Todavía no hay ventas hoy.</Text> : null}
      renderItem={({ item: v }) => (
        <View style={[s.fila, v.estado !== 'CONFIRMADA' && { opacity: 0.55 }]}>
          <View style={{ flex: 1 }}>
            <Text style={s.doc}>{v.serie}-{v.numero}{v.estado === 'ANULADA' ? '  ·  Anulada' : ''}</Text>
            <Text style={s.sub} numberOfLines={1}>{nombreCliente(v.cliente)}{v.vendedor ? `, ${v.vendedor.nombre}` : ''}</Text>
            <Text style={s.sub}>{new Date(v.fecha).toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' })}</Text>
          </View>
          <Text style={s.total}>{Q(v.total)}</Text>
        </View>
      )}
    />
  )
}

const s = StyleSheet.create({
  resumen: { backgroundColor: color.acento, borderRadius: radio.superficie, padding: 20, marginBottom: 8 },
  resumenEtiqueta: { color: '#D8F0E2', fontSize: 14 },
  resumenTotal: { color: '#fff', fontSize: 40, fontWeight: '700', fontVariant: ['tabular-nums'] },
  resumenNota: { color: '#D8F0E2', fontSize: 13 },
  fila: { flexDirection: 'row', alignItems: 'center', backgroundColor: color.superficie, borderRadius: radio.tarjeta, padding: 14 },
  doc: { fontSize: 16, fontWeight: '600', color: color.texto },
  sub: { fontSize: 13, color: color.secundario, marginTop: 2 },
  total: { fontSize: 18, fontWeight: '700', color: color.texto, fontVariant: ['tabular-nums'] },
  vacio: { color: color.secundario, textAlign: 'center', marginTop: 24 },
})
