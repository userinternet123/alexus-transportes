// Insignia de estado. Tonos suaves (fondo 50, texto 700) que también se leen en modo oscuro.
const VERDE = 'bg-green-50 text-green-700'
const ROJO = 'bg-red-50 text-red-700'
const AZUL = 'bg-blue-50 text-blue-700'
const MORADO = 'bg-purple-50 text-purple-700'
const AMBAR = 'bg-amber-50 text-amber-700'
const GRIS = 'bg-gray-100 text-gray-600'

const ESTILOS = {
  ACTIVO: VERDE, ACTIVA: VERDE, ENVIADA: VERDE, ENVIADA_PTC: VERDE, CONFIRMADA: VERDE, CONFIRMADO: VERDE,
  INACTIVO: GRIS, BAJA: GRIS,
  ACTUALIZAR: AMBAR, INCOMPLETA: AMBAR, SUSPENDIDO: AMBAR, PENDIENTE: AMBAR,
  COMPLETA: AZUL, APROBADO: AZUL, APROBADA: AZUL,
  BORRADOR: MORADO, PENDIENTE_ENVIO: MORADO,
  DESACTIVADA: ROJO, RECHAZADA: ROJO, RECHAZADO: ROJO, ELIMINADA: ROJO, CANCELADA: ROJO, ANULADA: ROJO, ANULADO: ROJO,
}
const TEXTO = { ACTIVO: 'Activo', INACTIVO: 'Inactivo', ACTIVA: 'Activa', BAJA: 'Baja' }

function StatusBadge({ status }) {
  // Booleano => Activo / Inactivo
  const clave = typeof status === 'boolean' ? (status ? 'ACTIVO' : 'INACTIVO') : String(status ?? '').toUpperCase()
  const texto = TEXTO[clave] ?? (clave.charAt(0) + clave.slice(1).toLowerCase()).replace(/_/g, ' ')
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${ESTILOS[clave] ?? GRIS}`}>{texto}</span>
}

export default StatusBadge
