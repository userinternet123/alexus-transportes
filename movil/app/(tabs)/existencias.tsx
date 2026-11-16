// Existencias: buscar por nombre o escanear el código de barras con la cámara.
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { almacen, api, mensajeError } from '../../src/api'
import { esperarCodigo } from '../../src/escaneo'
import { color, Q, radio } from '../../src/tema'

interface Producto {
  id: number; sku: string; codigoBarra: string | null; nombre: string; precioVenta: string; existencia: string
  stockMinimo: string; manejaInventario: boolean; imagenId: string | null; marca?: { nombre: string } | null
}

export default function Existencias() {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [lista, setLista] = useState<Producto[]>([])
  const [servidor, setServidor] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { almacen.servidor().then((s) => setServidor(s ?? '')) }, [])

  const buscar = async (texto: string) => {
    if (texto.trim().length < 2) { setLista([]); return }
    setCargando(true)
    setError('')
    try {
      const { data } = await api.get('/productos', { params: { q: texto.trim(), limit: 30 } })
      setLista(data.data)
    } catch (e) {
      setError(mensajeError(e))
    } finally { setCargando(false) }
  }
  useEffect(() => { const t = setTimeout(() => buscar(q), 350); return () => clearTimeout(t) }, [q])

  const escanear = () => {
    esperarCodigo((codigo) => setQ(codigo))
    router.push('/escaner')
  }

  const estado = (p: Producto) => {
    const n = Number(p.existencia)
    if (!p.manejaInventario) return { texto: 'Servicio', color: color.secundario }
    if (n <= 0) return { texto: 'Agotado', color: color.peligro }
    if (n <= Number(p.stockMinimo)) return { texto: `Quedan ${n}`, color: color.alerta }
    return { texto: `${n} en existencia`, color: color.secundario }
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.fondo }}>
      <View style={s.barra}>
        <View style={s.buscador}>
          <Ionicons name="search" size={18} color={color.secundario} />
          <TextInput value={q} onChangeText={setQ} placeholder="Nombre, SKU o código" style={s.entrada} autoCorrect={false} returnKeyType="search" accessibilityLabel="Buscar producto" />
        </View>
        <Pressable onPress={escanear} style={s.escanear} accessibilityLabel="Escanear código de barras">
          <Ionicons name="barcode-outline" size={24} color="#fff" />
        </Pressable>
      </View>
      {cargando && <ActivityIndicator color={color.acento} style={{ marginTop: 16 }} />}
      {error ? <Text style={s.error}>{error}</Text> : null}
      <FlatList
        data={lista}
        keyExtractor={(p) => String(p.id)}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        ListEmptyComponent={!cargando && q.trim().length >= 2 ? <Text style={s.vacio}>Sin productos para «{q}»</Text> : null}
        renderItem={({ item: p }) => {
          const e = estado(p)
          return (
            <View style={s.tarjeta}>
              {p.imagenId
                ? <Image source={{ uri: `${servidor}/api/v1/archivos/publico/${p.imagenId}` }} style={s.foto} />
                : <View style={[s.foto, s.sinFoto]}><Text style={s.iniciales}>{p.nombre.split(' ').slice(0, 2).map((x) => x[0]).join('').toUpperCase()}</Text></View>}
              <View style={{ flex: 1 }}>
                <Text style={s.nombre} numberOfLines={2}>{p.nombre}</Text>
                <Text style={s.sub}>{p.sku}{p.marca?.nombre ? `, ${p.marca.nombre}` : ''}</Text>
                <View style={s.pie}>
                  <Text style={s.precio}>{Q(p.precioVenta)}</Text>
                  <Text style={{ color: e.color, fontSize: 13, fontWeight: '500' }}>{e.texto}</Text>
                </View>
              </View>
            </View>
          )
        }}
      />
    </View>
  )
}

const s = StyleSheet.create({
  barra: { flexDirection: 'row', gap: 8, padding: 16, paddingBottom: 0 },
  buscador: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: color.superficie, borderRadius: radio.control, paddingHorizontal: 12 },
  entrada: { flex: 1, fontSize: 17, paddingVertical: 10, color: color.texto },
  escanear: { width: 48, borderRadius: radio.control, backgroundColor: color.acento, alignItems: 'center', justifyContent: 'center' },
  tarjeta: { flexDirection: 'row', gap: 12, backgroundColor: color.superficie, borderRadius: radio.tarjeta, padding: 12 },
  foto: { width: 64, height: 64, borderRadius: radio.control },
  sinFoto: { backgroundColor: color.acentoSuave, alignItems: 'center', justifyContent: 'center' },
  iniciales: { color: color.acento, fontWeight: '700', fontSize: 18 },
  nombre: { fontSize: 16, fontWeight: '600', color: color.texto },
  sub: { fontSize: 13, color: color.secundario, marginTop: 2 },
  pie: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 6 },
  precio: { fontSize: 18, fontWeight: '700', color: color.texto, fontVariant: ['tabular-nums'] },
  error: { color: color.peligro, textAlign: 'center', margin: 16 },
  vacio: { color: color.secundario, textAlign: 'center', marginTop: 32 },
})
