// Identificador único de cada reporte y foto (uuid v4): el servidor lo usa para no duplicar los reenvíos.
import * as Crypto from 'expo-crypto'

export const nuevoId = () => Crypto.randomUUID()
