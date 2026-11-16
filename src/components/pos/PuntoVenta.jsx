// ─────────────────────────────────────────────────────────────────────────────
// PUNTO DE VENTA — componente dedicado (no motor de formularios) porque
// necesita teclado, lector de código de barras y respuesta inmediata.
//
// Atajos:  F2 buscar · F4 cobrar · F8 vaciar · Esc cerrar cobro
// Reglas: no se vende sin existencia; quitar o reducir productos de una venta
// requiere el permiso ventas.quitar_linea o la autorización de un encargado.
// El total que se muestra es una VISTA PREVIA: el API recalcula precios,
// descuentos e IVA desde la base de datos y es la única fuente de verdad.
// ─────────────────────────────────────────────────────────────────────────────
import { registrarUso } from '../../utils/uso'
import { confirmar as pedirConfirmacion } from '../comun/Confirmacion' // "confirmar" ya es la función que registra la venta
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { usePresencia } from '../../hooks/usePresencia'
import { useSearchParams } from 'react-router-dom'
import { Search, Trash2, Banknote, CreditCard, Landmark, Plus, Minus, Receipt, UserRound, X, Info, FileText, Share2 } from 'lucide-react'
import EnviarDocumento from '../operacion/EnviarDocumento'
import api, { sesion as sesionApi } from '../../services/api'
import { AuthContext } from '../../context/AuthContext'
import { useVentasEnCurso, CLIENTE_CF } from './useVentasEnCurso'
import { ClienteRapido, ProductoNoEncontrado } from './AltasRapidas'
import Modal from '../comun/Modal'
import { ChipsGiro, useCamposProducto } from '../../hooks/useCamposProducto'
import { imprimirAlCobrar, imprimirTicket } from '../../utils/ticket'
import { showToast } from '../../utils/showToast'
import { Q, r2, errorApi } from './formato'
import AperturaCaja from './AperturaCaja'
import CajaVencida from './CajaVencida'
import { usePermisos } from '../../hooks/usePermisos'
import { useAutorizacion } from '../comun/AutorizacionSupervisor'
import BotonPantallaCompleta from '../comun/BotonPantallaCompleta'
import FichaProducto from './FichaProducto'
import LeerLista from './LeerLista'
import PorConseguir from './PorConseguir'

const MEDIOS = [
  { id: 'EFECTIVO', label: 'Efectivo', icon: Banknote },
  { id: 'TARJETA', label: 'Tarjeta', icon: CreditCard },
  { id: 'TRANSFERENCIA', label: 'Transferencia', icon: Landmark },
]

export default function PuntoVenta() {
  const camposGiro = useCamposProducto() // "205/55R16", "Rin 16"… en los resultados
  const [ficha, setFicha] = useState(null) // producto abierto en la ficha (forma adicional de vender)
  const [leyendoLista, setLeyendoLista] = useState(false) // lista de útiles (foto o PDF) en cotización
  const [iaLista, setIaLista] = useState(false)
  const [params, setParams] = useSearchParams()
  const esCotizacion = params.get('modo') === 'cotizacion'

  const [sesion, setSesion] = useState(undefined) // undefined=cargando, null=sin caja
  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState([])
  // Ventas en curso por vendedor: persisten (por usuario, sucursal y modo) hasta guardarse
  const { user } = useContext(AuthContext)
  const claveVentas = `spvi_pos_${user?.usuario?.id ?? 'u'}_${sesionApi.sucursal() ?? 's'}_${esCotizacion ? 'cotizacion' : 'venta'}`
  const enCurso = useVentasEnCurso(claveVentas)
  const { carrito, cliente, vendedor, setCarrito, setCliente } = enCurso
  const felPorDefecto = user?.usuario?.felPorDefecto ?? true
  const [emitirFel, setEmitirFel] = useState(felPorDefecto)
  const [imprimir, setImprimir] = useState(imprimirAlCobrar.leer) // preferencia de esta caja
  const [pidiendoVendedor, setPidiendoVendedor] = useState(null) // 'nueva' | 'cambiar' | null
  const [clienteNuevo, setClienteNuevo] = useState(null) // texto buscado sin resultado
  const [noEncontrado, setNoEncontrado] = useState(null) // código de producto inexistente
  const [frecuentes, setFrecuentes] = useState([])
  useEffect(() => {
    api.get('/productos/pos/frecuentes').then(({ data }) => setFrecuentes(data.data)).catch(() => setFrecuentes([]))
  }, [])
  const [nit, setNit] = useState('')
  const [cobrando, setCobrando] = useState(false)
  const cobro = usePresencia(cobrando, 200) // la ventana de cobro entra y sale con animación
  const [pagos, setPagos] = useState([])
  const [procesando, setProcesando] = useState(false)
  // Último documento POR TIPO: en Ventas se ofrece la última venta; en Cotizaciones, la última cotización
  const [ultimas, setUltimas] = useState({})
  const ultima = ultimas[esCotizacion ? 'COTIZACION' : 'VENTA'] ?? null
  const [compartiendo, setCompartiendo] = useState(false) // compartir el último documento (PDF, Word, WhatsApp, correo)
  const inputRef = useRef(null)
  const [clientesEncontrados, setClientesEncontrados] = useState([])
  const { puede } = usePermisos()
  const { pedirAutorizacion, modalAutorizacion } = useAutorizacion()
  // En cotizaciones no hay dinero ni existencia comprometida: no se exige autorización
  const requiereAutorizacion = !esCotizacion && !puede('ventas.quitar_linea')

  /** Pide autorización si hace falta. Devuelve true si se puede continuar. */
  const autorizarQuitar = async (detalle) => {
    if (!requiereAutorizacion) return true
    const token = await pedirAutorizacion('ventas.quitar_linea', detalle)
    return Boolean(token)
  }

  const cargarSesion = useCallback(() => {
    if (esCotizacion) return setSesion({ cotizacion: true })
    api.get('/caja/mi-sesion').then(({ data }) => setSesion(data.data)).catch(() => setSesion(null))
  }, [esCotizacion])

  useEffect(cargarSesion, [cargarSesion])

  const totales = useMemo(() => {
    const lineas = carrito.map((l) => {
      const unit = r2(l.precio - r2((l.precio * l.descuento) / 100))
      return { ...l, unit, subtotal: r2(unit * l.cantidad) }
    })
    const total = r2(lineas.reduce((a, l) => a + l.subtotal, 0))
    const bruto = r2(lineas.reduce((a, l) => a + l.precio * l.cantidad, 0))
    return { lineas, total, descuento: r2(bruto - total), articulos: lineas.reduce((a, l) => a + l.cantidad, 0) }
  }, [carrito])

  const pagado = r2(pagos.reduce((a, p) => a + Number(p.monto || 0), 0))
  const cambio = r2(Math.max(0, pagado - totales.total))

  // ── Atajos de teclado ─────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'F2') { e.preventDefault(); inputRef.current?.focus() }
      if (e.key === 'F4' && carrito.length) { e.preventDefault(); abrirCobro() }
      if (e.key === 'F8') { e.preventDefault(); vaciar() }
      if (e.key === 'Escape') setCobrando(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const [porConseguir, setPorConseguir] = useState(false) // agregar un producto que no tenemos (solo cotizaciones)
  const [lista, setLista] = useState({ reutilizable: false, nombre: '', esperados: '' }) // cotización como lista reutilizable
  const agregar = (p) => {
    const existencia = Number(p.existencia || 0)
    const controla = p.manejaInventario && !esCotizacion
    if (controla && existencia <= 0) {
      showToast({ type: 'error', message: `"${p.nombre}" no tiene existencia en esta sucursal` })
      setBusqueda('')
      setResultados([])
      inputRef.current?.focus()
      return
    }
    const enCarrito = carrito.find((l) => l.productoId === p.id)
    if (controla && enCarrito && enCarrito.cantidad + 1 > existencia) {
      showToast({ type: 'warning', message: `Solo hay ${existencia} de "${p.nombre}"` })
      setBusqueda('')
      inputRef.current?.focus()
      return
    }
    setCarrito((c) => {
      const existe = c.find((l) => l.productoId === p.id)
      if (existe) return c.map((l) => (l.productoId === p.id ? { ...l, cantidad: l.cantidad + 1 } : l))
      return [...c, {
        productoId: p.id, nombre: p.nombre, sku: p.sku, marca: p.marca?.nombre, precio: Number(p.precioVenta),
        cantidad: 1, descuento: 0, maxDescuento: Number(p.descuentoMaximo || 0), existencia: Number(p.existencia || 0),
        decimales: p.presentacion?.permiteDecimales, controla: p.manejaInventario,
      }]
    })
    setBusqueda('')
    setResultados([])
    inputRef.current?.focus()
  }

  // La lectura de listas solo se ofrece en cotizaciones y si el plan y el servidor tienen la IA activa
  useEffect(() => {
    if (!esCotizacion) { setIaLista(false); return }
    api.get('/listas/capacidades').then(({ data }) => setIaLista(Boolean(data.data.ia))).catch(() => setIaLista(false))
  }, [esCotizacion])

  /** Desde la lista de útiles: agrega todos los productos confirmados (si ya estaban, suma la cantidad). */
  const agregarLista = (items) => {
    setCarrito((c) => {
      const salida = [...c]
      for (const { producto: p, cantidad } of items) {
        const cant = p.presentacion?.permiteDecimales ? cantidad : Math.ceil(cantidad) // unidades enteras si no admite decimales
        const i = salida.findIndex((l) => l.productoId === p.id)
        if (i >= 0) salida[i] = { ...salida[i], cantidad: Math.round((salida[i].cantidad + cant) * 1000) / 1000 }
        else salida.push({
          productoId: p.id, nombre: p.nombre, sku: p.sku, marca: p.marca?.nombre, precio: Number(p.precioVenta), cantidad: cant, descuento: 0,
          maxDescuento: Number(p.descuentoMaximo || 0), existencia: Number(p.existencia || 0), decimales: p.presentacion?.permiteDecimales, controla: p.manejaInventario,
        })
      }
      return salida
    })
    setLeyendoLista(false)
    showToast({ type: 'success', message: `${items.length} productos agregados a la cotización` })
  }

  /** Desde la ficha: suma la cantidad elegida y aplica el descuento (la ficha ya validó existencia y tope). */
  const agregarDesdeFicha = (p, cantidad, descuento) => {
    setCarrito((c) => {
      const existe = c.find((l) => l.productoId === p.id)
      if (existe) return c.map((l) => (l.productoId === p.id ? { ...l, cantidad: Math.round((l.cantidad + cantidad) * 1000) / 1000, descuento } : l))
      return [...c, {
        productoId: p.id, nombre: p.nombre, sku: p.sku, marca: p.marca?.nombre, precio: Number(p.precioVenta),
        cantidad, descuento, maxDescuento: Number(p.descuentoMaximo || 0), existencia: Number(p.existencia || 0),
        decimales: p.presentacion?.permiteDecimales, controla: p.manejaInventario,
      }]
    })
    setFicha(null)
    setBusqueda('')
    setResultados([])
    inputRef.current?.focus()
  }

  const buscar = async (e) => {
    e.preventDefault()
    const q = busqueda.trim()
    if (!q) return
    try {
      const { data } = await api.get('/productos/pos/buscar', { params: { q } })
      if (data.data.length === 1) agregar(data.data[0]) // lector de barras: 1 coincidencia exacta
      else if (!data.data.length) setNoEncontrado(q)
      else setResultados(data.data)
    } catch (err) {
      showToast({ type: 'error', message: errorApi(err).mensaje })
    }
  }

  const actualizar = (id, cambios) => setCarrito((c) => c.map((l) => (l.productoId === id ? { ...l, ...cambios } : l)))

  /** Cambia la cantidad respetando existencia y la regla de autorización al reducir. */
  const cambiarCantidad = async (l, nueva) => {
    let cantidad = Math.max(l.decimales ? 0.001 : 1, Number(nueva) || 0)
    if (l.controla && !esCotizacion && cantidad > l.existencia) {
      showToast({ type: 'warning', message: `Solo hay ${l.existencia} de "${l.nombre}"` })
      cantidad = l.existencia
    }
    if (cantidad < l.cantidad && !(await autorizarQuitar(`Reducir "${l.nombre}" de ${l.cantidad} a ${cantidad}`))) return
    actualizar(l.productoId, { cantidad })
  }

  const quitar = async (l) => {
    if (!(await autorizarQuitar(`Quitar "${l.nombre}" (${l.cantidad}) de la venta`))) return
    setCarrito((c) => c.filter((x) => x.productoId !== l.productoId))
  }

  const vaciar = async () => {
    if (!carrito.length) return
    if (!(await autorizarQuitar(`Vaciar la venta (${carrito.length} productos)`))) return
    setCarrito([])
  }

  const nombreDe = (c) => c.razonSocial || [c.nombres, c.apellidos].filter(Boolean).join(' ') || 'Sin nombre'
  const elegirCliente = (c) => {
    setCliente({ id: c.id, nit: c.nit || 'CF', nombre: nombreDe(c) })
    setClientesEncontrados([])
    setNit('')
    inputRef.current?.focus()
  }

  /** Busca por NIT, CUI o nombre. NIT exacto o un solo resultado => se elige directo. */
  const buscarCliente = async () => {
    const valor = nit.trim()
    if (!valor || valor.toUpperCase() === 'CF') {
      setClientesEncontrados([])
      return setCliente(CLIENTE_CF)
    }
    try {
      const { data } = await api.get('/terceros/clientes', { params: { q: valor, limit: 10 } })
      const exacto = data.data.find((x) => x.nit === valor.toUpperCase() || x.cui === valor)
      if (exacto) return elegirCliente(exacto)
      if (data.data.length === 1) return elegirCliente(data.data[0])
      if (!data.data.length) {
        if (puede('terceros.crear')) return setClienteNuevo(valor)
        return showToast({ type: 'warning', message: 'Cliente no encontrado. Pida que lo registren o venda como CF.' })
      }
      setClientesEncontrados(data.data)
    } catch (err) {
      showToast({ type: 'error', message: errorApi(err).mensaje })
    }
  }

  // ── Cotización → venta: se abre en una pestaña NUEVA del POS con sus productos (a precio de hoy) y su cliente;
  //    todo se puede cambiar antes de cobrar (otro comprador, otra marca, otra cantidad…). Las demás pestañas no se tocan.
  const cotizacionPedida = !esCotizacion ? Number(params.get('cotizacion')) || null : null
  const cotizacionCargada = useRef(null)
  useEffect(() => {
    if (!cotizacionPedida || cotizacionCargada.current === cotizacionPedida) return
    cotizacionCargada.current = cotizacionPedida
    const quitarParametro = () => setParams((p) => { const n = new URLSearchParams(p); n.delete('cotizacion'); return n }, { replace: true })
    ;(async () => {
      try {
        const { data } = await api.get(`/ventas/${cotizacionPedida}`)
        const cot = data.data
        if (cot.tipo !== 'COTIZACION') throw new Error('Ese documento no es una cotización')
        if (cot.estado !== 'CONFIRMADA') throw new Error(`La cotización ${cot.serie}-${cot.numero} ya está ${String(cot.estado).toLowerCase()}`)
        const ids = cot.detalles.map((d) => d.productoId)
        const { data: prods } = await api.get('/productos/pos/buscar', { params: { ids: ids.join(',') } })
        const porId = new Map((prods.data ?? []).map((p) => [p.id, p]))
        const recortados = []
        const lineas = cot.detalles.filter((d) => porId.has(d.productoId)).map((d) => {
          const p = porId.get(d.productoId)
          const maxDescuento = Number(p.descuentoMaximo || 0)
          const pedido = Number(d.porcentajeDescuento || 0)
          if (pedido > maxDescuento) recortados.push(p.nombre)
          return { productoId: p.id, nombre: p.nombre, sku: p.sku, marca: p.marca?.nombre, precio: Number(p.precioVenta), cantidad: Number(d.cantidad),
            descuento: Math.min(pedido, maxDescuento), maxDescuento, existencia: Number(p.existencia || 0), decimales: p.presentacion?.permiteDecimales, controla: p.manejaInventario }
        })
        const faltan = cot.detalles.length - lineas.length
        const c = cot.cliente ?? {}
        const nombreCliente = c.razonSocial || [c.nombres, c.apellidos].filter(Boolean).join(' ') || 'Consumidor final'
        const clienteCot = !c.nit || c.nit === 'CF' ? CLIENTE_CF : { id: cot.clienteId, nit: c.nit, nombre: nombreCliente }
        enCurso.abrirCon({ carrito: lineas, cliente: clienteCot, cotizacion: { id: cot.id, numero: `${cot.serie}-${cot.numero}`, reutilizable: Boolean(cot.reutilizable), nombreLista: cot.nombreLista ?? null, cliente: nombreCliente } })
        showToast({ type: 'success', message: `Cotización ${cot.serie}-${cot.numero} lista para cobrar en una pestaña nueva` })
        if (faltan) showToast({ type: 'warning', message: `${faltan} ${faltan === 1 ? 'producto ya no está disponible y no se agregó' : 'productos ya no están disponibles y no se agregaron'}` })
        if (recortados.length) showToast({ type: 'warning', message: `El descuento de ${recortados.join(', ')} supera el permitido hoy y se ajustó` })
      } catch (e) {
        showToast({ type: 'error', message: e?.response ? errorApi(e).mensaje : e.message })
      } finally { quitarParametro() }
    })()
  }, [cotizacionPedida]) // eslint-disable-line react-hooks/exhaustive-deps

  const abrirCobro = () => {
    if (esCotizacion) return confirmar()
    setPagos([{ medioPago: 'EFECTIVO', monto: totales.total.toFixed(2), referencia: '' }])
    setEmitirFel(felPorDefecto)
    setCobrando(true)
  }

  const confirmar = async () => {
    setProcesando(true)
    try {
      const { data } = await api.post('/ventas', {
        tipo: esCotizacion ? 'COTIZACION' : 'VENTA',
        clienteId: cliente.id ?? undefined,
        lineas: carrito.map((l) => ({ productoId: l.productoId, cantidad: l.cantidad, porcentajeDescuento: l.descuento })),
        pagos: esCotizacion ? [] : pagos.filter((p) => Number(p.monto) > 0).map((p) => ({ ...p, monto: Number(p.monto), referencia: p.referencia || undefined })),
        emitirFel: esCotizacion ? undefined : emitirFel,
        vendedorCodigo: vendedor?.codigo,
        ...(!esCotizacion && enCurso.cotizacion ? { cotizacionId: enCurso.cotizacion.id } : {}), // venta que viene de una cotización
        // Lista reutilizable (p. ej. lista de útiles): la cotización se podrá vender varias veces
        ...(esCotizacion && lista.reutilizable ? { reutilizable: true, nombreLista: lista.nombre.trim() || undefined, compradoresEsperados: Number(lista.esperados) > 0 ? Math.round(Number(lista.esperados)) : undefined } : {}),
      })
      setUltimas((u) => ({ ...u, [data.data.tipo]: { ...data.data, resumenCliente: { nit: cliente.nit || 'CF', nombre: cliente.nombre } } }))
      registrarUso(data.data?.tipo === 'COTIZACION' ? 'pos.cotizacion' : 'pos.venta')
      // Ticket térmico (espera la certificación FEL unos segundos)
      if (imprimir) imprimirTicket(data.data.id).then((ok) => { if (!ok) showToast({ type: 'warning', message: 'No se pudo imprimir el ticket. Reimprímalo desde Ventas y cotizaciones.' }) })
      enCurso.cerrar(enCurso.actual.id) // la venta ya está en el API: se descarta del borrador
      setLista({ reutilizable: false, nombre: '', esperados: '' })
      setCobrando(false)
      setNit('')
      showToast({ type: 'success', message: esCotizacion ? 'Cotización creada' : `Venta registrada. Cambio: ${Q(data.data.cambio)}` })
    } catch (err) {
      const { codigo, mensaje } = errorApi(err)
      // La caja se cerró o cambió el día mientras vendía: se vuelve a consultar y el POS muestra qué hacer
      if (codigo === 'CAJA_CERRADA') { setCobrando(false); setSesion(null) }
      if (codigo === 'CAJA_DIA_ANTERIOR') { setCobrando(false); cargarSesion() }
      showToast({ type: 'error', message: mensaje })
    } finally {
      setProcesando(false)
      inputRef.current?.focus()
    }
  }

  if (sesion === undefined) return <p className="p-6 text-gray-500">Cargando caja…</p>
  if (sesion === null) return <AperturaCaja onAbierta={cargarSesion} />
  // Caja de otro día: se explica qué hacer ANTES de armar una venta que el servidor rechazaría
  if (sesion?.deDiaAnterior) return <CajaVencida sesion={sesion} onActualizar={cargarSesion} />

  const totalArticulos = totales.articulos
  return (
    <div className="grid gap-4 p-3 lg:h-[calc(100dvh-4.5rem)] lg:grid-cols-[minmax(0,1fr)_380px] lg:p-4">
      {/* ═══════════ Izquierda: escáner, recibo y frecuentes ═══════════ */}
      <section className="flex min-h-[60vh] flex-col overflow-hidden rounded-superficie border bg-white">
        {/* Ventas en curso (una por vendedor) */}
        <div className="separador flex flex-wrap items-center gap-2 border-b px-3 py-2" role="tablist" aria-label="Ventas en curso">
          {enCurso.ventas.map((v, i) => {
            const activa = v.id === enCurso.actual.id
            const items = v.carrito.reduce((a, l) => a + Number(l.cantidad), 0)
            return (
              <span key={v.id} className={`inline-flex items-center rounded-full text-sm ${activa ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700'}`}>
                <button type="button" role="tab" aria-selected={activa} onClick={() => enCurso.seleccionar(v.id)} className="py-1.5 pl-3.5 pr-1">
                  {v.cotizacion ? `${v.cotizacion.reutilizable ? 'Lista' : 'Cot.'} ${v.cotizacion.numero}` : v.vendedor ? v.vendedor.nombre.split(' ')[0] : `Venta ${i + 1}`}{items ? ` (${items})` : ''}
                </button>
                <button type="button" aria-label="Descartar esta venta" className={`mr-1 rounded-full p-1 ${activa ? 'hover:bg-white/20' : 'hover:bg-gray-200'}`}
                  onClick={async () => {
                    if (v.carrito.length) {
                      if (!(await pedirConfirmacion({ titulo: 'Descartar venta en curso', mensaje: `Se quitarán sus ${v.carrito.length} productos.`, confirmar: 'Descartar', peligro: true }))) return
                      if (!(await autorizarQuitar(`Descartar venta en curso (${v.carrito.length} productos)`))) return
                    }
                    enCurso.cerrar(v.id)
                  }}><X className="h-3.5 w-3.5" /></button>
              </span>
            )
          })}
          <button type="button" onClick={() => setPidiendoVendedor('nueva')} className="inline-flex items-center gap-1 rounded-full border border-dashed border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
            <Plus className="h-4 w-4" /> Nueva venta
          </button>
          <button type="button" onClick={() => setPidiendoVendedor('cambiar')} className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-200">
            <UserRound className="h-4 w-4" /> {vendedor ? vendedor.nombre : 'Vendedor: yo'}
          </button>
        </div>
        {enCurso.cotizacion && !esCotizacion && (
          <p className="mx-3 mt-2 rounded-control border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status">
            Venta desde {enCurso.cotizacion.reutilizable ? `la lista ${enCurso.cotizacion.nombreLista ?? enCurso.cotizacion.numero}` : `la cotización ${enCurso.cotizacion.numero}`} (cotizada a {enCurso.cotizacion.cliente}).
            {' '}Puede cambiar el cliente, los productos, las cantidades y los descuentos antes de cobrar. Precios de hoy.
          </p>
        )}

        {/* Escáner */}
        <form onSubmit={buscar} className="relative px-3 pt-3">
          <Search className="absolute left-7 top-[1.6rem] h-6 w-6 text-gray-400" aria-hidden />
          <input
            ref={inputRef} autoFocus value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Escanee o escriba un producto  (F2)"
            className="h-14 w-full rounded-tarjeta border-2 border-gray-200 bg-gray-50 pl-14 pr-4 text-xl focus:border-green-600 focus:bg-white focus:outline-none"
            aria-label="Buscar producto"
          />
          {resultados.length > 0 && (
            <ul className="absolute left-3 right-3 top-full z-20 mt-1 max-h-96 overflow-auto rounded-tarjeta border bg-white shadow-xl">
              {resultados.map((p) => (
                <li key={p.id} className="flex items-stretch">
                  <button type="button" onClick={() => agregar(p)} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-2.5 text-left hover:bg-green-50 focus:bg-green-50">
                    <MiniFoto p={p} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{p.nombre}</span>
                      <span className="block truncate text-sm text-gray-500">{p.sku}{p.marca?.nombre ? `, ${p.marca.nombre}` : ''}</span>
                      <ChipsGiro atributos={p.atributos} campos={camposGiro} className="mt-0.5" />
                    </span>
                    <span className="text-right">
                      <span className="cifra block text-lg font-semibold">{Q(p.precioVenta)}</span>
                      <span className={`text-xs ${Number(p.existencia) > 0 ? 'text-gray-500' : 'text-red-600'}`}>{Number(p.existencia) > 0 ? `${Number(p.existencia)} disponibles` : 'Agotado'}</span>
                    </span>
                  </button>
                  <button type="button" onClick={() => setFicha(p)} className="flex shrink-0 items-center border-l px-3 text-gray-500 hover:bg-sky-50 hover:text-sky-700" aria-label={`Ver ficha de ${p.nombre}`} title="Ver ficha y elegir cantidad"><Info className="h-5 w-5" /></button>
                </li>
              ))}
            </ul>
          )}
        </form>
        {esCotizacion && iaLista && (
          <div className="px-3 pt-2">
            <button type="button" onClick={() => setLeyendoLista(true)} className="inline-flex items-center gap-2 rounded-control border border-dashed border-green-600 px-3 py-2 text-sm font-medium text-green-800 hover:bg-green-50">
              <FileText className="h-4 w-4" aria-hidden /> Leer lista de útiles (foto o PDF)
            </button>
          </div>
        )}

        {/* Recibo */}
        <div className="mt-3 min-h-0 flex-1 overflow-auto">
          {carrito.length === 0 ? (
            <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-2 px-6 text-center text-gray-400">
              <Receipt className="h-12 w-12" aria-hidden />
              <p className="text-lg">Escanee el primer producto</p>
              {ultima && (
                <div className="flex flex-col items-center gap-2">
                  <p className="text-sm text-gray-600">
                    {ultima.tipo === 'COTIZACION' ? 'Última cotización' : 'Última venta'} {ultima.serie}-{ultima.numero} · NIT {ultima.resumenCliente?.nit ?? 'CF'} · {ultima.resumenCliente?.nombre ?? 'Consumidor final'} · <span className="cifra font-semibold">{Q(ultima.total)}</span>
                    {ultima.felEstado && ultima.felEstado !== 'NO_APLICA' ? ` · FEL ${ultima.felEstado.toLowerCase()}` : ''}
                  </p>
                  <button type="button" onClick={() => setCompartiendo(true)} className="inline-flex items-center gap-1.5 rounded-control bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700">
                    <Share2 className="h-4 w-4" aria-hidden /> {ultima.tipo === 'COTIZACION' ? 'Enviar cotización (PDF, WhatsApp, correo)' : 'Enviar última venta (PDF, WhatsApp, correo)'}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <ol className="separador divide-y divide-gray-200">
              {totales.lineas.map((l, idx) => (
                <li key={l.productoId} className="flex items-center gap-3 px-4 py-3">
                  <span className="w-6 text-right text-sm text-gray-400">{idx + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[17px] font-medium">{l.nombre}</span>
                    <span className="block text-sm text-gray-500">
                      {Q(l.precio)} c/u{l.descuento ? `, ${l.descuento}% desc.` : ''}
                      {l.controla && !esCotizacion && l.cantidad >= l.existencia && <span className="text-amber-600">, última existencia</span>}
                    </span>
                  </span>
                  <span className="flex items-center rounded-full bg-gray-100">
                    <button type="button" aria-label={`Restar ${l.nombre}`} className="rounded-full p-2 hover:bg-gray-200" onClick={() => cambiarCantidad(l, l.cantidad - 1)}><Minus className="h-4 w-4" /></button>
                    <input
                      type="number" min="0" step={l.decimales ? '0.001' : '1'} value={l.cantidad}
                      readOnly={requiereAutorizacion} title={requiereAutorizacion ? 'Use + y − (reducir requiere autorización)' : undefined}
                      onChange={(e) => { const v = Number(e.target.value); if (v >= l.cantidad) cambiarCantidad(l, v); else actualizar(l.productoId, { cantidad: Math.max(0, v) }) }}
                      onBlur={(e) => cambiarCantidad(l, e.target.value)}
                      className="cifra w-12 bg-transparent text-center text-[17px] font-semibold outline-none" aria-label={`Cantidad de ${l.nombre}`}
                    />
                    <button type="button" aria-label={`Sumar ${l.nombre}`} className="rounded-full p-2 hover:bg-gray-200" onClick={() => cambiarCantidad(l, l.cantidad + 1)}><Plus className="h-4 w-4" /></button>
                  </span>
                  <label className="hidden items-center gap-1 text-sm text-gray-500 sm:flex" title={l.maxDescuento ? `Máximo autorizado ${l.maxDescuento}%` : 'Sin descuento autorizado'}>
                    <input
                      type="number" min="0" max={l.maxDescuento} step="0.5" value={l.descuento} disabled={l.maxDescuento === 0}
                      onChange={(e) => actualizar(l.productoId, { descuento: Math.min(l.maxDescuento, Math.max(0, Number(e.target.value))) })}
                      className="cifra w-14 rounded-control border px-1.5 py-1 text-right disabled:bg-gray-50" aria-label={`Descuento de ${l.nombre}`}
                    />%
                  </label>
                  <span className="cifra w-28 text-right text-[19px] font-semibold">{Q(l.subtotal)}</span>
                  <button type="button" aria-label={`Quitar ${l.nombre}`} onClick={() => quitar(l)} className="rounded-full p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* Productos frecuentes: agregar con un toque */}
        {frecuentes.length > 0 && (
          <div className="separador border-t bg-gray-50 px-3 py-2.5">
            <p className="mb-2 px-1 text-[13px] text-gray-500">Más vendidos</p>
            <ul className="flex gap-2 overflow-x-auto pb-1">
              {frecuentes.map((p) => (
                <li key={p.id} className="shrink-0">
                  <button type="button" onClick={() => agregar(p)} className="flex w-28 flex-col overflow-hidden rounded-tarjeta border bg-white text-left hover:border-green-600">
                    <MiniFoto p={p} grande />
                    <span className="line-clamp-2 h-9 px-2 pt-1 text-xs leading-tight">{p.nombre}</span>
                    <span className="cifra px-2 pb-1.5 text-sm font-semibold">{Q(p.precioVenta)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* ═══════════ Derecha: cliente, total y cobro ═══════════ */}
      <aside className="flex flex-col gap-3">
        <div className="relative rounded-superficie border bg-white p-4">
          <label htmlFor="nit" className="mb-1.5 block text-[13px] text-gray-500">Cliente: NIT, DPI o nombre</label>
          <div className="flex gap-2">
            <input id="nit" value={nit} onChange={(e) => setNit(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && buscarCliente()} placeholder="CF" className="min-w-0 flex-1 rounded-control border px-3 py-2" />
            <button type="button" onClick={buscarCliente} className="rounded-control bg-gray-100 px-3 text-sm hover:bg-gray-200">Buscar</button>
          </div>
          {clientesEncontrados.length > 0 && (
            <ul className="absolute left-4 right-4 z-20 mt-1 max-h-64 overflow-auto rounded-tarjeta border bg-white shadow-xl">
              {clientesEncontrados.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => elegirCliente(c)} className="block w-full px-3 py-2 text-left text-sm hover:bg-green-50">
                    <span className="font-medium">{nombreDe(c)}</span> <span className="text-gray-500">NIT {c.nit || 'CF'}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 truncate text-[15px] font-medium">{cliente.nombre}</p>
          <p className="text-sm text-gray-500">NIT {cliente.nit}</p>
        </div>

        <div className="rounded-superficie border bg-white p-4">
          <dl className="space-y-1.5 text-[15px]">
            <div className="flex justify-between"><dt className="text-gray-500">Artículos</dt><dd className="cifra">{totalArticulos}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Descuentos</dt><dd className="cifra">{totales.descuento ? `− ${Q(totales.descuento)}` : Q(0)}</dd></div>
          </dl>
        </div>

        {esCotizacion && (
          <div className="space-y-2 rounded-superficie border bg-white p-3 text-sm">
            <button type="button" onClick={() => setPorConseguir(true)} className="w-full rounded-control border border-dashed px-3 py-2 text-left text-green-800 hover:bg-green-50">+ Producto que no tenemos (por conseguir)</button>
            <label className="flex items-start gap-2"><input type="checkbox" checked={lista.reutilizable} onChange={(e) => setLista((x) => ({ ...x, reutilizable: e.target.checked }))} className="mt-0.5 accent-green-600" />
              <span>Lista reutilizable <span className="text-gray-500">(se vende varias veces; p. ej. la lista de útiles de un colegio)</span></span></label>
            {lista.reutilizable && (
              <div className="flex gap-2">
                <input value={lista.nombre} onChange={(e) => setLista((x) => ({ ...x, nombre: e.target.value }))} maxLength={120} placeholder="Nombre (ej. Colegio Belén 3.º primaria)" aria-label="Nombre de la lista" className="min-w-0 flex-1 rounded-control border px-2 py-1.5" />
                <input type="number" min="1" value={lista.esperados} onChange={(e) => setLista((x) => ({ ...x, esperados: e.target.value }))} placeholder="Alumnos" aria-label="Compradores esperados" title="Cuántos compradores espera (para calcular qué comprar)" className="w-24 rounded-control border px-2 py-1.5 text-right" />
              </div>
            )}
          </div>
        )}

        {/* El protagonista: el total */}
        <div className="flex flex-col rounded-superficie bg-green-700 p-5 text-white">
          <div>
            <p className="text-[15px] opacity-80">{esCotizacion ? 'Total cotizado' : 'Total a pagar'}</p>
            <p className="cifra mt-1 break-all text-6xl font-bold leading-none" aria-live="polite">{Q(totales.total)}</p>
          </div>
          <button type="button" disabled={!carrito.length || procesando} onClick={abrirCobro}
            className="mt-6 h-16 w-full rounded-tarjeta bg-white text-xl font-semibold text-green-800 hover:bg-green-50 disabled:opacity-40">
            {esCotizacion ? 'Guardar cotización' : 'Cobrar'} <span className="ml-1 text-sm font-normal opacity-60">F4</span>
          </button>
        </div>

        <div className="flex items-center justify-between gap-2">
          <button type="button" disabled={!carrito.length} onClick={vaciar} className="rounded-control px-3 py-2 text-sm text-gray-600 hover:bg-gray-200 disabled:opacity-40">Vaciar venta <span className="text-xs opacity-60">F8</span></button>
          <BotonPantallaCompleta vista="pos" />
        </div>
        {!esCotizacion && sesion?.caja && <p className="text-center text-xs text-gray-500">{sesion.caja.nombre}</p>}
      </aside>

      {modalAutorizacion}
      {pidiendoVendedor && (
        <PedirVendedor
          titulo={pidiendoVendedor === 'nueva' ? 'Nueva venta' : 'Vendedor de esta venta'}
          onListo={(v) => {
            if (pidiendoVendedor === 'nueva') enCurso.abrir(v)
            else enCurso.setVendedor(v)
            setPidiendoVendedor(null)
            inputRef.current?.focus()
          }}
          onCerrar={() => setPidiendoVendedor(null)}
        />
      )}
      {clienteNuevo !== null && (
        <ClienteRapido inicial={clienteNuevo} onCerrar={() => setClienteNuevo(null)}
          onCreado={(c) => { setClienteNuevo(null); elegirCliente(c) }} />
      )}
      {leyendoLista && <LeerLista onCerrar={() => setLeyendoLista(false)} onAgregar={agregarLista} />}
      {porConseguir && <PorConseguir onCerrar={() => setPorConseguir(false)} onCreado={(p) => { setPorConseguir(false); agregar({ ...p, existencia: 0 }) }} />}
      {ficha && <FichaProducto producto={ficha} esCotizacion={esCotizacion} enCarrito={carrito.find((l) => l.productoId === ficha.id)?.cantidad ?? 0} onCerrar={() => setFicha(null)} onAgregar={agregarDesdeFicha} />}
      {noEncontrado && (
        <ProductoNoEncontrado codigo={noEncontrado} puedeCrear={puede('productos.crear')}
          onCorregir={() => { setNoEncontrado(null); setBusqueda(noEncontrado); setTimeout(() => inputRef.current?.select(), 0) }}
          onCreado={(p) => {
            setNoEncontrado(null)
            setBusqueda('')
            showToast({ type: 'success', message: `"${p.nombre}" creado${esCotizacion ? '' : '. Registre su ingreso en Compras para poder venderlo'}` })
            if (esCotizacion) agregar({ ...p, existencia: 0, descuentoMaximo: 0 })
          }} />
      )}

      {compartiendo && ultima && <EnviarDocumento venta={ultima} onCerrar={() => setCompartiendo(false)} />}

      {/* ═══════════ Cobro ═══════════ */}
      {cobro.montado && (
        <div className={`mac-fondo ${cobro.saliendo ? 'saliendo' : ''} fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4`} role="dialog" aria-modal="true" aria-labelledby="titulo-cobro">
          <div className={`mac-emergente ${cobro.saliendo ? 'saliendo' : ''} w-full max-w-xl rounded-t-superficie bg-gray-100 sm:rounded-superficie`}>
            <div className="rounded-t-superficie bg-green-700 px-6 py-5 text-white">
              <p id="titulo-cobro" className="text-[15px] opacity-80">Cobrar</p>
              <p className="cifra text-5xl font-bold">{Q(totales.total)}</p>
            </div>
            <div className="space-y-4 p-5">
              <div className="space-y-2">
                {pagos.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-tarjeta bg-white p-2">
                    <div className="flex rounded-control bg-gray-100 p-0.5 text-sm" role="radiogroup" aria-label="Medio de pago">
                      {MEDIOS.map((m) => (
                        <button key={m.id} type="button" role="radio" aria-checked={p.medioPago === m.id} onClick={() => setPagos((ps) => ps.map((x, j) => (j === i ? { ...x, medioPago: m.id } : x)))}
                          className={`rounded-[6px] px-2.5 py-1.5 ${p.medioPago === m.id ? 'bg-white font-medium shadow-sm' : 'text-gray-600'}`}>{m.label}</button>
                      ))}
                    </div>
                    <input type="number" step="0.01" min="0" autoFocus={i === 0} value={p.monto} onChange={(e) => setPagos((ps) => ps.map((x, j) => (j === i ? { ...x, monto: e.target.value } : x)))} className="cifra min-w-0 flex-1 rounded-control border px-3 py-2 text-right text-lg" aria-label="Monto" />
                    {pagos.length > 1 && <button type="button" aria-label="Quitar pago" onClick={() => setPagos((ps) => ps.filter((_, j) => j !== i))} className="p-1 text-gray-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>}
                    {p.medioPago !== 'EFECTIVO' && (
                      <input placeholder="Autorización" value={p.referencia} onChange={(e) => setPagos((ps) => ps.map((x, j) => (j === i ? { ...x, referencia: e.target.value } : x)))} className="w-28 rounded-control border px-2 py-2 text-sm" aria-label="Autorización o referencia" />
                    )}
                  </div>
                ))}
              </div>

              {/* Montos rápidos para el efectivo */}
              {pagos[0]?.medioPago === 'EFECTIVO' && (
                <div className="flex flex-wrap gap-2">
                  {montosRapidos(totales.total).map((m) => (
                    <button key={m} type="button" onClick={() => setPagos((ps) => ps.map((x, j) => (j === 0 ? { ...x, monto: m.toFixed(2) } : x)))}
                      className="cifra rounded-full bg-white px-4 py-2 text-[15px] font-medium hover:bg-green-50">{m === totales.total ? 'Exacto' : Q(m)}</button>
                  ))}
                </div>
              )}
              <button type="button" className="text-sm text-green-700 hover:underline" onClick={() => setPagos((ps) => [...ps, { medioPago: 'TARJETA', monto: r2(Math.max(0, totales.total - pagado)).toFixed(2), referencia: '' }])}>
                Dividir el pago con otro medio
              </button>

              <label className="flex items-center gap-2 rounded-tarjeta bg-white px-3 py-2.5 text-[15px]">
                <input type="checkbox" checked={emitirFel} onChange={(e) => setEmitirFel(e.target.checked)} />
                Emitir factura electrónica (FEL)
              </label>
              <label className="flex items-center gap-2 rounded-tarjeta bg-white px-3 py-2.5 text-[15px]">
                <input type="checkbox" checked={imprimir} onChange={(e) => { setImprimir(e.target.checked); imprimirAlCobrar.guardar(e.target.checked) }} />
                Imprimir ticket
                <span className="text-xs text-gray-500">(se recuerda en esta caja)</span>
              </label>

              <div className="flex items-end justify-between rounded-tarjeta bg-white px-4 py-3">
                <div><p className="text-sm text-gray-500">Recibido</p><p className="cifra text-xl font-semibold">{Q(pagado)}</p></div>
                <div className="text-right">
                  <p className="text-sm text-gray-500">{pagado < totales.total ? 'Falta' : 'Cambio'}</p>
                  <p className={`cifra text-4xl font-bold ${pagado < totales.total ? 'text-red-600' : ''}`}>{Q(pagado < totales.total ? totales.total - pagado : cambio)}</p>
                </div>
              </div>

              <div className="flex gap-2">
                <button type="button" onClick={() => setCobrando(false)} className="h-14 flex-1 rounded-tarjeta bg-white text-[17px]">Volver</button>
                <button type="button" disabled={procesando || pagado < totales.total} onClick={confirmar} className="h-14 flex-[2] rounded-tarjeta bg-green-600 text-[17px] font-semibold text-white disabled:opacity-40">
                  {procesando ? 'Registrando…' : 'Confirmar venta'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** Montos rápidos de efectivo: exacto y los billetes más probables. */
function montosRapidos(total) {
  const opciones = [total]
  for (const base of [5, 10, 20, 50, 100, 200]) {
    const m = Math.ceil(total / base) * base
    if (m > total && !opciones.includes(m)) opciones.push(m)
  }
  return opciones.slice(0, 5)
}

/** Foto pequeña del producto (o sus iniciales). */
function MiniFoto({ p, grande }) {
  const src = p.imagenId ? `${import.meta.env.VITE_API_URL}/archivos/publico/${p.imagenId}` : null
  const clase = grande ? 'h-20 w-full' : 'h-11 w-11 shrink-0 rounded-control'
  if (src) return <img src={src} alt="" loading="lazy" className={`${clase} object-cover`} />
  const ini = (p.nombre ?? '').split(' ').filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase()
  return <span className={`${clase} flex items-center justify-center bg-green-50 text-sm font-semibold text-green-700`} aria-hidden>{ini}</span>
}


/** Pide el código del vendedor (código de empleado o usuario) y lo valida en el API. */
function PedirVendedor({ titulo, onListo, onCerrar }) {
  const [codigo, setCodigo] = useState('')
  const [error, setError] = useState('')
  const [validando, setValidando] = useState(false)
  const validar = async (e) => {
    e.preventDefault()
    if (!codigo.trim()) return onListo(null) // vacío = el usuario en sesión
    setValidando(true)
    setError('')
    try {
      const { data } = await api.get(`/ventas/vendedores/${encodeURIComponent(codigo.trim())}`)
      onListo(data.data)
    } catch (err) {
      setError(errorApi(err).mensaje)
    } finally { setValidando(false) }
  }
  return (
    <Modal abierto titulo={titulo} onCerrar={onCerrar} ancho="max-w-sm">
      <form onSubmit={validar}>
        <label htmlFor="cod-vendedor" className="block text-sm">Código del vendedor</label>
        <input id="cod-vendedor" autoFocus value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Ej. V001 o su usuario" className="mt-1 w-full rounded-lg border px-3 py-2 uppercase" />
        <p className="mt-1 text-xs text-gray-500">Déjelo vacío para registrar la venta a su nombre.</p>
        {error && <p className="mt-2 text-sm text-red-600" role="alert">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCerrar} className="rounded-lg border px-3 py-2">Cancelar</button>
          <button disabled={validando} className="rounded-lg bg-green-700 px-4 py-2 text-white disabled:opacity-50">{validando ? 'Validando…' : 'Continuar'}</button>
        </div>
      </form>
    </Modal>
  )
}
