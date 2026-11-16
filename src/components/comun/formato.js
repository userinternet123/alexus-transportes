export const Q = (n) =>
  new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ', minimumFractionDigits: 2 }).format(Number(n || 0))

export const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100

/** Mensaje y código de error del API ({ codigo, message }) */
export const errorApi = (e) => ({ codigo: e?.response?.data?.codigo ?? e?.codigo, mensaje: e?.response?.data?.message ?? e?.message ?? 'Error inesperado' })
