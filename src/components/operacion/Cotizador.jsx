// ─────────────────────────────────────────────────────────────────────────────
// COTIZADOR: cuánto cuesta un viaje y a cuánto cobrarlo. Cada renglón dice de dónde salió el
// dato (historial real, ruta, cabezal, piloto o parámetro). Compara con la tarifa vigente del
// cliente y con lo que realmente costaron los viajes de esa ruta.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { Calculator } from 'lucide-react'
import api from '../../services/api'
import { showToast } from '../../utils/showToast'
import { Q, errorApi } from '../comun/formato'
import Campo from '../comun/Campo'
import { km as fkm, ent } from './comun'
import { Boton } from './Ui'

const FUENTE = { real: 'historial real', parametro: 'parámetro', ruta: 'de la ruta', cabezal: 'del cabezal', piloto: 'del piloto', cliente: 'del cliente' }

export default function Cotizador() {
  const [op, setOp] = useState(null)
  const [f, setF] = useState({ rutaId: '', km: '', kmVacios: '', horas: '', toneladas: '', clienteId: '', cabezalId: '', pilotoId: '', margen: '' })
  const [r, setR] = useState(null)
  const [calculando, setCalculando] = useState(false)
  useEffect(() => { api.get('/viajes/opciones').then(({ data }) => setOp(data.data)).catch(() => {}) }, [])
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const n = (v) => (v === '' ? null : Number(v))
  const cotizar = async () => {
    setCalculando(true)
    try { const { data } = await api.post('/viajes/cotizar', { rutaId: n(f.rutaId), km: n(f.km), kmVacios: n(f.kmVacios), horas: n(f.horas), toneladas: n(f.toneladas), clienteId: n(f.clienteId), cabezalId: n(f.cabezalId), pilotoId: n(f.pilotoId), margen: n(f.margen) }); setR(data.data) }
    catch (e) { showToast({ type: 'error', message: errorApi(e).mensaje }) } finally { setCalculando(false) }
  }
  const max = Math.max(1, ...(r?.lineas ?? []).map((l) => l.monto))
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <section className="rounded-superficie border bg-white p-4">
        <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Campo etiqueta="Ruta" id="cRuta" className="lg:col-span-2"><select value={f.rutaId} onChange={set('rutaId')} className={ent}><option value="">Sin ruta: indique los km</option>{(op?.rutas ?? []).map((x) => <option key={x.id} value={x.id}>{x.nombre} · {x.kmEstimados} km</option>)}</select></Campo>
          <Campo etiqueta="Km con carga" id="cKm"><input type="number" min="1" step="0.1" value={f.km} onChange={set('km')} placeholder={f.rutaId ? 'De la ruta' : ''} className={`${ent} text-right`} /></Campo>
          <Campo etiqueta="Km vacíos (regreso)" id="cKmV"><input type="number" min="0" step="0.1" value={f.kmVacios} onChange={set('kmVacios')} className={`${ent} text-right`} /></Campo>
          <Campo etiqueta="Cliente (compara su tarifa)" id="cCliente"><select value={f.clienteId} onChange={set('clienteId')} className={ent}><option value="">—</option>{(op?.clientes ?? []).map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></Campo>
          <Campo etiqueta="Cabezal (su rendimiento)" id="cCabezal"><select value={f.cabezalId} onChange={set('cabezalId')} className={ent}><option value="">Promedio de la flota</option>{(op?.cabezales ?? []).map((x) => <option key={x.id} value={x.id}>{x.codigo}</option>)}</select></Campo>
          <Campo etiqueta="Piloto (su bono y viático)" id="cPiloto"><select value={f.pilotoId} onChange={set('pilotoId')} className={ent}><option value="">Promedio de los pilotos</option>{(op?.pilotos ?? []).map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></Campo>
          <Campo etiqueta="Toneladas" id="cTon"><input type="number" min="0" step="0.01" value={f.toneladas} onChange={set('toneladas')} className={`${ent} text-right`} /></Campo>
          <Campo etiqueta="Horas de viaje" id="cHoras"><input type="number" min="0" step="0.5" value={f.horas} onChange={set('horas')} placeholder="De la ruta o 45 km/h" className={`${ent} text-right`} /></Campo>
          <Campo etiqueta="Margen deseado (%)" id="cMargen"><input type="number" min="0" max="95" step="1" value={f.margen} onChange={set('margen')} placeholder="Parámetro" className={`${ent} text-right`} /></Campo>
          <div className="flex items-end"><Boton onClick={cotizar} disabled={calculando || (!f.rutaId && !f.km)} className="w-full justify-center"><Calculator className="h-4 w-4" aria-hidden />{calculando ? 'Calculando…' : 'Cotizar'}</Boton></div>
        </div>
      </section>
      {r && <>
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-superficie border bg-white p-4"><p className="text-sm text-gray-500">Costo del viaje</p><p className="cifra mt-1 text-2xl font-semibold">{Q(r.costo)}</p><p className="text-xs text-gray-500">{Q(r.costoPorKm)}/km · {fkm(r.km)} ({r.kmCarga} con carga{r.kmVacios ? ` + ${r.kmVacios} vacíos` : ''})</p></div>
          <div className="rounded-superficie border border-green-200 bg-green-50 p-4"><p className="text-sm text-green-800">Precio sugerido (margen {r.margenObjetivo}%)</p><p className="cifra mt-1 text-2xl font-semibold text-green-800">{Q(r.precioSugerido)}</p><p className="text-xs text-green-700">{Q(r.precioPorKm)} por km con carga</p></div>
          {r.tarifa ? <div className={`rounded-superficie border p-4 ${r.tarifa.margen < r.margenObjetivo ? 'border-amber-200 bg-amber-50' : 'bg-white'}`}><p className="text-sm text-gray-600">Tarifa vigente del cliente</p><p className="cifra mt-1 text-2xl font-semibold">{Q(r.tarifa.cobro)}</p><p className="text-xs text-gray-600">utilidad {Q(r.tarifa.utilidad)} · margen {r.tarifa.margen}%{r.tarifa.margen < r.margenObjetivo ? ' · por debajo del objetivo' : ''}</p></div> : <div className="rounded-superficie border bg-white p-4 text-sm text-gray-500">Sin tarifa vigente del cliente para comparar.</div>}
          {r.historial ? <div className="rounded-superficie border bg-white p-4"><p className="text-sm text-gray-600">Historial de la ruta ({r.historial.viajes} viajes, 12 meses)</p><p className="cifra mt-1 text-2xl font-semibold">{Q(r.historial.costoPromedio)}</p><p className="text-xs text-gray-600">costo real promedio · cobrado {Q(r.historial.ingresoPromedio)} · margen {r.historial.margenPromedio}% · {fkm(r.historial.kmPromedio)}</p></div> : <div className="rounded-superficie border bg-white p-4 text-sm text-gray-500">Aún no hay viajes cerrados de esta ruta para comparar.</div>}
        </section>
        <section className="rounded-superficie border bg-white p-4">
          <h2 className="mb-2 text-sm font-medium">Desglose del costo</h2>
          <ul className="space-y-2 text-sm">{r.lineas.map((l) => <li key={l.concepto}><div className="flex justify-between gap-2"><span>{l.concepto} <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[11px] ${l.fuente === 'parametro' ? 'bg-amber-50 text-amber-800' : 'bg-gray-100 text-gray-600'}`}>{FUENTE[l.fuente]}</span></span><span className="cifra font-medium">{Q(l.monto)}</span></div><div className="mt-0.5 h-1.5 rounded-full bg-gray-100"><div className="h-1.5 rounded-full bg-green-600" style={{ width: `${(l.monto / max) * 100}%` }} /></div><p className="text-xs text-gray-500">{l.detalle}</p></li>)}</ul>
          <p className="mt-3 text-xs text-gray-500">Combustible: {r.galones} gal a {r.rendimiento} km/gal y {Q(r.precioGalon)}/gal · {r.dias} día(s) de viaje ({r.horas} h). Los renglones marcados <b>parámetro</b> se afinan solos cuando haya historial (cargas, taller y gastos registrados); mientras tanto se ajustan en Administración › Parámetros.</p>
        </section>
      </>}
    </div>
  )
}
