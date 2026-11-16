// Tarjeta de un resultado analítico: título, gráfica (con selector de tipo), confiabilidad de la proyección,
// explicación y descarga. La usan "Pregunta a tus datos", las plantillas guardadas y los tableros.
import { useState } from 'react'
import { Download, Info } from 'lucide-react'
import { descargarCsv } from '../../utils/grafica'
import GraficaDinamica from './GraficaDinamica'

export const TIPOS = { barras: 'Barras', barras_horizontales: 'Horizontales', lineas: 'Líneas', area: 'Área', dona: 'Dona', numero: 'Cifra', tabla: 'Tabla' }
const CONFIANZA = { alta: ['Confiabilidad alta', 'bg-green-50 text-green-700'], media: ['Confiabilidad media', 'bg-amber-50 text-amber-700'], baja: ['Confiabilidad baja', 'bg-red-50 text-red-700'] }

export default function RespuestaAnalitica({ r, acciones = null, compacta = false }) {
  const [tipo, setTipo] = useState(null) // null = el sugerido
  if (r.tipo === 'texto') return <div className="rounded-tarjeta border bg-white p-4 text-[15px] leading-relaxed"><p className="whitespace-pre-line">{r.explicacion}</p></div>
  const g = r.grafica
  const actual = tipo && g.tiposDisponibles.includes(tipo) ? tipo : g.tipo
  const conf = r.proyeccion ? CONFIANZA[r.proyeccion.confianza] : null
  return (
    <article className="overflow-hidden rounded-superficie border bg-white">
      <header className="flex flex-col gap-2 px-4 pt-4 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <h3 className={`min-w-0 flex-1 font-semibold leading-snug ${compacta ? 'text-[15px]' : 'text-[17px]'}`}>{r.titulo}</h3>
        {g.tiposDisponibles.length > 1 && (
          <div className="flex shrink-0 flex-wrap gap-1" role="radiogroup" aria-label="Tipo de gráfica">
            {g.tiposDisponibles.map((t) => (
              <button key={t} type="button" role="radio" aria-checked={actual === t} onClick={() => setTipo(t)}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${actual === t ? 'border-green-600 bg-green-50 text-green-800' : 'text-gray-600 hover:bg-gray-50'}`}>{TIPOS[t]}</button>
            ))}
          </div>
        )}
      </header>
      <div className="px-4 py-4"><GraficaDinamica tipo={actual} grafica={g} columnas={r.columnas} filas={r.filas} /></div>
      {conf && (
        <div className="mx-4 mb-3 flex flex-wrap items-center gap-2 text-xs">
          <span className={`rounded-full px-2.5 py-1 font-medium ${conf[1]}`}>{conf[0]}</span>
          {r.proyeccion.errorPct != null && <span className="text-gray-500">En una prueba con meses pasados, el error fue de {r.proyeccion.errorPct} %</span>}
        </div>
      )}
      {r.explicacion && <p className="whitespace-pre-line border-t bg-gray-50 px-4 py-3 text-[15px] leading-relaxed">{r.explicacion}</p>}
      {!compacta && <>
        {r.avisos?.map((a) => <p key={a} className="px-4 pt-2 text-xs text-amber-700">{a}</p>)}
        {r.proyeccion?.advertencias?.map((a) => <p key={a} className="px-4 pt-2 text-xs text-amber-700">⚠ {a}</p>)}
        <footer className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <details className="min-w-0 text-xs text-gray-500">
            <summary className="inline-flex cursor-pointer select-none items-center gap-1"><Info className="h-3.5 w-3.5" aria-hidden /> Cómo se calculó</summary>
            <ul className="mt-2 list-disc space-y-0.5 pl-5">
              {r.supuestos.map((s) => <li key={s}>{s}</li>)}
              {r.proyeccion && <li>Método de la proyección: {r.proyeccion.metodo}.</li>}
              <li>Las cifras salen directamente de su base de datos.{r.explicacion ? ' La explicación la redacta una IA: verifique las decisiones importantes.' : ''}</li>
            </ul>
          </details>
          <div className="flex flex-wrap gap-2">
            {acciones}
            <button type="button" onClick={() => descargarCsv(r.titulo, r.columnas, r.filas)} className="inline-flex items-center gap-1.5 rounded-control border px-3 py-1.5 text-sm hover:bg-gray-50"><Download className="h-4 w-4" aria-hidden /> Descargar para Excel</button>
          </div>
        </footer>
      </>}
    </article>
  )
}
