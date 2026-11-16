// ─────────────────────────────────────────────────────────────────────────────
// EXPERIENCIA: ayudar a ALEXUS a mejorar SPVI. El administrador decide UNA vez si comparte el uso del sistema
// (puede cambiarlo cuando quiera), y opcionalmente cuenta de su negocio. Cada 90 días se le pregunta si
// recomendaría SPVI. Cualquiera puede decir si una pantalla le sirvió o enviar una sugerencia.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Lightbulb, ShieldCheck, ThumbsDown, ThumbsUp, X } from 'lucide-react'
import api from '../../services/api'
import { showToast } from '../../utils/showToast'
import { activarUso, registrarPantalla } from '../../utils/uso'
import { errorApi } from '../pos/formato'
import Modal from './Modal'

const GIROS = ['Librería y papelería', 'Ferretería', 'Abarrotes / tienda', 'Ropa y calzado', 'Llantas y repuestos', 'Farmacia', 'Electrónica', 'Servicios', 'Otro']
const EMPLEADOS = { '1': 'Solo yo', '2-5': '2 a 5', '6-15': '6 a 15', '16-50': '16 a 50', 'mas-50': 'Más de 50' }
const CONOCIO = { recomendacion: 'Me lo recomendaron', redes: 'Redes sociales', buscador: 'Buscando en internet', visita: 'Visita de un vendedor', evento: 'Feria o evento', otro: 'Otro' }
const OBJETIVOS = { 'vender-mas': 'Vender más', 'controlar-inventario': 'Controlar el inventario', 'reducir-perdidas': 'Reducir pérdidas', 'facturar-fel': 'Facturar en línea (FEL)', 'conocer-numeros': 'Conocer mis números', 'crecer-sucursales': 'Abrir más sucursales', 'ahorrar-tiempo': 'Ahorrar tiempo' }
const POSPUESTO = 'spvi-nps-pospuesto'
const campo = 'mt-1 w-full rounded-control border px-3 py-2'

/** Primera vez (solo administradores): ¿compartir el uso? y, si quiere, el perfil del negocio. Se puede reabrir desde Ayuda. */
export function DialogoPrivacidad({ inicial, onCerrar, onListo }) {
  const [paso, setPaso] = useState(1)
  const [p, setP] = useState(() => ({ giro: '', empleados: '2-5', comoNosConocio: 'recomendacion', objetivos: [], ...(inicial?.perfil ?? {}) }))
  const [guardando, setGuardando] = useState(false)
  const decidir = async (acepta) => {
    setGuardando(true)
    try { const { data } = await api.put('/experiencia/consentimiento', { acepta }); showToast({ type: 'success', message: data.message }); activarUso(acepta); setPaso(2) }
    catch (e) { showToast({ type: 'error', message: errorApi(e).mensaje }) } finally { setGuardando(false) }
  }
  const guardarPerfil = async () => {
    setGuardando(true)
    try { const { data } = await api.put('/experiencia/perfil', { ...p, giro: p.giro.trim() }); showToast({ type: 'success', message: data.message }); onListo?.() }
    catch (e) { showToast({ type: 'error', message: errorApi(e).mensaje }) } finally { setGuardando(false) }
  }
  const objetivo = (k) => setP((x) => ({ ...x, objetivos: x.objetivos.includes(k) ? x.objetivos.filter((o) => o !== k) : [...x.objetivos, k] }))
  return (
    <Modal abierto titulo={paso === 1 ? 'Ayúdenos a mejorar SPVI' : 'Cuéntenos de su negocio (opcional)'} onCerrar={onCerrar} ancho="max-w-lg"
      pie={paso === 1
        ? <><button type="button" disabled={guardando} onClick={() => decidir(false)} className="rounded-control border px-4 py-2">No, gracias</button><button type="button" disabled={guardando} onClick={() => decidir(true)} className="rounded-control bg-green-600 px-4 py-2 font-medium text-white">Sí, compartir</button></>
        : <><button type="button" onClick={() => onListo?.()} className="rounded-control border px-4 py-2">Omitir</button><button type="button" disabled={guardando || p.giro.trim().length < 2} onClick={guardarPerfil} className="rounded-control bg-green-600 px-4 py-2 font-medium text-white disabled:opacity-50">Enviar</button></>}>
      {paso === 1 ? (
        <div className="space-y-3 text-sm">
          <p className="flex gap-2"><ShieldCheck className="h-5 w-5 shrink-0 text-green-700" aria-hidden /> ¿Nos permite saber <b>qué pantallas y funciones</b> se usan en este sistema? Así sabemos qué mejorar y qué explicar mejor.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-control bg-green-50 px-3 py-2"><p className="font-medium text-green-800">Sí se comparte</p><ul className="mt-1 list-disc pl-4 text-green-900"><li>Pantallas visitadas</li><li>Funciones usadas (cobrar, cotizar…)</li><li>Rol y tipo de equipo (celular o computadora)</li></ul></div>
            <div className="rounded-control bg-gray-100 px-3 py-2"><p className="font-medium">Nunca se comparte</p><ul className="mt-1 list-disc pl-4 text-gray-700"><li>Montos, precios o ventas</li><li>Nombres de clientes o productos</li><li>Quién hizo cada cosa</li></ul></div>
          </div>
          <p className="text-gray-600">Viaja cifrado: solo ALEXUS puede leerlo. Puede cambiar su decisión cuando quiera en <b>Ayuda y soporte</b>; si deja de compartir, se borra lo enviado.</p>
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <label className="block">Giro del negocio<input list="giros-spvi" value={p.giro} onChange={(e) => setP((x) => ({ ...x, giro: e.target.value }))} maxLength={60} className={campo} placeholder="Ej. Librería y papelería" /><datalist id="giros-spvi">{GIROS.map((g) => <option key={g} value={g} />)}</datalist></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">Personas que trabajan<select value={p.empleados} onChange={(e) => setP((x) => ({ ...x, empleados: e.target.value }))} className={campo}>{Object.entries(EMPLEADOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label className="block">¿Cómo conoció SPVI?<select value={p.comoNosConocio} onChange={(e) => setP((x) => ({ ...x, comoNosConocio: e.target.value }))} className={campo}>{Object.entries(CONOCIO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          </div>
          <fieldset><legend>¿Qué quiere lograr con SPVI?</legend>
            <div className="mt-1 flex flex-wrap gap-1.5">{Object.entries(OBJETIVOS).map(([k, v]) => <button key={k} type="button" aria-pressed={p.objetivos.includes(k)} onClick={() => objetivo(k)} className={`rounded-full border px-3 py-1 ${p.objetivos.includes(k) ? 'border-green-600 bg-green-50 text-green-800' : 'text-gray-600'}`}>{v}</button>)}</div>
          </fieldset>
        </div>
      )}
    </Modal>
  )
}

/** ¿Recomendaría SPVI? (0 a 10) — a quien administra, cada 90 días. Discreta y fácil de posponer. */
function EncuestaRecomendacion({ onListo }) {
  const [puntaje, setPuntaje] = useState(null)
  const [texto, setTexto] = useState('')
  const enviar = async () => {
    try { const { data } = await api.post('/experiencia/opinion', { tipo: 'NPS', puntaje, texto: texto.trim() || undefined }); showToast({ type: 'success', message: data.message }); onListo() }
    catch (e) { showToast({ type: 'error', message: errorApi(e).mensaje }) }
  }
  const posponer = () => { try { localStorage.setItem(POSPUESTO, String(Date.now() + 14 * 86_400_000)) } catch { /* sin almacenamiento */ } onListo() }
  return (
    <aside className="mac-spotlight fixed bottom-4 right-4 z-40 w-[min(24rem,calc(100vw-2rem))] rounded-2xl border bg-white p-4 shadow-xl" aria-labelledby="nps-titulo">
      <div className="flex items-start justify-between gap-2"><p id="nps-titulo" className="text-sm font-medium">¿Qué tan probable es que recomiende SPVI a otro negocio?</p><button type="button" onClick={posponer} className="rounded p-1 text-gray-400 hover:bg-gray-100" aria-label="Ahora no"><X className="h-4 w-4" /></button></div>
      <div className="mt-3 grid grid-cols-11 gap-1" role="radiogroup" aria-label="De 0 a 10">
        {Array.from({ length: 11 }, (_, n) => <button key={n} type="button" role="radio" aria-checked={puntaje === n} onClick={() => setPuntaje(n)} className={`cifra rounded-md border py-1.5 text-xs ${puntaje === n ? 'border-green-600 bg-green-600 text-white' : 'hover:bg-gray-50'}`}>{n}</button>)}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-gray-500"><span>Nada probable</span><span>Muy probable</span></div>
      {puntaje !== null && <>
        <label className="mt-3 block text-sm">{puntaje >= 9 ? '¿Qué es lo que más le gusta?' : '¿Qué deberíamos mejorar?'} <span className="text-gray-500">(opcional)</span><textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} maxLength={1000} className={campo} /></label>
        <button type="button" onClick={enviar} className="mt-2 w-full rounded-control bg-green-600 py-2 text-sm font-medium text-white">Enviar</button>
      </>}
    </aside>
  )
}

/** "¿Le sirvió esta pantalla?" al pie de las pantallas nuevas. */
export function UtilWidget({ pantalla }) {
  const [voto, setVoto] = useState(null)
  const [texto, setTexto] = useState('')
  const [enviado, setEnviado] = useState(false)
  const enviar = async (puntaje, comentario) => {
    try { await api.post('/experiencia/opinion', { tipo: 'UTIL', puntaje, pantalla, texto: comentario || undefined }); setEnviado(true) } catch (e) { showToast({ type: 'error', message: errorApi(e).mensaje }) }
  }
  if (enviado) return <p className="py-3 text-center text-sm text-gray-500">¡Gracias por su opinión!</p>
  return (
    <div className="flex flex-col items-center gap-2 py-3 text-sm text-gray-600">
      <div className="flex items-center gap-2"><span>¿Le sirvió esta pantalla?</span>
        <button type="button" onClick={() => { setVoto(1); enviar(1) }} className="rounded-full border p-1.5 hover:bg-green-50" aria-label="Sí, me sirvió"><ThumbsUp className="h-4 w-4" /></button>
        <button type="button" onClick={() => setVoto(0)} className={`rounded-full border p-1.5 hover:bg-red-50 ${voto === 0 ? 'border-red-300 bg-red-50' : ''}`} aria-label="No me sirvió"><ThumbsDown className="h-4 w-4" /></button>
      </div>
      {voto === 0 && <div className="flex w-full max-w-md gap-2"><input value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={300} placeholder="¿Qué le faltó? (opcional)" className="min-w-0 flex-1 rounded-control border px-3 py-1.5" aria-label="Qué le faltó" /><button type="button" onClick={() => enviar(0, texto.trim())} className="rounded-control border px-3 py-1.5">Enviar</button></div>}
    </div>
  )
}

/** Sugerencias al equipo de ALEXUS (en Ayuda y soporte), con la opción de cambiar la privacidad. */
export function Sugerencias() {
  const [texto, setTexto] = useState('')
  const [nombre, setNombre] = useState(false)
  const [estado, setEstado] = useState(null)
  const [dialogo, setDialogo] = useState(false)
  useEffect(() => { api.get('/experiencia/estado').then(({ data }) => setEstado(data.data)).catch(() => {}) }, [])
  const enviar = async () => {
    try { const { data } = await api.post('/experiencia/opinion', { tipo: 'SUGERENCIA', texto: texto.trim(), incluirNombre: nombre }); showToast({ type: 'success', message: data.message }); setTexto('') }
    catch (e) { showToast({ type: 'error', message: errorApi(e).mensaje }) }
  }
  return (
    <section className="mt-6 border-t pt-4" aria-labelledby="sug-titulo">
      <h3 id="sug-titulo" className="flex items-center gap-1.5 font-semibold"><Lightbulb className="h-4 w-4 text-amber-500" aria-hidden /> ¿Una idea para mejorar SPVI?</h3>
      <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} maxLength={1000} placeholder="Cuéntenos qué le gustaría que hiciera SPVI" className={`${campo} text-sm`} aria-label="Su sugerencia" />
      <label className="mt-1 flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" checked={nombre} onChange={(e) => setNombre(e.target.checked)} className="accent-green-600" /> Incluir mi nombre para que me contacten</label>
      <button type="button" disabled={texto.trim().length < 5} onClick={enviar} className="mt-2 rounded-control bg-green-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Enviar a ALEXUS</button>
      {estado?.administra && <p className="mt-3 text-xs text-gray-500">Compartir el uso del sistema: <b>{estado.consentimiento === 'si' ? 'activado' : estado.consentimiento === 'no' ? 'desactivado' : 'sin decidir'}</b>. <button type="button" onClick={() => setDialogo(true)} className="underline">Cambiar</button></p>}
      {dialogo && <DialogoPrivacidad inicial={estado} onCerrar={() => setDialogo(false)} onListo={() => setDialogo(false)} />}
    </section>
  )
}

/** Se monta una vez en el armazón: activa el registro de uso si hay permiso y muestra lo pendiente. */
export function AnfitrionExperiencia() {
  const [estado, setEstado] = useState(null)
  const [cerrado, setCerrado] = useState(false)
  const ubicacion = useLocation()
  const cargar = useCallback(() => api.get('/experiencia/estado').then(({ data }) => { setEstado(data.data); activarUso(data.data.consentimiento === 'si') }).catch(() => {}), [])
  useEffect(() => { cargar() }, [cargar])
  useEffect(() => { registrarPantalla(ubicacion.pathname) }, [ubicacion.pathname])
  if (!estado || cerrado) return null
  if (estado.administra && estado.consentimiento === null) return <DialogoPrivacidad inicial={estado} onCerrar={() => setCerrado(true)} onListo={() => { setCerrado(true); cargar() }} />
  let pospuesto = 0
  try { pospuesto = Number(localStorage.getItem(POSPUESTO) || 0) } catch { /* sin almacenamiento */ }
  if (estado.npsPendiente && Date.now() > pospuesto) return <EncuestaRecomendacion onListo={() => setCerrado(true)} />
  return null
}
