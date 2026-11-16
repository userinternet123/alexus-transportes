// Utilidades compartidas por las pantallas de operación (viajes, combustible, inspecciones, cotizador).
export const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(new Date())
/** Fecha y hora local (Guatemala) en el formato de <input type="datetime-local"> */
export const ahora = () => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date()).map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}T${p.hour === '24' ? '00' : p.hour}:${p.minute}`
}
export const fh = (iso) => (iso ? new Intl.DateTimeFormat('es-GT', { timeZone: 'America/Guatemala', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(iso)) : '—')
export const f = (iso) => (iso ? new Intl.DateTimeFormat('es-GT', { timeZone: 'America/Guatemala', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso)) : '—')
export const km = (n) => ((n === null || n === undefined) ? '—' : `${new Intl.NumberFormat('es-GT', { maximumFractionDigits: 1 }).format(n)} km`)
export const ent = 'mt-1 w-full rounded border px-3 py-2'
export const ESTADOS = {
  PROGRAMADO: { texto: 'Programado', clase: 'bg-blue-50 text-blue-800' },
  EN_RUTA: { texto: 'En ruta', clase: 'bg-amber-50 text-amber-800' },
  FINALIZADO: { texto: 'Finalizado', clase: 'bg-green-50 text-green-800' },
  LIQUIDADO: { texto: 'Liquidado', clase: 'bg-gray-100 text-gray-700' },
  CANCELADO: { texto: 'Cancelado', clase: 'bg-red-50 text-red-700' },
}
export const TIPOS_COSTO = { COMBUSTIBLE: 'Combustible', PEAJE: 'Peajes', VIATICO: 'Viáticos', HORAS_EXTRA: 'Horas extra', PARQUEO: 'Parqueo', CARGA_DESCARGA: 'Carga y descarga', MULTA: 'Multas', REPARACION_EN_RUTA: 'Reparación en ruta', OTRO: 'Otros' }
