// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD ANALÍTICO — decisiones de compra y venta con los datos del API.
//  • Ventas del período vs. período anterior (indicadores + tendencia diaria)
//  • Más vendidos · Mayor margen · Temporada próxima (comprar anticipado)
//  • Reponer (existencia baja) · Baja rotación (no recomprar)
// Cada bloque usa un reporte del API y respeta los permisos del usuario.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, TrendingUp, Percent, CalendarClock, PackagePlus, PackageX } from 'lucide-react'
import api from '../../services/api'
import { usePermisos } from '../../hooks/usePermisos'
import { Q } from '../pos/formato'
import { BarrasHorizontales, ColumnasComparadas, ColumnasTiempo, Indicador } from '../comun/Graficas'
import { anterior, anioActual, etiquetaMes, menosAnios, mesActual, MESES, porDia, rangoDe } from './periodos'
import BotonPantallaCompleta from '../comun/BotonPantallaCompleta'

const ymd = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(d)
const COMPARAR = {
  anterior: 'Período anterior',
  anioAnterior: 'Mismo período del año pasado',
  anios: 'Años anteriores (gráfica por mes)',
}

const sumar = (filas, k) => filas.reduce((a, f) => a + Number(f[k] || 0), 0)
const entero = (v) => Number(v || 0).toLocaleString('es-GT', { maximumFractionDigits: 1 })

function Bloque({ titulo, icono: Icono, children, nota }) {
  return (
    <section className="rounded-xl border bg-white p-4">
      <h3 className="flex items-center gap-2 font-semibold"><Icono className="h-4 w-4 text-green-700" aria-hidden /> {titulo}</h3>
      {nota && <p className="mt-0.5 text-xs text-gray-500">{nota}</p>}
      <div className="mt-3">{children}</div>
    </section>
  )
}

export default function DashboardAnalitico() {
  const { puede } = usePermisos()
  const [sel, setSel] = useState({ modo: 'mes', mes: mesActual(), mesDesde: `${anioActual()}-01`, mesHasta: mesActual(), anio: anioActual(), dias: 30 })
  const [comparar, setComparar] = useState('anterior')
  const [aniosComparar, setAniosComparar] = useState(2)
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(false)

  const cargar = useCallback(async () => {
    setCargando(true)
    const r = rangoDe(sel)
    const ref = comparar === 'anterior' ? anterior(r) : menosAnios(r, 1)
    const diario = porDia(r)
    const pedir = (clave, params, permiso) =>
      puede(permiso) ? api.get(`/reportes/${clave}`, { params }).then((x) => x.data.data).catch(() => null) : Promise.resolve(null)
    const serie = diario ? 'ventas-por-dia' : 'ventas-por-mes'
    const historicos = comparar === 'anios'
      ? Promise.all(Array.from({ length: aniosComparar + 1 }, (_, i) => {
          const ri = menosAnios(r, i)
          return pedir('ventas-por-mes', ri, 'reportes.ventas').then((filas) => ({ anio: ri.desde.slice(0, 4), filas: filas ?? [] }))
        }))
      : Promise.resolve(null)
    const [dias, diasAnt, productos, temporada, reponer, lentos, comparacion] = await Promise.all([
      pedir(serie, r, 'reportes.ventas'),
      pedir(serie, ref, 'reportes.ventas'),
      pedir('ventas-por-producto', r, 'reportes.ventas'),
      pedir('estacionalidad', { meses: 2, anios: 3, limite: 10 }, 'reportes.analitica'),
      pedir('sugerido-compra', { umbral: 5, diasVenta: 30, diasObjetivo: 30 }, 'reportes.inventario'),
      pedir('productos-menos-vendidos', { desde: ymd(new Date(Date.now() - 89 * 86_400_000)), hasta: r.hasta, limite: 10 }, 'reportes.analitica'),
      historicos,
    ])
    setDatos({ r, ref, diario, dias, diasAnt, productos, temporada, reponer, lentos, comparacion })
    setCargando(false)
  }, [sel, comparar, aniosComparar, puede])

  useEffect(() => { cargar() }, [cargar])

  if (!datos) return <p className="p-6 text-gray-500">Cargando análisis…</p>
  const { dias, diasAnt, productos, temporada, reponer, lentos, comparacion } = datos

  const kpi = (filas) => {
    if (!filas) return null
    const total = sumar(filas, 'total')
    const utilidad = sumar(filas, 'utilidad')
    const ventas = sumar(filas, 'ventas')
    return { total, utilidad, ventas, ticket: ventas ? total / ventas : 0, margen: total ? (utilidad / total) * 100 : 0 }
  }
  const act = kpi(dias)
  const ant = kpi(diasAnt)

  const masVendidos = (productos ?? []).slice(0, 10).map((p) => ({ etiqueta: p.producto, valor: p.total, detalle: `${entero(p.cantidad)} unidades · ${p.marca ?? 'sin marca'}` }))
  // Margen: solo productos con costo registrado y algo de volumen
  const mayorMargen = (productos ?? [])
    .filter((p) => Number(p.costo) > 0 && Number(p.cantidad) >= 3)
    .sort((a, b) => Number(b.utilidad) - Number(a.utilidad))
    .slice(0, 10)
    .map((p) => ({ etiqueta: p.producto, valor: p.utilidad, detalle: `Margen ${Number(p.margen).toFixed(1)}% · venta ${Q(p.total)}` }))
  const sinCosto = (productos ?? []).filter((p) => Number(p.costo) === 0).length
  const reponerConVenta = (reponer ?? []).filter((p) => Number(p.ventaDiaria) > 0)

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold">Dashboard analítico</h2>
        <div className="flex items-center gap-2">
          <select aria-label="Tipo de período" value={sel.modo} onChange={(e) => setSel((x) => ({ ...x, modo: e.target.value }))} className="rounded border px-2 py-1.5 text-sm">
            <option value="mes">Un mes</option><option value="rango">Rango de meses</option><option value="anio">Año completo</option><option value="ultimos">Últimos días</option>
          </select>
          {sel.modo === 'mes' && <input type="month" aria-label="Mes" value={sel.mes} max={mesActual()} onChange={(e) => setSel((x) => ({ ...x, mes: e.target.value }))} className="rounded border px-2 py-1 text-sm" />}
          {sel.modo === 'rango' && (
            <>
              <input type="month" aria-label="Desde el mes" value={sel.mesDesde} max={sel.mesHasta} onChange={(e) => setSel((x) => ({ ...x, mesDesde: e.target.value }))} className="rounded border px-2 py-1 text-sm" />
              <span className="text-sm">a</span>
              <input type="month" aria-label="Hasta el mes" value={sel.mesHasta} min={sel.mesDesde} max={mesActual()} onChange={(e) => setSel((x) => ({ ...x, mesHasta: e.target.value }))} className="rounded border px-2 py-1 text-sm" />
            </>
          )}
          {sel.modo === 'anio' && (
            <select aria-label="Año" value={sel.anio} onChange={(e) => setSel((x) => ({ ...x, anio: Number(e.target.value) }))} className="rounded border px-2 py-1.5 text-sm">
              {Array.from({ length: 8 }, (_, i) => anioActual() - i).map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          )}
          {sel.modo === 'ultimos' && (
            <select aria-label="Días" value={sel.dias} onChange={(e) => setSel((x) => ({ ...x, dias: Number(e.target.value) }))} className="rounded border px-2 py-1.5 text-sm">
              {[7, 30, 90, 180, 365].map((d) => <option key={d} value={d}>{d} días</option>)}
            </select>
          )}
          <select aria-label="Comparar con" value={comparar} onChange={(e) => setComparar(e.target.value)} className="rounded border px-2 py-1.5 text-sm">
            {Object.entries(COMPARAR).map(([k, v]) => <option key={k} value={k}>vs. {v}</option>)}
          </select>
          {comparar === 'anios' && (
            <select aria-label="Cuántos años" value={aniosComparar} onChange={(e) => setAniosComparar(Number(e.target.value))} className="rounded border px-2 py-1.5 text-sm">
              {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n} año{n > 1 ? 's' : ''} atrás</option>)}
            </select>
          )}
          <button type="button" onClick={cargar} disabled={cargando} className="inline-flex items-center gap-1 rounded-lg border bg-white px-3 py-1.5 text-sm disabled:opacity-50"><RefreshCw className="h-4 w-4" /> Actualizar</button>
          <BotonPantallaCompleta vista="dashboard" />
        </div>
      </div>

      {act && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Indicador titulo="Ventas" valor={act.total} anterior={ant?.total} formato={Q} />
          {puede('finanzas.costos') && <Indicador titulo="Utilidad bruta" valor={act.utilidad} anterior={ant?.utilidad} formato={Q} />}
          <Indicador titulo="Número de ventas" valor={act.ventas} anterior={ant?.ventas} formato={entero} />
          <Indicador titulo="Ticket promedio" valor={act.ticket} anterior={ant?.ticket} formato={Q} />
        </div>
      )}

      {dias && (
        <Bloque titulo={datos.diario ? 'Ventas por día' : 'Ventas por mes'} icono={TrendingUp}
          nota={`${datos.r.desde} a ${datos.r.hasta}${puede('finanzas.costos') ? ` · margen ${act.margen.toFixed(1)}%` : ''} · comparado con ${datos.ref.desde} a ${datos.ref.hasta}`}>
          <ColumnasTiempo datos={dias.map((d) => ({ etiqueta: datos.diario ? d.fecha : etiquetaMes(d.mes), valor: d.total }))} formato={Q} />
        </Bloque>
      )}

      {comparacion && (
        <Bloque titulo="Comparación con años anteriores" icono={TrendingUp} nota="Mismos meses de cada año">
          {(() => {
            const meses = [...new Set(comparacion.flatMap((c) => c.filas.map((f) => f.mes.slice(5, 7))))].sort()
            const series = [...comparacion].reverse().map((c) => ({
              nombre: c.anio,
              valores: meses.map((m) => Number(c.filas.find((f) => f.mes.slice(5, 7) === m)?.total ?? 0)),
            }))
            const totales = series.map((s) => ({ anio: s.nombre, total: s.valores.reduce((a, v) => a + v, 0) }))
            return (
              <>
                <ColumnasComparadas categorias={meses.map((m) => MESES[Number(m) - 1])} series={series} formato={Q} />
                <table className="mt-3 w-full text-sm">
                  <thead className="text-left text-xs text-gray-500"><tr><th>Año</th><th className="text-right">Ventas</th><th className="text-right">Variación vs. año anterior</th></tr></thead>
                  <tbody>
                    {totales.map((t, i) => {
                      const prev = totales[i - 1]?.total
                      const v = prev ? ((t.total - prev) / prev) * 100 : null
                      return <tr key={t.anio} className="border-t"><td className="py-1">{t.anio}</td><td className="text-right tabular-nums">{Q(t.total)}</td><td className={`text-right ${v == null ? '' : v >= 0 ? 'text-green-700' : 'text-red-600'}`}>{v == null ? '—' : `${v >= 0 ? '▲' : '▼'} ${Math.abs(v).toFixed(1)}%`}</td></tr>
                    })}
                  </tbody>
                </table>
              </>
            )
          })()}
        </Bloque>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {productos && (
          <Bloque titulo="Más vendidos del período" icono={TrendingUp} nota={`${datos.r.desde} a ${datos.r.hasta}`}>
            <BarrasHorizontales datos={masVendidos} formato={Q} />
          </Bloque>
        )}
        {productos && puede('finanzas.costos') && (
          <Bloque titulo="Mayor ganancia" icono={Percent} nota={sinCosto ? `${sinCosto} productos vendidos no tienen costo registrado y se excluyen` : 'Utilidad = venta − costo promedio'}>
            <BarrasHorizontales datos={mayorMargen} formato={Q} color="bg-emerald-500" vacio="Sin productos con costo registrado" />
          </Bloque>
        )}
        {temporada && (
          <Bloque titulo="Temporada próxima: comprar anticipado" icono={CalendarClock} nota="Productos que en los próximos 2 meses vendieron bastante más que su promedio en años anteriores">
            <BarrasHorizontales
              datos={temporada.slice(0, 8).map((p) => ({ etiqueta: p.producto, valor: p.sugerido, detalle: `${p.indice}× su promedio · ${entero(p.ventaMesTemporada)}/mes en temporada · existencia ${entero(p.existencia)}` }))}
              formato={(v) => `comprar ${entero(v)}`} color="bg-amber-500" vacio="Sin productos de temporada para los próximos meses"
            />
          </Bloque>
        )}
        {reponer && (
          <Bloque titulo="Reponer pronto" icono={PackagePlus} nota={`${reponer.length} productos con existencia ≤ 5 · se muestran los que sí se venden`}>
            <BarrasHorizontales
              datos={reponerConVenta.slice(0, 8).map((p) => ({ etiqueta: p.producto, valor: p.sugerido, detalle: `Existencia ${entero(p.existencia)} · ${entero(p.ventaDiaria)}/día · ${p.diasCobertura ?? 0} días de cobertura` }))}
              formato={(v) => `comprar ${entero(v)}`} color="bg-sky-500" vacio="Nada urgente por reponer"
            />
          </Bloque>
        )}
        {lentos && (
          <Bloque titulo="Baja rotación: no recomprar" icono={PackageX} nota="Con existencia y pocas o ninguna venta en 90 días (capital inmovilizado)">
            <BarrasHorizontales
              datos={lentos.slice(0, 8).map((p) => ({ etiqueta: p.producto, valor: p.valorInmovilizado, detalle: `${entero(p.unidadesVendidas)} vendidas · existencia ${entero(p.existencia)} · última venta ${p.ultimaVenta ?? 'nunca'}` }))}
              formato={Q} color="bg-red-400" vacio="Sin productos estancados"
            />
          </Bloque>
        )}
      </div>
      <p className="text-xs text-gray-500">El detalle completo de cada bloque está en Reportes (Excel incluido).</p>
    </div>
  )
}
