// Inicio: ventas y utilidad del día, estado de la caja y aviso de licencia.
import { useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { api } from '../../src/api'
import { puede } from '../../src/permisos'
import { useSesion } from '../../src/sesion'
import { color, hoyGT, Q, radio } from '../../src/tema'

interface Resumen { total: number; utilidad: number; ventas: number }

export default function Inicio() {
  const { perfil, sucursalId } = useSesion()
  const [resumen, setResumen] = useState<Resumen | null>(null)
  const [caja, setCaja] = useState<{ caja?: { nombre: string }; resumen?: { totalEsperado: string } } | null | undefined>(undefined)
  const [cargando, setCargando] = useState(false)

  const cargar = useCallback(async () => {
    setCargando(true)
    const hoy = hoyGT()
    await Promise.all([
      puede(perfil, 'reportes.ventas')
        ? api.get('/reportes/ventas-por-dia', { params: { desde: hoy, hasta: hoy } })
          .then(({ data }) => setResumen(data.data[0] ?? { total: 0, utilidad: 0, ventas: 0 })).catch(() => setResumen(null))
        : Promise.resolve(),
      puede(perfil, 'caja.operar')
        ? api.get('/caja/mi-sesion').then(({ data }) => setCaja(data.data)).catch(() => setCaja(null))
        : Promise.resolve(),
    ])
    setCargando(false)
  }, [perfil, sucursalId]) // eslint-disable-line react-hooks/exhaustive-deps

  useFocusEffect(useCallback(() => { cargar() }, [cargar]))

  const lic = perfil?.licencia
  const sucursal = perfil?.sucursales.find((s) => s.id === sucursalId)
  return (
    <ScrollView style={{ backgroundColor: color.fondo }} contentContainerStyle={s.contenido} refreshControl={<RefreshControl refreshing={cargando} onRefresh={cargar} tintColor={color.acento} />}>
      <View style={s.saludo}>
        <Text style={s.saludoSub}>{sucursal?.nombre ?? ''}</Text>
        <Text style={s.saludoTitulo}>Hola, {perfil?.nombre.split(' ')[0]}</Text>
      </View>

      {lic && (lic.modo === 'vencida' || (lic.diasRestantes != null && lic.diasRestantes <= 15)) && (
        <View style={[s.tarjeta, { backgroundColor: '#FFF4E5' }]}>
          <Text style={{ color: color.alerta }}>{lic.modo === 'vencida' ? 'La licencia venció: funciona con el plan Básico.' : `La licencia vence en ${lic.diasRestantes} días.`}</Text>
        </View>
      )}

      {resumen && (
        <View style={s.fila}>
          <View style={[s.tarjeta, s.mitad]}><Text style={s.etiqueta}>Ventas de hoy</Text><Text style={s.cifra}>{Q(resumen.total)}</Text><Text style={s.nota}>{resumen.ventas} documentos</Text></View>
          <View style={[s.tarjeta, s.mitad]}><Text style={s.etiqueta}>Utilidad</Text><Text style={s.cifra}>{Q(resumen.utilidad)}</Text></View>
        </View>
      )}
      {caja !== undefined && (
        <View style={s.tarjeta}>
          <Text style={s.etiqueta}>Mi caja</Text>
          <Text style={[s.cifra, { color: caja ? color.acento : color.secundario }]}>{caja ? 'Abierta' : 'Cerrada'}</Text>
          {caja && <Text style={s.nota}>{caja.caja?.nombre}, esperado {Q(caja.resumen?.totalEsperado)}</Text>}
        </View>
      )}
      {!resumen && caja === undefined && <Text style={s.vacio}>Use las pestañas de abajo para consultar existencias y ventas.</Text>}
    </ScrollView>
  )
}

const s = StyleSheet.create({
  contenido: { padding: 16, gap: 12 },
  saludo: { backgroundColor: color.acentoOscuro, borderRadius: radio.superficie, padding: 20 },
  saludoSub: { color: '#B7E4C7', fontSize: 14 },
  saludoTitulo: { color: '#fff', fontSize: 26, fontWeight: '700', marginTop: 2 },
  fila: { flexDirection: 'row', gap: 12 },
  mitad: { flex: 1 },
  tarjeta: { backgroundColor: color.superficie, borderRadius: radio.tarjeta, padding: 16 },
  etiqueta: { color: color.secundario, fontSize: 13 },
  cifra: { color: color.texto, fontSize: 24, fontWeight: '700', marginTop: 4, fontVariant: ['tabular-nums'] },
  nota: { color: color.secundario, fontSize: 13, marginTop: 2 },
  vacio: { color: color.secundario, textAlign: 'center', marginTop: 24 },
})
