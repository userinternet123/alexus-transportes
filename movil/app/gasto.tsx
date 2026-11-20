// Gasto del viaje (peaje, comida, parqueo…) con foto del recibo. Se liquida contra el anticipo.
import { useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { Alert, Text } from 'react-native'
import { Fotos, type FotoTomada } from '../src/componentes/Fotos'
import { Boton, Campo, Fichas, Interruptor, Pantalla, Tarjeta } from '../src/componentes/ui'
import { TIPOS_GASTO } from '../src/constantes'
import { useConexion } from '../src/offline/conexion'
import { useGuardarReporte } from '../src/reportes'
import { color, Q } from '../src/tema'

export default function Gasto() {
  const p = useLocalSearchParams<{ viajeId: string }>()
  const { miDia } = useConexion()
  const viaje = miDia?.viajes.find((v) => v.id === Number(p.viajeId)) ?? null
  const [tipo, setTipo] = useState('PEAJE')
  const [monto, setMonto] = useState('')
  const [detalle, setDetalle] = useState('')
  const [documento, setDocumento] = useState('')
  const [pagoYo, setPagoYo] = useState(true)
  const [fotos, setFotos] = useState<FotoTomada[]>([])
  const [guardando, setGuardando] = useState(false)
  const guardar = useGuardarReporte()
  const valor = Number(monto.replace(',', '.'))

  const enviar = async () => {
    setGuardando(true)
    try {
      await guardar({
        tipo: 'gasto', viajeId: Number(p.viajeId), fotos,
        titulo: `${TIPOS_GASTO.find((t) => t.valor === tipo)?.texto} ${Q(valor)} · ${viaje?.numero ?? ''}`,
        carga: { tipo, monto: Math.round(valor * 100) / 100, descripcion: detalle.trim() || null, documento: documento.trim() || null, pagadoPorPiloto: pagoYo, fecha: new Date().toISOString() },
      })
    } catch (e) { Alert.alert('No se pudo guardar', (e as Error).message) } finally { setGuardando(false) }
  }

  return (
    <Pantalla>
      {viaje && <Text style={{ fontSize: 16, color: color.secundario }}>{viaje.numero} · {viaje.destino}{Number(viaje.anticipos) > 0 ? ` · anticipo ${Q(viaje.anticipos)}` : ''}</Text>}
      <Tarjeta titulo="Tipo de gasto">
        <Fichas opciones={TIPOS_GASTO} valor={tipo} onCambio={setTipo} />
      </Tarjeta>
      <Tarjeta>
        <Campo etiqueta="Monto (Q)" valor={monto} onCambio={setMonto} teclado="decimal-pad" />
        <Campo etiqueta="Detalle (opcional)" valor={detalle} onCambio={setDetalle} placeholder="Ej. peaje Palín-Escuintla" />
        <Campo etiqueta="Número de factura o recibo (opcional)" valor={documento} onCambio={setDocumento} />
        <Interruptor etiqueta="Lo pagué yo (del anticipo)" valor={pagoYo} onCambio={setPagoYo} ayuda="Se descuenta del anticipo al liquidar el viaje" />
      </Tarjeta>
      <Tarjeta titulo="Foto del recibo">
        <Fotos valor={fotos} onCambio={setFotos} max={1} etiqueta="Foto del recibo" />
      </Tarjeta>
      <Boton texto="Guardar gasto" grande onPress={enviar} deshabilitado={!(valor > 0)} cargando={guardando} />
    </Pantalla>
  )
}
