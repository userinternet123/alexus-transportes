// Cálculo de períodos del dashboard (fechas en UTC, formato YYYY-MM-DD).
const f = (d) => d.toISOString().slice(0, 10)
const hoyGT = () => new Date(`${new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(new Date())}T00:00:00Z`)
const finDeMes = (y, m) => new Date(Date.UTC(y, m + 1, 0))
const min = (a, b) => (a < b ? a : b)
export const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

export const mesActual = () => f(hoyGT()).slice(0, 7)
export const anioActual = () => hoyGT().getUTCFullYear()

/** sel: { modo: 'mes'|'rango'|'anio'|'ultimos', mes, mesDesde, mesHasta, anio, dias } */
export function rangoDe(sel) {
  const hoy = hoyGT()
  let desde
  let hasta
  if (sel.modo === 'mes') {
    const [y, m] = sel.mes.split('-').map(Number)
    desde = new Date(Date.UTC(y, m - 1, 1)); hasta = min(finDeMes(y, m - 1), hoy)
  } else if (sel.modo === 'rango') {
    const [y1, m1] = sel.mesDesde.split('-').map(Number)
    const [y2, m2] = sel.mesHasta.split('-').map(Number)
    desde = new Date(Date.UTC(y1, m1 - 1, 1)); hasta = min(finDeMes(y2, m2 - 1), hoy)
  } else if (sel.modo === 'anio') {
    desde = new Date(Date.UTC(sel.anio, 0, 1)); hasta = min(new Date(Date.UTC(sel.anio, 11, 31)), hoy)
  } else {
    hasta = hoy; desde = new Date(hoy.getTime() - (Number(sel.dias) - 1) * 86_400_000)
  }
  if (desde > hasta) desde = hasta
  return { desde: f(desde), hasta: f(hasta) }
}

/** Mismo rango desplazado N años atrás. */
export function menosAnios(r, n) {
  const mover = (s) => { const d = new Date(`${s}T00:00:00Z`); d.setUTCFullYear(d.getUTCFullYear() - n); return f(d) }
  return { desde: mover(r.desde), hasta: mover(r.hasta) }
}

/** Período inmediatamente anterior de la misma duración. */
export function anterior(r) {
  const d = new Date(`${r.desde}T00:00:00Z`)
  const h = new Date(`${r.hasta}T00:00:00Z`)
  const dias = Math.round((h - d) / 86_400_000) + 1
  const antHasta = new Date(d.getTime() - 86_400_000)
  return { desde: f(new Date(antHasta.getTime() - (dias - 1) * 86_400_000)), hasta: f(antHasta) }
}

/** ¿Conviene graficar por día (≤ 62 días) o por mes? */
export const porDia = (r) => (new Date(`${r.hasta}T00:00:00Z`) - new Date(`${r.desde}T00:00:00Z`)) / 86_400_000 <= 62

export const etiquetaMes = (ym) => { const [y, m] = ym.split('-'); return `${MESES[Number(m) - 1]} ${y.slice(2)}` }
