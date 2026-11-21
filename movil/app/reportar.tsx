// Reportar desde el camino: qué pasa, comentario, fotos y ubicación. Un incidente puede abrir un caso con prioridad.
// «Salí» inicia el viaje en el servidor (si cumple inspección y documentos); si no puede, el envío lo explica.
import { useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { Alert, Text } from 'react-native'
import { Fotos, type FotoTomada } from '../src/componentes/Fotos'
import { Aviso, Boton, Campo, Fichas, Interruptor, Pantalla, Tarjeta } from '../src/componentes/ui'
import { EVENTOS, PRIORIDADES, TIPOS_CASO, textoEvento } from '../src/constantes'
import { useConexion } from '../src/offline/conexion'
import { antesDeSalir } from '../src/offline/logica'
import { useGuardarReporte } from '../src/reportes'
import { ubicacionActual } from '../src/ubicacion'
import { color } from '../src/tema'

export default function Reportar() {
  const p = useLocalSearchParams<{ viajeId: string; tipo?: string }>()
  const { miDia, cola } = useConexion()
  const viaje = miDia?.viajes.find((v) => v.id === Number(p.viajeId)) ?? null
  const [tipo, setTipo] = useState<string>(p.tipo ?? 'EN_RUTA')
  const [texto, setTexto] = useState('')
  const [odometro, setOdometro] = useState('')
  const [fotos, setFotos] = useState<FotoTomada[]>([])
  const [abrirCaso, setAbrirCaso] = useState(true)
  const [caso, setCaso] = useState({ tipo: 'MECANICO', prioridad: 'ALTA', impideSalir: false })
  const [guardando, setGuardando] = useState(false)
  const guardar = useGuardarReporte()
  const incidente = tipo === 'INCIDENTE'
  const avisosSalida = tipo === 'SALIDA' ? antesDeSalir(miDia, viaje, cola) : []

  const enviar = async () => {
    if (incidente && texto.trim().length < 5) { Alert.alert('Falta la descripción', 'Escriba qué pasó (al menos 5 letras).'); return }
    setGuardando(true)
    try {
      const u = await ubicacionActual()
      await guardar({
        tipo: 'evento', viajeId: Number(p.viajeId), fotos,
        titulo: `${textoEvento(tipo)} · ${viaje?.numero ?? `viaje ${p.viajeId}`}`,
        carga: {
          tipo, texto: texto.trim() || null, ocurridoEn: new Date().toISOString(),
          latitud: u?.latitud ?? null, longitud: u?.longitud ?? null, precisionM: u?.precisionM ?? null,
          odometro: odometro ? Number(odometro) : null,
          caso: incidente && abrirCaso ? { ...caso, titulo: texto.trim().slice(0, 150) } : null,
        },
      })
    } catch (e) { Alert.alert('No se pudo guardar', (e as Error).message) } finally { setGuardando(false) }
  }

  return (
    <Pantalla>
      {viaje && <Text style={{ fontSize: 16, color: color.secundario }}>{viaje.numero} · {viaje.origen} → {viaje.destino}</Text>}
      <Tarjeta titulo="¿Qué está pasando?">
        <Fichas opciones={EVENTOS.map((e) => ({ valor: e.valor, texto: e.texto, color: e.valor === 'INCIDENTE' ? color.peligro : undefined }))} valor={tipo} onCambio={setTipo} />
      </Tarjeta>
      {avisosSalida.map((a) => <Aviso key={a} tipo="peligro" texto={`${a}. Puede reportar igual: si no se puede salir, el envío le dirá por qué.`} />)}
      <Tarjeta>
        <Campo etiqueta={incidente ? 'Qué pasó' : 'Comentario (opcional)'} valor={texto} onCambio={setTexto} multilinea placeholder={incidente ? 'Ej. llanta trasera derecha baja, detenido en el km 45' : ''} />
        {tipo === 'SALIDA' && <Campo etiqueta="Odómetro (km, opcional)" valor={odometro} onCambio={setOdometro} teclado="numeric" ayuda="Vacío = el último registrado del cabezal" />}
      </Tarjeta>
      {incidente && (
        <Tarjeta titulo="Seguimiento" style={{ borderWidth: 1, borderColor: color.peligro }}>
          <Interruptor etiqueta="Abrir un caso" valor={abrirCaso} onCambio={setAbrirCaso} ayuda="El despacho y el taller lo ven con su prioridad" />
          {abrirCaso && <>
            <Fichas opciones={PRIORIDADES} valor={caso.prioridad} onCambio={(v) => setCaso((c) => ({ ...c, prioridad: v }))} />
            <Fichas opciones={TIPOS_CASO} valor={caso.tipo} onCambio={(v) => setCaso((c) => ({ ...c, tipo: v }))} colorActivo={() => color.acentoOscuro} />
            <Interruptor etiqueta="La unidad no puede seguir" valor={caso.impideSalir} onCambio={(v) => setCaso((c) => ({ ...c, impideSalir: v }))} />
          </>}
        </Tarjeta>
      )}
      <Tarjeta titulo="Fotos">
        <Fotos valor={fotos} onCambio={setFotos} />
      </Tarjeta>
      <Boton texto={incidente ? 'Reportar incidente' : 'Enviar reporte'} variante={incidente ? 'peligro' : 'primario'} grande onPress={enviar} cargando={guardando} />
      <Text style={{ fontSize: 13, color: color.secundario, textAlign: 'center' }}>Se guarda con la hora y la ubicación del teléfono, aunque no haya señal.</Text>
    </Pantalla>
  )
}
