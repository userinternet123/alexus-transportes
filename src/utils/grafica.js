// Utilidades puras de las gráficas del asistente de datos (sin React: se prueban solas).

/** Escala "bonita" anclada en cero: marcas en 1, 2, 2.5, 5 × 10ⁿ. */
export function escala(min, max, marcas = 4) {
  let lo = Number.isFinite(min) ? min : 0
  let hi = Number.isFinite(max) ? max : 1
  if (lo > 0) lo = 0
  if (hi < 0) hi = 0
  if (hi === lo) hi = lo + 1
  const bruto = (hi - lo) / marcas
  const magnitud = 10 ** Math.floor(Math.log10(bruto))
  const norm = bruto / magnitud
  const paso = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * magnitud
  const inicio = Math.floor(lo / paso) * paso
  const fin = Math.ceil(hi / paso) * paso
  const marcasY = []
  for (let i = 0; inicio + i * paso <= fin + paso / 2; i++) marcasY.push(Math.round((inicio + i * paso) * 1e9) / 1e9)
  return { min: marcasY[0], max: marcasY[marcasY.length - 1], paso, marcas: marcasY }
}

export function formatear(valor, formato) {
  if (valor === null || valor === undefined || valor === '') return '—'
  const n = Number(valor)
  if (!Number.isFinite(n)) return String(valor)
  if (formato === 'moneda') return `Q${n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  if (formato === 'porcentaje') return `${n.toLocaleString('es-GT', { maximumFractionDigits: 1 })} %`
  if (formato === 'numero') return n.toLocaleString('es-GT', { maximumFractionDigits: 3 })
  return String(valor)
}

/** Para los ejes: Q12.5 mil, Q1.2 M. */
export function compacto(valor, formato) {
  const n = Number(valor)
  if (!Number.isFinite(n)) return ''
  const a = Math.abs(n)
  const dec = (x) => (Math.round(x * 10) / 10).toLocaleString('es-GT')
  const t = a >= 1e6 ? `${dec(n / 1e6)} M` : a >= 1e4 ? `${dec(n / 1e3)} mil` : (Math.round(n * 100) / 100).toLocaleString('es-GT')
  return formato === 'moneda' ? `Q${t}` : formato === 'porcentaje' ? `${t} %` : t
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
/** '2026-10' → 'oct 26'; '2026-10-30' → '30 oct'; con corta=true, 'Miércoles' → 'Mié'; otro texto, igual. */
export function etiquetaPeriodo(p, corta = false) {
  const s = String(p ?? '')
  if (corta && DIAS.includes(s)) return s.slice(0, 3)
  let m = /^(\d{4})-(\d{2})$/.exec(s)
  if (m) return `${MESES[Number(m[2]) - 1]} ${m[1].slice(2)}`
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (m) return `${Number(m[3])} ${MESES[Number(m[2]) - 1]}`
  return s
}
export const recortar = (t, max) => { const s = String(t ?? ''); return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s }
/** Cada cuántas etiquetas mostrar una para que no se encimen. */
export const pasoEtiquetas = (n, maximo) => Math.max(1, Math.ceil(n / Math.max(1, maximo)))

/** Porciones de una dona: ángulos, fracción y trazo SVG (maneja el caso de una sola porción = 100 %). */
export function arcosDona(valores, cx, cy, rExt, rInt) {
  const total = valores.reduce((s, v) => s + Math.max(0, v), 0)
  if (total <= 0) return []
  const punto = (r, ang) => [cx + r * Math.cos(ang), cy + r * Math.sin(ang)]
  let ang = -Math.PI / 2
  return valores.map((v, i) => {
    const fraccion = Math.max(0, v) / total
    const fin = ang + fraccion * 2 * Math.PI
    let path
    if (fraccion >= 0.9999) {
      path = `M ${cx} ${cy - rExt} A ${rExt} ${rExt} 0 1 1 ${cx} ${cy + rExt} A ${rExt} ${rExt} 0 1 1 ${cx} ${cy - rExt} M ${cx} ${cy - rInt} A ${rInt} ${rInt} 0 1 0 ${cx} ${cy + rInt} A ${rInt} ${rInt} 0 1 0 ${cx} ${cy - rInt} Z`
    } else {
      const [x0, y0] = punto(rExt, ang); const [x1, y1] = punto(rExt, fin)
      const [x2, y2] = punto(rInt, fin); const [x3, y3] = punto(rInt, ang)
      const grande = fraccion > 0.5 ? 1 : 0
      path = `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${rExt} ${rExt} 0 ${grande} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} L ${x2.toFixed(2)} ${y2.toFixed(2)} A ${rInt} ${rInt} 0 ${grande} 0 ${x3.toFixed(2)} ${y3.toFixed(2)} Z`
    }
    const r = { indice: i, fraccion, path }
    ang = fin
    return r
  }).filter((a) => a.fraccion > 0)
}

/** CSV para Excel: separador coma, comillas dobles escapadas y BOM para que se vean bien las tildes. */
export function aCsv(columnas, filas) {
  const celda = (v) => {
    if (v === null || v === undefined) return ''
    const s = String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const cuerpo = [columnas.map((c) => celda(c.etiqueta)).join(','), ...filas.map((f) => columnas.map((c) => celda(f[c.clave])).join(','))].join('\r\n')
  return `\uFEFF${cuerpo}`
}
export function descargarCsv(nombre, columnas, filas) {
  const url = URL.createObjectURL(new Blob([aCsv(columnas, filas)], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${nombre.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 60) || 'datos'}.csv`
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
