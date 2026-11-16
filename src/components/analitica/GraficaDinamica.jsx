// ─────────────────────────────────────────────────────────────────────────────
// GRÁFICA DINÁMICA (SVG propio, sin librerías): barras, barras horizontales, líneas, área,
// dona, cifra y tabla. Recibe los datos EXACTOS que devolvió el servidor; el usuario puede
// cambiar el tipo sin volver a consultar. Con proyección dibuja la línea punteada y la banda
// del rango probable.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { arcosDona, compacto, escala, etiquetaPeriodo, formatear, pasoEtiquetas, recortar } from '../../utils/grafica'

// Clases escritas completas para que Tailwind las incluya
const COLOR = [
  { relleno: 'fill-green-600', trazo: 'stroke-green-600', punto: 'bg-green-600' },
  { relleno: 'fill-sky-500', trazo: 'stroke-sky-500', punto: 'bg-sky-500' },
  { relleno: 'fill-amber-500', trazo: 'stroke-amber-500', punto: 'bg-amber-500' },
  { relleno: 'fill-violet-500', trazo: 'stroke-violet-500', punto: 'bg-violet-500' },
  { relleno: 'fill-rose-500', trazo: 'stroke-rose-500', punto: 'bg-rose-500' },
  { relleno: 'fill-teal-500', trazo: 'stroke-teal-500', punto: 'bg-teal-500' },
  { relleno: 'fill-orange-500', trazo: 'stroke-orange-500', punto: 'bg-orange-500' },
  { relleno: 'fill-indigo-500', trazo: 'stroke-indigo-500', punto: 'bg-indigo-500' },
]
const AZUL = COLOR[1]
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v))

/** Mide el ancho del contenedor. Usa una "ref con función" para volver a medir cada vez que el elemento aparece
 *  (al cambiar de tabla a gráfica el elemento es nuevo; observar uno que ya salió de la pantalla daba ancho 0). */
function useAncho() {
  const [ancho, setAncho] = useState(0)
  const observador = useRef(null)
  const ref = useCallback((el) => {
    observador.current?.disconnect()
    observador.current = null
    if (!el) return
    const medir = () => setAncho(Math.round(el.getBoundingClientRect().width))
    medir()
    if (typeof ResizeObserver !== 'undefined') { observador.current = new ResizeObserver(medir); observador.current.observe(el) }
  }, [])
  useEffect(() => () => observador.current?.disconnect(), [])
  return [ref, ancho]
}

const etiquetaX = (v) => recortar(etiquetaPeriodo(v), 22)

/** Datos listos para dibujar: valores por serie y por fila, proyección y rango del eje Y. */
function preparar(filas, series, proy) {
  const valores = filas.map((f) => series.map((s) => num(f[s.clave])))
  const p = proy ? filas.map((f) => ({ v: num(f[proy.proyeccion]), lo: num(f[proy.inferior]), hi: num(f[proy.superior]) })) : null
  const todos = []
  valores.forEach((fila) => fila.forEach((v) => v !== null && todos.push(v)))
  p?.forEach((x) => [x.v, x.lo, x.hi].forEach((v) => v !== null && todos.push(v)))
  const ultimoReal = valores.reduce((u, fila, i) => (fila[0] !== null ? i : u), -1)
  return { valores, p, ultimoReal, eje: escala(Math.min(...todos, 0), Math.max(...todos, 0)) }
}

function Leyenda({ series, proy }) {
  if (series.length < 2 && !proy) return null
  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
      {series.map((s, i) => <li key={s.clave} className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-sm ${COLOR[i % COLOR.length].punto}`} />{s.etiqueta}</li>)}
      {proy && <li className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-sm opacity-60 ${AZUL.punto}`} />Proyección</li>}
      {proy && <li className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-sm opacity-25 ${AZUL.punto}`} />Rango probable (80 %)</li>}
    </ul>
  )
}

/** Cuadro con el detalle del punto tocado o señalado. */
function Detalle({ fila, indice, series, proy, columnaX, ancho, x }) {
  const p = proy ? { v: num(fila[proy.proyeccion]), lo: num(fila[proy.inferior]), hi: num(fila[proy.superior]) } : null
  const esProyeccion = p?.v !== null && p && num(fila[series[0].clave]) === null
  const izq = Math.min(Math.max(x - 85, 0), Math.max(0, ancho - 175))
  return (
    <div className="pointer-events-none absolute top-0 z-10 w-[170px] rounded-control border bg-white px-3 py-2 text-xs shadow-lg" style={{ left: izq }} role="status">
      <p className="mb-1 font-semibold">{etiquetaX(fila[columnaX])}{esProyeccion ? ' · proyección' : ''}</p>
      {!esProyeccion && series.map((s, i) => (
        <p key={s.clave} className="flex items-center justify-between gap-2"><span className="flex items-center gap-1 truncate"><span className={`h-2 w-2 shrink-0 rounded-full ${COLOR[i % COLOR.length].punto}`} />{recortar(s.etiqueta, 16)}</span><span className="cifra font-medium">{formatear(fila[s.clave], s.formato)}</span></p>
      ))}
      {esProyeccion && <>
        <p className="flex justify-between gap-2"><span>Estimado</span><span className="cifra font-medium">{formatear(p.v, series[0].formato)}</span></p>
        <p className="mt-0.5 text-gray-500">Entre {formatear(p.lo, series[0].formato)} y {formatear(p.hi, series[0].formato)}</p>
      </>}
      {fila.participacion != null && <p className="mt-0.5 text-gray-500">{formatear(fila.participacion, 'porcentaje')} del total</p>}
      <span className="hidden">{indice}</span>
    </div>
  )
}

function EjeY({ eje, ancho, M, alto, formato }) {
  const y = (v) => M.top + (alto - M.top - M.bottom) * (1 - (v - eje.min) / (eje.max - eje.min))
  return eje.marcas.map((m) => (
    <g key={m}>
      <line x1={M.left} x2={ancho - M.right} y1={y(m)} y2={y(m)} className={m === 0 ? 'stroke-gray-400' : 'stroke-gray-200'} strokeWidth="1" />
      <text x={M.left - 6} y={y(m) + 3.5} textAnchor="end" fontSize="11" className="fill-gray-500">{compacto(m, formato)}</text>
    </g>
  ))
}

const margenIzq = (eje, formato) => Math.max(36, Math.max(...eje.marcas.map((m) => compacto(m, formato).length)) * 6.6 + 12)

// ───────────────────────── Líneas y área ─────────────────────────
function Lineas({ ancho, filas, series, columnaX, proy, area }) {
  const [activo, setActivo] = useState(null)
  const { valores, p, ultimoReal, eje } = useMemo(() => preparar(filas, series, proy), [filas, series, proy])
  const alto = 270
  const M = { top: 14, right: 14, bottom: 32, left: margenIzq(eje, series[0].formato) }
  const anchoPlot = ancho - M.left - M.right; const n = filas.length
  const px = (i) => M.left + (n === 1 ? anchoPlot / 2 : (i * anchoPlot) / (n - 1))
  const py = (v) => M.top + (alto - M.top - M.bottom) * (1 - (v - eje.min) / (eje.max - eje.min))
  const base = py(Math.max(eje.min, 0))
  // Tramos continuos (la línea se corta donde no hay dato)
  const tramos = (get) => { const out = []; let t = []; filas.forEach((_, i) => { const v = get(i); if (v === null) { if (t.length) out.push(t); t = [] } else t.push([px(i), py(v)]) }); if (t.length) out.push(t); return out }
  const trazo = (t) => t.map(([x, y], i) => `${i ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const banda = p ? (() => {
    const idx = filas.map((_, i) => i).filter((i) => p[i].lo !== null && p[i].hi !== null)
    return idx.length > 1 ? `${idx.map((i, k) => `${k ? 'L' : 'M'} ${px(i).toFixed(1)} ${py(p[i].hi).toFixed(1)}`).join(' ')} ${[...idx].reverse().map((i) => `L ${px(i).toFixed(1)} ${py(p[i].lo).toFixed(1)}`).join(' ')} Z` : null
  })() : null
  const paso = pasoEtiquetas(n, Math.floor(anchoPlot / 56))
  const mover = (e) => {
    const r = e.currentTarget.ownerSVGElement.getBoundingClientRect()
    const rel = (e.clientX - r.left - M.left) / anchoPlot
    setActivo(Math.min(n - 1, Math.max(0, Math.round(rel * (n - 1)))))
  }
  return (
    <div className="relative">
      <svg width={ancho} height={alto} role="img" aria-label="Gráfica de líneas" className="block">
        <EjeY eje={eje} ancho={ancho} M={M} alto={alto} formato={series[0].formato} />
        {filas.map((f, i) => i % paso === 0 && <text key={i} x={px(i)} y={alto - 10} textAnchor="middle" fontSize="11" className="fill-gray-500">{etiquetaX(f[columnaX])}</text>)}
        {banda && <path d={banda} className={`${AZUL.relleno} opacity-20`} />}
        {area && series.map((s, k) => tramos((i) => valores[i][k]).map((t, j) => <path key={`${k}-${j}`} d={`${trazo(t)} L ${t[t.length - 1][0].toFixed(1)} ${base} L ${t[0][0].toFixed(1)} ${base} Z`} className={`${COLOR[k % COLOR.length].relleno} opacity-15`} />))}
        {series.map((s, k) => tramos((i) => valores[i][k]).map((t, j) => <path key={`${k}-${j}`} d={trazo(t)} fill="none" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" className={COLOR[k % COLOR.length].trazo} />))}
        {p && tramos((i) => p[i].v).map((t, j) => <path key={`p${j}`} d={trazo(t)} fill="none" strokeWidth="2.2" strokeDasharray="6 5" strokeLinecap="round" className={AZUL.trazo} />)}
        {p && ultimoReal >= 0 && <>
          <line x1={px(ultimoReal)} x2={px(ultimoReal)} y1={M.top} y2={alto - M.bottom} className="stroke-gray-400" strokeDasharray="3 3" />
          <text x={px(ultimoReal) - 5} y={M.top + 10} textAnchor="end" fontSize="10" className="fill-gray-500">real</text>
          {ancho - px(ultimoReal) > 84 && <text x={px(ultimoReal) + 5} y={M.top + 10} fontSize="10" className="fill-gray-500">proyección</text>}
        </>}
        {n <= 24 && series.map((s, k) => filas.map((_, i) => valores[i][k] !== null && <circle key={`${k}-${i}`} cx={px(i)} cy={py(valores[i][k])} r="3" className={`${COLOR[k % COLOR.length].relleno} stroke-white`} strokeWidth="1" />))}
        {n <= 24 && p && filas.map((_, i) => p[i].v !== null && valores[i][0] === null && <circle key={`p${i}`} cx={px(i)} cy={py(p[i].v)} r="3.2" className={`fill-white ${AZUL.trazo}`} strokeWidth="1.8" />)}
        {activo !== null && <line x1={px(activo)} x2={px(activo)} y1={M.top} y2={alto - M.bottom} className="stroke-gray-300" />}
        {activo !== null && series.map((s, k) => { const v = valores[activo][k] ?? p?.[activo].v; return v !== null && v !== undefined && <circle key={k} cx={px(activo)} cy={py(v)} r="4.5" className={`${COLOR[k % COLOR.length].relleno} stroke-white`} strokeWidth="2" /> })}
        <rect x={M.left} y={M.top} width={Math.max(0, anchoPlot)} height={Math.max(0, alto - M.top - M.bottom)} fill="transparent" onPointerMove={mover} onPointerDown={mover} onPointerLeave={() => setActivo(null)} />
      </svg>
      {activo !== null && <Detalle fila={filas[activo]} indice={activo} series={series} proy={proy} columnaX={columnaX} ancho={ancho} x={px(activo)} />}
      <Leyenda series={series} proy={proy} />
    </div>
  )
}

// ───────────────────────── Barras (verticales, agrupadas) ─────────────────────────
function Barras({ ancho, filas, series, columnaX, proy }) {
  const [activo, setActivo] = useState(null)
  const { valores, p, eje } = useMemo(() => preparar(filas, series, proy), [filas, series, proy])
  const alto = 270
  const M = { top: 14, right: 12, bottom: 38, left: margenIzq(eje, series[0].formato) }
  const anchoPlot = ancho - M.left - M.right; const n = filas.length
  const grupo = anchoPlot / n; const ancBarra = Math.min(46, Math.max(2, (grupo * 0.72) / series.length))
  const py = (v) => M.top + (alto - M.top - M.bottom) * (1 - (v - eje.min) / (eje.max - eje.min))
  const cero = py(0)
  const paso = pasoEtiquetas(n, Math.floor(anchoPlot / 34)) // etiquetas cortas (3 letras o 'oct 26'): caben más
  const cx = (i) => M.left + grupo * i + grupo / 2
  return (
    <div className="relative">
      <svg width={ancho} height={alto} role="img" aria-label="Gráfica de barras" className="block">
        <EjeY eje={eje} ancho={ancho} M={M} alto={alto} formato={series[0].formato} />
        {filas.map((f, i) => i % paso === 0 && <text key={i} x={cx(i)} y={alto - 16} textAnchor="middle" fontSize="11" className="fill-gray-500">{recortar(etiquetaPeriodo(f[columnaX], true), Math.max(3, Math.floor((grupo * paso) / 6.2)))}</text>)}
        {filas.map((f, i) => series.map((s, k) => {
          const real = valores[i][k]; const proyectado = real === null && k === 0 && p?.[i].v !== null && p ? p[i].v : null
          const v = real ?? proyectado
          if (v === null || v === undefined) return null
          const x = cx(i) - (ancBarra * series.length) / 2 + k * ancBarra
          const y = py(Math.max(v, 0)); const h = Math.max(1, Math.abs(py(v) - cero))
          return (
            <g key={`${i}-${k}`}>
              <rect x={x} y={y} width={Math.max(0, ancBarra - 1)} height={Math.max(0, h)} rx="2" className={`${proyectado !== null ? `${AZUL.relleno} opacity-50` : COLOR[k % COLOR.length].relleno} ${activo === i ? 'opacity-100' : ''}`} />
              {proyectado !== null && p[i].lo !== null && <line x1={x + ancBarra / 2} x2={x + ancBarra / 2} y1={py(p[i].lo)} y2={py(p[i].hi)} className="stroke-gray-600" strokeWidth="1.5" />}
            </g>
          )
        }))}
        {filas.map((_, i) => <rect key={i} x={M.left + grupo * i} y={M.top} width={grupo} height={alto - M.top - M.bottom} fill="transparent" onPointerEnter={() => setActivo(i)} onPointerDown={() => setActivo(i)} onPointerLeave={() => setActivo(null)} />)}
      </svg>
      {activo !== null && <Detalle fila={filas[activo]} indice={activo} series={series} proy={proy} columnaX={columnaX} ancho={ancho} x={cx(activo)} />}
      <Leyenda series={series} proy={proy} />
    </div>
  )
}

// ───────────────────────── Barras horizontales (rankings) ─────────────────────────
function BarrasH({ ancho, filas, series, columnaX }) {
  const s = series[0]
  const valores = filas.map((f) => num(f[s.clave]) ?? 0)
  const eje = escala(Math.min(...valores, 0), Math.max(...valores, 0))
  const etiqueta = Math.min(190, Math.max(96, Math.round(ancho * 0.38)))
  const fila = 30; const alto = filas.length * fila + 8
  const derecha = 92; const anchoPlot = Math.max(40, ancho - etiqueta - derecha)
  const px = (v) => etiqueta + ((v - eje.min) / (eje.max - eje.min)) * anchoPlot
  return (
    <svg width={ancho} height={alto} role="img" aria-label="Gráfica de barras horizontales" className="block">
      <line x1={px(0)} x2={px(0)} y1="0" y2={alto} className="stroke-gray-300" />
      {filas.map((f, i) => {
        const v = valores[i]; const y = i * fila + 4
        const x0 = Math.min(px(0), px(v)); const w = Math.max(2, Math.abs(px(v) - px(0)))
        return (
          <g key={i}>
            <text x={etiqueta - 8} y={y + 16} textAnchor="end" fontSize="12" className="fill-gray-700"><title>{String(f[columnaX])}</title>{recortar(f[columnaX], Math.floor(etiqueta / 6.4))}</text>
            <rect x={x0} y={y + 3} width={Math.max(0, w)} height={Math.max(0, fila - 10)} rx="3" className={COLOR[0].relleno} />
            <text x={Math.max(px(v), px(0)) + 6} y={y + 16} fontSize="12" className="fill-gray-800 cifra">{compacto(v, s.formato)}<tspan className="fill-gray-500" fontSize="11">{f.participacion != null ? `  ${formatear(f.participacion, 'porcentaje')}` : ''}</tspan></text>
          </g>
        )
      })}
    </svg>
  )
}

// ───────────────────────── Dona ─────────────────────────
function Dona({ ancho, filas, series, columnaX }) {
  const s = series[0]
  const valores = filas.map((f) => Math.max(0, num(f[s.clave]) ?? 0))
  const total = valores.reduce((a, b) => a + b, 0)
  const lado = Math.min(190, ancho)
  const arcos = arcosDona(valores, lado / 2, lado / 2, lado / 2 - 4, lado / 2 - 34)
  return (
    <div className={`flex ${ancho >= 460 ? 'flex-row items-center gap-8' : 'flex-col items-center gap-4'}`}>
      <svg width={lado} height={lado} role="img" aria-label="Gráfica de dona" className="shrink-0">
        {arcos.map((a) => <path key={a.indice} d={a.path} fillRule="evenodd" className={`${COLOR[a.indice % COLOR.length].relleno} stroke-white`} strokeWidth="2" />)}
        <text x={lado / 2} y={lado / 2 - 2} textAnchor="middle" fontSize="11" className="fill-gray-500">Total</text>
        <text x={lado / 2} y={lado / 2 + 16} textAnchor="middle" fontSize="16" fontWeight="600" className="fill-gray-900 cifra">{compacto(total, s.formato)}</text>
      </svg>
      <ul className="w-full min-w-0 flex-1 space-y-1.5 text-sm">
        {filas.map((f, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className={`h-3 w-3 shrink-0 rounded-sm ${COLOR[i % COLOR.length].punto}`} />
            <span className="min-w-0 flex-1 truncate">{String(f[columnaX])}</span>
            <span className="cifra shrink-0 font-medium">{formatear(valores[i], s.formato)}</span>
            <span className="cifra w-14 shrink-0 text-right text-gray-500">{total > 0 ? formatear((valores[i] / total) * 100, 'porcentaje') : ''}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ───────────────────────── Cifra ─────────────────────────
function Cifra({ fila, series, columnas }) {
  const variacion = columnas.find((c) => c.clave === 'variacion_pct') && fila.variacion_pct != null ? Number(fila.variacion_pct) : null
  return (
    <div className="flex flex-wrap items-end gap-x-8 gap-y-4 py-2">
      {series.map((s, i) => (
        <div key={s.clave}>
          <p className="text-xs text-gray-500">{s.etiqueta}</p>
          <p className={`cifra font-semibold tracking-tight ${i === 0 ? 'text-4xl' : 'text-2xl text-gray-600'}`}>{formatear(fila[s.clave], s.formato)}</p>
        </div>
      ))}
      {variacion !== null && (
        <span className={`mb-1 rounded-full px-3 py-1 text-sm font-semibold ${variacion >= 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{variacion >= 0 ? '▲' : '▼'} {formatear(Math.abs(variacion), 'porcentaje')}</span>
      )}
    </div>
  )
}

// ───────────────────────── Tabla ─────────────────────────
function Tabla({ columnas, filas }) {
  return (
    <div className="max-h-80 overflow-auto rounded-control border">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-gray-50 text-left text-[13px] text-gray-500">
          <tr>{columnas.map((c) => <th key={c.clave} className={`px-3 py-2 font-medium ${c.formato === 'texto' ? '' : 'text-right'}`}>{c.etiqueta}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {filas.map((f, i) => (
            <tr key={i}>
              {columnas.map((c) => {
                const v = f[c.clave]; const n = Number(v)
                const color = c.clave === 'variacion_pct' || c.clave === 'diferencia' ? (n > 0 ? 'text-green-700' : n < 0 ? 'text-red-600' : '') : ''
                return <td key={c.clave} className={`px-3 py-1.5 ${c.formato === 'texto' ? '' : 'cifra text-right'} ${color}`}>{c.formato === 'texto' ? (v === null || v === undefined ? '—' : /^\d{4}-\d{2}(-\d{2})?$/.test(String(v)) ? etiquetaPeriodo(v) : String(v)) : formatear(v, c.formato)}</td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function GraficaDinamica({ tipo, grafica, columnas, filas }) {
  const [ref, ancho] = useAncho()
  const t = tipo ?? grafica.tipo
  const series = grafica.series
  if (!filas?.length) return <p className="py-8 text-center text-sm text-gray-500">No hay datos para mostrar.</p>
  if (t === 'tabla') return <Tabla columnas={columnas} filas={filas} />
  if (t === 'numero') return <Cifra fila={filas[0]} series={series} columnas={columnas} />
  return (
    <div ref={ref} className="w-full">
      {ancho > 0 && (t === 'barras_horizontales' ? <BarrasH ancho={ancho} filas={filas} series={series} columnaX={grafica.x} />
        : t === 'dona' ? <Dona ancho={ancho} filas={filas} series={series} columnaX={grafica.x} />
        : t === 'barras' ? <Barras ancho={ancho} filas={filas} series={series} columnaX={grafica.x} proy={grafica.proyeccion} />
        : <Lineas ancho={ancho} filas={filas} series={series} columnaX={grafica.x} proy={grafica.proyeccion} area={t === 'area'} />)}
    </div>
  )
}
