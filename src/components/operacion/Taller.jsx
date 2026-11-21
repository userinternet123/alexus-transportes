// ─────────────────────────────────────────────────────────────────────────────
// TALLER: órdenes de trabajo (preventivas, servicios mayores, reparaciones), con repuestos por marca y mano de obra;
// alertas de mantenimiento por km o días; y qué marca de repuesto dura más y cuesta menos por km.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Trash2, Wrench } from 'lucide-react'
import { usePermisos } from '../../hooks/usePermisos'
import { useEstadoOpciones } from '../../hooks/useOpcionesRemotas'
import { Q } from '../comun/formato'
import Campo from '../comun/Campo'
import Hoja from '../comun/Hoja'
import Modal from '../comun/Modal'
import { Boton, BotonPrimario, Cifra, Etiqueta, Pestanas } from './comun'
import { ent, enviar, fecha, fechaHora, hay, hoy, nombreTercero, num, PRIORIDAD, useCatalogos, useConsulta } from './util'

const VISTAS = [['ORDENES', 'Órdenes de trabajo'], ['MANTENIMIENTO', 'Mantenimiento'], ['MARCAS', 'Repuestos por marca']]
const TIPOS = { PREVENTIVO: 'Preventivo', SERVICIO_MAYOR: 'Servicio mayor', CORRECTIVO: 'Reparación', LLANTAS: 'Llantas', CARROCERIA: 'Carrocería' }
const ESTADO = { ABIERTA: ['Abierta', 'azul'], EN_PROCESO: ['En proceso', 'ambar'], CERRADA: ['Cerrada', 'verde'], ANULADA: ['Anulada', 'gris'] }
const PLAN = { VENCIDO: ['Vencido', 'rojo'], PROXIMO: ['Próximo', 'ambar'], AL_DIA: ['Al día', 'verde'], SIN_HISTORIAL: ['Sin historial', 'gris'] }
/** «800 km · 12 días» lo que falta; lo ya vencido dice «pasado» (km y días se leen por separado). */
const faltan = (f) => [[f.faltaKm, 'km'], [f.faltaDias, 'días']].filter(([v]) => hay(v))
  .map(([v, u]) => (Number(v) <= 0 ? `pasado ${num(Math.abs(Number(v)))} ${u}` : `${num(v)} ${u}`)).join(' · ')
const cada = (p) => [p.cadaKm && `cada ${num(p.cadaKm)} km`, p.cadaDias && `cada ${p.cadaDias} días`].filter(Boolean).join(' o ')

export default function Taller() {
  const { puede } = usePermisos()
  const [params, setParams] = useSearchParams()
  const vista = VISTAS.some(([k]) => k === params.get('vista')) ? params.get('vista') : 'ORDENES'
  const setVista = (v) => setParams((p) => { p.set('vista', v); return p }, { replace: true })
  const [nueva, setNueva] = useState(null)
  const [abierta, setAbierta] = useState(null)
  const [version, setVersion] = useState(0)
  const cambio = () => setVersion((v) => v + 1)
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Pestanas opciones={VISTAS} valor={vista} onCambio={setVista} />
        {puede('mantenimiento.crear') && <BotonPrimario className="ml-auto" onClick={() => setNueva({})}><Plus className="h-4 w-4" aria-hidden /> Nueva orden</BotonPrimario>}
      </div>
      {vista === 'ORDENES' && <Ordenes key={version} onAbrir={setAbierta} />}
      {vista === 'MANTENIMIENTO' && <Mantenimiento key={version} puedeCrear={puede('mantenimiento.crear')} onNueva={setNueva} onAbrir={setAbierta} />}
      {vista === 'MARCAS' && <Marcas />}
      {nueva && <NuevaOrden inicial={nueva} onCerrar={() => setNueva(null)} onListo={(id) => { setNueva(null); cambio(); if (id) { setAbierta(id) } }} />}
      <Detalle id={abierta} onCerrar={() => setAbierta(null)} onCambio={cambio} />
    </div>
  )
}

function Ordenes({ onAbrir }) {
  const [estado, setEstado] = useState('ABIERTAS')
  const [q, setQ] = useState('')
  const { datos } = useConsulta('/taller/ordenes', { estado, q: q.trim() || undefined })
  const abiertas = datos?.filter((o) => ['ABIERTA', 'EN_PROCESO'].includes(o.estado)) ?? []
  return (
    <>
      {estado === 'ABIERTAS' && datos && <section className="grid gap-3 sm:grid-cols-3">
        <Cifra titulo="Órdenes abiertas" valor={abiertas.length} />
        <Cifra titulo="Unidades en taller" valor={new Set(abiertas.filter((o) => o.enTaller).map((o) => o.unidad)).size} detalle="no pueden salir a viaje" />
        <Cifra titulo="Abiertas hace más de 7 días" valor={abiertas.filter((o) => o.diasAbierta > 7).length} tono={abiertas.some((o) => o.diasAbierta > 7) ? 'malo' : null} />
      </section>}
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label>Estado<select value={estado} onChange={(e) => setEstado(e.target.value)} className="mt-1 block rounded-control border px-2 py-1.5"><option value="ABIERTAS">Abiertas y en proceso</option><option value="CERRADA">Cerradas</option><option value="ANULADA">Anuladas</option><option value="TODAS">Todas</option></select></label>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Número, unidad o trabajo" aria-label="Buscar orden" className="min-w-0 flex-1 rounded-control border px-3 py-2 sm:max-w-xs" />
      </div>
      <ul className="divide-y rounded-superficie border bg-white">
        {datos?.map((o) => {
          const [et, color] = ESTADO[o.estado]
          return (
            <li key={o.id}><button type="button" onClick={() => onAbrir(o.id)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left text-sm hover:bg-gray-50">
              <Wrench className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
              <span className="w-24 font-medium">{o.numero}</span>
              <span className="min-w-0 flex-1 basis-56"><span className="block truncate font-medium">{o.unidad} · {o.descripcion}</span><span className="block truncate text-xs text-gray-500">{TIPOS[o.tipo]}{o.plan ? ` · ${o.plan}` : ''} · {o.taller}{o.casos ? ` · ${o.casos} caso(s)` : ''}</span></span>
              <Etiqueta color={PRIORIDAD[o.prioridad].color}>{PRIORIDAD[o.prioridad].texto}</Etiqueta>
              <Etiqueta color={color}>{et}</Etiqueta>
              {o.enTaller && hay(o.diasAbierta) && <Etiqueta color="rojo">En taller</Etiqueta>}
              <span className="w-36 text-right text-xs text-gray-500">{hay(o.diasAbierta) ? `abierta hace ${o.diasAbierta} día(s)` : `cerrada ${fecha(o.fechaCierre)}`}<span className="cifra block text-sm font-medium text-gray-900">{Q(o.total)}</span></span>
            </button></li>
          )
        })}
        {datos && !datos.length && <li className="px-4 py-10 text-center text-sm text-gray-500">No hay órdenes en esta vista.</li>}
      </ul>
    </>
  )
}

function Mantenimiento({ puedeCrear, onNueva, onAbrir }) {
  const { datos: d } = useConsulta('/taller/mantenimiento')
  const [filtro, setFiltro] = useState('ALERTAS')
  if (!d) { return <p className="text-sm text-gray-500">Cargando…</p> }
  if (d.sinPlanes) { return <p className="rounded-superficie border bg-white px-4 py-10 text-center text-sm text-gray-500">No hay planes de mantenimiento. Créelos en Taller › Planes de mantenimiento (por ejemplo, cambio de aceite cada 15,000 km o 90 días).</p> }
  const filas = d.filas.filter((f) => (filtro === 'ALERTAS' ? ['VENCIDO', 'PROXIMO'].includes(f.estado) : filtro === 'TODOS' ? true : f.estado === filtro))
  return (
    <>
      <section className="grid gap-3 sm:grid-cols-4">
        {Object.entries(PLAN).map(([k, [t]]) => <button key={k} type="button" onClick={() => setFiltro(k)} className="text-left"><Cifra titulo={t} valor={d.resumen[k]} tono={k === 'VENCIDO' && d.resumen[k] ? 'malo' : null} detalle={k === 'SIN_HISTORIAL' ? 'registre su último servicio' : null} /></button>)}
      </section>
      <div className="flex flex-wrap items-center gap-2 text-sm"><Pestanas opciones={[['ALERTAS', 'Vencidos y próximos'], ['SIN_HISTORIAL', 'Sin historial'], ['TODOS', 'Todos']]} valor={['ALERTAS', 'SIN_HISTORIAL', 'TODOS'].includes(filtro) ? filtro : ''} onCambio={setFiltro} /><span className="text-xs text-gray-500">Km o días, lo que ocurra primero, desde el último servicio cerrado de ese plan.</span></div>
      <div className="overflow-x-auto rounded-superficie border bg-white">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="text-left text-xs text-gray-500"><tr><th className="px-4 py-2">Unidad</th><th className="py-2">Plan</th><th className="py-2">Último servicio</th><th className="py-2 text-right">Faltan</th><th className="py-2 pl-4">Estado</th><th className="px-4 py-2" /></tr></thead>
          <tbody className="divide-y">{filas.map((f) => {
            const [et, color] = PLAN[f.estado]
            const base = { cabezalId: f.tipo === 'CABEZAL' ? f.unidadId : undefined, remolqueId: f.tipo === 'REMOLQUE' ? f.unidadId : undefined, planId: f.planId, tipo: /mayor/i.test(f.plan) ? 'SERVICIO_MAYOR' : 'PREVENTIVO', descripcion: f.plan }
            return (
              <tr key={`${f.planId}-${f.tipo}-${f.unidadId}`}>
                <td className="px-4 py-2"><span className="font-medium">{f.unidad}</span> <span className="text-gray-500">{f.placa}</span>{hay(f.odometro) && <span className="block text-xs text-gray-500">{num(f.odometro)} km</span>}</td>
                <td className="py-2">{f.plan}<span className="block text-xs text-gray-500">{cada(f)}</span></td>
                <td className="py-2">{f.ultimo ? <>{fecha(f.ultimo.fecha)}<span className="block text-xs text-gray-500">{f.ultimo.numero}{hay(f.ultimo.odometro) ? ` · ${num(f.ultimo.odometro)} km` : ''}</span></> : <span className="text-gray-400">—</span>}</td>
                <td className={`cifra py-2 text-right ${f.estado === 'VENCIDO' ? 'font-semibold text-red-700' : ''}`}>{f.estado === 'SIN_HISTORIAL' ? '—' : faltan(f)}</td>
                <td className="py-2 pl-4"><Etiqueta color={color}>{et}</Etiqueta></td>
                <td className="px-4 py-2 text-right">
                  {f.ordenAbierta ? <Boton onClick={() => onAbrir(f.ordenAbierta.id)}>{f.ordenAbierta.numero}</Boton> : puedeCrear && (f.estado === 'SIN_HISTORIAL'
                    ? <Boton onClick={() => onNueva({ ...base, yaRealizado: true })}>Registrar último</Boton>
                    : <Boton onClick={() => onNueva(base)}>Abrir orden</Boton>)}
                </td>
              </tr>
            )
          })}{!filas.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">{filtro === 'ALERTAS' ? 'Nada vencido ni próximo.' : 'Sin unidades en esta vista.'}</td></tr>}</tbody>
        </table>
      </div>
    </>
  )
}

function Marcas() {
  const { datos } = useConsulta('/taller/repuestos-por-marca')
  if (!datos) { return <p className="text-sm text-gray-500">Cargando…</p> }
  const mejor = {}
  for (const x of datos) { if (hay(x.costoKm) && (!mejor[x.repuestoId] || Number(x.costoKm) < Number(mejor[x.repuestoId]))) { mejor[x.repuestoId] = x.costoKm } }
  return (
    <section className="rounded-superficie border bg-white">
      <p className="border-b px-4 py-3 text-sm text-gray-600">Cuántos km dura cada marca entre un cambio y el siguiente en el mismo cabezal, y cuánto cuesta por km. Necesita órdenes cerradas con el odómetro y la marca del repuesto.</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-sm">
          <thead className="text-left text-xs text-gray-500"><tr><th className="px-4 py-2">Repuesto</th><th className="py-2">Marca</th><th className="py-2 text-right">Veces</th><th className="py-2 text-right">Costo promedio</th><th className="py-2 text-right">Dura (km)</th><th className="px-4 py-2 text-right">Costo por km</th></tr></thead>
          <tbody className="divide-y">{datos.map((x) => (
            <tr key={`${x.repuestoId}-${x.marca}`} className={hay(x.costoKm) && x.costoKm === mejor[x.repuestoId] ? 'bg-green-50' : ''}>
              <td className="px-4 py-2">{x.repuesto}<span className="block text-xs text-gray-500">{x.categoria?.toLowerCase() ?? ''}</span></td>
              <td className="py-2 font-medium">{x.marca}{hay(x.costoKm) && x.costoKm === mejor[x.repuestoId] && <span className="ml-2"><Etiqueta color="verde">Mejor costo/km</Etiqueta></span>}</td>
              <td className="cifra py-2 text-right">{x.veces}</td>
              <td className="cifra py-2 text-right">{Q(x.costoPromedio)}</td>
              <td className="cifra py-2 text-right">{hay(x.kmPromedio) ? num(x.kmPromedio) : '—'}<span className="block text-xs text-gray-500">{x.medidas ? `${x.medidas} medición(es)` : 'falta un segundo cambio'}</span></td>
              <td className="cifra px-4 py-2 text-right">{hay(x.costoKm) ? `Q${num(x.costoKm, 4)}` : '—'}</td>
            </tr>
          ))}{!datos.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">Todavía no hay repuestos en órdenes cerradas.</td></tr>}</tbody>
        </table>
      </div>
    </section>
  )
}

function NuevaOrden({ inicial, onCerrar, onListo }) {
  const { cabezales, remolques } = useCatalogos()
  const planes = useEstadoOpciones('/mantenimiento/planes').opciones.filter((p) => p.activo !== false)
  const talleres = useEstadoOpciones('/terceros/talleres').opciones.filter((t) => t.activo !== false)
  const [f, setF] = useState({
    unidad: inicial.cabezalId ? `C:${inicial.cabezalId}` : inicial.remolqueId ? `R:${inicial.remolqueId}` : '', tipo: inicial.tipo ?? 'CORRECTIVO', prioridad: 'MODERADA',
    planId: inicial.planId ? String(inicial.planId) : '', tallerId: '', descripcion: inicial.descripcion ?? '', odometro: '', ponerEnTaller: false,
    yaRealizado: Boolean(inicial.yaRealizado), fecha: hoy(), manoObra: '', documento: '',
  })
  const [enviando, setEnviando] = useState(false)
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const [tipoU, idU] = f.unidad.split(':')
  const planesU = planes.filter((p) => !tipoU || p.aplicaA === 'AMBOS' || p.aplicaA === (tipoU === 'C' ? 'CABEZAL' : 'REMOLQUE'))
  const listo = f.unidad && f.descripcion.trim().length >= 5 && (!f.yaRealizado || f.fecha)
  const ir = async () => {
    setEnviando(true)
    const r = await enviar('post', '/taller/ordenes', {
      cabezalId: tipoU === 'C' ? Number(idU) : null, remolqueId: tipoU === 'R' ? Number(idU) : null, tipo: f.tipo, prioridad: f.prioridad, planId: f.planId || null, tallerId: f.tallerId || null,
      descripcion: f.descripcion, odometro: f.odometro || null, ponerEnTaller: f.ponerEnTaller, yaRealizado: f.yaRealizado, fecha: f.yaRealizado ? f.fecha : undefined,
      manoObra: f.manoObra || null, documento: f.documento || null,
    })
    setEnviando(false)
    if (r) { onListo(f.yaRealizado ? null : r.data?.id) }
  }
  return (
    <Modal abierto titulo={f.yaRealizado ? 'Registrar un servicio ya hecho' : 'Nueva orden de trabajo'} onCerrar={onCerrar} ancho="max-w-lg"
      pie={<><Boton onClick={onCerrar}>Cancelar</Boton><BotonPrimario disabled={enviando || !listo} onClick={ir}>{enviando ? 'Guardando…' : f.yaRealizado ? 'Registrar' : 'Abrir orden'}</BotonPrimario></>}>
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <Campo etiqueta="Unidad" id="unidad" requerido><select value={f.unidad} onChange={set('unidad')} className={ent}><option value="">Elija…</option><optgroup label="Cabezales">{cabezales.map((c) => <option key={c.id} value={`C:${c.id}`}>{c.codigo} · {c.placa}</option>)}</optgroup><optgroup label="Remolques">{remolques.map((r) => <option key={r.id} value={`R:${r.id}`}>{r.codigo} · {r.placa}</option>)}</optgroup></select></Campo>
        <Campo etiqueta="Tipo" id="tipo"><select value={f.tipo} onChange={set('tipo')} className={ent}>{Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
        <Campo etiqueta="Plan de mantenimiento" id="planId"><select value={f.planId} onChange={set('planId')} className={ent}><option value="">Ninguno</option>{planesU.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></Campo>
        <Campo etiqueta="Taller" id="tallerId"><select value={f.tallerId} onChange={set('tallerId')} className={ent}><option value="">Taller propio</option>{talleres.map((t) => <option key={t.id} value={t.id}>{nombreTercero(t)}</option>)}</select></Campo>
        <Campo etiqueta="Trabajo a realizar" id="descripcion" requerido className="sm:col-span-2"><textarea rows={2} value={f.descripcion} onChange={set('descripcion')} maxLength={1000} className={ent} /></Campo>
        {!f.yaRealizado && <Campo etiqueta="Prioridad" id="prioridad"><select value={f.prioridad} onChange={set('prioridad')} className={ent}>{Object.entries(PRIORIDAD).map(([k, v]) => <option key={k} value={k}>{v.texto}</option>)}</select></Campo>}
        <Campo etiqueta="Odómetro (km)" id="odometro"><input inputMode="numeric" value={f.odometro} onChange={set('odometro')} placeholder={tipoU === 'C' ? 'el actual del cabezal' : ''} className={`${ent} text-right`} /></Campo>
        {f.yaRealizado && <>
          <Campo etiqueta="Fecha en que se hizo" id="fecha" requerido><input type="date" max={hoy()} value={f.fecha} onChange={set('fecha')} className={ent} /></Campo>
          <Campo etiqueta="Costo total (Q)" id="manoObra"><input inputMode="decimal" value={f.manoObra} onChange={set('manoObra')} className={`${ent} text-right`} /></Campo>
          <Campo etiqueta="Factura del taller" id="documento"><input value={f.documento} onChange={set('documento')} maxLength={60} className={ent} /></Campo>
        </>}
        {!f.yaRealizado && <label className="flex items-center gap-2 sm:col-span-2"><input type="checkbox" checked={f.ponerEnTaller} onChange={set('ponerEnTaller')} className="accent-red-600" /> La unidad queda en taller (no puede salir a viaje hasta cerrar la orden)</label>}
        <label className="flex items-center gap-2 sm:col-span-2"><input type="checkbox" checked={f.yaRealizado} onChange={set('yaRealizado')} className="accent-green-600" /> Es un servicio que ya se hizo (para que las alertas cuenten desde ahí)</label>
      </div>
    </Modal>
  )
}

function Detalle({ id, onCerrar, onCambio }) {
  const { puede } = usePermisos()
  const { datos: o, recargar } = useConsulta(id ? `/taller/ordenes/${id}` : null)
  const repuestos = useEstadoOpciones(id ? '/mantenimiento/repuestos' : null).opciones.filter((r) => r.activo !== false)
  const marcas = useEstadoOpciones(id ? '/catalogos/marcas' : null).opciones
  const [linea, setLinea] = useState({ repuestoId: '', marcaId: '', cantidad: '1', costoUnitario: '' })
  const [cobro, setCobro] = useState(null)
  const [modo, setModo] = useState(null) // CERRADA | ANULADA
  const [comentario, setComentario] = useState('')
  const [odometro, setOdometro] = useState('')
  const [enviando, setEnviando] = useState(false)
  if (!id) { return null }
  const edita = puede('mantenimiento.editar') && o && ['ABIERTA', 'EN_PROCESO'].includes(o.estado)
  const hecho = (ok) => { if (ok) { recargar(); onCambio() } setEnviando(false); return ok }
  const rep = repuestos.find((r) => String(r.id) === String(linea.repuestoId))
  const agregar = async () => { setEnviando(true); if (hecho(await enviar('post', `/taller/ordenes/${o.id}/repuestos`, { repuestoId: Number(linea.repuestoId), marcaId: linea.marcaId || null, cantidad: Number(linea.cantidad), costoUnitario: linea.costoUnitario ? Number(linea.costoUnitario) : undefined }))) { setLinea({ repuestoId: '', marcaId: '', cantidad: '1', costoUnitario: '' }) } }
  const quitar = async (lid) => { setEnviando(true); hecho(await enviar('delete', `/taller/ordenes/${o.id}/repuestos/${lid}`)) }
  const guardarCobro = async () => { setEnviando(true); if (hecho(await enviar('put', `/taller/ordenes/${o.id}`, { manoObra: Number(cobro.manoObra || 0), documento: cobro.documento || null }))) { setCobro(null) } }
  const estado = async (nuevo) => { setEnviando(true); if (hecho(await enviar('put', `/taller/ordenes/${o.id}/estado`, { estado: nuevo, comentario: comentario || null, odometro: odometro || null }))) { setModo(null); setComentario('') } }
  const [et, color] = o ? ESTADO[o.estado] : []
  return (
    <Hoja abierta titulo={o ? `${o.numero} · ${o.cabezal?.codigo ?? o.remolque?.codigo}` : 'Orden de trabajo'} onCerrar={() => { setModo(null); setCobro(null); onCerrar() }}
      pie={edita && !modo && (
        <div className="flex w-full flex-wrap justify-end gap-2">
          {puede('mantenimiento.anular') && <Boton peligro onClick={() => setModo('ANULADA')}>Anular</Boton>}
          {o.estado === 'ABIERTA' && <Boton disabled={enviando} onClick={() => estado('EN_PROCESO')}>En proceso</Boton>}
          {puede('mantenimiento.cerrar') && <BotonPrimario onClick={() => { setOdometro(o.odometro ?? ''); setModo('CERRADA') }}>Cerrar orden</BotonPrimario>}
        </div>
      )}>
      {!o ? <p className="text-sm text-gray-500">Cargando…</p> : (
        <div className="space-y-4 text-sm">
          <section className="rounded-tarjeta bg-white p-4">
            <div className="flex flex-wrap gap-2"><Etiqueta color={color}>{et}</Etiqueta><Etiqueta>{TIPOS[o.tipo]}</Etiqueta><Etiqueta color={PRIORIDAD[o.prioridad].color}>{PRIORIDAD[o.prioridad].texto}</Etiqueta>{(o.cabezal?.estado ?? o.remolque?.estado) === 'EN_TALLER' && <Etiqueta color="rojo">Unidad en taller</Etiqueta>}</div>
            <p className="mt-2 font-medium">{o.descripcion}</p>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1">
              <dt className="text-gray-500">Unidad</dt><dd>{o.cabezal ? `${o.cabezal.codigo} · ${o.cabezal.placa}` : o.remolque?.codigo}</dd>
              {o.plan && <><dt className="text-gray-500">Plan</dt><dd>{o.plan.nombre}</dd></>}
              <dt className="text-gray-500">Taller</dt><dd>{o.taller?.nombre ?? 'Taller propio'}</dd>
              <dt className="text-gray-500">Odómetro</dt><dd>{hay(o.odometro) ? `${num(o.odometro)} km` : '—'}</dd>
              <dt className="text-gray-500">Abierta</dt><dd>{fechaHora(o.fechaApertura)} · {o.creadoPor}</dd>
              {o.fechaCierre && <><dt className="text-gray-500">{o.estado === 'ANULADA' ? 'Anulada' : 'Cerrada'}</dt><dd>{fechaHora(o.fechaCierre)}</dd></>}
            </dl>
            {o.observaciones && <p className="mt-2 rounded-control bg-green-50 px-3 py-2 text-green-900">{o.observaciones}</p>}
            {o.motivoAnulacion && <p className="mt-2 rounded-control bg-gray-100 px-3 py-2">Anulada: {o.motivoAnulacion}</p>}
          </section>

          {modo && (
            <section className={`space-y-2 rounded-tarjeta border-2 bg-white p-4 ${modo === 'CERRADA' ? 'border-green-600' : 'border-red-300'}`}>
              <h3 className="font-semibold">{modo === 'CERRADA' ? 'Cerrar la orden' : 'Anular la orden'}</h3>
              <textarea rows={2} value={comentario} onChange={(e) => setComentario(e.target.value)} maxLength={1000} placeholder={modo === 'CERRADA' ? 'Qué se hizo' : 'Por qué se anula (sus casos siguen abiertos)'} aria-label="Comentario" className={ent} />
              {modo === 'CERRADA' && o.cabezal && <Campo etiqueta="Odómetro al cerrar (km)" id="odoCierre"><input inputMode="numeric" value={odometro} onChange={(e) => setOdometro(e.target.value)} className={`${ent} text-right`} /></Campo>}
              {modo === 'CERRADA' && o.casos.some((c) => ['ABIERTO', 'EN_PROCESO'].includes(c.estado)) && <p className="text-xs text-gray-600">Se resolverán {o.casos.filter((c) => ['ABIERTO', 'EN_PROCESO'].includes(c.estado)).length} caso(s) ligados a esta orden.</p>}
              <div className="flex justify-end gap-2"><Boton onClick={() => setModo(null)}>Cancelar</Boton>{modo === 'CERRADA' ? <BotonPrimario disabled={enviando || comentario.trim().length < 5} onClick={() => estado('CERRADA')}>Cerrar por {Q(o.total)}</BotonPrimario> : <Boton peligro disabled={enviando || comentario.trim().length < 5} onClick={() => estado('ANULADA')}>Anular</Boton>}</div>
            </section>
          )}

          <section className="rounded-tarjeta bg-white p-4">
            <h3 className="mb-2 font-semibold">Repuestos</h3>
            <ul className="divide-y">{o.repuestos.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-1.5"><span className="min-w-0 flex-1"><span className="block">{r.nombre}{r.marca ? ` · ${r.marca}` : ''}</span><span className="block text-xs text-gray-500">{num(r.cantidad, Number(r.cantidad) % 1 ? 2 : 0)} {r.unidad?.toLowerCase()} × {Q(r.costoUnitario)}</span></span><span className="cifra">{Q(r.total)}</span>{edita && <button type="button" onClick={() => quitar(r.id)} disabled={enviando} aria-label={`Quitar ${r.nombre}`} className="rounded p-1 text-red-700 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>}</li>
            ))}{!o.repuestos.length && <li className="py-1.5 text-gray-500">Sin repuestos.</li>}</ul>
            {edita && <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-[2fr_1.3fr_0.7fr_1fr_auto]">
              <select value={linea.repuestoId} onChange={(e) => setLinea((l) => ({ ...l, repuestoId: e.target.value }))} aria-label="Repuesto" className={`${ent} col-span-2 sm:col-span-1`}><option value="">Repuesto…</option>{repuestos.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}</select>
              <select value={linea.marcaId} onChange={(e) => setLinea((l) => ({ ...l, marcaId: e.target.value }))} aria-label="Marca" className={ent}><option value="">{rep?.marca?.nombre ? `Marca: ${rep.marca.nombre}` : 'Marca…'}</option>{marcas.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}</select>
              <input inputMode="decimal" value={linea.cantidad} onChange={(e) => setLinea((l) => ({ ...l, cantidad: e.target.value }))} aria-label="Cantidad" className={`${ent} text-right`} />
              <input inputMode="decimal" value={linea.costoUnitario} onChange={(e) => setLinea((l) => ({ ...l, costoUnitario: e.target.value }))} placeholder={rep?.precioReferencia ? `Q${rep.precioReferencia}` : 'Costo unit.'} aria-label="Costo unitario" className={`${ent} text-right`} />
              <BotonPrimario disabled={enviando || !linea.repuestoId || !(Number(linea.cantidad) > 0)} onClick={agregar} className="col-span-2 justify-center sm:col-span-1"><Plus className="h-4 w-4" aria-hidden /> Agregar</BotonPrimario>
            </div>}
          </section>

          <section className="rounded-tarjeta bg-white p-4">
            <div className="flex items-baseline justify-between"><h3 className="font-semibold">Costo</h3>{edita && !cobro && <button type="button" onClick={() => setCobro({ manoObra: o.manoObra, documento: o.documento ?? '' })} className="text-xs text-green-700 underline">Editar</button>}</div>
            {cobro ? <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <Campo etiqueta="Mano de obra (Q)" id="manoObraEd"><input inputMode="decimal" value={cobro.manoObra} onChange={(e) => setCobro((c) => ({ ...c, manoObra: e.target.value }))} className={`${ent} text-right`} /></Campo>
              <Campo etiqueta="Factura del taller" id="documentoEd"><input value={cobro.documento} onChange={(e) => setCobro((c) => ({ ...c, documento: e.target.value }))} maxLength={60} className={ent} /></Campo>
              <div className="flex justify-end gap-2 sm:col-span-2"><Boton onClick={() => setCobro(null)}>Cancelar</Boton><BotonPrimario disabled={enviando} onClick={guardarCobro}>Guardar</BotonPrimario></div>
            </div> : <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
              <dt className="text-gray-500">Mano de obra</dt><dd className="cifra text-right">{Q(o.manoObra)}</dd>
              <dt className="text-gray-500">Repuestos</dt><dd className="cifra text-right">{Q(o.totalRepuestos)}</dd>
              <dt className="font-medium">Total</dt><dd className="cifra text-right font-semibold">{Q(o.total)}</dd>
              {o.documento && <><dt className="text-gray-500">Factura</dt><dd className="text-right">{o.documento}</dd></>}
            </dl>}
          </section>

          {o.casos.length > 0 && <section className="rounded-tarjeta bg-white p-4">
            <h3 className="mb-2 font-semibold">Casos que atiende</h3>
            <ul className="divide-y">{o.casos.map((c) => <li key={c.id} className="flex items-center gap-2 py-1.5"><span className="w-24 font-medium">{c.numero}</span><span className="min-w-0 flex-1 truncate">{c.titulo}</span><Etiqueta color={PRIORIDAD[c.prioridad].color}>{PRIORIDAD[c.prioridad].texto}</Etiqueta><Etiqueta color={c.estado === 'RESUELTO' ? 'verde' : 'azul'}>{c.estado.toLowerCase().replace('_', ' ')}</Etiqueta></li>)}</ul>
          </section>}
        </div>
      )}
    </Hoja>
  )
}
