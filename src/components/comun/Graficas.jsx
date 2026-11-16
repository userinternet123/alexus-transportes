// Gráficas livianas en SVG/CSS (sin dependencias). Accesibles: cada barra
// tiene su valor en texto; los colores no son la única forma de leer el dato.

/** Barras horizontales: [{ etiqueta, valor, detalle? }] */
export function BarrasHorizontales({ datos, formato = (v) => v, color = 'bg-green-600', vacio = 'Sin datos' }) {
  if (!datos?.length) return <p className="py-6 text-center text-sm text-gray-500">{vacio}</p>
  const max = Math.max(...datos.map((d) => Math.abs(Number(d.valor) || 0)), 1)
  return (
    <ul className="space-y-2">
      {datos.map((d, i) => (
        <li key={`${d.etiqueta}-${i}`}>
          <div className="flex justify-between gap-2 text-sm">
            <span className="truncate" title={d.etiqueta}>{d.etiqueta}</span>
            <span className="shrink-0 font-medium tabular-nums">{formato(d.valor)}</span>
          </div>
          <div className="mt-1 h-2 rounded bg-gray-100" aria-hidden>
            <div className={`h-2 rounded ${color}`} style={{ width: `${(Math.abs(Number(d.valor) || 0) / max) * 100}%` }} />
          </div>
          {d.detalle && <p className="mt-0.5 text-xs text-gray-500">{d.detalle}</p>}
        </li>
      ))}
    </ul>
  )
}

/** Columnas en el tiempo: [{ etiqueta: '2026-10-01', valor }] */
export function ColumnasTiempo({ datos, formato = (v) => v, alto = 160 }) {
  if (!datos?.length) return <p className="py-6 text-center text-sm text-gray-500">Sin datos</p>
  const max = Math.max(...datos.map((d) => Number(d.valor) || 0), 1)
  const ancho = 100 / datos.length
  return (
    <figure>
      <svg viewBox={`0 0 100 ${alto / 4}`} preserveAspectRatio="none" className="w-full" style={{ height: alto }} role="img"
        aria-label={`Serie de ${datos.length} períodos; máximo ${formato(max)}`}>
        {datos.map((d, i) => {
          const h = ((Number(d.valor) || 0) / max) * (alto / 4 - 1)
          return (
            <rect key={d.etiqueta} x={i * ancho + ancho * 0.15} y={alto / 4 - h} width={ancho * 0.7} height={h} className="fill-green-600">
              <title>{`${d.etiqueta}: ${formato(d.valor)}`}</title>
            </rect>
          )
        })}
      </svg>
      <figcaption className="mt-1 flex justify-between text-xs text-gray-500">
        <span>{datos[0].etiqueta}</span><span>{datos[datos.length - 1].etiqueta}</span>
      </figcaption>
    </figure>
  )
}

/** Tarjeta de indicador con variación contra el período anterior. */
export function Indicador({ titulo, valor, anterior, formato = (v) => v, invertir = false }) {
  const v = Number(valor) || 0
  const a = Number(anterior) || 0
  const variacion = a ? ((v - a) / Math.abs(a)) * 100 : null
  const bueno = variacion == null ? null : invertir ? variacion < 0 : variacion > 0
  return (
    <div className="rounded-xl border bg-white p-4">
      <p className="text-sm text-gray-500">{titulo}</p>
      <p className="text-2xl font-semibold tabular-nums">{formato(v)}</p>
      {variacion != null && (
        <p className={`text-xs ${bueno ? 'text-green-700' : 'text-red-600'}`}>
          {variacion > 0 ? '▲' : '▼'} {Math.abs(variacion).toFixed(1)}% vs. período anterior ({formato(a)})
        </p>
      )}
    </div>
  )
}

const PALETA = ['bg-green-700', 'bg-amber-500', 'bg-sky-500', 'bg-rose-400', 'bg-violet-500']
const PALETA_SVG = ['#15803d', '#f59e0b', '#0ea5e9', '#fb7185', '#8b5cf6']

/**
 * Columnas agrupadas para comparar series (ej. años) por categoría (ej. meses).
 * series: [{ nombre: '2026', valores: [..] }]
 */
export function ColumnasComparadas({ categorias, series, formato = (v) => v, alto = 200 }) {
  if (!categorias?.length || !series?.length) return <p className="py-6 text-center text-sm text-gray-500">Sin datos</p>
  const max = Math.max(1, ...series.flatMap((s) => s.valores.map((v) => Number(v) || 0)))
  const anchoGrupo = 100 / categorias.length
  const anchoBarra = (anchoGrupo * 0.8) / series.length
  const h = alto / 4
  return (
    <figure>
      <div className="mb-2 flex flex-wrap gap-3 text-xs">
        {series.map((s, i) => <span key={s.nombre} className="flex items-center gap-1"><span className={`inline-block h-3 w-3 rounded-sm ${PALETA[i % PALETA.length]}`} aria-hidden /> {s.nombre}</span>)}
      </div>
      <svg viewBox={`0 0 100 ${h}`} preserveAspectRatio="none" className="w-full" style={{ height: alto }} role="img" aria-label={`Comparación de ${series.map((s) => s.nombre).join(', ')}`}>
        {categorias.map((c, ci) => series.map((s, si) => {
          const v = Number(s.valores[ci]) || 0
          const bh = (v / max) * (h - 1)
          return (
            <rect key={`${c}-${s.nombre}`} x={ci * anchoGrupo + anchoGrupo * 0.1 + si * anchoBarra} y={h - bh} width={anchoBarra * 0.92} height={bh} fill={PALETA_SVG[si % PALETA_SVG.length]}>
              <title>{`${s.nombre} · ${c}: ${formato(v)}`}</title>
            </rect>
          )
        }))}
      </svg>
      <figcaption className="mt-1 grid text-center text-[10px] text-gray-500" style={{ gridTemplateColumns: `repeat(${categorias.length}, minmax(0, 1fr))` }}>
        {categorias.map((c) => <span key={c} className="truncate">{c}</span>)}
      </figcaption>
    </figure>
  )
}
