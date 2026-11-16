// Centro de reportes 100% guiado por metadata del API (GET /reportes):
// un reporte nuevo en el backend aparece aquí sin escribir código de UI.
import { useEffect, useMemo, useState } from 'react'
import { FileSpreadsheet, Play } from 'lucide-react'
import api, { descargar } from '../../services/api'
import { usePermisos } from '../../hooks/usePermisos'
import { showToast } from '../../utils/showToast'
import { Q, errorApi } from '../comun/formato'

const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(new Date())
const formatear = (v, tipo) => {
  if (v === null || v === undefined) return '—'
  if (tipo === 'moneda') return Q(v)
  if (tipo === 'porcentaje') return `${Number(v).toFixed(2)}%`
  if (tipo === 'numero') return Number(v).toLocaleString('es-GT')
  return String(v)
}

export default function CentroReportes() {
  const { puede } = usePermisos()
  const [catalogo, setCatalogo] = useState([])
  const [clave, setClave] = useState('')
  const [filtros, setFiltros] = useState({ consolidado: 'false' })
  const [resultado, setResultado] = useState(null)
  const [cargando, setCargando] = useState(false)

  useEffect(() => { api.get('/reportes').then(({ data }) => setCatalogo(data.data)) }, [])
  const def = useMemo(() => catalogo.find((r) => r.clave === clave), [catalogo, clave])
  const porCategoria = useMemo(() => catalogo.reduce((acc, r) => ({ ...acc, [r.categoria]: [...(acc[r.categoria] ?? []), r] }), {}), [catalogo])

  // Envía solo los parámetros del reporte; los no tocados usan su valor por defecto (o el del API)
  const params = () => Object.fromEntries(
    Object.entries(def?.parametrosUI ?? {})
      .map(([k, ui]) => [k, filtros[k] ?? ui.defecto])
      .filter(([, v]) => v !== undefined && v !== '')
  )

  const ejecutar = async () => {
    setCargando(true)
    try {
      const { data } = await api.get(`/reportes/${clave}`, { params: params() })
      setResultado(data)
    } catch (e) {
      showToast({ type: 'error', message: errorApi(e).mensaje })
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="grid gap-4 p-4 lg:grid-cols-[260px_1fr]">
      <nav className="rounded-xl border bg-white p-3" aria-label="Reportes disponibles">
        {Object.entries(porCategoria).map(([cat, items]) => (
          <div key={cat} className="mb-3">
            <p className="px-2 text-xs font-medium text-gray-500">{cat}</p>
            {items.map((r) => (
              <button key={r.clave} type="button" onClick={() => { setClave(r.clave); setResultado(null) }}
                className={`block w-full rounded-lg px-2 py-1.5 text-left text-sm ${clave === r.clave ? 'bg-green-100 text-green-900' : 'hover:bg-gray-50'}`}>
                {r.titulo}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <section className="rounded-xl border bg-white p-4">
        {!def ? (
          <p className="text-gray-500">Elija un reporte de la lista.</p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2"><h2 className="text-xl font-semibold">{def.titulo}</h2></div>
            <p className="text-sm text-gray-600">{def.descripcion}</p>
            <div className="mt-4 flex flex-wrap items-end gap-3">
              {Object.entries(def.parametrosUI ?? {}).map(([k, ui]) => {
                if (ui.tipo === 'bool') {
                  if (k === 'consolidado' && !puede('sucursales.todas')) return null
                  return <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={filtros[k] === 'true'} onChange={(e) => setFiltros((f) => ({ ...f, [k]: String(e.target.checked) }))} /> {ui.etiqueta}</label>
                }
                // Fecha vacía = el valor por defecto del reporte (ej. hoy, o últimos 90 días)
                const valor = filtros[k] ?? (ui.tipo === 'fecha' ? '' : ui.defecto ?? '')
                return (
                  <label key={k} className="text-sm">{ui.etiqueta}
                    <input type={ui.tipo === 'fecha' ? 'date' : 'number'} min={ui.tipo === 'numero' ? 0 : undefined} step="any" value={valor}
                      onChange={(e) => setFiltros((f) => ({ ...f, [k]: e.target.value }))}
                      className={`ml-2 rounded border px-2 py-1 ${ui.tipo === 'numero' ? 'w-24 text-right' : ''}`} />
                  </label>
                )
              })}
              <button type="button" onClick={ejecutar} disabled={cargando} className="flex items-center gap-2 rounded-lg bg-green-700 px-4 py-2 text-white disabled:opacity-50"><Play className="h-4 w-4" /> {cargando ? 'Generando…' : 'Generar'}</button>
              <button type="button" onClick={() => descargar(`/reportes/${clave}/excel`, params()).catch((e) => showToast({ type: 'error', message: errorApi(e).mensaje }))} className="flex items-center gap-2 rounded-lg border px-4 py-2"><FileSpreadsheet className="h-4 w-4" /> Excel</button>
            </div>

            {resultado && (
              <div className="mt-4 overflow-auto">
                {resultado.data.length === 0 ? (
                  <p className="py-8 text-center text-gray-500">No hay datos para los filtros elegidos.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-gray-50 text-left text-gray-600">
                      <tr>{resultado.columnas.map((c) => <th key={c.accessorKey} className={`px-3 py-2 ${c.tipo !== 'texto' && c.tipo !== 'fecha' ? 'text-right' : ''}`}>{c.header}</th>)}</tr>
                    </thead>
                    <tbody>
                      {resultado.data.map((f, i) => (
                        <tr key={i} className="border-t">
                          {resultado.columnas.map((c) => <td key={c.accessorKey} className={`px-3 py-1.5 ${c.tipo !== 'texto' && c.tipo !== 'fecha' ? 'text-right tabular-nums' : ''}`}>{formatear(f[c.accessorKey], c.tipo)}</td>)}
                        </tr>
                      ))}
                    </tbody>
                    {Object.keys(resultado.totales).length > 0 && (
                      <tfoot className="border-t-2 font-semibold">
                        <tr>{resultado.columnas.map((c, i) => <td key={c.accessorKey} className="px-3 py-2 text-right tabular-nums">{i === 0 ? 'Total' : c.accessorKey in resultado.totales ? formatear(resultado.totales[c.accessorKey], c.tipo) : ''}</td>)}</tr>
                      </tfoot>
                    )}
                  </table>
                )}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}
