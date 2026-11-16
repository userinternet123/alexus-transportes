// ─────────────────────────────────────────────────────────────────────────────
// DEPÓSITOS BANCARIOS desde la caja: boleta, banco, depositante, monto y foto
// del comprobante. Un encargado (permiso caja.validar_deposito) valida la
// boleta con sus credenciales. El efectivo depositado se descuenta del
// esperado en el cuadre.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react'
import { Camera, Landmark, Paperclip } from 'lucide-react'
import api from '../../services/api'
import { showToast } from '../../utils/showToast'
import { subirArchivo, verArchivo } from '../../utils/imagen'
import Modal from '../comun/Modal'
import { conAutorizacion, useAutorizacion } from '../comun/AutorizacionSupervisor'
import { Q, errorApi } from './formato'

const BANCOS = ['BANRURAL', 'BI', 'BAM', 'G&T CONTINENTAL', 'BANTRAB', 'PROMERICA', 'INTERBANCO', 'FICOHSA', 'OTRO']
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(new Date())

export default function DepositosBancarios({ sesionId, onCambio }) {
  const [lista, setLista] = useState([])
  const [abierto, setAbierto] = useState(false)
  const { pedirAutorizacion, modalAutorizacion } = useAutorizacion()

  const cargar = useCallback(() => api.get(`/caja/sesiones/${sesionId}/depositos`).then(({ data }) => setLista(data.data)).catch(() => {}), [sesionId])
  useEffect(() => { cargar() }, [cargar])

  const total = lista.reduce((a, d) => a + Number(d.monto), 0)
  return (
    <section className="mt-6 rounded-xl border bg-white p-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-medium"><Landmark className="h-4 w-4 text-green-700" /> Depósitos bancarios del turno</h3>
        <button type="button" onClick={() => setAbierto(true)} className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50">Registrar depósito</button>
      </div>
      {lista.length > 0 ? (
        <table className="mt-2 w-full text-sm">
          <thead className="text-left text-xs text-gray-500"><tr><th className="py-1">Banco · boleta</th><th>Depositante</th><th>Validó</th><th className="text-right">Monto</th><th /></tr></thead>
          <tbody>
            {lista.map((d) => (
              <tr key={d.id} className="border-t">
                <td className="py-1.5">{d.banco} · {d.numeroBoleta}</td><td>{d.depositante}</td><td className="text-xs text-gray-600">{d.validadoPor}</td>
                <td className="text-right tabular-nums">{Q(d.monto)}</td>
                <td className="text-right">{d.comprobanteId && <button type="button" onClick={() => verArchivo(d.comprobanteId).catch((e) => showToast({ type: 'error', message: errorApi(e).mensaje }))} className="inline-flex items-center gap-1 text-xs text-green-700 hover:underline"><Paperclip className="h-3 w-3" /> Comprobante</button>}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr className="border-t font-semibold"><td colSpan={3} className="py-1.5">Total depositado</td><td className="text-right tabular-nums">{Q(total)}</td><td /></tr></tfoot>
        </table>
      ) : <p className="mt-2 text-sm text-gray-500">Sin depósitos en este turno. El efectivo depositado se descuenta del esperado en el cuadre.</p>}

      {abierto && (
        <NuevoDeposito sesionId={sesionId} pedir={pedirAutorizacion} onCerrar={() => setAbierto(false)}
          onListo={() => { setAbierto(false); cargar(); onCambio?.() }} />
      )}
      {modalAutorizacion}
    </section>
  )
}

function NuevoDeposito({ sesionId, pedir, onCerrar, onListo }) {
  const [f, setF] = useState({ banco: 'BANRURAL', otroBanco: '', numeroBoleta: '', depositante: '', monto: '', fechaDeposito: hoy(), observacion: '' })
  const [archivo, setArchivo] = useState(null)
  const [vista, setVista] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const banco = f.banco === 'OTRO' ? f.otroBanco.trim() : f.banco
  const valido = banco.length > 1 && f.numeroBoleta.trim().length >= 3 && f.depositante.trim().length >= 3 && Number(f.monto) > 0

  const elegirArchivo = (a) => {
    setArchivo(a ?? null)
    setVista(a && a.type.startsWith('image/') ? URL.createObjectURL(a) : null)
  }

  const guardar = async () => {
    setEnviando(true)
    try {
      const comprobanteId = archivo ? await subirArchivo(archivo, { maxLado: 1600, calidad: 0.75 }) : undefined
      const datos = {
        banco, numeroBoleta: f.numeroBoleta, depositante: f.depositante, monto: Number(f.monto),
        fechaDeposito: f.fechaDeposito, comprobanteId, observacion: f.observacion || undefined,
      }
      const r = await conAutorizacion(
        (autorizacion) => api.post(`/caja/sesiones/${sesionId}/depositos`, { ...datos, autorizacion }),
        { permiso: 'caja.validar_deposito', detalle: `Depósito ${banco} boleta ${f.numeroBoleta} por ${Q(f.monto)}`, pedir },
      )
      if (r) {
        showToast({ type: 'success', message: r.data.message })
        onListo()
      }
    } catch (e) {
      showToast({ type: 'error', message: errorApi(e).mensaje })
    } finally { setEnviando(false) }
  }

  return (
    <Modal abierto titulo="Registrar depósito bancario" onCerrar={onCerrar} ancho="max-w-lg"
      pie={<><button type="button" onClick={onCerrar} className="rounded-lg border px-3 py-2">Cancelar</button><button type="button" disabled={!valido || enviando} onClick={guardar} className="rounded-lg bg-green-700 px-4 py-2 text-white disabled:opacity-50">{enviando ? 'Registrando…' : 'Registrar'}</button></>}>
      <div className="grid gap-3 text-sm md:grid-cols-2">
        <label>Banco
          <select value={f.banco} onChange={set('banco')} className="mt-1 w-full rounded border px-3 py-2">{BANCOS.map((b) => <option key={b}>{b}</option>)}</select>
        </label>
        {f.banco === 'OTRO' ? <label>Nombre del banco<input value={f.otroBanco} onChange={set('otroBanco')} className="mt-1 w-full rounded border px-3 py-2" /></label> : <span />}
        <label>Número de boleta *<input autoFocus value={f.numeroBoleta} onChange={set('numeroBoleta')} className="mt-1 w-full rounded border px-3 py-2 uppercase" /></label>
        <label>Monto depositado (Q) *<input type="number" min="0" step="0.01" value={f.monto} onChange={set('monto')} className="mt-1 w-full rounded border px-3 py-2 text-right" /></label>
        <label>Quién depositó *<input value={f.depositante} onChange={set('depositante')} className="mt-1 w-full rounded border px-3 py-2" placeholder="Nombre de quien hizo el depósito" /></label>
        <label>Fecha del depósito<input type="date" max={hoy()} value={f.fechaDeposito} onChange={set('fechaDeposito')} className="mt-1 w-full rounded border px-3 py-2" /></label>
        <label className="md:col-span-2">Observación<input value={f.observacion} onChange={set('observacion')} className="mt-1 w-full rounded border px-3 py-2" /></label>
        <div className="md:col-span-2">
          <span className="block">Comprobante (foto o PDF)</span>
          <label className="mt-1 inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 hover:bg-gray-50">
            <Camera className="h-4 w-4" /> {archivo ? archivo.name : 'Tomar foto o elegir archivo'}
            {/* capture: en celulares abre la cámara directamente */}
            <input type="file" accept="image/*,application/pdf" capture="environment" className="sr-only" onChange={(e) => elegirArchivo(e.target.files?.[0])} />
          </label>
          {vista && <img src={vista} alt="Vista previa del comprobante" className="mt-2 max-h-48 rounded border object-contain" />}
        </div>
      </div>
      <p className="mt-3 text-xs text-gray-500">Si usted no es encargado, se pedirán las credenciales del encargado que valida la boleta.</p>
    </Modal>
  )
}
