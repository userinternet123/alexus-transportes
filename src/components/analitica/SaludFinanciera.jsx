// ─────────────────────────────────────────────────────────────────────────────
// SALUD FINANCIERA (toda la empresa): estado de resultados, indicadores con semáforo y explicación sencilla,
// punto de equilibrio, efectivo, IVA estimado y gastos. Lo calcula el motor analítico local con lo que se
// registra en SPVI. Pensado para dueños que no son contadores: cada cifra dice qué significa.
// ─────────────────────────────────────────────────────────────────────────────
import { UtilWidget } from '../comun/Experiencia'
import { useCallback, useEffect, useState } from 'react'
import { Download, Info, RefreshCw } from 'lucide-react'
import api from '../../services/api'
import { descargarCsv } from '../../utils/grafica'
import { errorApi } from '../pos/formato'

const SEMAFORO = { verde: ['Bien', 'bg-green-500', 'text-green-800 bg-green-50'], amarillo: ['Atención', 'bg-amber-400', 'text-amber-900 bg-amber-50'], rojo: ['Riesgo', 'bg-red-500', 'text-red-800 bg-red-50'], gris: ['Informativo', 'bg-gray-400', 'text-gray-700 bg-gray-100'] }
const PESTANAS = [['indicadores', 'Indicadores'], ['resultados', 'Estado de resultados'], ['efectivo', 'Efectivo'], ['iva', 'IVA'], ['gastos', 'Gastos']]
const MEDIOS = { EFECTIVO: 'Efectivo', TARJETA: 'Tarjeta', TRANSFERENCIA: 'Transferencia', CHEQUE: 'Cheque', VALE: 'Vale', CREDITO: 'Crédito' }
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const q = (n) => (n === null || n === undefined ? '—' : `Q${Number(n).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
const pct = (n) => (n === null || n === undefined ? '—' : `${Number(n).toLocaleString('es-GT', { maximumFractionDigits: 1 })} %`)
const nombreMes = (m) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`
const valor = (i) => (i.valor === null ? '—' : i.unidad === 'Q' ? q(i.valor) : i.unidad === '%' ? pct(i.valor) : `${Number(i.valor).toLocaleString('es-GT')} ${i.unidad}`)

function Tarjeta({ i }) {
  const [etiqueta, punto, chip] = SEMAFORO[i.semaforo] ?? SEMAFORO.gris
  return (
    <li className="flex flex-col rounded-superficie border bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-medium leading-snug text-gray-700">{i.nombre}</h3>
        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${chip}`}><span className={`h-2 w-2 rounded-full ${punto}`} aria-hidden />{etiqueta}</span>
      </div>
      <p className="cifra mt-1 text-2xl font-semibold">{valor(i)}</p>
      <p className="mt-1 text-sm text-gray-700">{i.explicacion}</p>
      <details className="mt-2 text-xs text-gray-500">
        <summary className="inline-flex cursor-pointer select-none items-center gap-1"><Info className="h-3.5 w-3.5" aria-hidden /> ¿Cómo se calcula?</summary>
        <p className="mt-1">{i.detalle}</p>
        {i.meta && <p className="mt-1"><b>A qué apuntar:</b> {i.meta}</p>}
      </details>
    </li>
  )
}

function Tabla({ columnas, filas, totales, nombre }) {
  return (
    <div>
      <div className="overflow-x-auto rounded-superficie border bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead><tr className="border-b bg-gray-50 text-left text-xs text-gray-500">{columnas.map((c) => <th key={c.clave} className={`px-3 py-2 ${c.num ? 'text-right' : ''}`}>{c.etiqueta}</th>)}</tr></thead>
          <tbody>
            {filas.map((f, k) => <tr key={k} className={`border-b last:border-0 ${f._actual ? 'text-gray-500' : ''}`}>{columnas.map((c) => <td key={c.clave} className={`px-3 py-2 ${c.num ? 'cifra text-right' : ''} ${c.fuerte ? 'font-semibold' : ''} ${c.negativo && f[c.clave] < 0 ? 'text-red-700' : ''}`}>{c.fmt ? c.fmt(f[c.clave], f) : f[c.clave]}</td>)}</tr>)}
          </tbody>
          {totales && <tfoot><tr className="border-t-2 bg-gray-50 font-semibold">{columnas.map((c) => <td key={c.clave} className={`px-3 py-2 ${c.num ? 'cifra text-right' : ''}`}>{c.fmt ? c.fmt(totales[c.clave], totales) : totales[c.clave]}</td>)}</tr></tfoot>}
        </table>
      </div>
      <button type="button" onClick={() => descargarCsv(nombre, columnas.map((c) => ({ clave: c.clave, etiqueta: c.etiqueta })), filas)} className="mt-2 inline-flex items-center gap-1.5 rounded-control border bg-white px-3 py-1.5 text-sm hover:bg-gray-50"><Download className="h-4 w-4" aria-hidden /> Descargar para Excel</button>
    </div>
  )
}

/** Barras del resultado mensual (verde: ganó; rojo: perdió). */
function BarrasResultado({ filas }) {
  const max = Math.max(...filas.map((f) => Math.abs(f.utilidad_operativa)), 1)
  const ancho = 100 / filas.length
  return (
    <figure className="rounded-superficie border bg-white p-4" aria-label="Resultado de cada mes después de gastos">
      <figcaption className="mb-2 text-sm font-medium">Resultado de cada mes después de gastos</figcaption>
      <svg viewBox="0 0 100 44" preserveAspectRatio="none" className="h-36 w-full" role="img">
        <line x1="0" x2="100" y1="22" y2="22" stroke="currentColor" className="text-gray-300" strokeWidth="0.2" />
        {filas.map((f, k) => {
          const h = Math.max(0.4, (Math.abs(f.utilidad_operativa) / max) * 20)
          return <rect key={f.mes} x={k * ancho + ancho * 0.15} width={ancho * 0.7} y={f.utilidad_operativa >= 0 ? 22 - h : 22} height={h} className={f.utilidad_operativa >= 0 ? 'fill-green-600' : 'fill-red-500'}><title>{`${nombreMes(f.mes)}: ${q(f.utilidad_operativa)}`}</title></rect>
        })}
      </svg>
      <div className="flex text-[10px] text-gray-500">{filas.map((f) => <span key={f.mes} className="flex-1 text-center">{nombreMes(f.mes).split(' ')[0]}</span>)}</div>
    </figure>
  )
}

export default function SaludFinanciera() {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [comprasConIva, setComprasConIva] = useState(true)
  const [pestana, setPestana] = useState('indicadores')
  const cargar = useCallback(async (conIva) => {
    setCargando(true); setError(null)
    try { const { data } = await api.get('/finanzas/salud', { params: { comprasConIva: conIva }, timeout: 90000 }); setDatos(data.data) } catch (e) { setError(errorApi(e).mensaje) } finally { setCargando(false) }
  }, [])
  useEffect(() => { cargar(true) }, [cargar])

  const er = datos ? datos.estado_resultados.slice(-13).map((f) => ({ ...f, _actual: f.mes === datos.mesActual })) : []
  const completos = er.filter((f) => !f._actual)
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-gray-600">Cómo está el negocio en dinero: cuánto gana de verdad, cuánto necesita vender para no perder, cuánto dinero tiene detenido en mercadería y el IVA aproximado. Toda la empresa, con lo que se registra en SPVI.</p>
        <button type="button" disabled={cargando} onClick={() => cargar(comprasConIva)} className="inline-flex items-center gap-1.5 rounded-control border bg-white px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${cargando ? 'animate-spin' : ''}`} aria-hidden /> Actualizar</button>
      </div>
      {error && <p className="rounded-control bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{error}</p>}
      {!datos && !error && <p className="py-10 text-center text-sm text-gray-500" role="status">Calculando…</p>}
      {datos && <>
        <section className="rounded-superficie border bg-white p-4" aria-label="Resumen">
          <ul className="space-y-1 text-[15px]">{datos.resumen.map((s) => <li key={s}>{s}</li>)}</ul>
        </section>
        {datos.avisos.length > 0 && <ul className="space-y-1 rounded-control bg-amber-50 px-4 py-3 text-sm text-amber-900" role="note">{datos.avisos.map((a) => <li key={a}>{a}</li>)}</ul>}
        <div className="flex flex-wrap gap-1 rounded-control bg-gray-200 p-0.5 text-sm" role="tablist">
          {PESTANAS.map(([k, t]) => <button key={k} type="button" role="tab" aria-selected={pestana === k} onClick={() => setPestana(k)} className={`rounded-[6px] px-3 py-1.5 ${pestana === k ? 'bg-white font-medium shadow-sm' : 'text-gray-600'}`}>{t}</button>)}
        </div>

        {pestana === 'indicadores' && <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{datos.indicadores.map((i) => <Tarjeta key={i.clave} i={i} />)}</ul>}

        {pestana === 'resultados' && <div className="space-y-3">
          {completos.length > 0 && <BarrasResultado filas={completos} />}
          <Tabla nombre="Estado de resultados" filas={er} totales={datos.ultimos_12 ? { ...datos.ultimos_12, mes: 'Últimos 12 meses' } : null} columnas={[
            { clave: 'mes', etiqueta: 'Mes', fmt: (v, f) => (f.mes === 'Últimos 12 meses' ? v : `${nombreMes(v)}${f._actual ? ' (en curso)' : ''}`) },
            { clave: 'ventas_netas', etiqueta: 'Ventas (sin IVA)', num: true, fmt: q }, { clave: 'costo_ventas', etiqueta: 'Costo de lo vendido', num: true, fmt: q },
            { clave: 'utilidad_bruta', etiqueta: 'Utilidad bruta', num: true, fmt: q }, { clave: 'margen_bruto', etiqueta: 'Margen', num: true, fmt: pct },
            { clave: 'personal', etiqueta: 'Sueldos', num: true, fmt: q }, { clave: 'gastos_caja', etiqueta: 'Gastos de caja', num: true, fmt: q }, { clave: 'otros_gastos', etiqueta: 'Otros gastos', num: true, fmt: q },
            { clave: 'utilidad_operativa', etiqueta: 'Resultado', num: true, fuerte: true, negativo: true, fmt: q }, { clave: 'margen_operativo', etiqueta: 'Margen final', num: true, fmt: pct },
          ]} />
          <p className="text-xs text-gray-500">Las ventas y los costos van sin IVA: el IVA no es del negocio, es de la SAT. Las devoluciones ya están restadas. El mes en curso está incompleto.</p>
        </div>}

        {pestana === 'efectivo' && <div className="space-y-2">
          <Tabla nombre="Efectivo" filas={datos.efectivo.slice(-13).map((f) => ({ ...f, ...Object.fromEntries(Object.keys(MEDIOS).map((m) => [m, f.cobros[m] ?? 0])) }))} columnas={[
            { clave: 'mes', etiqueta: 'Mes', fmt: nombreMes }, ...Object.entries(MEDIOS).map(([k, v]) => ({ clave: k, etiqueta: k === 'CREDITO' ? 'Crédito (por cobrar)' : v, num: true, fmt: q })),
            { clave: 'egresos_caja', etiqueta: 'Gastos de caja', num: true, fmt: q }, { clave: 'otros_gastos', etiqueta: 'Otros gastos', num: true, fmt: q }, { clave: 'personal', etiqueta: 'Sueldos', num: true, fmt: q }, { clave: 'compras', etiqueta: 'Compras', num: true, fmt: q },
            { clave: 'neto_estimado', etiqueta: 'Neto estimado', num: true, fuerte: true, negativo: true, fmt: q },
          ]} />
          <p className="text-xs text-gray-500">Neto estimado = lo cobrado (sin el crédito) − gastos de caja − otros gastos − sueldos − compras. Supone que las compras y los sueldos se pagaron en su mes. El efectivo ya descuenta el cambio entregado.</p>
        </div>}

        {pestana === 'iva' && <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-control bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span>Cifras orientativas: el IVA de compras es <b>estimado</b> porque SPVI no guarda el IVA de cada factura de compra. Su contador tiene las cifras exactas.</span>
            <label className="flex items-center gap-2 font-medium"><input type="checkbox" checked={comprasConIva} onChange={(e) => { setComprasConIva(e.target.checked); cargar(e.target.checked) }} className="accent-green-600" /> Mis compras se registran con IVA incluido</label>
          </div>
          <Tabla nombre="IVA estimado" filas={datos.iva.slice(-13)} columnas={[
            { clave: 'mes', etiqueta: 'Mes', fmt: nombreMes }, { clave: 'debito', etiqueta: 'IVA de ventas (débito)', num: true, fmt: q },
            { clave: 'credito_estimado', etiqueta: 'IVA de compras (crédito, estimado)', num: true, fmt: q }, { clave: 'a_pagar_estimado', etiqueta: 'A pagar (estimado)', num: true, fuerte: true, fmt: q },
            { clave: 'remanente_estimado', etiqueta: 'Remanente a favor', num: true, fmt: q },
          ]} />
        </div>}

        {pestana === 'gastos' && <div className="space-y-2">
          {datos.gastosPorConcepto.length ? (
            <ul className="divide-y rounded-superficie border bg-white">
              {datos.gastosPorConcepto.map((g) => {
                const max = datos.gastosPorConcepto[0].monto || 1
                return (
                  <li key={g.concepto} className="px-4 py-2.5 text-sm">
                    <div className="flex justify-between gap-3"><span>{g.concepto} <span className="text-xs text-gray-500">({g.veces} {g.veces === 1 ? 'vez' : 'veces'})</span></span><span className="cifra font-medium">{q(g.monto)}</span></div>
                    <div className="mt-1 h-1.5 rounded-full bg-gray-100"><div className="h-1.5 rounded-full bg-amber-500" style={{ width: `${(g.monto / max) * 100}%` }} /></div>
                  </li>
                )
              })}
            </ul>
          ) : <p className="rounded-superficie border bg-white px-4 py-8 text-center text-sm text-gray-500">No hay gastos registrados en caja.</p>}
          <p className="text-xs text-gray-500">Gastos de caja y gastos fuera de caja de los últimos 2 años, agrupados por concepto o categoría. Los gastos pagados fuera de la caja (alquiler, luz, internet…) se registran en Caja › Gastos.</p>
        </div>}
      </>}
      <UtilWidget pantalla="salud-financiera" />
    </div>
  )
}
