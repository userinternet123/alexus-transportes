// ─────────────────────────────────────────────────────────────────────────────
// COMBUSTIBLE: cargas con odómetro, galones y precio. El rendimiento real (km/gal) sale de tanque lleno a tanque
// lleno y se compara con el esperado de cada cabezal; si cae más de lo permitido, la carga queda marcada.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react'
import { AlertTriangle, Fuel, Plus } from 'lucide-react'
import api from '../../services/api'
import { usePermisos } from '../../hooks/usePermisos'
import { showToast } from '../../utils/showToast'
import { errorApi, Q } from '../comun/formato'
import Campo from '../comun/Campo'
import Modal from '../comun/Modal'
import { confirmar } from '../comun/Confirmacion'
import { Boton, BotonPrimario, Cifra, Etiqueta, Pestanas } from './comun'
import { ent, enviar, fechaHora, haceDias, hay, hoy, nombrePiloto, num, useCatalogos, useConsulta } from './util'

function RegistrarCarga({ onListo, onCerrar }) {
  const { cabezales, pilotos } = useCatalogos()
  const [f, setF] = useState({ cabezalId: '', pilotoId: '', viajeId: '', odometro: '', galones: '', precioGalon: '', tanqueLleno: true, pagadoPorPiloto: false, estacion: '', documento: '' })
  const [enviando, setEnviando] = useState(false)
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const { datos: viajes } = useConsulta(f.cabezalId ? '/viajes' : null, { cabezalId: f.cabezalId, estado: 'ABIERTOS' })
  const cabezal = cabezales.find((c) => String(c.id) === f.cabezalId)
  const elegirCabezal = (e) => { const c = cabezales.find((x) => String(x.id) === e.target.value); setF((x) => ({ ...x, cabezalId: e.target.value, viajeId: '', pilotoId: c?.pilotoAsignadoId ? String(c.pilotoAsignadoId) : x.pilotoId })) }
  const total = f.galones && f.precioGalon ? Number(f.galones) * Number(f.precioGalon) : null
  const guardar = async (confirmarSalto = false) => {
    setEnviando(true)
    try {
      const { data } = await api.post('/combustible', { ...f, pilotoId: f.pilotoId || null, viajeId: f.viajeId || null, confirmarSalto })
      showToast({ type: data.data.alerta ? 'warning' : 'success', message: data.message })
      onListo()
    } catch (e) {
      const { codigo, mensaje } = errorApi(e)
      if (codigo === 'SALTO_ODOMETRO' && (await confirmar({ titulo: 'Odómetro fuera de lo normal', mensaje, confirmar: 'Sí, es correcto' }))) { setEnviando(false); return guardar(true) }
      if (codigo !== 'SALTO_ODOMETRO') {showToast({ type: 'error', message: mensaje })}
    }
    setEnviando(false)
  }
  return (
    <Modal abierto titulo="Registrar carga de combustible" onCerrar={onCerrar} ancho="max-w-lg"
      pie={<><Boton onClick={onCerrar}>Cancelar</Boton><button type="button" disabled={enviando || !f.cabezalId || !f.odometro || !f.galones || !f.precioGalon} onClick={() => guardar()} className="rounded-control bg-green-700 px-4 py-2 font-medium text-white disabled:opacity-50">{enviando ? 'Guardando…' : 'Registrar'}</button></>}>
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <Campo etiqueta="Cabezal" id="cabezalId" requerido><select value={f.cabezalId} onChange={elegirCabezal} className={ent}><option value="">Elija…</option>{cabezales.map((c) => <option key={c.id} value={c.id}>{c.codigo} · {c.placa}</option>)}</select></Campo>
        <Campo etiqueta="Piloto" id="pilotoId"><select value={f.pilotoId} onChange={set('pilotoId')} className={ent}><option value="">—</option>{pilotos.map((p) => <option key={p.id} value={p.id}>{nombrePiloto(p)}</option>)}</select></Campo>
        <Campo etiqueta="Viaje" id="viajeId" className="sm:col-span-2"><select value={f.viajeId} onChange={set('viajeId')} className={ent} disabled={!f.cabezalId}><option value="">Fuera de viaje (patio, traslado)</option>{viajes?.viajes.map((v) => <option key={v.id} value={v.id}>{v.numero} · {v.destino} · {v.estado.toLowerCase().replace('_', ' ')}</option>)}</select></Campo>
        <Campo etiqueta="Odómetro (km)" id="odometro" requerido><input type="number" min="0" step="0.1" value={f.odometro} onChange={set('odometro')} placeholder={cabezal ? `Último: ${num(cabezal.odometro)}` : ''} className={`${ent} text-right`} /></Campo>
        <Campo etiqueta="Galones" id="galones" requerido><input type="number" min="0" step="0.001" value={f.galones} onChange={set('galones')} className={`${ent} text-right`} /></Campo>
        <Campo etiqueta="Precio por galón (Q)" id="precioGalon" requerido><input type="number" min="0" step="0.01" value={f.precioGalon} onChange={set('precioGalon')} className={`${ent} text-right`} /></Campo>
        <div className="flex items-end pb-2 font-semibold"><span className="cifra">Total: {hay(total) ? Q(total) : '—'}</span></div>
        <Campo etiqueta="Estación" id="estacion"><input value={f.estacion} onChange={set('estacion')} maxLength={120} className={ent} /></Campo>
        <Campo etiqueta="Factura o vale" id="documento"><input value={f.documento} onChange={set('documento')} maxLength={60} className={ent} /></Campo>
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.tanqueLleno} onChange={set('tanqueLleno')} className="accent-green-600" /> Llenó el tanque</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.pagadoPorPiloto} onChange={set('pagadoPorPiloto')} className="accent-green-600" /> La pagó el piloto (anticipo)</label>
      </div>
      <p className="mt-3 text-xs text-gray-500">El rendimiento solo se calcula entre dos llenados completos. Si no llenó, marque la carga como parcial: sus galones se suman al siguiente llenado.</p>
    </Modal>
  )
}

function AnularCarga({ carga, onListo, onCerrar }) {
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const ir = async () => { setEnviando(true); const r = await enviar('put', `/combustible/${carga.id}/anular`, { motivo }); setEnviando(false); if (r) {onListo()} }
  return (
    <Modal abierto titulo={`Anular carga de ${Q(carga.total)}`} onCerrar={onCerrar} ancho="max-w-md"
      pie={<><Boton onClick={onCerrar}>Cancelar</Boton><button type="button" disabled={enviando || motivo.trim().length < 10} onClick={ir} className="rounded-control bg-red-600 px-4 py-2 font-medium text-white disabled:opacity-50">Anular</button></>}>
      <p className="text-sm text-gray-600">{carga.cabezal} · {fechaHora(carga.fecha)}{carga.viaje ? ` · se quita de los costos del viaje ${carga.viaje}` : ''}</p>
      <label className="mt-3 block text-sm">Motivo <span className="text-gray-500">(al menos 10 caracteres)</span><textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} className={ent} /></label>
    </Modal>
  )
}

export default function Combustible() {
  const { puede } = usePermisos()
  const [vista, setVista] = useState('cargas')
  const [desde, setDesde] = useState(haceDias(30))
  const [hasta, setHasta] = useState(hoy())
  const [cabezalId, setCabezalId] = useState('')
  const [soloAlertas, setSoloAlertas] = useState(false)
  const [registrando, setRegistrando] = useState(false)
  const [anulando, setAnulando] = useState(null)
  const { cabezales } = useCatalogos()
  const filtro = { desde, hasta, cabezalId: cabezalId || undefined, soloAlertas: soloAlertas || undefined }
  const cargas = useConsulta(vista === 'cargas' ? '/combustible' : null, filtro)
  const rend = useConsulta(vista === 'rendimiento' ? '/combustible/rendimiento' : null, { desde, hasta })
  const r = cargas.datos?.resumen
  const peor = useMemo(() => (rend.datos ?? []).filter((x) => hay(x.variacion) && Number(x.variacion) < 0).slice(0, 1)[0], [rend.datos])
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <Pestanas opciones={[['cargas', 'Cargas'], ['rendimiento', 'Rendimiento por cabezal']]} valor={vista} onCambio={setVista} />
        <label>Desde<input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} className="mt-1 block rounded-control border px-2 py-1.5" /></label>
        <label>Hasta<input type="date" value={hasta} max={hoy()} onChange={(e) => setHasta(e.target.value)} className="mt-1 block rounded-control border px-2 py-1.5" /></label>
        {vista === 'cargas' && <>
          <label>Cabezal<select value={cabezalId} onChange={(e) => setCabezalId(e.target.value)} className="mt-1 block rounded-control border px-2 py-1.5"><option value="">Todos</option>{cabezales.map((c) => <option key={c.id} value={c.id}>{c.codigo}</option>)}</select></label>
          <label className="flex items-center gap-2 pb-2"><input type="checkbox" checked={soloAlertas} onChange={(e) => setSoloAlertas(e.target.checked)} className="accent-amber-600" /> Solo alertas</label>
        </>}
        {puede('combustible.registrar') && <BotonPrimario className="ml-auto" onClick={() => setRegistrando(true)}><Plus className="h-4 w-4" aria-hidden /> Registrar carga</BotonPrimario>}
      </div>

      {vista === 'cargas' && r && <>
        <section className="grid gap-3 sm:grid-cols-4">
          <Cifra titulo="Gasto en combustible" valor={Q(r.total)} detalle={`${r.cargas} cargas`} />
          <Cifra titulo="Galones" valor={num(r.galones, 1)} detalle={r.precioPromedio ? `Q${num(r.precioPromedio, 2)} por galón` : null} />
          <Cifra titulo="Rendimiento real" valor={r.rendimiento ? `${num(r.rendimiento, 2)} km/gal` : '—'} detalle="tanque lleno a tanque lleno" />
          <Cifra titulo="Alertas de consumo" valor={r.alertas} tono={r.alertas ? 'malo' : null} />
        </section>
        <div className="overflow-x-auto rounded-superficie border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500"><tr><th className="px-3 py-2">Fecha</th><th className="px-3 py-2">Cabezal</th><th className="px-3 py-2">Piloto · viaje</th><th className="px-3 py-2 text-right">Odómetro</th><th className="px-3 py-2 text-right">Galones</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2 text-right">km/gal</th><th className="px-3 py-2" /></tr></thead>
            <tbody className="divide-y">
              {cargas.datos.cargas.map((c) => (
                <tr key={c.id} className={c.anulada ? 'text-gray-400 line-through' : ''}>
                  <td className="px-3 py-2">{fechaHora(c.fecha)}</td>
                  <td className="px-3 py-2 font-medium">{c.cabezal}</td>
                  <td className="px-3 py-2">{c.piloto ?? '—'}{c.viaje ? <span className="block text-xs text-gray-500">{c.viaje}</span> : null}</td>
                  <td className="cifra px-3 py-2 text-right">{num(c.odometro)}</td>
                  <td className="cifra px-3 py-2 text-right">{num(c.galones, 2)}{!c.tanqueLleno && <span className="block text-xs text-gray-500">parcial</span>}</td>
                  <td className="cifra px-3 py-2 text-right">{Q(c.total)}</td>
                  <td className="cifra px-3 py-2 text-right">{c.rendimiento ? <span className={c.alerta ? 'font-semibold text-red-700' : ''}>{c.alerta && <AlertTriangle className="mr-1 inline h-3.5 w-3.5" aria-label="Alerta" />}{num(c.rendimiento, 2)}</span> : '—'}{hay(c.variacion) && <span className="block text-xs text-gray-500">{Number(c.variacion) > 0 ? '+' : ''}{num(c.variacion, 1)} % vs {num(c.esperado, 1)}</span>}</td>
                  <td className="px-3 py-2 text-right">{!c.anulada && puede('combustible.anular') && <button type="button" onClick={() => setAnulando(c)} className="rounded px-2 py-1 text-xs text-red-700 hover:bg-red-50">Anular</button>}</td>
                </tr>
              ))}
              {!cargas.datos.cargas.length && <tr><td colSpan={8} className="px-3 py-10 text-center text-gray-500">Sin cargas en el período.</td></tr>}
            </tbody>
          </table>
        </div>
      </>}

      {vista === 'rendimiento' && rend.datos && <>
        {peor && <p className="rounded-control bg-amber-50 px-4 py-2.5 text-sm text-amber-900"><b>{peor.cabezal}</b> rinde {num(Math.abs(peor.variacion), 1)} % menos de lo esperado. Revise fugas, presión de llantas, tiempo en ralentí y los vales de esas cargas.</p>}
        <div className="overflow-x-auto rounded-superficie border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500"><tr><th className="px-3 py-2">Cabezal</th><th className="px-3 py-2 text-right">Km</th><th className="px-3 py-2 text-right">Galones</th><th className="px-3 py-2 text-right">Gasto</th><th className="px-3 py-2 text-right">Real km/gal</th><th className="px-3 py-2 text-right">Esperado</th><th className="px-3 py-2 text-right">Diferencia</th><th className="px-3 py-2 text-right">Alertas</th></tr></thead>
            <tbody className="divide-y">
              {rend.datos.map((x) => (
                <tr key={x.cabezalId}>
                  <td className="px-3 py-2 font-medium"><Fuel className="mr-2 inline h-4 w-4 text-gray-400" aria-hidden />{x.cabezal} <span className="text-xs text-gray-500">{x.placa}</span></td>
                  <td className="cifra px-3 py-2 text-right">{num(x.km)}</td><td className="cifra px-3 py-2 text-right">{num(x.galones, 1)}</td><td className="cifra px-3 py-2 text-right">{Q(x.total)}</td>
                  <td className="cifra px-3 py-2 text-right font-semibold">{x.rendimiento ? num(x.rendimiento, 2) : '—'}</td><td className="cifra px-3 py-2 text-right">{x.esperado ? num(x.esperado, 2) : '—'}</td>
                  <td className="px-3 py-2 text-right">{hay(x.variacion) ? <Etiqueta color={Number(x.variacion) < -10 ? 'rojo' : Number(x.variacion) < 0 ? 'ambar' : 'verde'}>{Number(x.variacion) > 0 ? '+' : ''}{num(x.variacion, 1)} %</Etiqueta> : '—'}</td>
                  <td className="cifra px-3 py-2 text-right">{x.alertas || ''}</td>
                </tr>
              ))}
              {!rend.datos.length && <tr><td colSpan={8} className="px-3 py-10 text-center text-gray-500">Sin cargas en el período.</td></tr>}
            </tbody>
          </table>
        </div>
      </>}
      {anulando && <AnularCarga carga={anulando} onCerrar={() => setAnulando(null)} onListo={() => { setAnulando(null); cargas.recargar() }} />}
      {registrando && <RegistrarCarga onCerrar={() => setRegistrando(false)} onListo={() => { setRegistrando(false); cargas.recargar() }} />}
    </div>
  )
}
