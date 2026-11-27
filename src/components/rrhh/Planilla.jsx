// ─────────────────────────────────────────────────────────────────────────────
// SUELDOS Y HORAS EXTRA: registro de horas del día (los pilotos en ruta no marcan entrada y salida),
// y planilla del mes o la quincena con salario, horas extra, pago por viajes, bonificación, IGSS y
// descuentos por incidentes (multas o daños de los que el piloto fue responsable).
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { usePermisos } from '../../hooks/usePermisos'
import { useEstadoOpciones } from '../../hooks/useOpcionesRemotas'
import { Q } from '../comun/formato'
import Campo from '../comun/Campo'
import { Boton, BotonPrimario, Cifra, Etiqueta, Pestanas } from '../operacion/comun'
import { ent, enviar, fecha, haceDias, hoy, num, useConsulta } from '../operacion/util'

const VISTAS = [['HORAS', 'Horas extra'], ['PLANILLAS', 'Planillas']]
const ESTADO = { BORRADOR: ['Borrador', 'azul'], APROBADA: ['Aprobada', 'verde'], PAGADA: ['Pagada', 'verde'], ANULADA: ['Anulada', 'gris'] }
const nombre = (e) => (e ? `${e.nombres} ${e.apellidos}` : '—')

export default function Planilla() {
  const { puede } = usePermisos()
  const [params, setParams] = useSearchParams()
  const opciones = VISTAS.filter(([k]) => (k === 'HORAS' ? puede('rrhh.asistencia') : puede('rrhh.planilla.ver')))
  const vista = opciones.some(([k]) => k === params.get('vista')) ? params.get('vista') : opciones[0]?.[0]
  const setVista = (v) => setParams((p) => { p.set('vista', v); return p }, { replace: true })
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <Pestanas opciones={opciones} valor={vista} onCambio={setVista} />
      {vista === 'HORAS' && <Horas />}
      {vista === 'PLANILLAS' && <Planillas />}
    </div>
  )
}

function Horas() {
  const empleados = useEstadoOpciones('/rrhh/empleados').opciones.filter((e) => e.estado !== 'BAJA')
  const [desde, setDesde] = useState(haceDias(14))
  const [hasta, setHasta] = useState(hoy())
  const { datos, recargar } = useConsulta('/rrhh/asistencias', { desde, hasta })
  const [f, setF] = useState({ empleadoId: '', fecha: hoy(), horasNormales: '8', horasExtra: '' })
  const [enviando, setEnviando] = useState(false)
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const guardar = async () => {
    setEnviando(true)
    const r = await enviar('post', '/rrhh/asistencias', { empleadoId: Number(f.empleadoId), fecha: f.fecha, horasNormales: Number(f.horasNormales || 0), horasExtra: Number(f.horasExtra || 0), origen: 'MANUAL' })
    setEnviando(false)
    if (r) { setF((x) => ({ ...x, horasExtra: '' })); recargar() }
  }
  // Totales por persona en el rango
  const porPersona = new Map()
  for (const a of datos ?? []) {
    const p = porPersona.get(a.empleadoId) ?? { empleado: a.empleado, dias: 0, normales: 0, extra: 0 }
    p.dias += 1; p.normales += Number(a.horasNormales); p.extra += Number(a.horasExtra)
    porPersona.set(a.empleadoId, p)
  }
  const personas = [...porPersona.values()].sort((a, b) => b.extra - a.extra)
  const totalExtra = personas.reduce((s, p) => s + p.extra, 0)
  return (
    <>
      <section className="rounded-superficie border bg-white p-4">
        <h3 className="mb-2 font-semibold">Registrar horas del día</h3>
        <div className="grid gap-2 text-sm sm:grid-cols-[2fr_1fr_1fr_1fr_auto]">
          <Campo etiqueta="Empleado o piloto" id="h-emp"><select value={f.empleadoId} onChange={set('empleadoId')} className={ent}><option value="">Elija…</option>{empleados.map((e) => <option key={e.id} value={e.id}>{nombre(e)}</option>)}</select></Campo>
          <Campo etiqueta="Fecha" id="h-fecha"><input type="date" value={f.fecha} max={hoy()} onChange={set('fecha')} className={ent} /></Campo>
          <Campo etiqueta="Horas normales" id="h-norm"><input inputMode="decimal" value={f.horasNormales} onChange={set('horasNormales')} className={`${ent} text-right`} /></Campo>
          <Campo etiqueta="Horas extra" id="h-extra"><input inputMode="decimal" value={f.horasExtra} onChange={set('horasExtra')} placeholder="0" className={`${ent} text-right`} /></Campo>
          <div className="flex items-end"><BotonPrimario disabled={enviando || !f.empleadoId} onClick={guardar} className="w-full justify-center">Guardar</BotonPrimario></div>
        </div>
        <p className="mt-2 text-xs text-gray-500">Si ya hay horas ese día para esa persona, se reemplazan. La planilla paga cada hora extra al valor de la hora ordinaria por el factor de Administración › Parámetros (1.5 por ley).</p>
      </section>
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label>Desde<input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} className="mt-1 block rounded-control border px-2 py-1.5" /></label>
        <label>Hasta<input type="date" value={hasta} min={desde} max={hoy()} onChange={(e) => setHasta(e.target.value)} className="mt-1 block rounded-control border px-2 py-1.5" /></label>
        <span className="text-xs text-gray-500">{num(totalExtra, 1)} horas extra en el rango</span>
      </div>
      <div className="overflow-x-auto rounded-superficie border bg-white">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="text-left text-xs text-gray-500"><tr><th className="px-4 py-2">Persona</th><th className="py-2 text-right">Días</th><th className="py-2 text-right">Horas normales</th><th className="px-4 py-2 text-right">Horas extra</th></tr></thead>
          <tbody className="divide-y">{personas.map((p) => (
            <tr key={p.empleado?.codigo}><td className="px-4 py-2 font-medium">{nombre(p.empleado)}</td><td className="cifra py-2 text-right">{p.dias}</td><td className="cifra py-2 text-right">{num(p.normales, 1)}</td><td className={`cifra px-4 py-2 text-right ${p.extra > 0 ? 'font-semibold' : ''}`}>{num(p.extra, 1)}</td></tr>
          ))}{datos && !personas.length && <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">Sin horas registradas en el rango.</td></tr>}</tbody>
        </table>
      </div>
    </>
  )
}

function Planillas() {
  const { puede } = usePermisos()
  const { datos: lista, recargar } = useConsulta('/rrhh/planillas')
  const [sel, setSel] = useState(null)
  const ahora = new Date()
  const [g, setG] = useState({ periodo: `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`, tipo: 'MENSUAL', quincena: '1' })
  const [enviando, setEnviando] = useState(false)
  const actual = sel ?? lista?.[0]?.id
  const { datos: p, recargar: recargarP } = useConsulta(actual ? `/rrhh/planillas/${actual}` : null)
  const generar = async () => {
    setEnviando(true)
    const [anio, mes] = g.periodo.split('-').map(Number)
    const r = await enviar('post', '/rrhh/planillas/generar', { anio, mes, tipo: g.tipo, quincena: g.tipo === 'QUINCENAL' ? Number(g.quincena) : undefined })
    setEnviando(false)
    if (r) { recargar(); setSel(r.data?.id ?? null); recargarP() }
  }
  const aprobar = async () => { setEnviando(true); if (await enviar('post', `/rrhh/planillas/${p.id}/aprobar`)) { recargar(); recargarP() } setEnviando(false) }
  const descuentosDe = (empleadoId) => (p?.descuentos ?? []).filter((d) => d.empleadoId === empleadoId)
  const totalExtra = (p?.detalles ?? []).reduce((s, d) => s + Number(d.horasExtraMonto), 0)
  const totalViajes = (p?.detalles ?? []).reduce((s, d) => s + Number(d.comisiones), 0)
  return (
    <>
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label>Planilla<select value={actual ?? ''} onChange={(e) => setSel(Number(e.target.value))} className="mt-1 block rounded-control border px-2 py-1.5">{(lista ?? []).map((x) => <option key={x.id} value={x.id}>{x.periodo} · {x.tipo.toLowerCase()} · {ESTADO[x.estado][0].toLowerCase()}</option>)}{lista && !lista.length && <option value="">Aún no hay planillas</option>}</select></label>
        {puede('rrhh.planilla.generar') && <>
          <label className="ml-auto">Período<input type="month" value={g.periodo} onChange={(e) => setG((x) => ({ ...x, periodo: e.target.value }))} className="mt-1 block rounded-control border px-2 py-1.5" /></label>
          <label>Tipo<select value={g.tipo} onChange={(e) => setG((x) => ({ ...x, tipo: e.target.value }))} className="mt-1 block rounded-control border px-2 py-1.5"><option value="MENSUAL">Mensual</option><option value="QUINCENAL">Quincenal</option></select></label>
          {g.tipo === 'QUINCENAL' && <label>Quincena<select value={g.quincena} onChange={(e) => setG((x) => ({ ...x, quincena: e.target.value }))} className="mt-1 block rounded-control border px-2 py-1.5"><option value="1">1 al 15</option><option value="2">16 a fin de mes</option></select></label>}
          <BotonPrimario disabled={enviando} onClick={generar}>{enviando ? 'Calculando…' : 'Generar o recalcular'}</BotonPrimario>
        </>}
      </div>
      {!p ? <p className="text-sm text-gray-500">{lista && !lista.length ? 'Genere la planilla del mes: toma el salario, las horas extra registradas, el pago por cada viaje terminado del piloto y los descuentos por incidentes.' : 'Cargando…'}</p> : <>
        <section className="grid gap-3 sm:grid-cols-4">
          <Cifra titulo="Líquido a pagar" valor={Q(p.totalLiquido)} detalle={`${p.detalles.length} personas · ${fecha(p.fechaInicio)} al ${fecha(p.fechaFin)}`} />
          <Cifra titulo="Horas extra" valor={Q(totalExtra)} />
          <Cifra titulo="Pago por viajes" valor={Q(totalViajes)} detalle="bono por viaje terminado" />
          <Cifra titulo="Costo patronal" valor={Q(p.totalPatronal)} detalle="IGSS, IRTRA e INTECAP" />
        </section>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Etiqueta color={ESTADO[p.estado][1]}>{ESTADO[p.estado][0]}</Etiqueta>
          {p.estado === 'BORRADOR' && <span className="text-xs text-gray-500">Recalcúlela si registra más horas, viajes o descuentos. Quien la genera no puede aprobarla.</span>}
          {p.estado === 'BORRADOR' && puede('rrhh.planilla.aprobar') && <Boton className="ml-auto" disabled={enviando} onClick={aprobar}>Aprobar planilla</Boton>}
        </div>
        <div className="overflow-x-auto rounded-superficie border bg-white">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="text-left text-xs text-gray-500"><tr><th className="px-4 py-2">Persona</th><th className="py-2 text-right">Días</th><th className="py-2 text-right">Salario</th><th className="py-2 text-right">Horas extra</th><th className="py-2 text-right">Por viajes</th><th className="py-2 text-right">Bonificación</th><th className="py-2 text-right">IGSS</th><th className="py-2 text-right">ISR</th><th className="py-2 text-right">Otros desc.</th><th className="px-4 py-2 text-right">Líquido</th></tr></thead>
            <tbody className="divide-y">{p.detalles.map((d) => {
              const inc = descuentosDe(d.empleadoId)
              return (
                <tr key={d.id}>
                  <td className="px-4 py-2"><span className="font-medium">{nombre(d.empleado)}</span><span className="block text-xs text-gray-500">{d.empleado.puesto?.nombre}</span></td>
                  <td className="cifra py-2 text-right">{num(d.diasLaborados, 0)}</td>
                  <td className="cifra py-2 text-right">{Q(d.salarioDevengado)}</td>
                  <td className="cifra py-2 text-right">{Q(d.horasExtraMonto)}</td>
                  <td className="cifra py-2 text-right">{Q(d.comisiones)}</td>
                  <td className="cifra py-2 text-right">{Q(d.bonificacionIncentivo)}</td>
                  <td className="cifra py-2 text-right text-red-700">{Q(d.igssLaboral)}</td>
                  <td className="cifra py-2 text-right text-red-700">{Q(d.isr)}</td>
                  <td className="cifra py-2 text-right text-red-700" title={inc.map((x) => `${x.incidente.numero}: ${Q(x.monto)}`).join('\n') || undefined}>{Q(d.otrosDescuentos)}{inc.length > 0 && <span className="block text-xs text-gray-500">{inc.map((x) => x.incidente.numero).join(', ')}</span>}</td>
                  <td className="cifra px-4 py-2 text-right font-semibold">{Q(d.liquido)}</td>
                </tr>
              )
            })}</tbody>
          </table>
        </div>
      </>}
    </>
  )
}
