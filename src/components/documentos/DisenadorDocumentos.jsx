// ─────────────────────────────────────────────────────────────────────────────
// FORMATO DE DOCUMENTOS: el negocio diseña cómo se ven sus cotizaciones y facturas (papel, color, logo, qué datos
// y columnas lleva, notas, firmas y los mensajes de WhatsApp y correo). La vista previa cambia al instante, y
// "Ver PDF de prueba" genera el PDF real con el diseño que se está editando, aunque aún no se haya guardado.
// ─────────────────────────────────────────────────────────────────────────────
import { confirmar } from '../comun/Confirmacion'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { FileDown, RotateCcw, Save } from 'lucide-react'
import api from '../../services/api'
import { useMarca } from '../../hooks/useMarca'
import { showToast } from '../../utils/showToast'
import { archivoDesdeBlob, descargar } from '../../utils/compartir'
import { errorApi } from '../pos/formato'
import DocumentoVistaPrevia from './DocumentoVistaPrevia'

const TIPOS = [['COTIZACION', 'Cotización'], ['VENTA', 'Venta / factura']]
const PAPELES = { CARTA: 'Carta (8.5 × 11 pulg.)', MEDIA_CARTA: 'Media carta (8.5 × 5.5 pulg.)', A4: 'A4' }
const LETRAS = { PEQUENA: 'Pequeña', NORMAL: 'Normal', GRANDE: 'Grande' }
const POSICIONES = { IZQUIERDA: 'A la izquierda', CENTRO: 'Centrado arriba', DERECHA: 'A la derecha' }
const entrada = 'mt-1 w-full rounded-control border px-3 py-2 text-sm'

function Seccion({ titulo, abierta = false, children }) {
  return (
    <details open={abierta} className="rounded-tarjeta border bg-white">
      <summary className="cursor-pointer select-none px-4 py-3 font-medium">{titulo}</summary>
      <div className="space-y-3 border-t px-4 py-3">{children}</div>
    </details>
  )
}
const Interruptor = ({ etiqueta, valor, onChange, nota }) => (
  <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={valor} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 accent-green-600" /><span>{etiqueta}{nota && <span className="block text-xs text-gray-500">{nota}</span>}</span></label>
)

export default function DisenadorDocumentos() {
  const marca = useMarca()
  const [tipo, setTipo] = useState('COTIZACION')
  const [cargado, setCargado] = useState(null)
  const [p, setP] = useState(null)
  const [guardado, setGuardado] = useState('')
  const [trabajando, setTrabajando] = useState(false)

  const cargar = useCallback(async (t) => {
    setCargado(null); setP(null)
    try {
      const { data } = await api.get(`/documentos/vista-previa/${t}`)
      setCargado(data.data); setP(data.data.plantilla); setGuardado(JSON.stringify(data.data.plantilla))
    } catch (e) { showToast({ type: 'error', message: errorApi(e).mensaje }) }
  }, [])
  useEffect(() => { cargar(tipo) }, [tipo, cargar])

  const sucio = useMemo(() => p !== null && JSON.stringify(p) !== guardado, [p, guardado])
  const poner = (k, v) => setP((x) => ({ ...x, [k]: v }))
  const ponerEn = (g, k, v) => setP((x) => ({ ...x, [g]: { ...x[g], [k]: v } }))
  const cambiarTipo = async (t) => { if (sucio && !(await confirmar({ titulo: 'Cambios sin guardar', mensaje: 'Hay cambios sin guardar en este diseño. ¿Descartarlos?', confirmar: 'Descartar', peligro: true }))) return; setTipo(t) }

  const guardar = async () => {
    setTrabajando(true)
    try { const { data } = await api.put(`/documentos/plantillas/${tipo}`, p); setGuardado(JSON.stringify(p)); showToast({ type: 'success', message: data.message }) }
    catch (e) { showToast({ type: 'error', message: errorApi(e).mensaje }) } finally { setTrabajando(false) }
  }
  const restablecer = async () => {
    if (!(await confirmar({ titulo: 'Volver al diseño de fábrica', mensaje: 'Se pierden los cambios guardados de este documento.', confirmar: 'Restablecer', peligro: true }))) return
    setTrabajando(true)
    try { const { data } = await api.delete(`/documentos/plantillas/${tipo}`); setP(data.data); setGuardado(JSON.stringify(data.data)); showToast({ type: 'success', message: data.message }) }
    catch (e) { showToast({ type: 'error', message: errorApi(e).mensaje }) } finally { setTrabajando(false) }
  }
  const verPdf = async () => {
    setTrabajando(true)
    try { const { data } = await api.post(`/documentos/prueba/${tipo}`, p, { responseType: 'blob', timeout: 60000 }); descargar(archivoDesdeBlob(data, `Prueba-${tipo === 'COTIZACION' ? 'Cotizacion' : 'Venta'}.pdf`, 'application/pdf')) }
    catch (e) { showToast({ type: 'error', message: errorApi(e).mensaje }) } finally { setTrabajando(false) }
  }

  const logoUrl = marca.predeterminada.logo ? null : marca.logo

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-control bg-gray-200 p-0.5 text-sm" role="tablist">
          {TIPOS.map(([k, t]) => <button key={k} type="button" role="tab" aria-selected={tipo === k} onClick={() => cambiarTipo(k)} className={`rounded-[6px] px-4 py-1.5 ${tipo === k ? 'bg-white font-medium shadow-sm' : 'text-gray-600'}`}>{t}</button>)}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!p || trabajando} onClick={verPdf} className="inline-flex items-center gap-1.5 rounded-control border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"><FileDown className="h-4 w-4" aria-hidden /> Ver PDF de prueba</button>
          <button type="button" disabled={!p || trabajando} onClick={restablecer} className="inline-flex items-center gap-1.5 rounded-control border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"><RotateCcw className="h-4 w-4" aria-hidden /> Diseño de fábrica</button>
          <button type="button" disabled={!sucio || trabajando} onClick={guardar} className="inline-flex items-center gap-1.5 rounded-control bg-green-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"><Save className="h-4 w-4" aria-hidden /> {sucio ? 'Guardar cambios' : 'Guardado'}</button>
        </div>
      </div>
      {!p || !cargado ? <p className="py-10 text-center text-sm text-gray-500" role="status">Cargando el diseño…</p> : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
          <div className="space-y-3">
            <Seccion titulo="Papel y estilo" abierta>
              <label className="block text-sm">Tamaño de papel<select value={p.papel} onChange={(e) => poner('papel', e.target.value)} className={entrada}>{Object.entries(PAPELES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
              <label className="block text-sm">Título del documento<input value={p.titulo} maxLength={40} onChange={(e) => poner('titulo', e.target.value)} className={entrada} /></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">Color<input type="color" value={p.colorAcento} onChange={(e) => poner('colorAcento', e.target.value)} className="mt-1 h-10 w-full cursor-pointer rounded-control border" aria-label="Color del documento" /></label>
                <label className="block text-sm">Tamaño de letra<select value={p.tamanoLetra} onChange={(e) => poner('tamanoLetra', e.target.value)} className={entrada}>{Object.entries(LETRAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
              </div>
            </Seccion>
            <Seccion titulo="Logo y datos del negocio">
              <Interruptor etiqueta="Mostrar el logo" valor={p.logo.mostrar} onChange={(v) => ponerEn('logo', 'mostrar', v)} nota={logoUrl ? undefined : 'Aún no ha subido su logo: súbalo en Configuración del negocio.'} />
              {p.logo.mostrar && <>
                <label className="block text-sm">Posición del logo<select value={p.logo.posicion} onChange={(e) => ponerEn('logo', 'posicion', e.target.value)} className={entrada}>{Object.entries(POSICIONES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                <label className="block text-sm">Altura del logo: {p.logo.alto}<input type="range" min="20" max="120" value={p.logo.alto} onChange={(e) => ponerEn('logo', 'alto', Number(e.target.value))} className="mt-1 w-full accent-green-600" /></label>
              </>}
              {[['razonSocial', 'Razón social'], ['nit', 'NIT del negocio'], ['direccion', 'Dirección'], ['telefono', 'Teléfono'], ['correo', 'Correo'], ['eslogan', 'Eslogan']].map(([k, t]) => <Interruptor key={k} etiqueta={t} valor={p.encabezado[k]} onChange={(v) => ponerEn('encabezado', k, v)} />)}
            </Seccion>
            <Seccion titulo="Cliente y vendedor">
              {[['nit', 'NIT del cliente'], ['direccion', 'Dirección del cliente'], ['telefono', 'Teléfono del cliente'], ['correo', 'Correo del cliente']].map(([k, t]) => <Interruptor key={k} etiqueta={t} valor={p.cliente[k]} onChange={(v) => ponerEn('cliente', k, v)} />)}
              <Interruptor etiqueta="Mostrar el vendedor" valor={p.vendedor} onChange={(v) => poner('vendedor', v)} />
            </Seccion>
            <Seccion titulo="Tabla de artículos y totales">
              {[['numero', 'Número de línea (#)'], ['cantidad', 'Cantidad'], ['precio', 'Precio'], ['descuento', 'Descuento'], ['subtotal', 'Subtotal']].map(([k, t]) => <Interruptor key={k} etiqueta={t} valor={p.columnas[k]} onChange={(v) => ponerEn('columnas', k, v)} nota={k === 'descuento' ? 'Solo aparece si alguna línea tiene descuento.' : undefined} />)}
              <hr />
              <Interruptor etiqueta="Desglose: subtotal, descuento e IVA incluido" valor={p.mostrar.desglose} onChange={(v) => ponerEn('mostrar', 'desglose', v)} />
              <Interruptor etiqueta="Monto en letras (SON: …)" valor={p.mostrar.montoEnLetras} onChange={(v) => ponerEn('mostrar', 'montoEnLetras', v)} />
              <Interruptor etiqueta="Forma de pago y cambio" valor={p.mostrar.pagos} onChange={(v) => ponerEn('mostrar', 'pagos', v)} />
              <Interruptor etiqueta="Fecha de validez (cotizaciones)" valor={p.mostrar.validez} onChange={(v) => ponerEn('mostrar', 'validez', v)} />
              <Interruptor etiqueta="Observaciones de la venta" valor={p.mostrar.observaciones} onChange={(v) => ponerEn('mostrar', 'observaciones', v)} />
            </Seccion>
            <Seccion titulo="Notas, pie y firmas">
              <label className="block text-sm">Notas (condiciones, garantía…)<textarea value={p.textos.notas} rows={3} maxLength={600} onChange={(e) => ponerEn('textos', 'notas', e.target.value)} className={entrada} /></label>
              <label className="block text-sm">Pie de página<input value={p.textos.pie} maxLength={300} onChange={(e) => ponerEn('textos', 'pie', e.target.value)} className={entrada} /></label>
              <Interruptor etiqueta="Líneas de firma" valor={p.firmas.mostrar} onChange={(v) => ponerEn('firmas', 'mostrar', v)} />
              {p.firmas.mostrar && <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">Firma izquierda<input value={p.firmas.izquierda} maxLength={40} onChange={(e) => ponerEn('firmas', 'izquierda', e.target.value)} className={entrada} /></label>
                <label className="block text-sm">Firma derecha<input value={p.firmas.derecha} maxLength={40} onChange={(e) => ponerEn('firmas', 'derecha', e.target.value)} className={entrada} /></label>
              </div>}
            </Seccion>
            <Seccion titulo="Mensajes de WhatsApp y correo">
              <p className="text-xs text-gray-500">Puede usar {'{cliente}'}, {'{tipo}'}, {'{numero}'}, {'{total}'}, {'{negocio}'} y {'{fecha}'}.</p>
              <label className="block text-sm">Mensaje de WhatsApp<textarea value={p.textos.mensajeWhatsApp} rows={3} maxLength={400} onChange={(e) => ponerEn('textos', 'mensajeWhatsApp', e.target.value)} className={entrada} /></label>
              <label className="block text-sm">Asunto del correo<input value={p.textos.asuntoCorreo} maxLength={120} onChange={(e) => ponerEn('textos', 'asuntoCorreo', e.target.value)} className={entrada} /></label>
              <label className="block text-sm">Mensaje del correo<textarea value={p.textos.cuerpoCorreo} rows={5} maxLength={800} onChange={(e) => ponerEn('textos', 'cuerpoCorreo', e.target.value)} className={entrada} /></label>
            </Seccion>
          </div>
          <div className="lg:sticky lg:top-4 lg:self-start">
            <p className="mb-2 text-xs text-gray-500">Vista previa con datos de ejemplo. «Ver PDF de prueba» genera el PDF real con este diseño.{cargado?.datos.conMarca ? ' La firma «SPVI by ALEXUS» se quita con la licencia correspondiente.' : ''}</p>
            <DocumentoVistaPrevia datos={cargado.datos} p={p} logoUrl={logoUrl} />
          </div>
        </div>
      )}
    </div>
  )
}
