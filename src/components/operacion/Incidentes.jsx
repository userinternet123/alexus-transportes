// ─────────────────────────────────────────────────────────────────────────────
// INCIDENTES Y MULTAS: multas de tránsito, accidentes, robos, daños a la carga, averías en ruta y reclamos de clientes.
// Cada uno con su costo (multa, daños, terceros), lo recuperado (seguro y descuento al piloto en planilla) y su trámite.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertTriangle, Plus } from 'lucide-react'
import { usePermisos } from '../../hooks/usePermisos'
import { Q } from '../comun/formato'
import Campo from '../comun/Campo'
import Hoja from '../comun/Hoja'
import Modal from '../comun/Modal'
import { Boton, BotonPrimario, Cifra, Etiqueta, Pestanas } from './comun'
import { ahoraLocal, deLocal, ent, enviar, fecha, fechaHora, haceDias, hay, hoy, nombrePiloto, useCatalogos, useConsulta } from './util'

const VISTAS = [['ABIERTOS', 'Abiertos'], ['MULTAS', 'Multas'], ['TODOS', 'Historial'], ['RESUMEN', 'Costo por piloto y cabezal']]
const TIPOS_INC = { MULTA: 'Multa', ACCIDENTE: 'Accidente', ROBO: 'Robo', DANO_CARGA: 'Daño a la carga', AVERIA_EN_RUTA: 'Avería en ruta', RECLAMO_CLIENTE: 'Reclamo del cliente', OTRO: 'Otro' }
const ESTADO = { ABIERTO: ['Abierto', 'azul'], EN_TRAMITE: ['En trámite', 'ambar'], CERRADO: ['Cerrado', 'verde'], ANULADO: ['Anulado', 'gris'] }
const MULTA = { PAGADA: ['Pagada', 'verde'], VENCIDA: ['Vencida', 'rojo'], POR_VENCER: ['Por vencer', 'ambar'], PENDIENTE: ['Sin pagar', 'azul'] }
const RESPONSABLE = { SIN_DEFINIR: 'Sin definir', EMPRESA: 'La empresa', PILOTO: 'El piloto', TERCERO: 'Un tercero' }
const RECLAMO = { SIN_RECLAMO: 'Sin reclamo', PRESENTADO: 'Presentado', APROBADO: 'Aprobado', RECHAZADO: 'Rechazado', PAGADO: 'Pagado' }
const diasMulta = (m) => (!m || !hay(m.dias) ? '' : m.dias < 0 ? ` hace ${-m.dias} día(s)` : m.dias === 0 ? ' hoy' : ` en ${m.dias} día(s)`)

export default function Incidentes() {
  const { puede } = usePermisos()
  const [params, setParams] = useSearchParams()
  const vista = VISTAS.some(([k]) => k === params.get('vista')) ? params.get('vista') : 'ABIERTOS'
  const setVista = (v) => setParams((p) => { p.set('vista', v); return p }, { replace: true })
  const [nuevo, setNuevo] = useState(false)
  const [abierto, setAbierto] = useState(null)
  const [version, setVersion] = useState(0)
  const cambio = () => setVersion((v) => v + 1)
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Pestanas opciones={VISTAS} valor={vista} onCambio={setVista} />
        {puede('incidentes.registrar') && <BotonPrimario className="ml-auto" onClick={() => setNuevo(true)}><Plus className="h-4 w-4" aria-hidden /> Registrar incidente</BotonPrimario>}
      </div>
      {vista === 'RESUMEN' ? <Resumen key={version} /> : <Lista key={`${vista}-${version}`} vista={vista} onAbrir={setAbierto} />}
      {nuevo && <Nuevo onCerrar={() => setNuevo(false)} onListo={(id) => { setNuevo(false); cambio(); setAbierto(id) }} />}
      <Detalle id={abierto} onCerrar={() => setAbierto(null)} onCambio={cambio} />
    </div>
  )
}

function Lista({ vista, onAbrir }) {
  const [q, setQ] = useState('')
  const [tipo, setTipo] = useState(vista === 'MULTAS' ? 'MULTA' : '')
  const estado = vista === 'TODOS' ? 'TODOS' : vista === 'MULTAS' ? 'TODOS' : 'ABIERTOS'
  const { datos } = useConsulta('/incidentes', { estado, tipo: tipo || undefined, q: q.trim() || undefined, desde: vista === 'ABIERTOS' ? undefined : haceDias(365) })
  const filas = vista === 'MULTAS' ? (datos ?? []).filter((i) => i.estado !== 'ANULADO') : (datos ?? [])
  const sinPagar = filas.filter((i) => i.multa && i.multa.estado !== 'PAGADA')
  return (
    <>
      {datos && <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {vista === 'MULTAS' ? <>
          <Cifra titulo="Multas sin pagar" valor={sinPagar.length} detalle={Q(sinPagar.reduce((a, i) => a + Number(i.costoMulta), 0))} tono={sinPagar.length ? 'malo' : null} />
          <Cifra titulo="Vencidas" valor={sinPagar.filter((i) => i.multa.estado === 'VENCIDA').length} tono={sinPagar.some((i) => i.multa.estado === 'VENCIDA') ? 'malo' : null} detalle="págalas para evitar recargos" />
          <Cifra titulo="Por vencer" valor={sinPagar.filter((i) => i.multa.estado === 'POR_VENCER').length} />
          <Cifra titulo="Pagado en multas (12 meses)" valor={Q(filas.filter((i) => i.multa?.estado === 'PAGADA').reduce((a, i) => a + Number(i.costoMulta), 0))} />
        </> : <>
          <Cifra titulo={vista === 'ABIERTOS' ? 'Incidentes abiertos' : 'Incidentes (12 meses)'} valor={filas.length} />
          <Cifra titulo="Costo" valor={Q(filas.reduce((a, i) => a + Number(i.costo), 0))} detalle="multas, daños y terceros" />
          <Cifra titulo="Recuperado" valor={Q(filas.reduce((a, i) => a + Number(i.recuperado), 0))} detalle="seguro y descuentos al piloto" tono="bueno" />
          <Cifra titulo="Costo neto" valor={Q(filas.reduce((a, i) => a + Number(i.neto), 0))} tono={filas.some((i) => Number(i.neto) > 0) ? 'malo' : null} />
        </>}
      </section>}
      <div className="flex flex-wrap items-end gap-3 text-sm">
        {vista !== 'MULTAS' && <label>Tipo<select value={tipo} onChange={(e) => setTipo(e.target.value)} className="mt-1 block rounded-control border px-2 py-1.5"><option value="">Todos</option>{Object.entries(TIPOS_INC).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>}
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Número, boleta, cabezal o descripción" aria-label="Buscar incidente" className="min-w-0 flex-1 rounded-control border px-3 py-2 sm:max-w-xs" />
      </div>
      <ul className="divide-y rounded-superficie border bg-white">
        {filas.map((i) => {
          const [et, color] = ESTADO[i.estado]
          return (
            <li key={i.id}><button type="button" onClick={() => onAbrir(i.id)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left text-sm hover:bg-gray-50">
              <AlertTriangle className={`h-4 w-4 shrink-0 ${i.tipo === 'ACCIDENTE' || i.tipo === 'ROBO' ? 'text-red-500' : 'text-amber-500'}`} aria-hidden />
              <span className="w-24 font-medium">{i.numero}</span>
              <span className="min-w-0 flex-1 basis-56"><span className="block truncate font-medium">{TIPOS_INC[i.tipo]}{i.unidad ? ` · ${i.unidad}` : ''} · {i.descripcion}</span><span className="block truncate text-xs text-gray-500">{fecha(i.fecha)}{i.piloto ? ` · ${i.piloto}` : ''}{i.autoridad ? ` · ${i.autoridad}` : ''}{i.numeroBoleta ? ` ${i.numeroBoleta}` : ''}{i.orden ? ` · ${i.orden.numero}` : ''}</span></span>
              {i.multa && <Etiqueta color={MULTA[i.multa.estado][1]} titulo={i.fechaLimitePago ? `Fecha límite ${fecha(i.fechaLimitePago)}` : undefined}>{MULTA[i.multa.estado][0]}{i.multa.estado !== 'PAGADA' ? diasMulta(i.multa) : ''}</Etiqueta>}
              {i.estadoReclamo !== 'SIN_RECLAMO' && <Etiqueta color="morado">Seguro: {RECLAMO[i.estadoReclamo].toLowerCase()}</Etiqueta>}
              <Etiqueta color={color}>{et}</Etiqueta>
              <span className="w-32 text-right text-xs text-gray-500">neto<span className="cifra block text-sm font-medium text-gray-900">{Q(i.neto)}</span></span>
            </button></li>
          )
        })}
        {datos && !filas.length && <li className="px-4 py-10 text-center text-sm text-gray-500">{vista === 'ABIERTOS' ? 'No hay incidentes abiertos.' : 'Sin incidentes en esta vista.'}</li>}
        {!datos && <li className="px-4 py-10 text-center text-sm text-gray-500">Cargando…</li>}
      </ul>
    </>
  )
}

function Tabla({ titulo, filas }) {
  return (
    <section className="rounded-superficie border bg-white">
      <h3 className="border-b px-4 py-2 font-semibold">{titulo}</h3>
      <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-sm">
        <thead className="text-left text-xs text-gray-500"><tr><th className="px-4 py-2" /><th className="py-2 text-right">Incidentes</th><th className="py-2 text-right">Multas</th><th className="py-2 text-right">Accidentes</th><th className="py-2 text-right">Costo</th><th className="py-2 text-right">Recuperado</th><th className="px-4 py-2 text-right">Neto</th></tr></thead>
        <tbody className="divide-y">{filas.map((g) => (
          <tr key={g.clave}><td className="px-4 py-2 font-medium">{g.texto ?? g.clave}</td><td className="cifra py-2 text-right">{g.incidentes}</td><td className="cifra py-2 text-right">{g.multas}</td><td className="cifra py-2 text-right">{g.accidentes}</td><td className="cifra py-2 text-right">{Q(g.costo)}</td><td className="cifra py-2 text-right text-green-700">{Q(g.recuperado)}</td><td className="cifra px-4 py-2 text-right font-semibold">{Q(g.neto)}</td></tr>
        ))}{!filas.length && <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-500">Sin incidentes en el período.</td></tr>}</tbody>
      </table></div>
    </section>
  )
}

function Resumen() {
  const [desde, setDesde] = useState(haceDias(365))
  const [hasta, setHasta] = useState(hoy())
  const { datos: d } = useConsulta('/incidentes/resumen', { desde, hasta })
  return (
    <>
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label>Desde<input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} className="mt-1 block rounded-control border px-2 py-1.5" /></label>
        <label>Hasta<input type="date" value={hasta} min={desde} max={hoy()} onChange={(e) => setHasta(e.target.value)} className="mt-1 block rounded-control border px-2 py-1.5" /></label>
      </div>
      {!d ? <p className="text-sm text-gray-500">Cargando…</p> : <>
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Cifra titulo="Incidentes" valor={d.totales.incidentes} />
          <Cifra titulo="Costo neto" valor={Q(d.totales.neto)} detalle={`costo ${Q(d.totales.costo)} − recuperado ${Q(d.totales.recuperado)}`} tono={Number(d.totales.neto) > 0 ? 'malo' : null} />
          <Cifra titulo="Multas sin pagar" valor={d.totales.multasSinPagar} detalle={Q(d.totales.montoSinPagar)} tono={d.totales.multasSinPagar ? 'malo' : null} />
          <Cifra titulo="Por descontar a pilotos" valor={Q(d.totales.porDescontar)} detalle="sale en las próximas planillas" />
        </section>
        <Tabla titulo="Por piloto" filas={d.porPiloto} />
        <Tabla titulo="Por cabezal" filas={d.porCabezal} />
        <Tabla titulo="Por tipo" filas={d.porTipo} />
      </>}
    </>
  )
}

function Nuevo({ onCerrar, onListo }) {
  const { cabezales, remolques, pilotos } = useCatalogos()
  const { datos: dv } = useConsulta('/viajes', { desde: haceDias(45), limit: 200 })
  const viajes = (dv?.viajes ?? []).filter((v) => v.estado !== 'CANCELADO')
  const { puede } = usePermisos()
  const [f, setF] = useState({ tipo: 'MULTA', fecha: ahoraLocal(), lugar: '', descripcion: '', viajeId: '', cabezalId: '', remolqueId: '', pilotoId: '', autoridad: '', numeroBoleta: '', montoMulta: '', fechaLimitePago: '', costoDanos: '', costoTerceros: '', heridos: false, abrirOrden: false, ponerEnTaller: false })
  const [enviando, setEnviando] = useState(false)
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const elegirViaje = (e) => {
    // El viaje trae su cabezal, remolque y piloto (si no se eligen, el API los toma del viaje)
    const v = viajes.find((x) => String(x.id) === e.target.value)
    const id = (lista, codigo) => String(lista.find((u) => u.codigo === codigo)?.id ?? '')
    setF((x) => (v ? { ...x, viajeId: e.target.value, cabezalId: id(cabezales, v.cabezal), remolqueId: v.remolque ? id(remolques, v.remolque) : '', pilotoId: String(v.pilotoId ?? '') } : { ...x, viajeId: '' }))
  }
  const multa = f.tipo === 'MULTA'
  const danos = ['ACCIDENTE', 'ROBO', 'DANO_CARGA', 'AVERIA_EN_RUTA', 'RECLAMO_CLIENTE', 'OTRO'].includes(f.tipo)
  const listo = f.descripcion.trim().length >= 5 && f.fecha && (!multa || Number(f.montoMulta) > 0) && (!f.abrirOrden || f.cabezalId || f.remolqueId)
  const ir = async () => {
    setEnviando(true)
    const n = (v) => (v === '' ? null : Number(v))
    const r = await enviar('post', '/incidentes', {
      tipo: f.tipo, fecha: deLocal(f.fecha), lugar: f.lugar || null, descripcion: f.descripcion, viajeId: n(f.viajeId), cabezalId: n(f.cabezalId), remolqueId: n(f.remolqueId), pilotoId: n(f.pilotoId),
      autoridad: multa ? f.autoridad || null : null, numeroBoleta: multa ? f.numeroBoleta || null : null, montoMulta: multa ? n(f.montoMulta) : null, fechaLimitePago: multa && f.fechaLimitePago ? f.fechaLimitePago : null,
      costoDanos: danos ? n(f.costoDanos) : null, costoTerceros: danos ? n(f.costoTerceros) : null, heridos: f.heridos, abrirOrden: f.abrirOrden, ponerEnTaller: f.abrirOrden && f.ponerEnTaller,
    })
    setEnviando(false)
    if (r) { onListo(r.data?.id) }
  }
  return (
    <Modal abierto titulo="Registrar incidente" onCerrar={onCerrar} ancho="max-w-2xl"
      pie={<><Boton onClick={onCerrar}>Cancelar</Boton><BotonPrimario disabled={enviando || !listo} onClick={ir}>{enviando ? 'Guardando…' : 'Registrar'}</BotonPrimario></>}>
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <Campo etiqueta="Tipo" id="tipo" requerido><select value={f.tipo} onChange={set('tipo')} className={ent}>{Object.entries(TIPOS_INC).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
        <Campo etiqueta="Fecha y hora" id="fecha" requerido><input type="datetime-local" value={f.fecha} max={ahoraLocal(1)} onChange={set('fecha')} className={ent} /></Campo>
        <Campo etiqueta="Viaje (opcional)" id="viajeId" className="sm:col-span-2"><select value={f.viajeId} onChange={elegirViaje} className={ent}><option value="">Sin viaje</option>{viajes.map((v) => <option key={v.id} value={v.id}>{v.numero} · {v.cabezal} · {v.piloto} · {v.destino}</option>)}</select></Campo>
        <Campo etiqueta="Cabezal" id="cabezalId"><select value={f.cabezalId} onChange={set('cabezalId')} className={ent}><option value="">—</option>{cabezales.map((c) => <option key={c.id} value={c.id}>{c.codigo} · {c.placa}</option>)}</select></Campo>
        <Campo etiqueta="Piloto" id="pilotoId"><select value={f.pilotoId} onChange={set('pilotoId')} className={ent}><option value="">—</option>{pilotos.map((p) => <option key={p.id} value={p.id}>{nombrePiloto(p)}</option>)}</select></Campo>
        <Campo etiqueta="Remolque" id="remolqueId"><select value={f.remolqueId} onChange={set('remolqueId')} className={ent}><option value="">—</option>{remolques.map((r) => <option key={r.id} value={r.id}>{r.codigo} · {r.placa}</option>)}</select></Campo>
        <Campo etiqueta="Lugar" id="lugar"><input value={f.lugar} onChange={set('lugar')} maxLength={200} placeholder="Km 45 CA-9, Escuintla" className={ent} /></Campo>
        <Campo etiqueta="Qué pasó" id="descripcion" requerido className="sm:col-span-2"><textarea rows={2} value={f.descripcion} onChange={set('descripcion')} maxLength={2000} className={ent} /></Campo>
        {multa && <>
          <Campo etiqueta="Autoridad" id="autoridad"><input value={f.autoridad} onChange={set('autoridad')} list="autoridades" maxLength={80} className={ent} /><datalist id="autoridades"><option value="PMT" /><option value="PNC" /><option value="Provial" /><option value="SAT" /><option value="Municipalidad" /></datalist></Campo>
          <Campo etiqueta="Número de boleta" id="numeroBoleta"><input value={f.numeroBoleta} onChange={set('numeroBoleta')} maxLength={60} className={ent} /></Campo>
          <Campo etiqueta="Monto de la multa (Q)" id="montoMulta" requerido><input inputMode="decimal" value={f.montoMulta} onChange={set('montoMulta')} className={`${ent} text-right`} /></Campo>
          <Campo etiqueta="Fecha límite de pago" id="fechaLimitePago"><input type="date" value={f.fechaLimitePago} onChange={set('fechaLimitePago')} className={ent} /></Campo>
        </>}
        {danos && <>
          <Campo etiqueta="Costo de reparar lo propio (Q)" id="costoDanos"><input inputMode="decimal" value={f.costoDanos} onChange={set('costoDanos')} placeholder="estimado" className={`${ent} text-right`} /></Campo>
          <Campo etiqueta="Daños a terceros, carga o cliente (Q)" id="costoTerceros"><input inputMode="decimal" value={f.costoTerceros} onChange={set('costoTerceros')} className={`${ent} text-right`} /></Campo>
          {f.tipo === 'ACCIDENTE' && <label className="flex items-center gap-2 sm:col-span-2"><input type="checkbox" checked={f.heridos} onChange={set('heridos')} className="accent-red-600" /> Hubo personas heridas</label>}
          {puede('mantenimiento.crear') && (f.cabezalId || f.remolqueId) && <label className="flex items-center gap-2 sm:col-span-2"><input type="checkbox" checked={f.abrirOrden} onChange={set('abrirOrden')} className="accent-green-600" /> Abrir una orden de taller para la reparación</label>}
          {f.abrirOrden && <label className="flex items-center gap-2 sm:col-span-2"><input type="checkbox" checked={f.ponerEnTaller} onChange={set('ponerEnTaller')} className="accent-red-600" /> La unidad queda en taller (no puede salir a viaje)</label>}
        </>}
      </div>
    </Modal>
  )
}

function Detalle({ id, onCerrar, onCambio }) {
  const { puede } = usePermisos()
  const { datos: i, recargar } = useConsulta(id ? `/incidentes/${id}` : null)
  const [g, setG] = useState(null) // formulario de gestión
  const [modo, setModo] = useState(null) // EN_TRAMITE | CERRADO | ANULADO
  const [comentario, setComentario] = useState('')
  const [enviando, setEnviando] = useState(false)
  if (!id) { return null }
  const abierto = i && ['ABIERTO', 'EN_TRAMITE'].includes(i.estado)
  const gestiona = puede('incidentes.gestionar') && abierto
  const hecho = (ok) => { if (ok) { recargar(); onCambio() } setEnviando(false); return ok }
  const abrirGestion = () => setG({
    responsable: i.responsable, pagadoEn: i.pagadoEn?.slice(0, 10) ?? '', montoPagado: i.pagadoEn ? i.montoPagado : '', aseguradora: i.aseguradora ?? '', numeroReclamo: i.numeroReclamo ?? '',
    estadoReclamo: i.estadoReclamo, deducible: Number(i.deducible) ? i.deducible : '', montoRecuperado: Number(i.montoRecuperado) ? i.montoRecuperado : '', descuentoPiloto: Number(i.descuentoPiloto) ? i.descuentoPiloto : '', cuotasDescuento: i.cuotasDescuento,
  })
  const setg = (k) => (e) => setG((x) => ({ ...x, [k]: e.target.value }))
  const guardar = async () => {
    setEnviando(true)
    const n = (v) => (v === '' || v === null ? null : Number(v))
    const tieneMulta = Number(i.montoMulta) > 0
    const cuerpo = {
      responsable: g.responsable, aseguradora: g.aseguradora || null, numeroReclamo: g.numeroReclamo || null, estadoReclamo: g.estadoReclamo,
      deducible: n(g.deducible) ?? 0, montoRecuperado: n(g.montoRecuperado) ?? 0, ...(g.responsable === 'PILOTO' ? { descuentoPiloto: n(g.descuentoPiloto) ?? 0, cuotasDescuento: Number(g.cuotasDescuento) || 1 } : {}),
      ...(tieneMulta ? { pagadoEn: g.pagadoEn || null, montoPagado: g.pagadoEn ? n(g.montoPagado) : null } : {}),
    }
    if (hecho(await enviar('put', `/incidentes/${i.id}/gestion`, cuerpo))) { setG(null) }
  }
  const estado = async (nuevo) => { setEnviando(true); if (hecho(await enviar('put', `/incidentes/${i.id}/estado`, { estado: nuevo, comentario }))) { setModo(null); setComentario('') } }
  const [et, color] = i ? ESTADO[i.estado] : []
  return (
    <Hoja abierta titulo={i ? `${i.numero} · ${TIPOS_INC[i.tipo]}` : 'Incidente'} onCerrar={() => { setModo(null); setG(null); onCerrar() }}
      pie={gestiona && !modo && !g && (
        <div className="flex w-full flex-wrap justify-end gap-2">
          {puede('incidentes.anular') && <Boton peligro onClick={() => setModo('ANULADO')}>Anular</Boton>}
          {i.estado === 'ABIERTO' && <Boton onClick={() => setModo('EN_TRAMITE')}>En trámite</Boton>}
          <BotonPrimario onClick={() => setModo('CERRADO')}>Cerrar</BotonPrimario>
        </div>
      )}>
      {!i ? <p className="text-sm text-gray-500">Cargando…</p> : (
        <div className="space-y-4 text-sm">
          <section className="rounded-tarjeta bg-white p-4">
            <div className="flex flex-wrap gap-2"><Etiqueta color={color}>{et}</Etiqueta>{i.multa && <Etiqueta color={MULTA[i.multa.estado][1]}>Multa: {MULTA[i.multa.estado][0].toLowerCase()}{i.multa.estado !== 'PAGADA' ? diasMulta(i.multa) : ''}</Etiqueta>}{i.heridos && <Etiqueta color="rojo">Con heridos</Etiqueta>}</div>
            <p className="mt-2 font-medium">{i.descripcion}</p>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1">
              <dt className="text-gray-500">Fecha</dt><dd>{fechaHora(i.fecha)}</dd>
              {i.lugar && <><dt className="text-gray-500">Lugar</dt><dd>{i.lugar}</dd></>}
              {(i.cabezal || i.remolque) && <><dt className="text-gray-500">Unidad</dt><dd>{[i.cabezal && `${i.cabezal.codigo} · ${i.cabezal.placa}`, i.remolque?.codigo].filter(Boolean).join(' + ')}</dd></>}
              {i.piloto && <><dt className="text-gray-500">Piloto</dt><dd>{i.piloto.nombre}</dd></>}
              {i.viaje && <><dt className="text-gray-500">Viaje</dt><dd>{i.viaje.numero} · {i.viaje.origen} → {i.viaje.destino}</dd></>}
              {i.ordenTrabajo && <><dt className="text-gray-500">Reparación</dt><dd>{i.ordenTrabajo.numero} ({i.ordenTrabajo.estado.toLowerCase().replace('_', ' ')}) · {Q(i.ordenTrabajo.total)}</dd></>}
              {Number(i.montoMulta) > 0 && <><dt className="text-gray-500">Multa</dt><dd>{[i.autoridad, i.numeroBoleta].filter(Boolean).join(' · ')} · {Q(i.montoMulta)}{i.fechaLimitePago ? ` · límite ${fecha(i.fechaLimitePago)}` : ''}</dd></>}
              <dt className="text-gray-500">Responsable</dt><dd>{RESPONSABLE[i.responsable]}</dd>
              <dt className="text-gray-500">Registró</dt><dd>{i.creadoPor} · {fechaHora(i.creadoEn)}</dd>
            </dl>
            {i.resolucion && <p className="mt-2 rounded-control bg-green-50 px-3 py-2 text-green-900">{i.resolucion}</p>}
            {i.motivoAnulacion && <p className="mt-2 rounded-control bg-gray-100 px-3 py-2">Anulado: {i.motivoAnulacion}</p>}
          </section>

          {modo && (
            <section className={`space-y-2 rounded-tarjeta border-2 bg-white p-4 ${modo === 'ANULADO' ? 'border-red-300' : 'border-green-600'}`}>
              <h3 className="font-semibold">{{ EN_TRAMITE: 'Pasar a trámite', CERRADO: 'Cerrar el incidente', ANULADO: 'Anular el incidente' }[modo]}</h3>
              <textarea rows={2} value={comentario} onChange={(e) => setComentario(e.target.value)} maxLength={1000} placeholder={modo === 'ANULADO' ? 'Por qué se anula' : 'Cómo quedó'} aria-label="Comentario" className={ent} />
              {modo === 'CERRADO' && Number(i.porDescontar) > 0 && <p className="text-xs text-gray-600">Al piloto le faltan {Q(i.porDescontar)} por descontar: siguen saliendo en las próximas planillas.</p>}
              <div className="flex justify-end gap-2"><Boton onClick={() => setModo(null)}>Cancelar</Boton>{modo === 'ANULADO' ? <Boton peligro disabled={enviando || comentario.trim().length < 3} onClick={() => estado('ANULADO')}>Anular</Boton> : <BotonPrimario disabled={enviando || comentario.trim().length < 3} onClick={() => estado(modo)}>Guardar</BotonPrimario>}</div>
            </section>
          )}

          <section className="rounded-tarjeta bg-white p-4">
            <div className="flex items-baseline justify-between"><h3 className="font-semibold">Costo y recuperación</h3>{gestiona && !g && <button type="button" onClick={abrirGestion} className="text-xs text-green-700 underline">Registrar pago, seguro o descuento</button>}</div>
            {g ? (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <Campo etiqueta="¿Quién fue responsable?" id="responsable" className="sm:col-span-2"><select value={g.responsable} onChange={setg('responsable')} className={ent}>{Object.entries(RESPONSABLE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
                {Number(i.montoMulta) > 0 && <>
                  <Campo etiqueta="Multa pagada el" id="pagadoEn"><input type="date" value={g.pagadoEn} max={hoy()} onChange={setg('pagadoEn')} className={ent} /></Campo>
                  <Campo etiqueta="Monto pagado (Q)" id="montoPagado"><input inputMode="decimal" value={g.montoPagado} onChange={setg('montoPagado')} placeholder={`${Number(i.montoMulta)}`} disabled={!g.pagadoEn} className={`${ent} text-right`} /></Campo>
                </>}
                <Campo etiqueta="Aseguradora" id="aseguradora"><input value={g.aseguradora} onChange={setg('aseguradora')} maxLength={120} className={ent} /></Campo>
                <Campo etiqueta="Número de reclamo" id="numeroReclamo"><input value={g.numeroReclamo} onChange={setg('numeroReclamo')} maxLength={60} className={ent} /></Campo>
                <Campo etiqueta="Reclamo al seguro" id="estadoReclamo"><select value={g.estadoReclamo} onChange={setg('estadoReclamo')} className={ent}>{Object.entries(RECLAMO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
                <Campo etiqueta="Deducible (Q)" id="deducible"><input inputMode="decimal" value={g.deducible} onChange={setg('deducible')} className={`${ent} text-right`} /></Campo>
                <Campo etiqueta="Pagado por el seguro (Q)" id="montoRecuperado"><input inputMode="decimal" value={g.montoRecuperado} onChange={setg('montoRecuperado')} className={`${ent} text-right`} /></Campo>
                {g.responsable === 'PILOTO' && i.piloto && <>
                  <Campo etiqueta={`Descontar a ${i.piloto.nombre} (Q)`} id="descuentoPiloto"><input inputMode="decimal" value={g.descuentoPiloto} onChange={setg('descuentoPiloto')} className={`${ent} text-right`} /></Campo>
                  <Campo etiqueta="En cuántas planillas" id="cuotasDescuento"><input type="number" min={1} max={24} value={g.cuotasDescuento} onChange={setg('cuotasDescuento')} className={`${ent} text-right`} /></Campo>
                  <p className="text-xs text-gray-500 sm:col-span-2">Se descuenta en cada planilla sin pasar del tope por planilla (Administración › Parámetros › Incidentes). Consulte con su asesor laboral los descuentos permitidos.</p>
                </>}
                <div className="flex justify-end gap-2 sm:col-span-2"><Boton onClick={() => setG(null)}>Cancelar</Boton><BotonPrimario disabled={enviando} onClick={guardar}>Guardar</BotonPrimario></div>
              </div>
            ) : (
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                {Number(i.montoMulta) > 0 && <><dt className="text-gray-500">Multa{i.pagadoEn ? ` (pagada ${fecha(i.pagadoEn)})` : ' (sin pagar)'}</dt><dd className="cifra text-right">{Q(i.costoMulta)}</dd></>}
                {Number(i.costoDanos) > 0 && <><dt className="text-gray-500">Daños propios</dt><dd className="cifra text-right">{Q(i.costoDanos)}</dd></>}
                {Number(i.costoTerceros) > 0 && <><dt className="text-gray-500">Terceros, carga o cliente</dt><dd className="cifra text-right">{Q(i.costoTerceros)}</dd></>}
                <dt className="font-medium">Costo</dt><dd className="cifra text-right font-medium">{Q(i.costo)}</dd>
                {i.estadoReclamo !== 'SIN_RECLAMO' && <><dt className="text-gray-500">Seguro: {i.aseguradora} {i.numeroReclamo ?? ''} ({RECLAMO[i.estadoReclamo].toLowerCase()}){Number(i.deducible) ? ` · deducible ${Q(i.deducible)}` : ''}</dt><dd className="cifra text-right text-green-700">−{Q(i.montoRecuperado)}</dd></>}
                {Number(i.descuentoPiloto) > 0 && <><dt className="text-gray-500">Descuento al piloto ({i.cuotasDescuento} cuota(s); descontado {Q(i.descontado)})</dt><dd className="cifra text-right text-green-700">−{Q(i.descuentoPiloto)}</dd></>}
                <dt className="font-semibold">Costo neto para la empresa</dt><dd className="cifra text-right font-semibold">{Q(i.neto)}</dd>
              </dl>
            )}
          </section>

          {i.descuentos.length > 0 && <section className="rounded-tarjeta bg-white p-4">
            <h3 className="mb-2 font-semibold">Descuentos en planilla</h3>
            <ul className="divide-y">{i.descuentos.map((x) => <li key={x.planillaId} className="flex items-center gap-2 py-1.5"><span className="flex-1">Planilla {x.periodo} ({x.tipo.toLowerCase()})</span><Etiqueta color={x.estado === 'BORRADOR' ? 'azul' : 'verde'}>{x.estado === 'BORRADOR' ? 'por aprobar' : 'descontado'}</Etiqueta><span className="cifra w-24 text-right">{Q(x.monto)}</span></li>)}</ul>
          </section>}
        </div>
      )}
    </Hoja>
  )
}
