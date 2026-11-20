// ─────────────────────────────────────────────────────────────────────────────
// COTIZADOR: precio de un viaje según la distancia, las condiciones de la ruta (terreno, subida, tráfico, esperas),
// ida y vuelta, extras y los costos reales de la empresa. Cada supuesto dice de dónde salió. Las cotizaciones se
// guardan con número y vigencia, y se convierten en viaje cuando el cliente acepta.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calculator, FileText, Plus, Save, Trash2, Truck } from 'lucide-react'
import api from '../../services/api'
import { usePermisos } from '../../hooks/usePermisos'
import { errorApi, Q } from '../comun/formato'
import Campo from '../comun/Campo'
import Modal from '../comun/Modal'
import { Boton, BotonPrimario, Etiqueta, Pestanas } from './comun'
import { ahoraLocal, deLocal, ent, enviar, fecha, hay, nombrePiloto, nombreTercero, num, useCatalogos, useConsulta } from './util'

const TERRENO = { PLANO: 'Plano', ONDULADO: 'Ondulado', MONTANA: 'Montaña' }
const TRAFICO = { FLUIDO: 'Fluido', NORMAL: 'Normal', LENTO: 'Lento', MUY_LENTO: 'Muy lento' }
const REGRESO = { VACIO: 'Ida y regreso vacío', CARGADO: 'Ida y vuelta con carga', NINGUNO: 'Solo ida' }
const ESTADO_COT = { BORRADOR: { texto: 'Borrador', color: 'gris' }, ENVIADA: { texto: 'Enviada', color: 'azul' }, ACEPTADA: { texto: 'Aceptada', color: 'verde' }, RECHAZADA: { texto: 'Rechazada', color: 'rojo' }, CONVERTIDA: { texto: 'Es viaje', color: 'morado' } }
const vacio = { rutaId: '', clienteId: '', cabezalId: '', kmIda: '', origen: '', destino: '', regreso: 'VACIO', terreno: '', trafico: '', subidaMetros: '', horasEspera: '', peajes: '', viatico: '', pagoPiloto: '', precioGalon: '', rendimiento: '', margen: '', toneladas: '' }
const limpio = (f, extras) => Object.fromEntries(Object.entries({ ...f, extras: extras.filter((x) => x.concepto.trim() && Number(x.monto) > 0) }).filter(([, v]) => v !== ''))

function Calculadora() {
  const { puede } = usePermisos()
  const { clientes, rutas, cabezales } = useCatalogos()
  const [f, setF] = useState(vacio)
  const [extras, setExtras] = useState([])
  const [r, setR] = useState(null)
  const [error, setError] = useState(null)
  const [guardando, setGuardando] = useState(null) // { precioOfrecido, notas }
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const ruta = rutas.find((x) => String(x.id) === f.rutaId)
  const cuerpo = JSON.stringify(limpio(f, extras))
  // Cálculo en vivo (con una pausa corta mientras se escribe). Sin ruta ni km no hay nada que mostrar.
  const listo = Boolean(f.rutaId || f.kmIda)
  useEffect(() => {
    if (!listo) { return undefined }
    let vivo = true
    const t = setTimeout(() => api.post('/viajes/cotizar', JSON.parse(cuerpo))
      .then(({ data }) => { if (vivo) { setR(data.data); setError(null) } })
      .catch((e) => { if (vivo) { setR(null); setError(errorApi(e).mensaje) } }), 350)
    return () => { vivo = false; clearTimeout(t) }
  }, [cuerpo, listo])
  const res = listo ? r : null
  const guardar = async () => {
    const res = await enviar('post', '/cotizaciones', { ...JSON.parse(cuerpo), precioOfrecido: guardando.precioOfrecido || null, notas: guardando.notas })
    if (res) {setGuardando(null)}
  }
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_24rem]">
      <section className="space-y-4 rounded-superficie border bg-white p-4 text-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Ruta" id="rutaId" className="sm:col-span-2"><select value={f.rutaId} onChange={set('rutaId')} className={ent}><option value="">Otra (escriba los km)</option>{rutas.map((x) => <option key={x.id} value={x.id}>{x.nombre} · {num(x.kmEstimados)} km</option>)}</select></Campo>
          {!f.rutaId && <>
            <Campo etiqueta="Origen" id="origen"><input value={f.origen} onChange={set('origen')} className={ent} /></Campo>
            <Campo etiqueta="Destino" id="destino"><input value={f.destino} onChange={set('destino')} className={ent} /></Campo>
          </>}
          <Campo etiqueta={f.rutaId ? 'Km de ida (corregir)' : 'Km de ida'} id="kmIda" requerido={!f.rutaId}><input type="number" min="0" value={f.kmIda} onChange={set('kmIda')} placeholder={ruta ? num(ruta.kmEstimados) : ''} className={`${ent} text-right`} /></Campo>
          <Campo etiqueta="Cliente" id="clienteId"><select value={f.clienteId} onChange={set('clienteId')} className={ent}><option value="">— (para comparar con su tarifa)</option>{clientes.map((c) => <option key={c.id} value={c.id}>{nombreTercero(c)}</option>)}</select></Campo>
        </div>
        <fieldset>
          <legend className="mb-1 font-medium">Recorrido</legend>
          <div className="flex flex-wrap gap-2">{Object.entries(REGRESO).map(([k, t]) => <label key={k} className={`cursor-pointer rounded-control border px-3 py-2 ${f.regreso === k ? 'border-green-600 bg-green-50 font-medium' : ''}`}><input type="radio" name="regreso" value={k} checked={f.regreso === k} onChange={set('regreso')} className="sr-only" />{t}</label>)}</div>
        </fieldset>
        <fieldset className="grid gap-3 sm:grid-cols-4">
          <legend className="mb-1 font-medium sm:col-span-4">Condiciones de la ruta {ruta && <span className="font-normal text-gray-500">(vacío = las de la ruta)</span>}</legend>
          <Campo etiqueta="Terreno" id="terreno"><select value={f.terreno} onChange={set('terreno')} className={ent}><option value="">{ruta ? `${TERRENO[ruta.terreno]} (ruta)` : 'Plano'}</option>{Object.entries(TERRENO).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></Campo>
          <Campo etiqueta="Subida acumulada (m)" id="subidaMetros"><input type="number" min="0" value={f.subidaMetros} onChange={set('subidaMetros')} placeholder={ruta?.subidaMetros ? String(ruta.subidaMetros) : '—'} className={`${ent} text-right`} /></Campo>
          <Campo etiqueta="Tráfico" id="trafico"><select value={f.trafico} onChange={set('trafico')} className={ent}><option value="">{ruta ? `${TRAFICO[ruta.trafico]} (ruta)` : 'Normal'}</option>{Object.entries(TRAFICO).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></Campo>
          <Campo etiqueta="Horas de espera / colas" id="horasEspera"><input type="number" min="0" step="0.5" value={f.horasEspera} onChange={set('horasEspera')} placeholder={ruta ? num(ruta.horasEspera, 1) : '0'} className={`${ent} text-right`} /></Campo>
        </fieldset>
        <fieldset>
          <div className="mb-1 flex items-center justify-between"><legend className="font-medium">Extras</legend><Boton onClick={() => setExtras((x) => [...x, { concepto: '', monto: '' }])}><Plus className="h-4 w-4" aria-hidden /> Extra</Boton></div>
          <ul className="space-y-2">{extras.map((x, i) => <li key={i} className="flex gap-2"><input value={x.concepto} onChange={(e) => setExtras((l) => l.map((y, j) => (j === i ? { ...y, concepto: e.target.value } : y)))} placeholder="Escolta, maniobras, permiso de sobrepeso, seguro de carga…" aria-label="Concepto del extra" className="min-w-0 flex-1 rounded-control border px-3 py-2" /><input type="number" min="0" value={x.monto} onChange={(e) => setExtras((l) => l.map((y, j) => (j === i ? { ...y, monto: e.target.value } : y)))} placeholder="Q" aria-label="Monto del extra" className="w-28 rounded-control border px-3 py-2 text-right" /><button type="button" onClick={() => setExtras((l) => l.filter((_, j) => j !== i))} aria-label="Quitar extra" className="rounded p-2 text-gray-400 hover:bg-red-50 hover:text-red-700"><Trash2 className="h-4 w-4" /></button></li>)}
            {!extras.length && <li className="text-xs text-gray-500">Sin extras.</li>}</ul>
        </fieldset>
        <details>
          <summary className="cursor-pointer font-medium">Ajustar supuestos</summary>
          <div className="mt-2 grid gap-3 sm:grid-cols-4">
            <Campo etiqueta="Cabezal" id="cabezalId"><select value={f.cabezalId} onChange={set('cabezalId')} className={ent}><option value="">Flota</option>{cabezales.map((c) => <option key={c.id} value={c.id}>{c.codigo}</option>)}</select></Campo>
            <Campo etiqueta="Km por galón" id="rendimiento"><input type="number" min="0" step="0.1" value={f.rendimiento} onChange={set('rendimiento')} placeholder={res ? num(res.supuestos.rendimiento, 2) : ''} className={`${ent} text-right`} /></Campo>
            <Campo etiqueta="Precio galón (Q)" id="precioGalon"><input type="number" min="0" step="0.01" value={f.precioGalon} onChange={set('precioGalon')} placeholder={res ? num(res.supuestos.precioGalon, 2) : ''} className={`${ent} text-right`} /></Campo>
            <Campo etiqueta="Margen (%)" id="margen"><input type="number" min="0" value={f.margen} onChange={set('margen')} placeholder={res ? String(res.margenObjetivo) : ''} className={`${ent} text-right`} /></Campo>
            <Campo etiqueta="Peajes por sentido" id="peajes"><input type="number" min="0" value={f.peajes} onChange={set('peajes')} className={`${ent} text-right`} /></Campo>
            <Campo etiqueta="Viático por sentido" id="viatico"><input type="number" min="0" value={f.viatico} onChange={set('viatico')} className={`${ent} text-right`} /></Campo>
            <Campo etiqueta="Pago al piloto" id="pagoPiloto"><input type="number" min="0" value={f.pagoPiloto} onChange={set('pagoPiloto')} placeholder={res ? num(res.supuestos.pagoPiloto, 2) : ''} className={`${ent} text-right`} /></Campo>
            <Campo etiqueta="Toneladas" id="toneladas"><input type="number" min="0" value={f.toneladas} onChange={set('toneladas')} className={`${ent} text-right`} /></Campo>
          </div>
        </details>
      </section>

      <aside className="space-y-3" aria-live="polite">
        {!res && <div className="rounded-superficie border bg-white p-6 text-center text-sm text-gray-500"><Calculator className="mx-auto mb-2 h-8 w-8 text-gray-300" aria-hidden />{(listo && error) || 'Elija una ruta o escriba los km para cotizar.'}</div>}
        {res && <>
          <div className="rounded-superficie border bg-white p-4">
            <p className="text-sm text-gray-500">Precio sugerido</p>
            <p className="cifra text-4xl font-semibold">{Q(res.precioRedondeado)}</p>
            <p className="mt-1 text-xs text-gray-500">{Q(res.precioSugerido)} exacto{hay(res.costoTotal) ? ` · costo ${Q(res.costoTotal)} + ${res.margenObjetivo} %` : ''}</p>
            <p className="mt-2 text-sm">{num(res.kmTotal)} km ({num(res.kmCargados)} con carga{Number(res.kmVacios) ? `, ${num(res.kmVacios)} vacíos` : ''}) · {num(res.galones, 1)} gal · ~{num(res.horasEstimadas, 1)} h</p>
            {hay(res.tarifaActual) && <p className="mt-2 rounded-control bg-gray-50 px-3 py-2 text-sm">Tarifa actual del cliente: <b>{Q(res.tarifaActual)}</b>{hay(res.margenTarifaActual) && <> · margen <b className={Number(res.margenTarifaActual) < 0 ? 'text-red-700' : ''}>{num(res.margenTarifaActual, 1)} %</b></>}</p>}
            {puede('viajes.cotizar') && <BotonPrimario className="mt-3 w-full justify-center" onClick={() => setGuardando({ precioOfrecido: String(res.precioRedondeado), notas: '' })}><Save className="h-4 w-4" aria-hidden /> Guardar cotización</BotonPrimario>}
          </div>
          <div className="rounded-superficie border bg-white p-4 text-sm">
            <h3 className="mb-2 font-semibold">Desglose</h3>
            <ul className="space-y-2">{res.partidas.map((p) => <li key={p.concepto}><div className="flex justify-between gap-2"><span>{p.concepto}</span><span className="cifra font-medium">{Q(p.monto)}</span></div><p className="text-xs text-gray-500">{p.detalle}</p></li>)}</ul>
            <h3 className="mb-1 mt-4 font-semibold">De dónde salen los números</h3>
            <ul className="space-y-0.5 text-xs text-gray-600">
              <li>Rendimiento: {num(res.supuestos.rendimiento, 2)} km/gal · {res.supuestos.fuenteRendimiento}</li>
              <li>Diésel: Q{num(res.supuestos.precioGalon, 2)}/gal · {res.supuestos.fuentePrecio}</li>
              {res.supuestos.fuenteSueldos && <li>Sueldos: {{ PLANILLA: 'planillas aprobadas', ESTIMADO: 'estimados con los empleados activos', NINGUNA: 'no incluidos' }[res.supuestos.fuenteSueldos]}</li>}
              {res.supuestos.cargas?.length > 0 && <li>Cargas laborales: {res.supuestos.cargas.filter((x) => x.incluida).map((x) => `${x.nombre.split(' (')[0]} ${num(x.tasa, 2)} %${x.pagaHoy ? '' : ' (no se paga hoy)'}`).join(', ') || 'ninguna incluida'}</li>}
              {res.supuestos.fuenteCostoKm && <li>Costo indirecto: {res.supuestos.fuenteCostoKm === 'HISTORIAL' ? `historial ${res.periodoCostoKm?.desde ?? ''} a ${res.periodoCostoKm?.hasta ?? ''}` : 'parámetro'}</li>}
              <li>Terreno {TERRENO[res.terreno].toLowerCase()} · tráfico {TRAFICO[res.trafico].toLowerCase()}{res.subidaMetros ? ` · ${num(res.subidaMetros)} m de subida` : ''}</li>
            </ul>
            {res.avisos?.map((a) => <p key={a} className="mt-2 rounded-control bg-amber-50 px-3 py-2 text-xs text-amber-900">{a}</p>)}
          </div>
        </>}
      </aside>
      {guardando && (
        <Modal abierto titulo="Guardar cotización" onCerrar={() => setGuardando(null)} ancho="max-w-md" pie={<><Boton onClick={() => setGuardando(null)}>Cancelar</Boton><BotonPrimario onClick={guardar}>Guardar</BotonPrimario></>}>
          <div className="space-y-3 text-sm">
            {!f.clienteId && <p className="rounded-control bg-amber-50 px-3 py-2 text-amber-900">Sin cliente: podrá verla, pero no convertirla en viaje.</p>}
            <Campo etiqueta="Precio ofrecido (Q)" id="precioOfrecido"><input type="number" min="0" value={guardando.precioOfrecido} onChange={(e) => setGuardando((g) => ({ ...g, precioOfrecido: e.target.value }))} className={`${ent} text-right`} /></Campo>
            <Campo etiqueta="Notas para el cliente" id="notas"><textarea rows={2} value={guardando.notas} onChange={(e) => setGuardando((g) => ({ ...g, notas: e.target.value }))} maxLength={500} className={ent} /></Campo>
          </div>
        </Modal>
      )}
    </div>
  )
}

function Convertir({ cot, onCerrar }) {
  const navigate = useNavigate()
  const { cabezales, remolques, pilotos } = useCatalogos()
  const [f, setF] = useState({ cabezalId: '', remolqueId: '', pilotoId: '', fechaSalida: ahoraLocal(2), referencia: '', carga: '' })
  const [enviando, setEnviando] = useState(false)
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const ir = async () => {
    setEnviando(true)
    const r = await enviar('post', `/cotizaciones/${cot.id}/convertir`, { ...f, remolqueId: f.remolqueId || null, fechaSalida: deLocal(f.fechaSalida) })
    setEnviando(false)
    if (r) {navigate(`/home/viajes?id=${r.data.id}`)}
  }
  return (
    <Modal abierto titulo={`Convertir ${cot.numero} en viaje`} onCerrar={onCerrar} ancho="max-w-lg" pie={<><Boton onClick={onCerrar}>Cancelar</Boton><BotonPrimario disabled={enviando || !f.cabezalId || !f.pilotoId} onClick={ir}><Truck className="h-4 w-4" aria-hidden /> Programar viaje</BotonPrimario></>}>
      <p className="mb-3 text-sm text-gray-600">{cot.cliente} · {cot.origen} → {cot.destino} · {Q(cot.precioOfrecido)}</p>
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <Campo etiqueta="Cabezal" id="cabezalId" requerido><select value={f.cabezalId} onChange={(e) => { const c = cabezales.find((x) => String(x.id) === e.target.value); setF((x) => ({ ...x, cabezalId: e.target.value, pilotoId: x.pilotoId || (c?.pilotoAsignadoId ? String(c.pilotoAsignadoId) : '') })) }} className={ent}><option value="">Elija…</option>{cabezales.map((c) => <option key={c.id} value={c.id} disabled={c.estado !== 'ACTIVO'}>{c.codigo} · {c.placa}</option>)}</select></Campo>
        <Campo etiqueta="Remolque" id="remolqueId"><select value={f.remolqueId} onChange={set('remolqueId')} className={ent}><option value="">Sin remolque</option>{remolques.map((r) => <option key={r.id} value={r.id}>{r.codigo}</option>)}</select></Campo>
        <Campo etiqueta="Piloto" id="pilotoId" requerido><select value={f.pilotoId} onChange={set('pilotoId')} className={ent}><option value="">Elija…</option>{pilotos.map((p) => <option key={p.id} value={p.id}>{nombrePiloto(p)}</option>)}</select></Campo>
        <Campo etiqueta="Salida" id="fechaSalida" requerido><input type="datetime-local" value={f.fechaSalida} onChange={set('fechaSalida')} className={ent} /></Campo>
        <Campo etiqueta="Carga" id="carga"><input value={f.carga} onChange={set('carga')} className={ent} /></Campo>
        <Campo etiqueta="Referencia del cliente" id="referencia"><input value={f.referencia} onChange={set('referencia')} className={ent} /></Campo>
      </div>
    </Modal>
  )
}

function Cotizaciones() {
  const { puede } = usePermisos()
  const [estado, setEstado] = useState('')
  const [convirtiendo, setConvirtiendo] = useState(null)
  const { datos, recargar } = useConsulta('/cotizaciones', { estado: estado || undefined })
  const cambiar = async (c, nuevo) => { if (await enviar('put', `/cotizaciones/${c.id}/estado`, { estado: nuevo })) {recargar()} }
  return (
    <div className="space-y-3">
      <label className="block text-sm">Estado<select value={estado} onChange={(e) => setEstado(e.target.value)} className="mt-1 block rounded-control border px-2 py-1.5"><option value="">Todas</option>{Object.entries(ESTADO_COT).map(([k, v]) => <option key={k} value={k}>{v.texto}</option>)}</select></label>
      <ul className="divide-y rounded-superficie border bg-white">
        {datos?.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm">
            <FileText className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
            <span className="w-24 font-medium">{c.numero}</span>
            <Etiqueta color={ESTADO_COT[c.estado].color}>{ESTADO_COT[c.estado].texto}</Etiqueta>
            {c.vencida && <Etiqueta color="rojo">Vencida</Etiqueta>}
            <span className="min-w-0 flex-1 basis-56"><span className="block truncate font-medium">{c.cliente ?? 'Sin cliente'}</span><span className="block truncate text-xs text-gray-500">{c.origen} → {c.destino} · {REGRESO[c.regreso]} · {num(c.kmTotal)} km · vigente al {fecha(c.vigenteHasta)}{c.viaje ? ` · ${c.viaje}` : ''}</span></span>
            <span className="cifra w-28 text-right font-semibold">{Q(c.precioOfrecido)}{hay(c.ganancia) && <span className={`block text-xs font-normal ${Number(c.ganancia) < 0 ? 'text-red-700' : 'text-green-700'}`}>{Q(c.ganancia)}</span>}</span>
            <span className="flex gap-1">
              {c.estado === 'BORRADOR' && <Boton onClick={() => cambiar(c, 'ENVIADA')}>Enviada</Boton>}
              {['BORRADOR', 'ENVIADA'].includes(c.estado) && <><Boton onClick={() => cambiar(c, 'ACEPTADA')}>Aceptó</Boton><Boton peligro onClick={() => cambiar(c, 'RECHAZADA')}>Rechazó</Boton></>}
              {['BORRADOR', 'ENVIADA', 'ACEPTADA'].includes(c.estado) && !c.vencida && c.cliente && puede('viajes.crear') && <BotonPrimario onClick={() => setConvirtiendo(c)}><Truck className="h-4 w-4" aria-hidden /> Viaje</BotonPrimario>}
            </span>
          </li>
        ))}
        {datos && !datos.length && <li className="px-4 py-10 text-center text-sm text-gray-500">No hay cotizaciones guardadas.</li>}
      </ul>
      {convirtiendo && <Convertir cot={convirtiendo} onCerrar={() => setConvirtiendo(null)} />}
    </div>
  )
}

export default function Cotizador() {
  const [vista, setVista] = useState('calcular')
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <Pestanas opciones={[['calcular', 'Cotizar'], ['guardadas', 'Cotizaciones guardadas']]} valor={vista} onCambio={setVista} />
      {vista === 'calcular' ? <Calculadora /> : <Cotizaciones />}
    </div>
  )
}
