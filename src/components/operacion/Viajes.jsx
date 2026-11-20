// ─────────────────────────────────────────────────────────────────────────────
// VIAJES: programar → iniciar (con inspección) → finalizar (km) → liquidar. En el detalle se registran anticipos y
// costos (peajes, viáticos…) y se ve la liquidación: lo que devuelve o se le paga al piloto y la ganancia real.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Banknote, CheckCircle2, Flag, Play, Plus, Receipt, Route as RutaIcono, Search, Trash2, XCircle } from 'lucide-react'
import { usePermisos } from '../../hooks/usePermisos'
import { Q } from '../comun/formato'
import Campo from '../comun/Campo'
import Hoja from '../comun/Hoja'
import Modal from '../comun/Modal'
import { confirmar } from '../comun/Confirmacion'
import { Boton, BotonPrimario, Etiqueta, Pestanas } from './comun'
import { ahoraLocal, deLocal, ent, enviar, ESTADO_VIAJE, fechaHora, hay, nombrePiloto, nombreTercero, num, useCatalogos, useConsulta } from './util'

const TIPOS_COSTO = { PEAJE: 'Peaje', VIATICO: 'Viático', HORAS_EXTRA: 'Horas extra', PARQUEO: 'Parqueo', CARGA_DESCARGA: 'Carga y descarga', MULTA: 'Multa', REPARACION_EN_RUTA: 'Reparación en ruta', OTRO: 'Otro', COMBUSTIBLE: 'Combustible', GASTO_EMPRESA: 'Gasto de la empresa' }
const PESTANAS = [['ABIERTOS', 'Abiertos'], ['PROGRAMADO', 'Programados'], ['EN_RUTA', 'En ruta'], ['FINALIZADO', 'Por liquidar'], ['LIQUIDADO', 'Liquidados'], ['CANCELADO', 'Cancelados'], ['', 'Todos']]

function Pie({ onCerrar, enviando, onAceptar, texto, peligro, deshabilitado }) {
  return <><Boton onClick={onCerrar}>Cancelar</Boton><button type="button" disabled={enviando || deshabilitado} onClick={onAceptar} className={`rounded-control px-4 py-2 font-medium text-white disabled:opacity-50 ${peligro ? 'bg-red-600' : 'bg-green-700'}`}>{enviando ? 'Guardando…' : texto}</button></>
}

// ───────────────────────────── Programar ─────────────────────────────

export function ProgramarViaje({ inicial = {}, onListo, onCerrar }) {
  const { cabezales, remolques, pilotos, clientes, rutas } = useCatalogos()
  const [f, setF] = useState({ clienteId: '', rutaId: '', cabezalId: '', remolqueId: '', pilotoId: '', origen: '', destino: '', carga: '', toneladas: '', referencia: '', fechaSalida: ahoraLocal(1), fechaCompromiso: '', montoCobrado: '', observaciones: '', ...inicial })
  const [enviando, setEnviando] = useState(false)
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  // Al elegir cabezal se propone su piloto asignado
  const elegirCabezal = (e) => { const c = cabezales.find((x) => String(x.id) === e.target.value); setF((x) => ({ ...x, cabezalId: e.target.value, pilotoId: x.pilotoId || (c?.pilotoAsignadoId ? String(c.pilotoAsignadoId) : '') })) }
  const ruta = rutas.find((r) => String(r.id) === f.rutaId)
  const guardar = async () => {
    setEnviando(true)
    const r = await enviar('post', '/viajes', {
      clienteId: f.clienteId, rutaId: f.rutaId || null, cabezalId: f.cabezalId, remolqueId: f.remolqueId || null, pilotoId: f.pilotoId,
      origen: f.origen || null, destino: f.destino || null, carga: f.carga, toneladas: f.toneladas || null, referencia: f.referencia,
      fechaSalida: deLocal(f.fechaSalida), fechaCompromiso: deLocal(f.fechaCompromiso), montoCobrado: f.montoCobrado === '' ? null : f.montoCobrado, observaciones: f.observaciones,
    })
    setEnviando(false)
    if (r) {onListo(r.data.id)}
  }
  return (
    <Modal abierto titulo="Programar viaje" onCerrar={onCerrar} ancho="max-w-2xl" pie={<Pie onCerrar={onCerrar} enviando={enviando} onAceptar={guardar} texto="Programar" deshabilitado={!f.clienteId || !f.cabezalId || !f.pilotoId} />}>
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <Campo etiqueta="Cliente" id="clienteId" requerido className="sm:col-span-2"><select value={f.clienteId} onChange={set('clienteId')} className={ent}><option value="">Elija…</option>{clientes.map((c) => <option key={c.id} value={c.id}>{nombreTercero(c)}</option>)}</select></Campo>
        <Campo etiqueta="Ruta" id="rutaId" className="sm:col-span-2"><select value={f.rutaId} onChange={set('rutaId')} className={ent}><option value="">Sin ruta (escriba origen y destino)</option>{rutas.map((r) => <option key={r.id} value={r.id}>{r.nombre} · {num(r.kmEstimados)} km</option>)}</select></Campo>
        {!f.rutaId && <><Campo etiqueta="Origen" id="origen" requerido><input value={f.origen} onChange={set('origen')} className={ent} /></Campo><Campo etiqueta="Destino" id="destino" requerido><input value={f.destino} onChange={set('destino')} className={ent} /></Campo></>}
        <Campo etiqueta="Cabezal" id="cabezalId" requerido><select value={f.cabezalId} onChange={elegirCabezal} className={ent}><option value="">Elija…</option>{cabezales.map((c) => <option key={c.id} value={c.id} disabled={c.estado !== 'ACTIVO'}>{c.codigo} · {c.placa}{c.estado !== 'ACTIVO' ? ` (${c.estado === 'EN_TALLER' ? 'en taller' : c.estado.toLowerCase()})` : ''}</option>)}</select></Campo>
        <Campo etiqueta="Remolque" id="remolqueId"><select value={f.remolqueId} onChange={set('remolqueId')} className={ent}><option value="">Sin remolque</option>{remolques.map((r) => <option key={r.id} value={r.id} disabled={r.estado !== 'ACTIVO'}>{r.codigo} · {r.tipo?.toLowerCase()}</option>)}</select></Campo>
        <Campo etiqueta="Piloto" id="pilotoId" requerido className="sm:col-span-2"><select value={f.pilotoId} onChange={set('pilotoId')} className={ent}><option value="">Elija…</option>{pilotos.map((p) => <option key={p.id} value={p.id}>{nombrePiloto(p)} · licencia {p.licenciaTipo} vence {String(p.licenciaVence).slice(0, 10)}</option>)}</select></Campo>
        <Campo etiqueta="Salida" id="fechaSalida" requerido><input type="datetime-local" value={f.fechaSalida} onChange={set('fechaSalida')} className={ent} /></Campo>
        <Campo etiqueta="Entrega comprometida" id="fechaCompromiso"><input type="datetime-local" value={f.fechaCompromiso} onChange={set('fechaCompromiso')} className={ent} /></Campo>
        <Campo etiqueta="Carga" id="carga"><input value={f.carga} onChange={set('carga')} placeholder="Ej. contenedor 40 pies" className={ent} /></Campo>
        <Campo etiqueta="Toneladas" id="toneladas"><input type="number" min="0" step="0.01" value={f.toneladas} onChange={set('toneladas')} className={`${ent} text-right`} /></Campo>
        <Campo etiqueta="Referencia del cliente" id="referencia"><input value={f.referencia} onChange={set('referencia')} placeholder="Orden, BL, contenedor" className={ent} /></Campo>
        <Campo etiqueta="Monto a cobrar (Q)" id="montoCobrado"><input type="number" min="0" step="0.01" value={f.montoCobrado} onChange={set('montoCobrado')} placeholder="Vacío = según tarifa" className={`${ent} text-right`} /></Campo>
        <Campo etiqueta="Observaciones" id="observaciones" className="sm:col-span-2"><textarea rows={2} value={f.observaciones} onChange={set('observaciones')} maxLength={500} className={ent} /></Campo>
      </div>
      {ruta && <p className="mt-3 text-xs text-gray-500">{ruta.origen} → {ruta.destino} · {num(ruta.kmEstimados)} km de ida{ruta.horasEstimadas ? ` · ${num(ruta.horasEstimadas, 1)} h` : ''}</p>}
    </Modal>
  )
}

// ───────────────────────────── Acciones ─────────────────────────────

function Iniciar({ viaje, onListo, onCerrar, puedeAutorizar }) {
  const [km, setKm] = useState('')
  const [sinInspeccion, setSin] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const ir = async () => { setEnviando(true); const r = await enviar('post', `/viajes/${viaje.id}/iniciar`, { kmSalida: km || null, sinInspeccion }); setEnviando(false); if (r) {onListo()} }
  return (
    <Modal abierto titulo={`Iniciar ${viaje.numero}`} onCerrar={onCerrar} ancho="max-w-md" pie={<Pie onCerrar={onCerrar} enviando={enviando} onAceptar={ir} texto="Sale a ruta" />}>
      <p className="text-sm text-gray-600">Se exige la inspección pre viaje de las últimas 24 h del cabezal {viaje.cabezal}{viaje.remolque ? ` con el remolque ${viaje.remolque}` : ''}.</p>
      <Campo etiqueta="Odómetro de salida (km)" id="kmSalida" className="mt-3 text-sm"><input type="number" min="0" step="0.1" value={km} onChange={(e) => setKm(e.target.value)} placeholder="Vacío = el último registrado del cabezal" className={`${ent} text-right`} /></Campo>
      {puedeAutorizar && <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" checked={sinInspeccion} onChange={(e) => setSin(e.target.checked)} className="mt-1 accent-amber-600" /> Autorizo la salida sin inspección (queda en la bitácora)</label>}
    </Modal>
  )
}

function Finalizar({ viaje, onListo, onCerrar }) {
  const sugeridoVacios = viaje.kmVacios && Number(viaje.kmVacios) > 0 ? String(Number(viaje.kmVacios)) : ''
  const [f, setF] = useState({ kmLlegada: '', kmVacios: sugeridoVacios, observaciones: '' })
  const [enviando, setEnviando] = useState(false)
  const recorridos = f.kmLlegada && viaje.kmSalida ? Number(f.kmLlegada) - Number(viaje.kmSalida) : null
  const ir = async () => { setEnviando(true); const r = await enviar('post', `/viajes/${viaje.id}/finalizar`, { kmLlegada: f.kmLlegada, kmVacios: f.kmVacios || null, observaciones: f.observaciones }); setEnviando(false); if (r) {onListo()} }
  return (
    <Modal abierto titulo={`Finalizar ${viaje.numero}`} onCerrar={onCerrar} ancho="max-w-md" pie={<Pie onCerrar={onCerrar} enviando={enviando} onAceptar={ir} texto="Finalizar" deshabilitado={!f.kmLlegada} />}>
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <Campo etiqueta="Odómetro de llegada (km)" id="kmLlegada" requerido><input type="number" min="0" step="0.1" value={f.kmLlegada} onChange={(e) => setF((x) => ({ ...x, kmLlegada: e.target.value }))} className={`${ent} text-right`} /></Campo>
        <Campo etiqueta="Km vacíos (sin carga)" id="kmVacios"><input type="number" min="0" step="0.1" value={f.kmVacios} onChange={(e) => setF((x) => ({ ...x, kmVacios: e.target.value }))} className={`${ent} text-right`} /></Campo>
        <Campo etiqueta="Observaciones" id="obs" className="sm:col-span-2"><textarea rows={2} value={f.observaciones} onChange={(e) => setF((x) => ({ ...x, observaciones: e.target.value }))} className={ent} /></Campo>
      </div>
      <p className="mt-2 text-xs text-gray-500">Salió con {num(viaje.kmSalida, 1)} km{hay(recorridos) ? ` · recorrido: ${num(recorridos)} km` : ''}</p>
    </Modal>
  )
}

function NuevoCosto({ viaje, onListo, onCerrar }) {
  const [f, setF] = useState({ tipo: 'PEAJE', monto: '', descripcion: '', documento: '', pagadoPorPiloto: true })
  const [enviando, setEnviando] = useState(false)
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const ir = async () => { setEnviando(true); const r = await enviar('post', `/viajes/${viaje.id}/costos`, f); setEnviando(false); if (r) {onListo()} }
  return (
    <Modal abierto titulo="Registrar costo del viaje" onCerrar={onCerrar} ancho="max-w-md" pie={<Pie onCerrar={onCerrar} enviando={enviando} onAceptar={ir} texto="Registrar" deshabilitado={!f.monto} />}>
      <p className="mb-3 rounded-control bg-amber-50 px-3 py-2 text-xs text-amber-900">El combustible se registra en <b>Combustible</b> con galones y odómetro: así sale el rendimiento.</p>
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <Campo etiqueta="Tipo" id="tipo" requerido><select value={f.tipo} onChange={set('tipo')} className={ent}>{Object.entries(TIPOS_COSTO).filter(([k]) => !['COMBUSTIBLE', 'GASTO_EMPRESA'].includes(k)).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></Campo>
        <Campo etiqueta="Monto (Q)" id="monto" requerido><input type="number" min="0" step="0.01" value={f.monto} onChange={set('monto')} className={`${ent} text-right`} /></Campo>
        <Campo etiqueta="Detalle" id="descripcion" className="sm:col-span-2"><input value={f.descripcion} onChange={set('descripcion')} maxLength={200} placeholder="Ej. peaje autopista Palín-Escuintla" className={ent} /></Campo>
        <Campo etiqueta="Factura o recibo" id="documento"><input value={f.documento} onChange={set('documento')} maxLength={60} className={ent} /></Campo>
        <label className="flex items-center gap-2 pt-6"><input type="checkbox" checked={f.pagadoPorPiloto} onChange={set('pagadoPorPiloto')} className="accent-green-600" /> Lo pagó el piloto (del anticipo)</label>
      </div>
    </Modal>
  )
}

function NuevoAnticipo({ viaje, onListo, onCerrar }) {
  const [f, setF] = useState({ monto: '', medio: 'EFECTIVO', nota: '' })
  const [enviando, setEnviando] = useState(false)
  const ir = async () => { setEnviando(true); const r = await enviar('post', `/viajes/${viaje.id}/anticipos`, f); setEnviando(false); if (r) {onListo()} }
  return (
    <Modal abierto titulo={`Anticipo al piloto · ${viaje.piloto}`} onCerrar={onCerrar} ancho="max-w-md" pie={<Pie onCerrar={onCerrar} enviando={enviando} onAceptar={ir} texto="Entregar" deshabilitado={!f.monto} />}>
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <Campo etiqueta="Monto (Q)" id="monto" requerido><input type="number" min="0" step="0.01" value={f.monto} onChange={(e) => setF((x) => ({ ...x, monto: e.target.value }))} className={`${ent} text-right`} /></Campo>
        <Campo etiqueta="Medio" id="medio"><select value={f.medio} onChange={(e) => setF((x) => ({ ...x, medio: e.target.value }))} className={ent}><option value="EFECTIVO">Efectivo</option><option value="TRANSFERENCIA">Transferencia</option><option value="CHEQUE">Cheque</option></select></Campo>
        <Campo etiqueta="Nota" id="nota" className="sm:col-span-2"><input value={f.nota} onChange={(e) => setF((x) => ({ ...x, nota: e.target.value }))} placeholder="Ej. peajes y comida" className={ent} /></Campo>
      </div>
    </Modal>
  )
}

function Cancelar({ viaje, onListo, onCerrar }) {
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const ir = async () => { setEnviando(true); const r = await enviar('post', `/viajes/${viaje.id}/cancelar`, { motivo }); setEnviando(false); if (r) {onListo()} }
  return (
    <Modal abierto titulo={`Cancelar ${viaje.numero}`} onCerrar={onCerrar} ancho="max-w-md" pie={<Pie onCerrar={onCerrar} enviando={enviando} onAceptar={ir} texto="Cancelar viaje" peligro deshabilitado={motivo.trim().length < 10} />}>
      <label className="block text-sm">Motivo <span className="text-gray-500">(al menos 10 caracteres)</span><textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} className={ent} /></label>
    </Modal>
  )
}

// ───────────────────────────── Detalle ─────────────────────────────

function Fila({ etiqueta, valor, fuerte, tono }) {
  return <div className={`flex justify-between gap-3 py-1 ${fuerte ? 'font-semibold' : ''} ${tono === 'malo' ? 'text-red-700' : tono === 'bueno' ? 'text-green-700' : ''}`}><span>{etiqueta}</span><span className="cifra">{valor}</span></div>
}

function Liquidacion({ l }) {
  if (!l) {return null}
  const saldo = Number(l.saldoPiloto)
  return (
    <section className="rounded-tarjeta bg-white p-4 text-sm">
      <h3 className="mb-2 font-semibold">{l.definitiva ? 'Liquidación' : 'Vista previa de la liquidación'}</h3>
      <Fila etiqueta="Cobrado al cliente" valor={Q(l.cobrado)} />
      {l.porTipo.map((t) => <Fila key={t.tipo} etiqueta={`− ${TIPOS_COSTO[t.tipo] ?? t.tipo}`} valor={Q(t.monto)} />)}
      <Fila etiqueta="− Pago al piloto (bono)" valor={Q(l.pagoPiloto)} />
      {hay(l.prorrateo) && <Fila etiqueta={`− Indirectos (${num(l.kmRecorridos)} km × ${Q(l.costoKmFijo)})`} valor={Q(l.prorrateo)} />}
      {hay(l.ganancia) && <div className="mt-1 border-t pt-1"><Fila etiqueta={`Ganancia${hay(l.margen) ? ` (${num(l.margen, 1)} %)` : ''}`} valor={Q(l.ganancia)} fuerte tono={Number(l.ganancia) < 0 ? 'malo' : 'bueno'} /></div>}
      <div className="mt-3 rounded-control bg-gray-50 p-3">
        <Fila etiqueta="Anticipos entregados" valor={Q(l.anticipos)} />
        <Fila etiqueta="Gastos pagados por el piloto" valor={Q(l.pagadoPorPiloto)} />
        <Fila etiqueta={saldo >= 0 ? 'El piloto devuelve' : 'Se le paga al piloto'} valor={Q(Math.abs(saldo))} fuerte />
      </div>
      {!l.definitiva && l.avisos?.map((a) => <p key={a} className="mt-2 text-xs text-amber-800">{a}</p>)}
    </section>
  )
}

function Detalle({ id, onCerrar, onCambio }) {
  const { puede } = usePermisos()
  const { datos: v, recargar } = useConsulta(id ? `/viajes/${id}` : null)
  const [modal, setModal] = useState(null)
  const listo = () => { setModal(null); recargar(); onCambio() }
  if (!id) {return null}
  const estado = v?.estado
  const abierto = ['PROGRAMADO', 'EN_RUTA', 'FINALIZADO'].includes(estado)
  const liquidar = async () => {
    if (!(await confirmar({ titulo: `Liquidar ${v.numero}`, mensaje: 'Se cierran los costos y anticipos del viaje y se guarda su ganancia. Después ya no se modifica.', confirmar: 'Liquidar' }))) {return}
    if (await enviar('post', `/viajes/${v.id}/liquidar`)) { recargar(); onCambio() }
  }
  const quitar = async (tipo, itemId) => {
    if (!(await confirmar({ titulo: tipo === 'costos' ? 'Eliminar costo' : 'Eliminar anticipo', mensaje: '¿Seguro? Queda registrado en la bitácora.', confirmar: 'Eliminar', peligro: true }))) {return}
    if (await enviar('delete', `/viajes/${v.id}/${tipo}/${itemId}`)) { recargar(); onCambio() }
  }
  const pie = v && (
    <div className="flex w-full flex-wrap justify-end gap-2">
      {estado === 'PROGRAMADO' && puede('viajes.crear') && <BotonPrimario onClick={() => setModal('iniciar')}><Play className="h-4 w-4" aria-hidden /> Iniciar</BotonPrimario>}
      {estado === 'EN_RUTA' && puede('viajes.cerrar') && <BotonPrimario onClick={() => setModal('finalizar')}><Flag className="h-4 w-4" aria-hidden /> Finalizar</BotonPrimario>}
      {estado === 'FINALIZADO' && puede('viajes.liquidar') && <BotonPrimario onClick={liquidar}><CheckCircle2 className="h-4 w-4" aria-hidden /> Liquidar</BotonPrimario>}
      {['PROGRAMADO', 'EN_RUTA'].includes(estado) && puede('viajes.anular') && <Boton peligro onClick={() => setModal('cancelar')}><XCircle className="h-4 w-4" aria-hidden /> Cancelar</Boton>}
    </div>
  )
  return (
    <Hoja abierta titulo={v ? `${v.numero} · ${v.cliente}` : 'Viaje'} onCerrar={onCerrar} pie={pie}>
      {!v ? <p className="text-sm text-gray-500">Cargando…</p> : (
        <div className="space-y-4 text-sm">
          <section className="rounded-tarjeta bg-white p-4">
            <div className="flex items-center justify-between"><Etiqueta color={ESTADO_VIAJE[estado].color}>{ESTADO_VIAJE[estado].texto}</Etiqueta>{hay(v.aTiempo) && <Etiqueta color={v.aTiempo ? 'verde' : 'rojo'}>{v.aTiempo ? 'Entregó a tiempo' : 'Entrega tarde'}</Etiqueta>}</div>
            <p className="mt-2 font-medium">{v.origen} → {v.destino}</p>
            <p className="text-gray-600">{v.ruta ?? 'Sin ruta del catálogo'}{v.carga ? ` · ${v.carga}` : ''}{v.referencia ? ` · Ref. ${v.referencia}` : ''}</p>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1">
              <dt className="text-gray-500">Cabezal</dt><dd>{v.cabezal} · {v.placa}{v.remolque ? ` + ${v.remolque}` : ''}</dd>
              <dt className="text-gray-500">Piloto</dt><dd>{v.piloto}</dd>
              <dt className="text-gray-500">Salida</dt><dd>{fechaHora(v.iniciadoEn ?? v.fechaSalida)}</dd>
              <dt className="text-gray-500">Llegada</dt><dd>{fechaHora(v.fechaLlegada)}</dd>
              <dt className="text-gray-500">Km</dt><dd className="cifra">{v.kmSalida ? `${num(v.kmSalida)} → ${v.kmLlegada ? num(v.kmLlegada) : '…'}` : '—'}{v.kmRecorridos ? ` (${num(v.kmRecorridos)} km, ${num(v.kmVacios)} vacíos)` : ''}</dd>
              <dt className="text-gray-500">Cobro</dt><dd className="cifra">{Q(v.montoCobrado)}{v.tarifa ? ` · tarifa ${v.tarifa.tipo.toLowerCase().replace('_', ' ')}` : ''}</dd>
            </dl>
            {v.motivoCancelacion && <p className="mt-2 text-red-700">Cancelado: {v.motivoCancelacion}</p>}
            {v.inspecciones?.[0] && <p className="mt-2 text-xs text-gray-500">Inspección de salida: {fechaHora(v.inspecciones[0].fecha)} · {v.inspecciones[0].resultado.toLowerCase().replace('_', ' ')}</p>}
          </section>

          <section className="rounded-tarjeta bg-white p-4">
            <div className="mb-2 flex items-center justify-between"><h3 className="font-semibold">Anticipos</h3>{abierto && puede('viajes.anticipos') && <Boton onClick={() => setModal('anticipo')}><Banknote className="h-4 w-4" aria-hidden /> Entregar</Boton>}</div>
            <ul className="divide-y">{v.anticipos.map((a) => <li key={a.id} className="flex items-center gap-2 py-1.5"><span className="flex-1">{fechaHora(a.fecha)} · {a.medio.toLowerCase()}{a.nota ? ` · ${a.nota}` : ''} <span className="text-xs text-gray-500">({a.entrego})</span></span><span className="cifra">{Q(a.monto)}</span>{abierto && puede('viajes.anticipos') && <button type="button" onClick={() => quitar('anticipos', a.id)} aria-label="Eliminar anticipo" className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-700"><Trash2 className="h-4 w-4" /></button>}</li>)}
              {!v.anticipos.length && <li className="py-1.5 text-gray-500">Sin anticipos.</li>}</ul>
          </section>

          <section className="rounded-tarjeta bg-white p-4">
            <div className="mb-2 flex items-center justify-between"><h3 className="font-semibold">Costos del viaje</h3>{abierto && puede('viajes.costos') && <Boton onClick={() => setModal('costo')}><Plus className="h-4 w-4" aria-hidden /> Costo</Boton>}</div>
            <ul className="divide-y">{v.costos.map((c) => <li key={c.id} className="flex items-center gap-2 py-1.5"><Receipt className="h-4 w-4 shrink-0 text-gray-400" aria-hidden /><span className="flex-1">{TIPOS_COSTO[c.tipo] ?? c.tipo}{c.descripcion ? ` · ${c.descripcion}` : ''}<span className="block text-xs text-gray-500">{fechaHora(c.fecha)} · {c.pagadoPorPiloto ? 'pagó el piloto' : 'pagó la empresa'}{c.documento ? ` · ${c.documento}` : ''}</span></span><span className="cifra">{Q(c.monto)}</span>{abierto && puede('viajes.costos') && !c.desdeCarga && <button type="button" onClick={() => quitar('costos', c.id)} aria-label="Eliminar costo" className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-700"><Trash2 className="h-4 w-4" /></button>}</li>)}
              {!v.costos.length && <li className="py-1.5 text-gray-500">Sin costos registrados.</li>}</ul>
          </section>

          <Liquidacion l={v.liquidacion} />
        </div>
      )}
      {modal === 'iniciar' && <Iniciar viaje={v} puedeAutorizar={puede('viajes.liquidar')} onListo={listo} onCerrar={() => setModal(null)} />}
      {modal === 'finalizar' && <Finalizar viaje={v} onListo={listo} onCerrar={() => setModal(null)} />}
      {modal === 'costo' && <NuevoCosto viaje={v} onListo={listo} onCerrar={() => setModal(null)} />}
      {modal === 'anticipo' && <NuevoAnticipo viaje={v} onListo={listo} onCerrar={() => setModal(null)} />}
      {modal === 'cancelar' && <Cancelar viaje={v} onListo={listo} onCerrar={() => setModal(null)} />}
    </Hoja>
  )
}

// ───────────────────────────── Lista ─────────────────────────────

export default function Viajes() {
  const { puede } = usePermisos()
  const [params, setParams] = useSearchParams()
  const [estado, setEstado] = useState('ABIERTOS')
  const [q, setQ] = useState('')
  const [buscar, setBuscar] = useState('')
  const [programando, setProgramando] = useState(false)
  const abierto = params.get('id') ? Number(params.get('id')) : null
  const abrir = (id) => setParams(id ? { id: String(id) } : {})
  const { datos, recargar } = useConsulta('/viajes', { estado: estado || undefined, q: buscar || undefined })
  useEffect(() => { const t = setTimeout(() => setBuscar(q.trim()), 300); return () => clearTimeout(t) }, [q])
  const pestanas = useMemo(() => PESTANAS.map(([v, t]) => {
    const n = datos?.porEstado ? (v === 'ABIERTOS' ? ['PROGRAMADO', 'EN_RUTA', 'FINALIZADO'].reduce((a, k) => a + (datos.porEstado[k] ?? 0), 0) : datos.porEstado[v]) : null
    return [v, n ? `${t} (${n})` : t]
  }), [datos])
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Pestanas opciones={pestanas} valor={estado} onCambio={setEstado} />
        <label className="relative ml-auto"><span className="sr-only">Buscar</span><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" aria-hidden /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Número, referencia o destino" className="w-60 rounded-control border py-2 pl-8 pr-3 text-sm" /></label>
        {puede('viajes.crear') && <BotonPrimario onClick={() => setProgramando(true)}><Plus className="h-4 w-4" aria-hidden /> Programar viaje</BotonPrimario>}
      </div>
      <ul className="divide-y rounded-superficie border bg-white">
        {datos?.viajes.map((v) => (
          <li key={v.id}>
            <button type="button" onClick={() => abrir(v.id)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left text-sm hover:bg-gray-50">
              <RutaIcono className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
              <span className="w-24 font-medium">{v.numero}</span>
              <Etiqueta color={ESTADO_VIAJE[v.estado].color}>{ESTADO_VIAJE[v.estado].texto}</Etiqueta>
              <span className="min-w-0 flex-1 basis-56"><span className="block truncate font-medium">{v.cliente}</span><span className="block truncate text-xs text-gray-500">{v.ruta ?? `${v.origen} → ${v.destino}`}</span></span>
              <span className="w-44 text-xs text-gray-600"><span className="block">{v.cabezal}{v.remolque ? ` + ${v.remolque}` : ''}</span><span className="block truncate">{v.piloto}</span></span>
              <span className="w-36 text-xs text-gray-600">{new Date(v.fechaSalida).toLocaleString('es-GT', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Guatemala' })}</span>
              <span className="cifra w-28 text-right font-semibold">{Q(v.montoCobrado)}{hay(v.ganancia) && <span className={`block text-xs font-normal ${Number(v.ganancia) < 0 ? 'text-red-700' : 'text-green-700'}`}>{Q(v.ganancia)}</span>}</span>
            </button>
          </li>
        ))}
        {datos && !datos.viajes.length && <li className="px-4 py-10 text-center text-sm text-gray-500">No hay viajes en esta vista.</li>}
      </ul>
      {programando && <ProgramarViaje onCerrar={() => setProgramando(false)} onListo={(id) => { setProgramando(false); recargar(); abrir(id) }} />}
      <Detalle id={abierto} onCerrar={() => abrir(null)} onCambio={recargar} />
    </div>
  )
}
