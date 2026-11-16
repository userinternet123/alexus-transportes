// Colores y medidas de SPVI móvil (mismos tokens del portal: tema "Tienda").
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
  alerta: '#B25000',
}
export const radio = { control: 8, tarjeta: 12, superficie: 16 }
export const Q = (n: number | string | null | undefined) =>
  'Q' + Number(n ?? 0).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const hoyGT = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(new Date())
