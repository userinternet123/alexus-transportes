// ─────────────────────────────────────────────────────────────────────────────
// PREGUNTA A TUS DATOS: el usuario escribe una pregunta en lenguaje normal y recibe una
// gráfica (a elegir) con su explicación, o una proyección con su rango y confiabilidad.
// Las cifras de la gráfica salen directo de la base de datos; la IA solo redacta la explicación.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'
import { BarChart3, BookmarkPlus, Send, Sparkles } from 'lucide-react'
import api from '../../services/api'
import { usePermisos } from '../../hooks/usePermisos'
import { showToast } from '../../utils/showToast'
import { errorApi } from '../pos/formato'
import EditorAnalisis from './EditorAnalisis'
import RespuestaAnalitica from './RespuestaAnalitica'

const PASOS = ['Entendiendo la pregunta…', 'Consultando tus datos…', 'Calculando…', 'Preparando la gráfica…']

function Pensando() {
  const [paso, setPaso] = useState(0)
  useEffect(() => { const t = setInterval(() => setPaso((p) => Math.min(p + 1, PASOS.length - 1)), 3500); return () => clearInterval(t) }, [])
  return (
    <div className="flex items-center gap-3 rounded-tarjeta border bg-white p-4 text-sm text-gray-600" role="status" aria-live="polite">
      <span className="flex gap-1" aria-hidden><i className="h-2 w-2 animate-bounce rounded-full bg-green-600 [animation-delay:-0.3s]" /><i className="h-2 w-2 animate-bounce rounded-full bg-green-600 [animation-delay:-0.15s]" /><i className="h-2 w-2 animate-bounce rounded-full bg-green-600" /></span>
      {PASOS[paso]}
    </div>
  )
}

export default function AsistenteDatos() {
  const { puede } = usePermisos()
  const [cap, setCap] = useState(null)
  const [guardando, setGuardando] = useState(null) // respuesta que se está guardando como análisis
  const [mensajes, setMensajes] = useState([])
  const [entrada, setEntrada] = useState('')
  const [enviando, setEnviando] = useState(false)
  const fin = useRef(null)

  useEffect(() => { api.get('/agente/capacidades').then(({ data }) => setCap(data.data)).catch(() => setCap({ disponible: false, ejemplos: [] })) }, [])
  useEffect(() => { fin.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [mensajes, enviando])

  const preguntar = async (texto) => {
    const pregunta = texto.trim()
    if (pregunta.length < 3 || enviando) return
    // El asistente recuerda lo último hablado ("ahora en barras", "¿y el mes pasado?")
    const historial = []
    for (let i = 0; i < mensajes.length - 1; i += 1) {
      if (mensajes[i].rol === 'usuario' && mensajes[i + 1].rol === 'asistente' && !mensajes[i + 1].error) historial.push({ pregunta: mensajes[i].texto, respuesta: mensajes[i + 1].respuesta.explicacion ?? '' })
    }
    setMensajes((m) => [...m, { id: Date.now(), rol: 'usuario', texto: pregunta }])
    setEntrada('')
    setEnviando(true)
    try {
      const { data } = await api.post('/agente/preguntar', { pregunta, historial: historial.slice(-6) }, { timeout: 130000 })
      setMensajes((m) => [...m, { id: Date.now() + 1, rol: 'asistente', respuesta: data.data }])
    } catch (e) {
      setMensajes((m) => [...m, { id: Date.now() + 1, rol: 'asistente', error: errorApi(e).mensaje }])
    } finally { setEnviando(false) }
  }

  const guardarAnalisis = async (payload) => {
    try { await api.post('/analisis/plantillas', payload); showToast({ type: 'success', message: 'Análisis guardado. Lo encuentra en Reportes › Mis análisis.' }); setGuardando(null) }
    catch (e) { showToast({ type: 'error', message: errorApi(e).mensaje }) }
  }

  if (cap && !cap.disponible) {
    return (
      <div className="mx-auto max-w-xl p-6 text-center">
        <Sparkles className="mx-auto mb-3 h-8 w-8 text-gray-300" aria-hidden />
        <p className="text-lg font-semibold">Todavía no está activado en este servidor</p>
        <p className="mt-2 text-sm text-gray-600">Para preguntar a sus datos con IA, su proveedor debe configurar el servicio de IA en el servidor (clave IA_API_KEY). Mientras tanto, puede usar el Dashboard analítico y el Centro de reportes.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col gap-4 p-4">
      {!mensajes.length && (
        <section className="rounded-superficie border bg-white p-5">
          <p className="flex items-center gap-2 text-lg font-semibold"><BarChart3 className="h-5 w-5 text-green-700" aria-hidden /> Pregunte a sus datos</p>
          <p className="mt-1 text-sm text-gray-600">Escriba lo que quiere saber, como se lo preguntaría a una persona. Recibirá una gráfica, que puede cambiar de tipo, y una explicación. También puede pedir proyecciones.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {(cap?.ejemplos ?? []).map((e) => <button key={e} type="button" onClick={() => preguntar(e)} className="rounded-full border px-3 py-1.5 text-left text-sm text-gray-700 hover:border-green-600 hover:bg-green-50">{e}</button>)}
          </div>
        </section>
      )}

      <div className="flex flex-1 flex-col gap-4">
        {mensajes.map((m) => m.rol === 'usuario'
          ? <div key={m.id} className="self-end rounded-2xl rounded-br-md bg-green-600 px-4 py-2.5 text-[15px] text-white">{m.texto}</div>
          : m.error
            ? <div key={m.id} className="rounded-tarjeta border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">{m.error}</div>
            : <RespuestaAnalitica key={m.id} r={m.respuesta} acciones={m.respuesta.plantillaSugerida && puede('reportes.analitica')
              ? <button type="button" onClick={() => setGuardando(m.respuesta.plantillaSugerida)} className="inline-flex items-center gap-1.5 rounded-control border border-green-600 px-3 py-1.5 text-sm font-medium text-green-800 hover:bg-green-50"><BookmarkPlus className="h-4 w-4" aria-hidden /> Guardar como análisis</button> : null} />)}
        {enviando && <Pensando />}
        <div ref={fin} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); preguntar(entrada) }} className="sticky bottom-0 -mx-1 bg-gray-100/90 px-1 pb-1 pt-2 backdrop-blur">
        <div className="flex items-end gap-2 rounded-superficie border bg-white p-2 shadow-sm focus-within:border-green-600">
          <textarea value={entrada} onChange={(e) => setEntrada(e.target.value)} rows={1} maxLength={500} placeholder="Por ejemplo: ¿qué categoría vende más este año?"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); preguntar(entrada) } }}
            className="max-h-32 min-h-[44px] flex-1 resize-none bg-transparent px-2 py-2.5 text-[15px] outline-none" aria-label="Su pregunta" />
          <button type="submit" disabled={enviando || entrada.trim().length < 3} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-green-600 text-white disabled:opacity-40" aria-label="Enviar pregunta"><Send className="h-5 w-5" /></button>
        </div>
        <p className="mt-1.5 px-2 text-[11px] leading-snug text-gray-500">Para responder, se envían a un servicio de IA las cifras consultadas (ventas, productos, vendedores). No se envían datos de clientes. Verifique las decisiones importantes.</p>
      </form>
      {guardando && <EditorAnalisis titulo="Guardar como análisis" textoGuardar="Guardar análisis" inicial={{ nombre: guardando.definicion.titulo, descripcion: '', definicion: guardando.definicion }} fijos={guardando.fijos} onCerrar={() => setGuardando(null)} onGuardar={guardarAnalisis} />}
    </div>
  )
}
