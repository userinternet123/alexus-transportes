// Más: cuenta, sede, servidor, sincronizar y salir o borrar los datos del teléfono.
import { useEffect, useState } from 'react'
import { Alert, Pressable, StyleSheet, Text } from 'react-native'
import { almacen, mensajeError } from '../../src/api'
import { Boton, Pantalla, Tarjeta } from '../../src/componentes/ui'
import { borrarTodoLocal } from '../../src/offline/almacen'
import { useConexion } from '../../src/offline/conexion'
import { haceCuanto } from '../../src/offline/logica'
import { useSesion } from '../../src/sesion'
import { color } from '../../src/tema'

export default function Mas() {
  const { perfil, sucursalId, cambiarSucursal, salir } = useSesion()
  const { pendientes, rechazadas, sincronizar, sincronizando, miDiaActualizado, miDia } = useConexion()
  const [servidor, setServidor] = useState('')
  useEffect(() => { almacen.servidor().then((x) => setServidor(x ?? '')) }, [])
  const porEnviar = pendientes + rechazadas

  const confirmarSalida = () => Alert.alert('Cerrar sesión', `¿Salir en este teléfono?${porEnviar ? `\n\nTiene ${porEnviar} reporte(s) sin enviar: se guardan cifrados y se envían cuando vuelva a entrar con su usuario.` : ''}`, [
    { text: 'Cancelar', style: 'cancel' }, { text: 'Cerrar sesión', style: 'destructive', onPress: () => { salir() } },
  ])
  const borrar = () => Alert.alert('Borrar los datos de este teléfono', `Se borra TODO lo guardado aquí, incluidas las fotos, y se destruye la llave de cifrado.${porEnviar ? `\n\n⚠ ${porEnviar} reporte(s) sin enviar SE PERDERÁN.` : ''}\n\nNo afecta nada en el servidor.`, [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Borrar todo', style: 'destructive', onPress: async () => {
      try { await borrarTodoLocal(); await salir(); Alert.alert('Datos borrados', 'Este teléfono ya no guarda información de ALEXUS Transportes.') }
      catch (e) { Alert.alert('No se pudo borrar', mensajeError(e)) }
    } },
  ])

  return (
    <Pantalla>
      <Tarjeta titulo="Cuenta">
        <Text style={s.fuerte}>{perfil?.nombre}</Text>
        <Text style={s.sub}>Usuario {perfil?.username}{miDia?.piloto ? ` · licencia ${miDia.piloto.licenciaTipo}, vence ${miDia.piloto.licenciaVence}` : ''}</Text>
      </Tarjeta>
      {(perfil?.sucursales.length ?? 0) > 1 && (
        <Tarjeta titulo="Sede">
          {perfil!.sucursales.map((x) => (
            <Pressable key={x.id} onPress={() => cambiarSucursal(x.id)} accessibilityRole="radio" accessibilityState={{ checked: x.id === sucursalId }} style={s.opcion}>
              <Text style={[s.texto, x.id === sucursalId && { color: color.acento, fontWeight: '700' }]}>{x.id === sucursalId ? '● ' : '○ '}{x.nombre}</Text>
            </Pressable>
          ))}
        </Tarjeta>
      )}
      <Tarjeta titulo="Conexión">
        <Text style={s.texto}>{servidor}</Text>
        <Text style={s.sub}>{miDiaActualizado ? `Datos del ${haceCuanto(miDiaActualizado)}` : 'Sin datos descargados'}{porEnviar ? ` · ${porEnviar} por enviar` : ''}</Text>
        <Boton texto="Sincronizar ahora" icono="sync" variante="secundario" onPress={sincronizar} cargando={sincronizando} />
      </Tarjeta>
      <Tarjeta titulo="Seguridad">
        <Text style={s.sub}>Sus reportes, fotos y viajes se guardan cifrados en el teléfono. Las fotos no pasan por la galería y se borran al enviarse.</Text>
        <Boton texto="Cerrar sesión" variante="secundario" onPress={confirmarSalida} />
        <Boton texto="Borrar los datos de este teléfono" variante="peligro" onPress={borrar} />
      </Tarjeta>
      <Text style={[s.sub, { textAlign: 'center' }]}>ALEXUS Piloto · ALEXUS Transportes</Text>
    </Pantalla>
  )
}

const s = StyleSheet.create({
  fuerte: { fontSize: 18, fontWeight: '600', color: color.texto },
  texto: { fontSize: 16, color: color.texto },
  sub: { fontSize: 14, color: color.secundario },
  opcion: { minHeight: 44, justifyContent: 'center' },
})
