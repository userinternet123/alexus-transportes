// ─────────────────────────────────────────────────────────────────────────────
// TABLERO DE GERENCIA: indicadores de la flota (ingreso y costo por km, utilización, km vacíos, entregas a tiempo),
// costo total y rentabilidad de cada cabezal, scorecard de los pilotos y presupuesto de mantenimiento contra lo gastado.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Q } from '../comun/formato'
import { BarrasHorizontales, ColumnasComparadas } from '../comun/Graficas'
import { usePermisos } from '../../hooks/usePermisos'
import { BotonPrimario, Cifra, Etiqueta, Pestanas } from '../operacion/comun'
import { ent, enviar, hay, hoy, num, useConsulta } from '../operacion/util'

const TODAS = [['TABLERO', 'Tablero', 'reportes.tablero'], ['UNIDADES', 'Costo por cabezal', 'reportes.tablero', 'finanzas.costos'], ['PILOTOS', 'Scorecard de pilotos', 'reportes.tablero'], ['PRESUPUESTO', 'Presupuesto de mantenimiento', 'mantenimiento.ver']]
const NIVEL = { EXCELENTE: ['Excelente', 'verde'], BUENO: ['Bueno', 'azul'], REGULAR: ['Regular', 'ambar'], BAJO: ['Bajo', 'rojo'], SIN_DATOS: ['Sin datos', 'gris'] }
const PRESUP = { BIEN: ['En presupuesto', 'verde'], CERCA: ['Cerca del límite', 'ambar'], EXCEDIDO: ['Excedido', 'rojo'], SIN_PRESUPUESTO: ['Sin presupuesto', 'gris'] }
const pct = (v, d = 0) => (hay(v) ? `${num(v, d)} %` : '—')
const porKm = (v) => (hay(v) ? `Q${num(v, 2)}` : '—')
const MES = (m) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString('es-GT', { month: 'short', year: '2-digit', timeZone: 'UTC' })
const inicioMes = () => `${hoy().slice(0, 8)}01`

export default function Tablero() {
  const { puede } = usePermisos()
  const vistas = TODAS.filter(([, , ...permisos]) => permisos.every(puede)).map(([k, t]) => [k, t])
  const [params, setParams] = useSearchParams()
  const vista = vistas.some(([k]) => k === params.get('vista')) ? params.get('vista') : vistas[0]?.[0]
  const setVista = (v) => setParams((p) => { p.set('vista', v); return p }, { replace: true })
  const [desde, setDesde] = useState(inicioMes())
  const [hasta, setHasta] = useState(hoy())
  if (!vista) {return <p className="p-6 text-sm text-gray-500">No tiene acceso al tablero de gerencia.</p>}
  const periodo = vista !== 'PRESUPUESTO'
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <Pestanas opciones={vistas} valor={vista} onCambio={setVista} />
        {periodo && <div className="flex flex-wrap items-end gap-3 sm:ml-auto">
          <label>Desde<input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} className="mt-1 block rounded-control border px-2 py-1.5" /></label>
          <label>Hasta<input type="date" value={hasta} max={hoy()} onChange={(e) => setHasta(e.target.value)} className="mt-1 block rounded-control border px-2 py-1.5" /></label>
        </div>}
      </div>
      {vista === 'TABLERO' && <Indicadores desde={desde} hasta={hasta} costos={puede('finanzas.costos')} />}
      {vista === 'UNIDADES' && <Unidades desde={desde} hasta={hasta} />}
      {vista === 'PILOTOS' && <Pilotos desde={desde} hasta={hasta} />}
      {vista === 'PRESUPUESTO' && <Presupuesto editar={puede('mantenimiento.presupuesto')} />}
    </div>
  )
}

function Avisos({ lista }) {
  if (!lista?.length) {return null}
  return <ul className="space-y-1 rounded-control bg-amber-50 px-3 py-2 text-sm text-amber-900">{lista.map((a) => <li key={a}>{a}</li>)}</ul>
}

// ─────────────────────────────── Tablero ───────────────────────────────

function Indicadores({ desde, hasta, costos }) {
  const { datos: d, cargando } = useConsulta('/gerencia/tablero', { desde, hasta })
  if (!d) {return <p className="text-sm text-gray-500">{cargando ? 'Calculando…' : 'Sin datos'}</p>}
  const k = d.kpis
  return (
    <>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Cifra titulo="Ingresos" valor={Q(k.ingresos)} detalle={`${k.viajes} viaje(s) · ${num(k.km)} km · ingreso ${porKm(k.ingresoKm)}/km`} />
        {costos && <Cifra titulo="Costo total" valor={Q(k.costoTotal)} detalle={`${porKm(k.costoKm)} por km recorrido`} />}
        {costos && <Cifra titulo="Utilidad" valor={Q(k.utilidad)} tono={Number(k.utilidad) < 0 ? 'malo' : 'bueno'} detalle={`margen ${pct(k.margen, 1)}`} />}
        <Cifra titulo="Utilización de la flota" valor={pct(k.utilizacion)} tono={hay(k.utilizacion) && k.utilizacion < 50 ? 'malo' : null} detalle="días con viaje ÷ días disponibles" />
        <Cifra titulo="Entregas a tiempo" valor={pct(k.aTiempoPct)} tono={hay(k.aTiempoPct) && k.aTiempoPct < 90 ? 'malo' : null} detalle={`${k.conCompromiso} viaje(s) con fecha comprometida`} />
        <Cifra titulo="Km vacíos" valor={pct(k.kmVaciosPct, 1)} tono={hay(k.kmVaciosPct) && k.kmVaciosPct > 25 ? 'malo' : null} detalle="recorridos sin carga (busque carga de regreso)" />
        <Cifra titulo="Disponibilidad" valor={pct(k.disponibilidad)} detalle={`${k.cabezales} cabezal(es) · ${k.enTaller} en taller · ${k.enRuta} en ruta`} />
        <Cifra titulo="Por cobrar" valor={Q(k.porCobrar)} tono={Number(k.vencido) > 0 ? 'malo' : null} detalle={Number(k.vencido) > 0 ? `${Q(k.vencido)} vencido` : 'nada vencido'} />
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-superficie border bg-white p-4">
          <h2 className="mb-3 font-semibold">Últimos 6 meses</h2>
          <ColumnasComparadas categorias={d.tendencia.map((t) => MES(t.mes))} formato={Q}
            series={[{ nombre: 'Ingresos', valores: d.tendencia.map((t) => Number(t.ingresos)) }, ...(costos ? [{ nombre: 'Costo', valores: d.tendencia.map((t) => Number(t.costo ?? 0)) }] : [])]} />
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-gray-500"><tr><th className="py-1">Mes</th><th className="py-1 text-right">Viajes</th><th className="py-1 text-right">Km</th>{costos && <><th className="py-1 text-right">Costo/km</th><th className="py-1 text-right">Utilidad</th></>}</tr></thead>
              <tbody className="divide-y">{d.tendencia.map((t) => <tr key={t.mes}><td className="py-1.5">{MES(t.mes)}</td><td className="cifra py-1.5 text-right">{t.viajes}</td><td className="cifra py-1.5 text-right">{num(t.km)}</td>{costos && <><td className="cifra py-1.5 text-right">{porKm(t.costoKm)}</td><td className={`cifra py-1.5 text-right ${Number(t.utilidad) < 0 ? 'text-red-700' : ''}`}>{Q(t.utilidad)}</td></>}</tr>)}</tbody>
            </table>
          </div>
        </div>
        <div className="space-y-4">
          {costos && <div className="rounded-superficie border bg-white p-4">
            <h2 className="mb-3 font-semibold">En qué se va el dinero</h2>
            <BarrasHorizontales datos={[...d.partidas].sort((a, b) => Number(b.monto) - Number(a.monto)).map((p) => ({ etiqueta: p.nombre, valor: Number(p.monto), detalle: Number(k.costoTotal) ? `${num((Number(p.monto) / Number(k.costoTotal)) * 100, 1)} % del costo` : null }))} formato={Q} color="bg-amber-500" vacio="Sin costos en el período" />
          </div>}
          {costos && <div className="rounded-superficie border bg-white p-4">
            <h2 className="mb-3 font-semibold">Utilidad por cabezal</h2>
            <BarrasHorizontales datos={d.ranking.map((r) => ({ etiqueta: r.cabezal, valor: Number(r.utilidad), detalle: `${num(r.km)} km · costo ${porKm(r.costoKm)}/km · utilización ${pct(r.utilizacion)}` }))} formato={Q} />
          </div>}
          {Number(k.multasPendientes) > 0 && <p className="rounded-control bg-red-50 px-3 py-2 text-sm text-red-800">{k.multasPendientes} multa(s) sin pagar por {Q(k.montoMultas)}.</p>}
        </div>
      </section>
      <Avisos lista={d.avisos} />
    </>
  )
}

// ─────────────────────────────── Costo por cabezal ───────────────────────────────

function Unidades({ desde, hasta }) {
  const { datos: d, cargando } = useConsulta('/gerencia/unidades', { desde, hasta })
  const [abierto, setAbierto] = useState(null)
  if (!d) {return <p className="text-sm text-gray-500">{cargando ? 'Calculando…' : 'Sin datos'}</p>}
  const f = d.flota
  return (
    <>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Cifra titulo="Costo total de la flota" valor={Q(f.costoTotal)} detalle={`${d.dias} día(s) · ${num(f.km)} km`} />
        <Cifra titulo="Costo por km" valor={porKm(f.costoKm)} detalle={`ingreso ${porKm(f.ingresoKm)} por km`} tono={hay(f.costoKm) && hay(f.ingresoKm) && Number(f.costoKm) > Number(f.ingresoKm) ? 'malo' : null} />
        <Cifra titulo="Utilidad" valor={Q(f.utilidad)} tono={Number(f.utilidad) < 0 ? 'malo' : 'bueno'} detalle={`margen ${pct(f.margen, 1)}`} />
        <Cifra titulo="Utilización" valor={pct(f.utilizacion)} detalle={`km vacíos ${pct(f.kmVaciosPct, 1)}`} />
      </section>
      <section className="rounded-superficie border bg-white p-4">
        <h2 className="font-semibold">Costo total y rentabilidad por cabezal</h2>
        <p className="mb-3 text-xs text-gray-500">Todo lo que cuesta cada unidad: combustible, viaje, piloto, taller, llantas, incidentes, depreciación, seguros y su parte de los gastos generales. Toque un cabezal para ver el desglose.</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs text-gray-500"><tr><th className="py-1">Cabezal</th><th className="py-1 text-right">Viajes</th><th className="py-1 text-right">Km</th><th className="py-1 text-right">Ingresos</th><th className="py-1 text-right">Costo total</th><th className="py-1 text-right">Costo/km</th><th className="py-1 text-right">Utilidad</th><th className="py-1 text-right">Margen</th><th className="py-1 text-right">Utilización</th></tr></thead>
            <tbody className="divide-y">{d.unidades.map((u) => <FilaUnidad key={u.cabezal.id} u={u} partidas={d.partidas} abierto={abierto === u.cabezal.id} onAbrir={() => setAbierto(abierto === u.cabezal.id ? null : u.cabezal.id)} />)}</tbody>
          </table>
        </div>
      </section>
      <Avisos lista={d.avisos} />
    </>
  )
}

function FilaUnidad({ u, partidas, abierto, onAbrir }) {
  const total = Number(u.costoTotal)
  return (
    <>
      <tr className="cursor-pointer hover:bg-gray-50" onClick={onAbrir}>
        <td className="py-1.5"><span className="font-medium">{u.cabezal.codigo}</span> <span className="text-xs text-gray-500">{u.cabezal.placa}</span></td>
        <td className="cifra py-1.5 text-right">{u.viajes}</td>
        <td className="cifra py-1.5 text-right">{num(u.km)}</td>
        <td className="cifra py-1.5 text-right">{Q(u.ingresos)}</td>
        <td className="cifra py-1.5 text-right">{Q(u.costoTotal)}</td>
        <td className="cifra py-1.5 text-right">{porKm(u.costoKm)}</td>
        <td className={`cifra py-1.5 text-right font-medium ${Number(u.utilidad) < 0 ? 'text-red-700' : 'text-green-700'}`}>{Q(u.utilidad)}</td>
        <td className="cifra py-1.5 text-right">{pct(u.margen, 1)}</td>
        <td className="cifra py-1.5 text-right">{pct(u.utilizacion)}</td>
      </tr>
      {abierto && <tr><td colSpan={9} className="bg-gray-50 px-3 py-3">
        <BarrasHorizontales datos={partidas.filter((p) => Number(u.partidas[p.clave]) > 0).sort((a, b) => Number(u.partidas[b.clave]) - Number(u.partidas[a.clave])).map((p) => ({ etiqueta: p.nombre, valor: Number(u.partidas[p.clave]), detalle: total ? `${num((Number(u.partidas[p.clave]) / total) * 100, 1)} %${Number(u.km) ? ` · Q${num(Number(u.partidas[p.clave]) / Number(u.km), 2)}/km` : ''}` : null }))} formato={Q} color="bg-amber-500" vacio="Sin costos en el período" />
      </td></tr>}
    </>
  )
}

// ─────────────────────────────── Scorecard de pilotos ───────────────────────────────

function Pilotos({ desde, hasta }) {
  const { datos: d, cargando } = useConsulta('/gerencia/pilotos', { desde, hasta })
  if (!d) {return <p className="text-sm text-gray-500">{cargando ? 'Calculando…' : 'Sin datos'}</p>}
  const w = d.pesos
  return (
    <section className="rounded-superficie border bg-white p-4">
      <h2 className="font-semibold">Scorecard de pilotos</h2>
      <p className="mb-3 text-xs text-gray-500">Puntaje de 0 a 100: puntualidad {w.puntualidad} %, rendimiento de combustible contra lo esperado del cabezal {w.rendimiento} %, seguridad (accidentes, multas e incidentes de los que fue responsable) {w.seguridad} % e inspecciones pre viaje {w.inspecciones} %. Si falta un dato, su peso se reparte entre los demás.</p>
      <ul className="grid gap-3 md:grid-cols-2">
        {d.pilotos.map((p) => {
          const [t, c] = NIVEL[p.nivel]
          return (
            <li key={p.piloto.id} className="rounded-control border p-3">
              <div className="flex items-start gap-3">
                <span className={`cifra flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-semibold ${!hay(p.puntaje) ? 'bg-gray-100 text-gray-500' : p.puntaje >= 70 ? 'bg-green-100 text-green-800' : p.puntaje >= 50 ? 'bg-amber-100 text-amber-900' : 'bg-red-100 text-red-800'}`}>{p.puntaje ?? '—'}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{p.piloto.nombre}</p>
                  <p className="text-xs text-gray-500">{p.viajes} viaje(s) · {num(p.km)} km{hay(p.ganancia) ? ` · ganancia ${Q(p.ganancia)}` : ''}</p>
                  <div className="mt-1 flex flex-wrap gap-1"><Etiqueta color={c}>{t}</Etiqueta>{p.diasLicencia < 30 && <Etiqueta color={p.diasLicencia < 0 ? 'rojo' : 'ambar'}>{p.diasLicencia < 0 ? 'Licencia vencida' : `Licencia vence en ${p.diasLicencia} días`}</Etiqueta>}</div>
                </div>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <Dato n="Puntualidad" v={pct(p.puntualidad)} d={p.conCompromiso ? `${p.aTiempo} de ${p.conCompromiso} a tiempo` : 'sin fecha comprometida'} />
                <Dato n="Rendimiento" v={pct(p.rendimientoPct)} d={hay(p.rendimientoReal) ? `${num(p.rendimientoReal, 2)} de ${num(p.rendimientoEsperado, 2)} km/gal` : 'sin cargas medidas'} />
                <Dato n="Seguridad" v={pct(p.seguridad)} d={`${p.accidentes} accidente(s) · ${p.multas} multa(s)${p.otrosIncidentes ? ` · ${p.otrosIncidentes} otro(s)` : ''}`} />
                <Dato n="Inspecciones" v={pct(p.inspecciones)} d={`${p.inspeccionesHechas} en ${p.viajes} viaje(s)`} />
              </dl>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

const Dato = ({ n, v, d }) => <div><dt className="text-xs text-gray-500">{n}</dt><dd><span className="cifra font-medium">{v}</span> <span className="text-xs text-gray-500">{d}</span></dd></div>

// ─────────────────────────────── Presupuesto ───────────────────────────────

function Presupuesto({ editar }) {
  const [mes, setMes] = useState(hoy().slice(0, 7))
  const [anio, m] = mes.split('-')
  const { datos: d, recargar } = useConsulta('/gerencia/presupuesto', { anio, mes: Number(m) })
  const [edicion, setEdicion] = useState(null) // { cabezalId, monto, notas, todoElAnio }
  const guardar = async () => {
    const r = await enviar('put', '/gerencia/presupuesto', { anio: Number(anio), mes: Number(m), cabezalId: edicion.cabezalId, monto: Number(edicion.monto || 0), notas: edicion.notas || null, todoElAnio: edicion.todoElAnio })
    if (r) { setEdicion(null); recargar() }
  }
  const filas = d ? [d.flota, ...d.cabezales] : []
  return (
    <section className="rounded-superficie border bg-white p-4">
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1"><h2 className="font-semibold">Presupuesto de mantenimiento</h2><p className="text-xs text-gray-500">Órdenes de taller cerradas, llantas compradas y reencauches del mes contra lo presupuestado. Avisa en la campana al llegar al 90 %.</p></div>
        <label className="text-sm">Mes<input type="month" value={mes} onChange={(e) => e.target.value && setMes(e.target.value)} className="mt-1 block rounded-control border px-2 py-1.5" /></label>
      </div>
      {d && <p className="mb-3 text-xs text-gray-500">Ha transcurrido el {d.avanceMes} % del mes.</p>}
      <ul className="divide-y">
        {filas.map((x) => {
          const [t, c] = PRESUP[x.estado]
          const id = x.cabezal?.id ?? null
          const usado = Math.min(100, x.usado ?? 0)
          return (
            <li key={id ?? 'flota'} className="py-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="min-w-0 flex-1 font-medium">{x.cabezal ? `${x.cabezal.codigo} · ${x.cabezal.placa}` : 'Toda la flota'}</p>
                <Etiqueta color={c}>{t}{hay(x.usado) ? ` · ${x.usado} %` : ''}</Etiqueta>
                {editar && <button type="button" className="text-sm text-green-700 hover:underline" onClick={() => setEdicion({ cabezalId: id, monto: Number(x.presupuesto) > 0 ? x.presupuesto : x.sugerido ?? '', notas: x.notas ?? '', todoElAnio: false })}>{Number(x.presupuesto) > 0 ? 'Cambiar' : 'Definir'}</button>}
              </div>
              <p className="cifra mt-1 text-sm">Gastado {Q(x.gastado.total)} <span className="text-xs text-gray-500">(taller {Q(x.gastado.taller)} · llantas {Q(x.gastado.llantas)})</span>{hay(x.presupuesto) && <> de {Q(x.presupuesto)} · {Number(x.disponible) < 0 ? <span className="text-red-700">pasado por {Q(-Number(x.disponible))}</span> : `quedan ${Q(x.disponible)}`}</>}</p>
              {hay(x.presupuesto) && <div className="mt-1 h-2 rounded bg-gray-100" aria-hidden><div className={`h-2 rounded ${x.estado === 'EXCEDIDO' ? 'bg-red-500' : x.estado === 'CERCA' ? 'bg-amber-500' : 'bg-green-600'}`} style={{ width: `${usado}%` }} /></div>}
              <p className="mt-1 text-xs text-gray-500">{hay(x.sugerido) ? `Sugerido ${Q(x.sugerido)} (promedio de los meses con gasto)` : 'Sin historial de gasto'}{x.notas ? ` · ${x.notas}` : ''}</p>
              {edicion && edicion.cabezalId === id && <div className="mt-2 grid gap-2 rounded-control bg-gray-50 p-3 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
                <label className="text-sm">Monto (Q)<input type="number" min="0" step="100" value={edicion.monto} onChange={(e) => setEdicion({ ...edicion, monto: e.target.value })} className={ent} /></label>
                <label className="text-sm">Notas<input value={edicion.notas} maxLength={300} onChange={(e) => setEdicion({ ...edicion, notas: e.target.value })} className={ent} /></label>
                <div className="flex items-center gap-2"><BotonPrimario onClick={guardar}>Guardar</BotonPrimario><button type="button" className="px-2 py-2 text-sm text-gray-600" onClick={() => setEdicion(null)}>Cancelar</button></div>
                <label className="flex items-center gap-2 text-sm sm:col-span-3"><input type="checkbox" checked={edicion.todoElAnio} onChange={(e) => setEdicion({ ...edicion, todoElAnio: e.target.checked })} /> Usar el mismo monto en los meses que faltan del año</label>
              </div>}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
