// «Mi día»: el viaje de ahora, lo que falta antes de salir, botones grandes para reportar y los casos abiertos.
// Funciona sin señal con lo último que se descargó.
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useMemo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Aviso, Boton, Etiqueta, Pantalla, Tarjeta } from '../../src/componentes/ui'
import { ESTADO_VIAJE, PRIORIDADES, textoEvento } from '../../src/constantes'
import { useConexion } from '../../src/offline/conexion'
import { antesDeSalir, haceCuanto, viajeActual, type ViajeDia } from '../../src/offline/logica'
import { puede } from '../../src/permisos'
import { useSesion } from '../../src/sesion'
import { color, fechaHora, Q, radio } from '../../src/tema'

const RAPIDOS: { tipo: string; texto: string; icono: keyof typeof Ionicons.glyphMap; solo?: 'PROGRAMADO' | 'EN_RUTA' }[] = [
  { tipo: 'SALIDA', texto: 'Salí', icono: 'navigate', solo: 'PROGRAMADO' },
  { tipo: 'EN_COLA', texto: 'En cola', icono: 'hourglass', solo: 'EN_RUTA' },
  { tipo: 'LLEGADA_DESTINO', texto: 'Llegué', icono: 'location', solo: 'EN_RUTA' },
  { tipo: 'ENTREGADO', texto: 'Entregué', icono: 'checkmark-done', solo: 'EN_RUTA' },
]

export default function MiDia() {
  const router = useRouter()
  const { perfil } = useSesion()
  const { miDia, miDiaActualizado, cola, sincronizar, sincronizando, enLinea } = useConexion()
  const v = viajeActual(miDia)
  const pendientes = antesDeSalir(miDia, v, cola)
  const otros = (miDia?.viajes ?? []).filter((x) => x.id !== v?.id)
  // Reportes de este viaje que aún no salen del teléfono
  const enColaDelViaje = useMemo(() => cola.filter((p) => p.viajeId === v?.id && p.estado !== 'enviada'), [cola, v?.id])
  const ir = (ruta: string, params: Record<string, string | number | undefined> = {}) =>
    router.push({ pathname: ruta as never, params: Object.fromEntries(Object.entries(params).filter(([, x]) => x !== undefined).map(([k, x]) => [k, String(x)])) })

  return (
    <Pantalla refrescar={sincronizar} refrescando={sincronizando}>
      <View>
        <Text style={s.saludo}>Hola, {perfil?.nombre.split(' ')[0]}</Text>
        <Text style={s.sub}>{miDiaActualizado ? `Actualizado ${haceCuanto(miDiaActualizado)}${enLinea === false ? ' · sin señal' : ''}` : enLinea === false ? 'Sin señal: conéctese una vez para descargar sus viajes' : 'Descargando sus viajes…'}</Text>
      </View>

      {miDia?.piloto && miDia.piloto.diasLicencia < 30 && (
        <Aviso tipo={miDia.piloto.diasLicencia < 0 ? 'peligro' : 'alerta'} texto={miDia.piloto.diasLicencia < 0 ? `Su licencia venció el ${miDia.piloto.licenciaVence}: no puede salir a viajes` : `Su licencia vence en ${miDia.piloto.diasLicencia} días (${miDia.piloto.licenciaVence})`} />
      )}

      {v ? <ViajeActual v={v} enCola={enColaDelViaje.length} /> : (
        <Tarjeta><Text style={s.vacio}>{miDia ? 'No tiene viajes asignados por ahora.' : 'Aún no hay datos en el teléfono.'}</Text></Tarjeta>
      )}

      {pendientes.map((t) => <Aviso key={t} tipo="peligro" texto={t} />)}

      {v && puede(perfil, 'viajes.reportar') && (
        <Tarjeta titulo="Reportar ahora">
          <View style={s.rapidos}>
            {RAPIDOS.filter((r) => !r.solo || r.solo === v.estado).map((r) => (
              <Pressable key={r.tipo} onPress={() => ir('/reportar', { viajeId: v.id, tipo: r.tipo })} style={({ pressed }) => [s.rapido, pressed && { opacity: 0.7 }]} accessibilityRole="button" accessibilityLabel={r.texto}>
                <Ionicons name={r.icono} size={26} color={color.acento} />
                <Text style={s.rapidoTexto}>{r.texto}</Text>
              </Pressable>
            ))}
          </View>
          <Boton texto="Reportar incidente" icono="warning" variante="peligro" grande onPress={() => ir('/reportar', { viajeId: v.id, tipo: 'INCIDENTE' })} />
          <Boton texto="Otro reporte con fotos" icono="camera" variante="secundario" onPress={() => ir('/reportar', { viajeId: v.id })} />
        </Tarjeta>
      )}

      <Tarjeta titulo="Registrar">
        <View style={s.rejilla}>
          {puede(perfil, 'inspecciones.registrar') && <Accion icono="clipboard" texto="Inspección" onPress={() => ir('/inspeccion', { viajeId: v?.estado === 'PROGRAMADO' ? v.id : undefined, cabezalId: v?.cabezalId })} />}
          {puede(perfil, 'combustible.registrar') && <Accion icono="water" texto="Combustible" onPress={() => ir('/combustible', { cabezalId: v?.cabezalId })} />}
          {v && puede(perfil, 'viajes.costos') && <Accion icono="receipt" texto="Gasto" onPress={() => ir('/gasto', { viajeId: v.id })} />}
          {puede(perfil, 'casos.crear') && <Accion icono="construct" texto="Problema" onPress={() => ir('/caso', { cabezalId: v?.cabezalId })} />}
        </View>
      </Tarjeta>

      {(miDia?.casos.length ?? 0) > 0 && (
        <Tarjeta titulo="Casos abiertos">
          {miDia!.casos.map((c) => {
            const p = PRIORIDADES.find((x) => x.valor === c.prioridad)
            return (
              <View key={c.id} style={s.caso}>
                <View style={{ flex: 1 }}><Text style={s.casoTitulo}>{c.numero} · {c.titulo}</Text><Text style={s.sub}>{c.estado === 'EN_PROCESO' ? 'En proceso' : 'Abierto'}{c.impideSalir ? ' · impide salir' : ''}</Text></View>
                <Etiqueta texto={p?.texto ?? c.prioridad} colorFondo={`${p?.color ?? color.secundario}22`} colorTexto={p?.color ?? color.secundario} />
              </View>
            )
          })}
        </Tarjeta>
      )}

      {otros.length > 0 && (
        <Tarjeta titulo="Otros viajes">
          {otros.map((x) => <Text key={x.id} style={s.otro}>{x.numero} · {ESTADO_VIAJE[x.estado]} · {x.destino} · {fechaHora(x.fechaSalida)}</Text>)}
        </Tarjeta>
      )}
    </Pantalla>
  )
}

function ViajeActual({ v, enCola }: { v: ViajeDia; enCola: number }) {
  const enRuta = v.estado === 'EN_RUTA'
  return (
    <View style={[s.viaje, enRuta && { borderColor: color.acento }]}>
      <View style={s.viajeArriba}>
        <Text style={s.numero}>{v.numero}</Text>
        <Etiqueta texto={ESTADO_VIAJE[v.estado]} colorFondo={enRuta ? color.acento : color.acentoSuave} colorTexto={enRuta ? '#fff' : color.acentoOscuro} />
      </View>
      <Text style={s.destino}>{v.origen} → {v.destino}</Text>
      <Text style={s.linea}>{v.cliente}{v.carga ? ` · ${v.carga}` : ''}{v.referencia ? ` · Ref. ${v.referencia}` : ''}</Text>
      <Text style={s.linea}>{v.cabezal} ({v.placa}){v.remolque ? ` + ${v.remolque}` : ''}</Text>
      <Text style={s.linea}>{enRuta ? 'Entrega' : 'Salida'}: {fechaHora(enRuta ? v.fechaCompromiso : v.fechaSalida)}{Number(v.anticipos) > 0 ? ` · Anticipo ${Q(v.anticipos)}` : ''}</Text>
      {v.observaciones && <Text style={[s.linea, { fontStyle: 'italic' }]}>{v.observaciones}</Text>}
      {(v.ultimoReporte || enCola > 0) && <Text style={s.sub}>{v.ultimoReporte ? `Último reporte: ${textoEvento(v.ultimoReporte.tipo)} ${haceCuanto(new Date(v.ultimoReporte.ocurridoEn).getTime())}` : ''}{enCola ? `${v.ultimoReporte ? ' · ' : ''}${enCola} en el teléfono por enviar` : ''}</Text>}
    </View>
  )
}

function Accion({ icono, texto, onPress }: { icono: keyof typeof Ionicons.glyphMap; texto: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.accion, pressed && { opacity: 0.7 }]} accessibilityRole="button" accessibilityLabel={texto}>
      <Ionicons name={icono} size={28} color={color.acento} />
      <Text style={s.accionTexto}>{texto}</Text>
    </Pressable>
  )
}

const s = StyleSheet.create({
  saludo: { fontSize: 28, fontWeight: '700', color: color.texto },
  sub: { fontSize: 14, color: color.secundario, marginTop: 2 },
  vacio: { fontSize: 16, color: color.secundario, textAlign: 'center', paddingVertical: 12 },
  viaje: { backgroundColor: color.superficie, borderRadius: radio.superficie, padding: 16, gap: 6, borderWidth: 2, borderColor: color.superficie },
  viajeArriba: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  numero: { fontSize: 15, fontWeight: '600', color: color.secundario },
  destino: { fontSize: 21, fontWeight: '700', color: color.texto },
  linea: { fontSize: 16, color: color.texto },
  rapidos: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  rapido: { flexGrow: 1, flexBasis: '45%', minHeight: 72, borderRadius: radio.tarjeta, backgroundColor: color.acentoSuave, alignItems: 'center', justifyContent: 'center', gap: 4 },
  rapidoTexto: { fontSize: 16, fontWeight: '600', color: color.acentoOscuro },
  rejilla: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  accion: { flexGrow: 1, flexBasis: '45%', minHeight: 80, borderRadius: radio.tarjeta, borderWidth: 1, borderColor: color.separador, alignItems: 'center', justifyContent: 'center', gap: 6 },
  accionTexto: { fontSize: 16, color: color.texto, fontWeight: '500' },
  caso: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  casoTitulo: { fontSize: 16, color: color.texto },
  otro: { fontSize: 15, color: color.texto },
})
