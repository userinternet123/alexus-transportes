// Inspección pre viaje en el celular: lista de revisión, foto de cada falla con su prioridad, otros hallazgos y fotos
// generales de la unidad. Funciona sin señal (la lista se guarda en el teléfono).
import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams } from 'expo-router'
import { useMemo, useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { Fotos, type FotoTomada } from '../src/componentes/Fotos'
import { Aviso, Boton, Campo, Fichas, Interruptor, Pantalla, Tarjeta } from '../src/componentes/ui'
import { PRIORIDADES, TIPOS_CASO } from '../src/constantes'
import { useConexion } from '../src/offline/conexion'
import { revisarInspeccion, type Respuesta } from '../src/offline/logica'
import { useGuardarReporte } from '../src/reportes'
import { color, radio } from '../src/tema'

type Hallazgo = { titulo: string; tipo: string; prioridad: string; impideSalir: boolean }

export default function Inspeccion() {
  const p = useLocalSearchParams<{ viajeId?: string; cabezalId?: string }>()
  const { miDia, puntos } = useConexion()
  const viaje = miDia?.viajes.find((v) => v.id === Number(p.viajeId)) ?? null
  const [cabezalId, setCabezalId] = useState<number | null>(Number(p.cabezalId) || miDia?.cabezales.find((c) => c.asignado)?.id || null)
  const remolqueId = viaje && viaje.cabezalId === cabezalId ? viaje.remolqueId : null
  const [odometro, setOdometro] = useState('')
  const [resp, setResp] = useState<Record<string, Respuesta>>({})
  const [fotosFalla, setFotosFalla] = useState<Record<string, FotoTomada[]>>({})
  const [fotos, setFotos] = useState<FotoTomada[]>([])
  const [hallazgos, setHallazgos] = useState<Hallazgo[]>([])
  const [obs, setObs] = useState('')
  const [guardando, setGuardando] = useState(false)
  const guardar = useGuardarReporte()
  const rev = revisarInspeccion(puntos, resp, Boolean(remolqueId))
  const grupos = useMemo(() => {
    const m = new Map<string, typeof rev.aplican>()
    for (const pt of rev.aplican) m.set(pt.grupo, [...(m.get(pt.grupo) ?? []), pt])
    return [...m]
  }, [rev.aplican])
  const cabezal = miDia?.cabezales.find((c) => c.id === cabezalId)

  const marcar = (codigo: string, estado: Respuesta['estado'], sugerida: string) => setResp((r) => ({ ...r, [codigo]: { ...r[codigo], estado, prioridad: r[codigo]?.prioridad ?? sugerida } }))
  const todoBien = () => setResp(Object.fromEntries(rev.aplican.map((pt) => [pt.codigo, { estado: 'OK' as const }])))

  const enviar = async () => {
    if (!cabezalId) { Alert.alert('Elija el cabezal'); return }
    if (rev.faltan) { Alert.alert('Faltan puntos', `Revise los ${rev.faltan} puntos que faltan.`); return }
    if (rev.sinNota.length) { Alert.alert('Describa las fallas', rev.sinNota.join('\n')); return }
    if (hallazgos.some((h) => h.titulo.trim().length < 5)) { Alert.alert('Describa cada hallazgo', 'Al menos 5 letras.'); return }
    const seguir = rev.resultado !== 'RECHAZADA' || await new Promise<boolean>((ok) => Alert.alert('Falla crítica', 'La unidad quedará FUERA DE SERVICIO hasta que el taller la repare y otra inspección la apruebe.', [{ text: 'Revisar', style: 'cancel', onPress: () => ok(false) }, { text: 'Enviar así', style: 'destructive', onPress: () => ok(true) }]))
    if (!seguir) return
    setGuardando(true)
    try {
      const todasFotos = [...Object.values(fotosFalla).flat(), ...fotos]
      await guardar({
        tipo: 'inspeccion', viajeId: null, fotos: todasFotos,
        titulo: `Inspección ${cabezal?.codigo ?? ''}${rev.resultado === 'APROBADA' ? '' : rev.resultado === 'RECHAZADA' ? ' · fuera de servicio' : ' · con observaciones'}`,
        carga: {
          cabezalId, remolqueId, viajeId: viaje?.estado === 'PROGRAMADO' ? viaje.id : null, odometro: odometro ? Number(odometro) : null, observaciones: obs.trim() || null,
          puntos: rev.aplican.map((pt) => ({ codigo: pt.codigo, estado: resp[pt.codigo].estado, nota: resp[pt.codigo].nota?.trim() || null, prioridad: resp[pt.codigo].estado === 'FALLA' ? resp[pt.codigo].prioridad : null })),
          hallazgos: hallazgos.map((h) => ({ ...h, titulo: h.titulo.trim() })),
        },
      })
    } catch (e) { Alert.alert('No se pudo guardar', (e as Error).message) } finally { setGuardando(false) }
  }

  if (!puntos.length) return <Pantalla><Aviso texto="La lista de revisión aún no está en el teléfono. Conéctese una vez para descargarla." /></Pantalla>

  return (
    <Pantalla>
      <Tarjeta titulo="Unidad">
        <Fichas opciones={(miDia?.cabezales ?? []).map((c) => ({ valor: String(c.id), texto: `${c.codigo} · ${c.placa}` }))} valor={cabezalId ? String(cabezalId) : null} onCambio={(v) => setCabezalId(Number(v))} />
        {remolqueId && <Text style={s.nota}>Con el remolque {viaje?.remolque} del viaje {viaje?.numero}</Text>}
        <Campo etiqueta="Odómetro (km)" valor={odometro} onCambio={setOdometro} teclado="numeric" ayuda={cabezal ? `Último registrado: ${Number(cabezal.odometro).toLocaleString('es-GT')} km` : undefined} />
      </Tarjeta>

      <Boton texto="Marcar todo bien" icono="checkmark-done" variante="secundario" onPress={todoBien} />
      <Text style={s.nota}><Ionicons name="shield" size={13} color={color.peligro} /> Puntos críticos: si fallan, la unidad no puede salir.</Text>

      {grupos.map(([grupo, lista]) => (
        <Tarjeta key={grupo} titulo={grupo}>
          {lista.map((pt) => {
            const r = resp[pt.codigo]
            return (
              <View key={pt.codigo} style={[s.punto, r?.estado === 'FALLA' && s.falla]}>
                <Text style={s.puntoTexto}>{pt.critico && <Ionicons name="shield" size={14} color={color.peligro} />} {pt.nombre}</Text>
                <View style={s.botones}>
                  {(['OK', 'FALLA', 'NO_APLICA'] as const).filter((e) => !(e === 'NO_APLICA' && pt.critico && pt.aplicaA === 'CABEZAL')).map((e) => {
                    const activo = r?.estado === e
                    const fondo = e === 'OK' ? color.acento : e === 'FALLA' ? color.peligro : color.secundario
                    return (
                      <Pressable key={e} onPress={() => marcar(pt.codigo, e, pt.prioridadSugerida)} style={[s.opcion, activo && { backgroundColor: fondo, borderColor: fondo }]} accessibilityRole="radio" accessibilityState={{ checked: activo }} accessibilityLabel={`${pt.nombre}: ${e === 'OK' ? 'bien' : e === 'FALLA' ? 'falla' : 'no aplica'}`}>
                        <Text style={[s.opcionTexto, activo && { color: '#fff' }]}>{e === 'OK' ? 'Bien' : e === 'FALLA' ? 'Falla' : 'N/A'}</Text>
                      </Pressable>
                    )
                  })}
                </View>
                {r?.estado === 'FALLA' && (
                  <View style={{ gap: 10, marginTop: 8 }}>
                    <Campo etiqueta="Describa la falla" valor={r.nota ?? ''} onCambio={(t) => setResp((x) => ({ ...x, [pt.codigo]: { ...x[pt.codigo], nota: t } }))} />
                    <Fichas opciones={PRIORIDADES} valor={r.prioridad ?? pt.prioridadSugerida} onCambio={(v) => setResp((x) => ({ ...x, [pt.codigo]: { ...x[pt.codigo], prioridad: v } }))} />
                    <Fotos valor={fotosFalla[pt.codigo] ?? []} onCambio={(l) => setFotosFalla((x) => ({ ...x, [pt.codigo]: l }))} max={3} destino={`punto:${pt.codigo}`} etiqueta="Foto de la falla" />
                  </View>
                )}
              </View>
            )
          })}
        </Tarjeta>
      ))}

      <Tarjeta titulo="Otros hallazgos">
        {hallazgos.map((h, i) => {
          const cambiar = (k: keyof Hallazgo, v: string | boolean) => setHallazgos((l) => l.map((x, j) => (j === i ? { ...x, [k]: v } : x)))
          return (
            <View key={i} style={{ gap: 10, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: color.separador }}>
              <Campo etiqueta={`Hallazgo ${i + 1}`} valor={h.titulo} onCambio={(t) => cambiar('titulo', t)} placeholder="Ej. golpe en la defensa" />
              <Fichas opciones={PRIORIDADES} valor={h.prioridad} onCambio={(v) => cambiar('prioridad', v)} />
              <Fichas opciones={TIPOS_CASO} valor={h.tipo} onCambio={(v) => cambiar('tipo', v)} colorActivo={() => color.acentoOscuro} />
              <Interruptor etiqueta="Impide salir" valor={h.impideSalir} onCambio={(v) => cambiar('impideSalir', v)} />
              <Boton texto="Quitar" variante="secundario" onPress={() => setHallazgos((l) => l.filter((_, j) => j !== i))} />
            </View>
          )
        })}
        <Boton texto="Reportar algo más" icono="add" variante="secundario" onPress={() => setHallazgos((l) => [...l, { titulo: '', tipo: 'MECANICO', prioridad: 'MODERADA', impideSalir: false }])} />
      </Tarjeta>

      <Tarjeta titulo="Fotos de la unidad">
        <Text style={s.nota}>Frente, costados, llantas y carga: quedan como prueba de cómo salió.</Text>
        <Fotos valor={fotos} onCambio={setFotos} />
        <Campo etiqueta="Observaciones" valor={obs} onCambio={setObs} multilinea />
      </Tarjeta>

      {rev.resultado === 'RECHAZADA' && <Aviso tipo="peligro" texto="Hay fallas críticas: la unidad quedará fuera de servicio." />}
      <Boton texto={rev.faltan ? `Faltan ${rev.faltan} puntos` : 'Enviar inspección'} grande onPress={enviar} deshabilitado={rev.faltan > 0} cargando={guardando} />
    </Pantalla>
  )
}

const s = StyleSheet.create({
  nota: { fontSize: 14, color: color.secundario },
  punto: { paddingVertical: 8, gap: 8, borderRadius: radio.control },
  falla: { backgroundColor: color.peligroSuave, paddingHorizontal: 8 },
  puntoTexto: { fontSize: 16, color: color.texto },
  botones: { flexDirection: 'row', gap: 8 },
  opcion: { flex: 1, minHeight: 46, borderRadius: radio.control, borderWidth: 1, borderColor: color.separador, alignItems: 'center', justifyContent: 'center', backgroundColor: color.superficie },
  opcionTexto: { fontSize: 16, fontWeight: '600', color: color.texto },
})
