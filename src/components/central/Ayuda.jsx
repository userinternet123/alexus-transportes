// ─────────────────────────────────────────────────────────────────────────────
// AYUDA: tickets de soporte al proveedor (ALEXUS Central) desde el portal.
// El usuario describe el problema y puede adjuntar una captura; se agregan
// datos técnicos (pantalla, navegador, últimos errores) para resolver más rápido.
// La respuesta del proveedor llega aquí mismo.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { ImagePlus, LifeBuoy, Send } from 'lucide-react'
import api from '../../services/api'
import { showToast } from '../../utils/showToast'
import { prepararArchivo } from '../../utils/imagen'
import { erroresRecientes } from '../../utils/erroresWeb'
import { errorApi } from '../comun/formato'
import Hoja, { Grupo } from '../comun/Hoja'

const ESTADO = { ABIERTO: ['Recibido', 'bg-amber-50 text-amber-700'], EN_PROCESO: ['En atención', 'bg-sky-50 text-sky-700'], RESUELTO: ['Resuelto', 'bg-green-50 text-green-700'] }
const fecha = (f) => new Date(f).toLocaleString('es-GT', { dateStyle: 'short', timeStyle: 'short' })

export function BotonAyuda({ pendientes = 0 }) {
  const [abierta, setAbierta] = useState(false)
  // La campana de notificaciones abre este panel cuando soporte respondió
  useEffect(() => {
    const abrir = () => setAbierta(true)
    window.addEventListener('spvi:abrir-ayuda', abrir)
    return () => window.removeEventListener('spvi:abrir-ayuda', abrir)
  }, [])
  return (
    <>
      <button type="button" onClick={() => setAbierta(true)} className="relative rounded-md p-1.5 text-gray-600 hover:bg-gray-200" aria-label="Ayuda y soporte" title="Ayuda y soporte">
        <LifeBuoy className="h-5 w-5" />
        {pendientes > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white" aria-label={`${pendientes} respuestas nuevas`}>{pendientes}</span>}
      </button>
      {abierta && <Ayuda onCerrar={() => setAbierta(false)} />}
    </>
  )
}

export default function Ayuda({ onCerrar }) {
  const [vista, setVista] = useState('nuevo')
  const [tickets, setTickets] = useState(null)
  const [habilitado, setHabilitado] = useState(true)

  const cargar = () => api.get('/central/soporte/tickets').then(({ data }) => {
    setTickets(data.data)
    if (data.habilitado === false) setHabilitado(false)
  }).catch((e) => { setTickets([]); showToast({ type: 'error', message: errorApi(e).mensaje }) })
  useEffect(() => { cargar() }, [])

  return (
    <Hoja abierta titulo="Ayuda y soporte" onCerrar={onCerrar}>
      {!habilitado ? (
        <p className="rounded-tarjeta bg-amber-50 p-4 text-sm text-amber-800">El soporte en línea no está configurado en este servidor. Comuníquese con su proveedor por teléfono o correo.</p>
      ) : (
        <>
          <div className="mb-4 flex rounded-control bg-gray-200 p-0.5 text-sm" role="tablist">
            {[['nuevo', 'Nuevo reporte'], ['mis', `Mis reportes${tickets?.length ? ` (${tickets.length})` : ''}`]].map(([v, t]) => (
              <button key={v} type="button" role="tab" aria-selected={vista === v} onClick={() => setVista(v)} className={`flex-1 rounded-[6px] py-1.5 ${vista === v ? 'bg-white font-medium shadow-sm' : 'text-gray-600'}`}>{t}</button>
            ))}
          </div>
          {vista === 'nuevo'
            ? <NuevoTicket onEnviado={() => { cargar(); setVista('mis') }} />
            : <MisTickets tickets={tickets} onActualizar={cargar} />}
        </>
      )}
    </Hoja>
  )
}

function NuevoTicket({ onEnviado }) {
  const [asunto, setAsunto] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [captura, setCaptura] = useState(null) // { base64, vista }
  const [tecnicos, setTecnicos] = useState(true)
  const [enviando, setEnviando] = useState(false)

  const adjuntar = async (archivo) => {
    if (!archivo) return
    try {
      const { base64 } = await prepararArchivo(archivo, { maxLado: 1600, calidad: 0.7 })
      setCaptura({ base64, vista: base64 })
    } catch (e) { showToast({ type: 'error', message: e.message }) }
  }

  const enviar = async () => {
    setEnviando(true)
    try {
      const { data } = await api.post('/central/soporte/tickets', {
        asunto, descripcion, captura: captura?.base64,
        contexto: tecnicos ? { pantalla: window.location.pathname, navegador: navigator.userAgent, errores: erroresRecientes() } : undefined,
      })
      showToast({ type: 'success', message: data.message })
      onEnviado()
    } catch (e) {
      showToast({ type: 'error', message: errorApi(e).mensaje })
    } finally { setEnviando(false) }
  }

  return (
    <>
      <Grupo titulo="¿Qué pasó?" nota="Cuente qué intentaba hacer, qué esperaba y qué ocurrió.">
        <label className="block px-4 py-2.5"><span className="sr-only">Asunto</span>
          <input value={asunto} onChange={(e) => setAsunto(e.target.value)} placeholder="Asunto (ej. No imprime el ticket)" className="w-full bg-transparent text-[15px] outline-none" maxLength={150} />
        </label>
        <label className="block px-4 py-2.5"><span className="sr-only">Descripción</span>
          <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={5} placeholder="Descripción" className="w-full resize-none bg-transparent text-[15px] outline-none" maxLength={5000} />
        </label>
      </Grupo>
      <Grupo titulo="Captura de pantalla (opcional)">
        <div className="px-4 py-3">
          {captura && <img src={captura.vista} alt="Captura adjunta" className="mb-2 max-h-40 rounded-control border" />}
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-green-700">
            <ImagePlus className="h-4 w-4" /> {captura ? 'Cambiar imagen' : 'Adjuntar imagen'}
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => adjuntar(e.target.files?.[0])} />
          </label>
          <p className="mt-1 text-xs text-gray-500">En Windows: tecla Impr Pant o Windows + Shift + S. En el celular: botones de encendido y bajar volumen.</p>
        </div>
      </Grupo>
      <label className="mb-4 flex items-start gap-2 px-1 text-sm">
        <input type="checkbox" checked={tecnicos} onChange={(e) => setTecnicos(e.target.checked)} className="mt-0.5" />
        <span>Incluir datos técnicos: pantalla, navegador, versión y los últimos errores. No incluye ventas ni datos de clientes.</span>
      </label>
      <button type="button" disabled={asunto.trim().length < 3 || descripcion.trim().length < 5 || enviando} onClick={enviar} className="inline-flex w-full items-center justify-center gap-2 rounded-control bg-green-600 py-2.5 font-medium text-white disabled:opacity-50">
        <Send className="h-4 w-4" /> {enviando ? 'Enviando…' : 'Enviar a soporte'}
      </button>
    </>
  )
}

function MisTickets({ tickets, onActualizar }) {
  const [abierto, setAbierto] = useState(null)
  const [texto, setTexto] = useState('')
  if (tickets === null) return <p className="text-sm text-gray-500">Cargando…</p>
  if (!tickets.length) return <p className="py-8 text-center text-sm text-gray-500">Todavía no ha enviado reportes.</p>

  const responder = async (id) => {
    try {
      await api.post(`/central/soporte/tickets/${id}/mensajes`, { texto })
      setTexto('')
      onActualizar()
    } catch (e) { showToast({ type: 'error', message: errorApi(e).mensaje }) }
  }

  return (
    <ul className="space-y-2">
      {tickets.map((t) => {
        const [etiqueta, color] = ESTADO[t.estado] ?? ESTADO.ABIERTO
        const conRespuesta = t.mensajes.some((m) => m.autor === 'soporte')
        return (
          <li key={t.id} className="rounded-tarjeta border bg-white">
            <button type="button" onClick={() => setAbierto(abierto === t.id ? null : t.id)} className="flex w-full items-start justify-between gap-2 p-3 text-left" aria-expanded={abierto === t.id}>
              <span className="min-w-0">
                <span className="block truncate font-medium">#{t.id} {t.asunto}</span>
                <span className="text-xs text-gray-500">{fecha(t.actualizadoEn)}{conRespuesta ? ', con respuesta de soporte' : ''}</span>
              </span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>{etiqueta}</span>
            </button>
            {abierto === t.id && (
              <div className="space-y-2 border-t px-3 pb-3 pt-2">
                <p className="whitespace-pre-line text-sm text-gray-700">{t.descripcion}</p>
                {t.mensajes.map((m, i) => (
                  <div key={i} className={`rounded-control p-2.5 text-sm ${m.autor === 'soporte' ? 'bg-green-50' : 'bg-gray-100'}`}>
                    <p className="text-xs text-gray-500">{m.autor === 'soporte' ? `Soporte (${m.nombre})` : m.nombre}, {fecha(m.creadoEn)}</p>
                    <p className="whitespace-pre-line">{m.texto}</p>
                  </div>
                ))}
                <div className="flex gap-2 pt-1">
                  <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escribir una respuesta" className="flex-1 rounded-control border px-3 py-2 text-sm" aria-label="Respuesta" />
                  <button type="button" disabled={!texto.trim()} onClick={() => responder(t.id)} className="rounded-control bg-green-600 px-3 text-sm font-medium text-white disabled:opacity-50">Enviar</button>
                </div>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
