// Piezas de interfaz de la app del piloto: grandes y con buen contraste (se usan con guantes, al sol, en la cabina).
import { Ionicons } from '@expo/vector-icons'
import type { ReactNode } from 'react'
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, View, type KeyboardTypeOptions, type StyleProp, type ViewStyle } from 'react-native'
import { color, radio } from '../tema'
import { BarraConexion } from './BarraConexion'

export function Pantalla({ children, refrescar, refrescando }: { children: ReactNode; refrescar?: () => void; refrescando?: boolean }) {
  return (
    <View style={{ flex: 1, backgroundColor: color.fondo }}>
      <BarraConexion />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled"
        refreshControl={refrescar ? <RefrescoControl refrescar={refrescar} refrescando={Boolean(refrescando)} /> : undefined}>
        {children}
      </ScrollView>
    </View>
  )
}

function RefrescoControl({ refrescar, refrescando }: { refrescar: () => void; refrescando: boolean }) {
  return <RefreshControl refreshing={refrescando} onRefresh={refrescar} colors={[color.acento]} tintColor={color.acento} />
}

export function Tarjeta({ children, style, titulo }: { children: ReactNode; style?: StyleProp<ViewStyle>; titulo?: string }) {
  return (
    <View>
      {titulo && <Text style={s.tituloSeccion}>{titulo}</Text>}
      <View style={[s.tarjeta, style]}>{children}</View>
    </View>
  )
}

type Variante = 'primario' | 'secundario' | 'peligro'
export function Boton({ texto, onPress, variante = 'primario', icono, deshabilitado, cargando, grande }: { texto: string; onPress: () => void; variante?: Variante; icono?: keyof typeof Ionicons.glyphMap; deshabilitado?: boolean; cargando?: boolean; grande?: boolean }) {
  const fondo = variante === 'primario' ? color.acento : variante === 'peligro' ? color.peligro : color.superficie
  const tinta = variante === 'secundario' ? color.acento : '#fff'
  return (
    <Pressable onPress={onPress} disabled={deshabilitado || cargando} accessibilityRole="button" accessibilityLabel={texto} accessibilityState={{ disabled: deshabilitado || cargando }}
      style={({ pressed }) => [s.boton, { backgroundColor: fondo, minHeight: grande ? 60 : 50 }, variante === 'secundario' && { borderWidth: 1, borderColor: color.separador }, (deshabilitado || cargando) && { opacity: 0.45 }, pressed && { opacity: 0.8 }]}>
      {cargando ? <ActivityIndicator color={tinta} /> : <>
        {icono && <Ionicons name={icono} size={grande ? 24 : 20} color={tinta} />}
        <Text style={[s.botonTexto, { color: tinta, fontSize: grande ? 19 : 17 }]}>{texto}</Text>
      </>}
    </Pressable>
  )
}

export function Campo({ etiqueta, valor, onCambio, teclado, multilinea, placeholder, ayuda, error }: { etiqueta: string; valor: string; onCambio: (t: string) => void; teclado?: KeyboardTypeOptions; multilinea?: boolean; placeholder?: string; ayuda?: string; error?: string | null }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.etiqueta}>{etiqueta}</Text>
      <TextInput value={valor} onChangeText={onCambio} keyboardType={teclado} multiline={multilinea} placeholder={placeholder} placeholderTextColor={color.secundario}
        accessibilityLabel={etiqueta} style={[s.campo, multilinea && { minHeight: 84, textAlignVertical: 'top' }, error ? { borderColor: color.peligro } : null]} />
      {error ? <Text style={{ color: color.peligro, fontSize: 13 }}>{error}</Text> : ayuda ? <Text style={s.ayuda}>{ayuda}</Text> : null}
    </View>
  )
}

export function Interruptor({ etiqueta, valor, onCambio, ayuda }: { etiqueta: string; valor: boolean; onCambio: (v: boolean) => void; ayuda?: string }) {
  return (
    <Pressable onPress={() => onCambio(!valor)} style={s.interruptor} accessibilityRole="switch" accessibilityState={{ checked: valor }} accessibilityLabel={etiqueta}>
      <View style={{ flex: 1 }}><Text style={s.textoFila}>{etiqueta}</Text>{ayuda && <Text style={s.ayuda}>{ayuda}</Text>}</View>
      <Switch value={valor} onValueChange={onCambio} trackColor={{ true: color.acento }} />
    </Pressable>
  )
}

/** Opciones como fichas grandes (una sola elegida). */
export function Fichas<T extends string>({ opciones, valor, onCambio, colorActivo }: { opciones: { valor: T; texto: string; color?: string }[]; valor: T | null; onCambio: (v: T) => void; colorActivo?: (v: T) => string | undefined }) {
  return (
    <View style={s.fichas} accessibilityRole="radiogroup">
      {opciones.map((o) => {
        const activa = o.valor === valor
        const c = colorActivo?.(o.valor) ?? o.color ?? color.acento
        return (
          <Pressable key={o.valor} onPress={() => onCambio(o.valor)} accessibilityRole="radio" accessibilityState={{ checked: activa }}
            style={[s.ficha, activa && { backgroundColor: c, borderColor: c }]}>
            <Text style={[s.fichaTexto, activa && { color: '#fff', fontWeight: '600' }]}>{o.texto}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

export function Aviso({ texto, tipo = 'alerta', icono }: { texto: string; tipo?: 'alerta' | 'peligro' | 'info'; icono?: keyof typeof Ionicons.glyphMap }) {
  const c = tipo === 'peligro' ? { fondo: color.peligroSuave, tinta: color.peligro } : tipo === 'info' ? { fondo: color.acentoSuave, tinta: color.acentoOscuro } : { fondo: color.alertaSuave, tinta: color.alerta }
  return (
    <View style={[s.aviso, { backgroundColor: c.fondo }]} accessibilityRole="alert">
      <Ionicons name={icono ?? (tipo === 'info' ? 'information-circle' : 'warning')} size={20} color={c.tinta} />
      <Text style={{ color: c.tinta, fontSize: 15, flex: 1 }}>{texto}</Text>
    </View>
  )
}

export function Etiqueta({ texto, colorFondo = color.acentoSuave, colorTexto = color.acentoOscuro }: { texto: string; colorFondo?: string; colorTexto?: string }) {
  return <View style={{ backgroundColor: colorFondo, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' }}><Text style={{ color: colorTexto, fontSize: 13, fontWeight: '600' }}>{texto}</Text></View>
}

export const s = StyleSheet.create({
  tituloSeccion: { fontSize: 13, color: color.secundario, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6, marginLeft: 4 },
  tarjeta: { backgroundColor: color.superficie, borderRadius: radio.superficie, padding: 16, gap: 12 },
  boton: { borderRadius: radio.tarjeta, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  botonTexto: { fontWeight: '600' },
  etiqueta: { fontSize: 15, color: color.texto, fontWeight: '500' },
  campo: { fontSize: 18, color: color.texto, backgroundColor: color.superficie, borderWidth: 1, borderColor: color.separador, borderRadius: radio.control, paddingHorizontal: 14, paddingVertical: 12 },
  ayuda: { fontSize: 13, color: color.secundario },
  interruptor: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  textoFila: { fontSize: 16, color: color.texto },
  fichas: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  ficha: { borderWidth: 1, borderColor: color.separador, backgroundColor: color.superficie, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 11, minHeight: 44, justifyContent: 'center' },
  fichaTexto: { fontSize: 16, color: color.texto },
  aviso: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', borderRadius: radio.tarjeta, padding: 12 },
})
