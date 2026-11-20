// Carga de combustible: odómetro, galones, precio y foto del vale. Si el cabezal está en un viaje, entra a ese viaje.
import { useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { Alert, Text } from 'react-native'
import { Fotos, type FotoTomada } from '../src/componentes/Fotos'
import { Aviso, Boton, Campo, Fichas, Interruptor, Pantalla, Tarjeta } from '../src/componentes/ui'
import { useConexion } from '../src/offline/conexion'
import { useGuardarReporte } from '../src/reportes'
import { color, Q } from '../src/tema'

const numero = (t: string) => Number(t.replace(',', '.'))

export default function Combustible() {
  const p = useLocalSearchParams<{ cabezalId?: string }>()
  const { miDia } = useConexion()
  const [cabezalId, setCabezalId] = useState<number | null>(Number(p.cabezalId) || miDia?.cabezales.find((c) => c.asignado)?.id || null)
  const cabezal = miDia?.cabezales.find((c) => c.id === cabezalId)
  const viaje = miDia?.viajes.find((v) => v.cabezalId === cabezalId && v.estado === 'EN_RUTA') ?? null
  const [f, setF] = useState({ odometro: '', galones: '', precio: '', estacion: '', documento: '' })
  const [lleno, setLleno] = useState(true)
  const [pagoYo, setPagoYo] = useState(false)
  const [fotos, setFotos] = useState<FotoTomada[]>([])
  const [guardando, setGuardando] = useState(false)
  const guardar = useGuardarReporte()
  const set = (k: keyof typeof f) => (t: string) => setF((x) => ({ ...x, [k]: t }))
  const total = numero(f.galones) * numero(f.precio)
  const ultimo = cabezal ? Number(cabezal.odometro) : null
  const errorOdo = f.odometro && ultimo != null && numero(f.odometro) <= ultimo ? `Debe ser mayor que el último (${ultimo.toLocaleString('es-GT')} km)` : null
  const capacidad = cabezal?.capacidadTanque ? Number(cabezal.capacidadTanque) : null
  const errorGal = f.galones && capacidad && numero(f.galones) > capacidad * 1.05 ? `El tanque es de ${capacidad} galones` : null
  const listo = cabezalId && numero(f.odometro) > 0 && numero(f.galones) > 0 && numero(f.precio) > 0 && !errorOdo && !errorGal

  const enviar = async () => {
    setGuardando(true)
    try {
      await guardar({
        tipo: 'carga', viajeId: viaje?.id ?? null, fotos,
        titulo: `Combustible ${cabezal?.codigo ?? ''} · ${numero(f.galones)} gal · ${Q(total)}`,
        carga: {
          cabezalId, viajeId: viaje?.id ?? null, fecha: new Date().toISOString(), odometro: numero(f.odometro), galones: numero(f.galones), precioGalon: numero(f.precio),
          tanqueLleno: lleno, pagadoPorPiloto: pagoYo, estacion: f.estacion.trim() || null, documento: f.documento.trim() || null,
        },
      })
    } catch (e) { Alert.alert('No se pudo guardar', (e as Error).message) } finally { setGuardando(false) }
  }

  return (
    <Pantalla>
      <Tarjeta titulo="Cabezal">
        <Fichas opciones={(miDia?.cabezales ?? []).map((c) => ({ valor: String(c.id), texto: c.codigo }))} valor={cabezalId ? String(cabezalId) : null} onCambio={(v) => setCabezalId(Number(v))} />
        <Text style={{ fontSize: 15, color: color.secundario }}>{viaje ? `Entra como costo del viaje ${viaje.numero}` : 'Fuera de viaje (patio, traslado)'}</Text>
      </Tarjeta>
      <Tarjeta>
        <Campo etiqueta="Odómetro (km)" valor={f.odometro} onCambio={set('odometro')} teclado="numeric" ayuda={ultimo != null ? `Último: ${ultimo.toLocaleString('es-GT')} km` : undefined} error={errorOdo} />
        <Campo etiqueta="Galones" valor={f.galones} onCambio={set('galones')} teclado="decimal-pad" error={errorGal} />
        <Campo etiqueta="Precio por galón (Q)" valor={f.precio} onCambio={set('precio')} teclado="decimal-pad" />
        {total > 0 && <Text style={{ fontSize: 22, fontWeight: '700', color: color.texto }}>Total {Q(total)}</Text>}
        <Interruptor etiqueta="Llené el tanque" valor={lleno} onCambio={setLleno} ayuda="Así se calcula el rendimiento real (km por galón)" />
        <Interruptor etiqueta="La pagué yo (del anticipo)" valor={pagoYo} onCambio={setPagoYo} />
        <Campo etiqueta="Gasolinera (opcional)" valor={f.estacion} onCambio={set('estacion')} />
        <Campo etiqueta="Número de factura o vale (opcional)" valor={f.documento} onCambio={set('documento')} />
      </Tarjeta>
      <Tarjeta titulo="Foto del vale o factura">
        <Fotos valor={fotos} onCambio={setFotos} max={1} etiqueta="Foto del vale" />
      </Tarjeta>
      {!fotos.length && <Aviso tipo="info" texto="La foto del vale ayuda a cuadrar la carga sin llamadas." />}
      <Boton texto="Guardar carga" grande onPress={enviar} deshabilitado={!listo} cargando={guardando} />
    </Pantalla>
  )
}
