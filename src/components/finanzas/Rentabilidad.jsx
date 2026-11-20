// ─────────────────────────────────────────────────────────────────────────────
// RENTABILIDAD: qué viajes, clientes, rutas, cabezales y pilotos dejan más ganancia y cuáles pagan mejor por km
// (viajes liquidados del período). La ganancia ya descuenta costos directos, pago al piloto y costos indirectos.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Q } from '../comun/formato'
import { BarrasHorizontales } from '../comun/Graficas'
import { Cifra, Pestanas } from '../operacion/comun'
import { haceDias, hay, hoy, num, useConsulta } from '../operacion/util'

const VISTAS = [['porCliente', 'Clientes'], ['porRuta', 'Rutas'], ['porCabezal', 'Cabezales'], ['porPiloto', 'Pilotos']]

export default function Rentabilidad() {
  const navigate = useNavigate()
  const [desde, setDesde] = useState(haceDias(90))
  const [hasta, setHasta] = useState(hoy())
  const [vista, setVista] = useState('porCliente')
  const { datos: d } = useConsulta('/viajes/rentabilidad', { desde, hasta })
  const t = d?.total
  const margen = t && Number(t.ingresos) ? (Number(t.ganancia) / Number(t.ingresos)) * 100 : null
  const perdidas = d?.viajes.filter((v) => Number(v.ganancia) < 0) ?? []
  const grupo = d?.[vista] ?? []
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label>Desde<input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} className="mt-1 block rounded-control border px-2 py-1.5" /></label>
        <label>Hasta<input type="date" value={hasta} max={hoy()} onChange={(e) => setHasta(e.target.value)} className="mt-1 block rounded-control border px-2 py-1.5" /></label>
        <p className="pb-2 text-xs text-gray-500">Solo viajes liquidados. La ganancia descuenta costos del viaje, pago al piloto e indirectos por km.</p>
      </div>
      {t && <section className="grid gap-3 sm:grid-cols-4">
        <Cifra titulo="Viajes liquidados" valor={t.viajes} detalle={`${num(t.km)} km`} />
        <Cifra titulo="Ingresos" valor={Q(t.ingresos)} detalle={Number(t.km) ? `Q${num(Number(t.ingresos) / Number(t.km), 2)} por km` : null} />
        <Cifra titulo="Ganancia" valor={Q(t.ganancia)} tono={Number(t.ganancia) < 0 ? 'malo' : 'bueno'} detalle={Number(t.km) ? `Q${num(Number(t.ganancia) / Number(t.km), 2)} por km` : null} />
        <Cifra titulo="Margen" valor={hay(margen) ? `${num(margen, 1)} %` : '—'} tono={hay(margen) && margen < 0 ? 'malo' : null} detalle={perdidas.length ? `${perdidas.length} viaje(s) con pérdida` : 'ningún viaje con pérdida'} />
      </section>}
      {d && <>
        <section className="rounded-superficie border bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Ganancia por {VISTAS.find(([k]) => k === vista)[1].toLowerCase()}</h2><Pestanas opciones={VISTAS} valor={vista} onCambio={setVista} /></div>
          <div className="grid gap-6 lg:grid-cols-2">
            <BarrasHorizontales datos={grupo.slice(0, 10).map((g) => ({ etiqueta: g.nombre, valor: Number(g.ganancia), detalle: `${g.viajes} viaje(s) · margen ${hay(g.margen) ? `${num(g.margen, 1)} %` : '—'}` }))} formato={Q} vacio="Sin viajes liquidados en el período" />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-gray-500"><tr><th className="py-1">Nombre</th><th className="py-1 text-right">Viajes</th><th className="py-1 text-right">Ingreso/km</th><th className="py-1 text-right">Ganancia/km</th><th className="py-1 text-right">Margen</th></tr></thead>
                <tbody className="divide-y">{[...grupo].sort((a, b) => Number(b.gananciaKm ?? 0) - Number(a.gananciaKm ?? 0)).map((g) => <tr key={g.nombre}><td className="py-1.5">{g.nombre}</td><td className="cifra py-1.5 text-right">{g.viajes}</td><td className="cifra py-1.5 text-right">{hay(g.ingresoKm) ? `Q${num(g.ingresoKm, 2)}` : '—'}</td><td className={`cifra py-1.5 text-right font-medium ${Number(g.gananciaKm) < 0 ? 'text-red-700' : ''}`}>{hay(g.gananciaKm) ? `Q${num(g.gananciaKm, 2)}` : '—'}</td><td className="cifra py-1.5 text-right">{hay(g.margen) ? `${num(g.margen, 1)} %` : '—'}</td></tr>)}</tbody>
              </table>
              <p className="mt-2 text-xs text-gray-500">Ordenado por ganancia por km: compara viajes largos y cortos con la misma vara.</p>
            </div>
          </div>
        </section>
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-superficie border bg-white p-4">
            <h2 className="mb-2 font-semibold">Mejor pagados por km</h2>
            <ol className="divide-y text-sm">{d.mejorPagados.map((v, i) => <li key={v.id}><button type="button" onClick={() => navigate(`/home/viajes?id=${v.id}`)} className="flex w-full items-center gap-3 py-2 text-left hover:bg-gray-50"><span className="w-5 text-gray-400">{i + 1}</span><span className="min-w-0 flex-1"><span className="block truncate font-medium">{v.numero} · {v.cliente}</span><span className="block truncate text-xs text-gray-500">{v.ruta ?? `${v.origen} → ${v.destino}`} · {num(v.km)} km</span></span><span className="cifra text-right">Q{num(v.ingresoKm, 2)}/km<span className="block text-xs text-gray-500">{Q(v.montoCobrado)}</span></span></button></li>)}</ol>
          </div>
          <div className="rounded-superficie border bg-white p-4">
            <h2 className="mb-2 font-semibold">Mayor ganancia</h2>
            <ol className="divide-y text-sm">{d.viajes.slice(0, 10).map((v, i) => <li key={v.id}><button type="button" onClick={() => navigate(`/home/viajes?id=${v.id}`)} className="flex w-full items-center gap-3 py-2 text-left hover:bg-gray-50"><span className="w-5 text-gray-400">{i + 1}</span><span className="min-w-0 flex-1"><span className="block truncate font-medium">{v.numero} · {v.cliente}</span><span className="block truncate text-xs text-gray-500">{v.cabezal} · {v.piloto}</span></span><span className={`cifra text-right font-medium ${Number(v.ganancia) < 0 ? 'text-red-700' : 'text-green-700'}`}>{Q(v.ganancia)}<span className="block text-xs font-normal text-gray-500">{hay(v.margen) ? `${num(v.margen, 1)} %` : ''}</span></span></button></li>)}</ol>
            {perdidas.length > 0 && <p className="mt-3 rounded-control bg-red-50 px-3 py-2 text-sm text-red-800">Con pérdida: {perdidas.map((v) => v.numero).join(', ')}. Revise su tarifa o sus costos.</p>}
          </div>
        </section>
      </>}
    </div>
  )
}
