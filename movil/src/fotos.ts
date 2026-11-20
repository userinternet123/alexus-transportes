// Fotos de evidencia: siempre con la cámara (no de la galería), reducidas a 1600 px y comprimidas (~200-400 KB),
// guardadas CIFRADAS en la base de la app hasta enviarlas. No quedan en la galería del teléfono.
import { File } from 'expo-file-system'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import * as ImagePicker from 'expo-image-picker'
import { guardarFoto } from './offline/almacen'
import type { FotoLocal } from './offline/logica'
import { ubicacionActual } from './ubicacion'
import { nuevoId } from './id'

const LADO = 1600

/** Toma una foto con la cámara y la deja lista (cifrada) para la cola. null si el piloto canceló. */
export async function tomarFoto(destino?: string): Promise<{ foto: FotoLocal; vista: string } | null> {
  const permiso = await ImagePicker.requestCameraPermissionsAsync()
  if (!permiso.granted) throw new Error('Permita el uso de la cámara para tomar las fotos de evidencia (Ajustes › Aplicaciones › ALEXUS Piloto).')
  const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85, exif: false, allowsEditing: false })
  if (r.canceled || !r.assets?.length) return null
  const a = r.assets[0]
  const escala = Math.min(1, LADO / Math.max(a.width, a.height))
  const ctx = ImageManipulator.manipulate(a.uri)
  if (escala < 1) ctx.resize(a.width >= a.height ? { width: Math.round(a.width * escala) } : { height: Math.round(a.height * escala) })
  const imagen = await ctx.renderAsync()
  const final = await imagen.saveAsync({ compress: 0.7, format: SaveFormat.JPEG, base64: true })
  const ubicacion = await ubicacionActual(3000)
  const clave = nuevoId()
  await guardarFoto(clave, final.base64 ?? '')
  // La original de la cámara se borra: lo único que queda es la copia cifrada
  for (const uri of [a.uri]) { try { new File(uri).delete() } catch { /* ya no existe */ } }
  return {
    foto: { clave, archivoId: null, descripcion: null, latitud: ubicacion?.latitud ?? null, longitud: ubicacion?.longitud ?? null, tomadaEn: new Date().toISOString(), destino },
    vista: final.uri, // vista previa temporal (se borra al cerrar el formulario)
  }
}

/** Borra las vistas previas temporales de un formulario. */
export function borrarVistas(uris: string[]) {
  for (const u of uris) { try { new File(u).delete() } catch { /* ya no existe */ } }
}
