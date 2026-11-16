// CLIENTES en tarjetas con avatar; tocar una abre la hoja de edición.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Mail, Phone, Plus, Search } from 'lucide-react'
import api from '../../services/api'
import { usePermisos } from '../../hooks/usePermisos'
import { useValidacion } from '../../hooks/useValidacion'
import ResumenErrores from '../forms/ResumenErrores'
import { showToast } from '../../utils/showToast'
import { Q, errorApi } from '../comun/formato'
import Hoja, { Avatar, Fila, Grupo } from '../comun/Hoja'
import SelectorMunicipio, { textoMunicipio } from '../comun/SelectorMunicipio'

/** Datos que se piden al guardar un cliente (el NIT es obligatorio: CF si no tiene). */
const camposCliente = (tipo) => [
  { name: 'nit', label: 'NIT', type: 'text', required: true },
  ...(tipo === 'PERSONA'
    ? [{ name: 'cui', label: 'DPI', type: 'text', formato: 'cui' }, { name: 'nombres', label: 'Nombres', type: 'text', required: true, minLength: 2 }]
    : [{ name: 'razonSocial', label: 'Razón social', type: 'text', required: true, minLength: 3 }]),
  { name: 'telefono', label: 'Teléfono', type: 'text' },
  { name: 'email', label: 'Correo', type: 'text' },
  { name: 'limiteCredito', label: 'Límite de crédito', type: 'number', min: 0 },
  { name: 'diasCredito', label: 'Días de crédito', type: 'number', min: 0, entero: true },
]

const nombreDe = (c) => c.razonSocial || [c.nombres, c.apellidos].filter(Boolean).join(' ') || 'Sin nombre'

export default function Clientes() {
  const { puede } = usePermisos()
  const [q, setQ] = useState('')
  const [lista, setLista] = useState([])
  const [total, setTotal] = useState(0)
  const [editando, setEditando] = useState(null)

  const cargar = useCallback(async (texto = q) => {
    try {
      const { data } = await api.get('/terceros/clientes', { params: { q: texto || undefined, limit: 120, activo: 'todos' } })
      setLista(data.data)
      setTotal(data.meta.total)
    } catch (e) {
      showToast({ type: 'error', message: errorApi(e).mensaje })
    }
  }, [q])
  useEffect(() => { const t = setTimeout(() => cargar(q), 300); return () => clearTimeout(t) }, [q]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mx-auto max-w-6xl p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, NIT o DPI" aria-label="Buscar clientes" className="w-full rounded-control border bg-white py-2 pl-9 pr-3 text-[15px]" />
        </div>
        {puede('terceros.crear') && <button type="button" onClick={() => setEditando({})} className="inline-flex items-center gap-1 rounded-control bg-green-600 px-3 py-2 text-sm font-medium text-white"><Plus className="h-4 w-4" /> Nuevo cliente</button>}
      </div>
      <p className="mt-3 text-sm text-gray-500">{total.toLocaleString('es-GT')} clientes{lista.length < total ? `, mostrando ${lista.length}: use la búsqueda para encontrar más` : ''}</p>
      <ul className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {lista.map((c) => (
          <li key={c.id}>
            <button type="button" onClick={() => setEditando(c)} className={`mac-elevar flex w-full items-start gap-3 rounded-tarjeta border bg-white p-4 text-left hover:border-green-600 ${c.activo ? '' : 'opacity-60'}`}>
              <Avatar nombre={nombreDe(c)} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold">{nombreDe(c)}</span>
                <span className="block text-sm text-gray-500">NIT {c.nit || 'CF'}</span>
                {c.telefono && <span className="mt-1 flex items-center gap-1 text-sm text-gray-600"><Phone className="h-3.5 w-3.5" aria-hidden />{c.telefono}</span>}
                {c.municipio && <span className="mt-0.5 block truncate text-xs text-gray-500">{textoMunicipio(c.municipio)}</span>}
                {c.email && <span className="flex items-center gap-1 truncate text-sm text-gray-600"><Mail className="h-3.5 w-3.5 shrink-0" aria-hidden /><span className="truncate">{c.email}</span></span>}
                {Number(c.limiteCredito) > 0 && <span className="mt-2 inline-block rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700">Crédito hasta {Q(c.limiteCredito)}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {!lista.length && <p className="py-16 text-center text-gray-500">Sin clientes que coincidan con la búsqueda.</p>}
      {editando && <EditorCliente cliente={editando} onCerrar={() => setEditando(null)} onGuardado={() => { setEditando(null); cargar() }} />}
    </div>
  )
}

function EditorCliente({ cliente, onCerrar, onGuardado }) {
  const { puede } = usePermisos()
  const nuevo = !cliente.id
  const editable = nuevo ? puede('terceros.crear') : puede('terceros.editar')
  const [f, setF] = useState({
    tipo: cliente.tipo ?? 'PERSONA', nit: cliente.nit ?? '', cui: cliente.cui ?? '', nombres: cliente.nombres ?? '', apellidos: cliente.apellidos ?? '',
    razonSocial: cliente.razonSocial ?? '', telefono: cliente.telefono ?? '', email: cliente.email ?? '', direccion: cliente.direccion ?? '', municipioId: cliente.municipioId ?? null,
    limiteCredito: cliente.limiteCredito != null ? Number(cliente.limiteCredito) : 0, diasCredito: cliente.diasCredito ?? 0, activo: cliente.activo ?? true,
  })
  const [guardando, setGuardando] = useState(false)
  const campos = useMemo(() => camposCliente(f.tipo), [f.tipo])
  const v = useValidacion(campos)
  const set = (k) => (e) => { v.alCambiar(k); setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })) }

  const guardar = async () => {
    // Se revisa TODO antes de enviar: lo que falta o está mal se marca en rojo y el cursor va al primero
    const r = v.validar(f)
    if (!r.ok) { showToast({ type: 'error', message: r.lista.length === 1 ? `Revise: ${r.lista[0].label}` : `Revise los ${r.lista.length} datos marcados en rojo` }); return }
    setGuardando(true)
    const datos = Object.fromEntries(Object.entries(r.valores).map(([k, val]) => [k, val === '' ? null : val]))
    if (f.tipo === 'EMPRESA') { datos.cui = null; datos.nombres = null; datos.apellidos = null } // campos que no se muestran para una empresa
    datos.limiteCredito = Number(f.limiteCredito || 0)
    datos.diasCredito = Number(f.diasCredito || 0)
    try {
      if (nuevo) await api.post('/terceros/clientes', datos)
      else await api.put(`/terceros/clientes/${cliente.id}`, datos)
      showToast({ type: 'success', message: nuevo ? 'Cliente creado' : 'Cambios guardados' })
      onGuardado()
    } catch (e) {
      v.delServidor(e) // lo que el servidor rechazó queda marcado bajo su campo
      showToast({ type: 'error', message: errorApi(e).mensaje })
    } finally { setGuardando(false) }
  }

  return (
    <Hoja abierta titulo={nuevo ? 'Nuevo cliente' : nombreDe(cliente)} onCerrar={onCerrar}
      pie={editable && <><button type="button" onClick={onCerrar} className="rounded-control border px-4 py-2">Cancelar</button><button type="button" disabled={guardando} onClick={guardar} className="rounded-control bg-green-600 px-4 py-2 font-medium text-white disabled:opacity-50">{guardando ? 'Guardando…' : 'Guardar'}</button></>}>
      <fieldset disabled={!editable}>
        <ResumenErrores lista={v.lista} />
        <div className="mb-5 flex justify-center">
          <div className="flex rounded-control bg-gray-200 p-0.5 text-sm" role="radiogroup" aria-label="Tipo de cliente">
            {[['PERSONA', 'Persona'], ['EMPRESA', 'Empresa']].map(([v, t]) => (
              <button key={v} type="button" role="radio" aria-checked={f.tipo === v} onClick={() => setF((x) => ({ ...x, tipo: v }))} className={`rounded-[6px] px-4 py-1 ${f.tipo === v ? 'bg-white font-medium shadow-sm' : 'text-gray-600'}`}>{t}</button>
            ))}
          </div>
        </div>
        <Grupo titulo="Identificación">
          <Fila etiqueta="NIT" id="nit" requerido error={v.error('nit')}><input value={f.nit} onChange={set('nit')} onBlur={() => v.alSalir('nit', f)} placeholder="CF o número" className="uppercase" /></Fila>
          {f.tipo === 'PERSONA' && <Fila etiqueta="DPI" id="cui" error={v.error('cui')}><input value={f.cui} onChange={set('cui')} onBlur={() => v.alSalir('cui', f)} inputMode="numeric" placeholder="13 dígitos" /></Fila>}
          {f.tipo === 'PERSONA' ? (
            <>
              <Fila etiqueta="Nombres" id="nombres" requerido error={v.error('nombres')}><input value={f.nombres} onChange={set('nombres')} onBlur={() => v.alSalir('nombres', f)} placeholder="Requerido" /></Fila>
              <Fila etiqueta="Apellidos"><input value={f.apellidos} onChange={set('apellidos')} /></Fila>
            </>
          ) : <Fila etiqueta="Razón social" id="razonSocial" requerido error={v.error('razonSocial')}><input value={f.razonSocial} onChange={set('razonSocial')} onBlur={() => v.alSalir('razonSocial', f)} placeholder="Requerido" /></Fila>}
        </Grupo>
        <Grupo titulo="Contacto" nota="El correo se usa para enviar la factura electrónica.">
          <Fila etiqueta="Teléfono" id="telefono" error={v.error('telefono')}><input value={f.telefono} onChange={set('telefono')} onBlur={() => v.alSalir('telefono', f)} inputMode="tel" /></Fila>
          <Fila etiqueta="Correo" id="email" error={v.error('email')}><input type="email" value={f.email} onChange={set('email')} onBlur={() => v.alSalir('email', f)} /></Fila>
        </Grupo>
        <Grupo titulo="Dirección" nota="Calle, número, zona o colonia. El municipio permite filtrar clientes por lugar y completar la factura.">
          <SelectorMunicipio value={f.municipioId} departamentoInicial={cliente.municipio?.departamentoId} onChange={(municipioId) => setF((x) => ({ ...x, municipioId }))} />
          <Fila etiqueta="Dirección"><input value={f.direccion} onChange={set('direccion')} placeholder="4a. calle 3-21 zona 1" /></Fila>
        </Grupo>
        <Grupo titulo="Crédito">
          <Fila etiqueta="Límite (Q)" id="limiteCredito" error={v.error('limiteCredito')}><input type="number" min="0" step="0.01" value={f.limiteCredito} onChange={set('limiteCredito')} onBlur={() => v.alSalir('limiteCredito', f)} className="cifra" /></Fila>
          <Fila etiqueta="Días de crédito" id="diasCredito" error={v.error('diasCredito')}><input type="number" min="0" value={f.diasCredito} onChange={set('diasCredito')} onBlur={() => v.alSalir('diasCredito', f)} className="cifra" /></Fila>
        </Grupo>
        {!nuevo && <Grupo><Fila etiqueta="Activo"><input type="checkbox" checked={f.activo} onChange={set('activo')} className="!w-auto" /></Fila></Grupo>}
      </fieldset>
    </Hoja>
  )
}
