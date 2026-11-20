// Colores y medidas de la app del piloto (mismos tokens del portal ALEXUS Transportes).
export const color = {
  acento: '#1E7B4F',
  acentoOscuro: '#17442F',
  acentoSuave: '#ECF7F1',
  fondo: '#F2F2F7',
  superficie: '#FFFFFF',
  texto: '#1D1D1F',
  secundario: '#6E6E73',
  separador: '#D1D1D6',
  peligro: '#D70015',
  peligroSuave: '#FDECEE',
  alerta: '#B25000',
  alertaSuave: '#FFF4E5',
}
export const radio = { control: 10, tarjeta: 14, superficie: 18 }
export const Q = (n: number | string | null | undefined) =>
  'Q' + Number(n ?? 0).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const fechaHora = (v: string | number | Date | null | undefined) =>
  v ? new Date(v).toLocaleString('es-GT', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/Guatemala' }) : '—'
