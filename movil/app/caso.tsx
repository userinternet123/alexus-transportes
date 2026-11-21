// Reportar un problema fuera de un viaje (ruido, golpe, faltante, documento): abre un caso con prioridad y fotos.
import { useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { Alert } from 'react-native'
import { Fotos, type FotoTomada } from '../src/componentes/Fotos'
import { Boton, Campo, Fichas, Interruptor, Pantalla, Tarjeta } from '../src/componentes/ui'
import { PRIORIDADES, TIPOS_CASO } from '../src/constantes'
import { useConexion } from '../src/offline/conexion'
import { useGuardarReporte } from '../src/reportes'
import { ubicacionActual } from '../src/ubicacion'
import { color } from '../src/tema'

export default function Caso() {
  const p = useLocalSearchParams<{ cabezalId?: string }>()
  const { miDia } = useConexion()
  const [cabezalId, setCabezalId] = useState<string | null>(p.cabezalId ?? null)
  const [f, setF] = useState({ titulo: '', descripcion: '', tipo: 'MECANICO', prioridad: 'MODERADA', impideSalir: false })
  const [fotos, setFotos] = useState<FotoTomada[]>([])
  const [guardando, setGuardando] = useState(false)
  const guardar = useGuardarReporte()

  const enviar = async () => {
    setGuardando(true)
    try {
      const u = await ubicacionActual()
      await guardar({
        tipo: 'caso', fotos, titulo: `Problema: ${f.titulo.trim()}`,
        carga: { ...f, titulo: f.titulo.trim(), descripcion: f.descripcion.trim() || null, cabezalId: cabezalId ? Number(cabezalId) : null, latitud: u?.latitud ?? null, longitud: u?.longitud ?? null },
      })
    } catch (e) { Alert.alert('No se pudo guardar', (e as Error).message) } finally { setGuardando(false) }
  }

  return (
    <Pantalla>
      <Tarjeta>
        <Campo etiqueta="¿Qué pasa?" valor={f.titulo} onCambio={(t) => setF((x) => ({ ...x, titulo: t }))} placeholder="Ej. ruido en el diferencial al frenar" />
        <Campo etiqueta="Detalle (opcional)" valor={f.descripcion} onCambio={(t) => setF((x) => ({ ...x, descripcion: t }))} multilinea />
      </Tarjeta>
      <Tarjeta titulo="Prioridad">
        <Fichas opciones={PRIORIDADES} valor={f.prioridad} onCambio={(v) => setF((x) => ({ ...x, prioridad: v }))} />
      </Tarjeta>
      <Tarjeta titulo="Tipo">
        <Fichas opciones={TIPOS_CASO} valor={f.tipo} onCambio={(v) => setF((x) => ({ ...x, tipo: v }))} colorActivo={() => color.acentoOscuro} />
      </Tarjeta>
      <Tarjeta titulo="Unidad">
        <Fichas opciones={[{ valor: '', texto: 'Ninguna' }, ...(miDia?.cabezales ?? []).map((c) => ({ valor: String(c.id), texto: c.codigo }))]} valor={cabezalId ?? ''} onCambio={(v) => setCabezalId(v || null)} />
        <Interruptor etiqueta="La unidad no puede salir hasta resolverlo" valor={f.impideSalir} onCambio={(v) => setF((x) => ({ ...x, impideSalir: v }))} />
      </Tarjeta>
      <Tarjeta titulo="Fotos">
        <Fotos valor={fotos} onCambio={setFotos} />
      </Tarjeta>
      <Boton texto="Reportar" grande onPress={enviar} deshabilitado={f.titulo.trim().length < 5 || (['MECANICO', 'LLANTAS'].includes(f.tipo) && !cabezalId)} cargando={guardando} />
    </Pantalla>
  )
}
