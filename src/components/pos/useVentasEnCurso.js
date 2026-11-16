// ─────────────────────────────────────────────────────────────────────────────
// VENTAS EN CURSO (varios vendedores en una misma caja)
// Cada pestaña = una venta en proceso con su vendedor, carrito y cliente.
// Se guarda en el navegador (por usuario, sucursal y modo) y sobrevive a
// recargar la página o a que se cierre la sesión, hasta que se guarda en el API.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState } from 'react'

export const CLIENTE_CF = { id: null, nit: 'CF', nombre: 'Consumidor final' }
const nuevaVenta = (vendedor = null) => ({
  id: `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
  vendedor, // { id, nombre, codigo } | null = el usuario en sesión
  carrito: [],
  cliente: CLIENTE_CF,
  creada: Date.now(),
})

function leer(clave) {
  try {
    const e = JSON.parse(localStorage.getItem(clave) || 'null')
    if (e?.ventas?.length) return e
  } catch { /* datos dañados: se ignoran */ }
  const v = nuevaVenta()
  return { activa: v.id, ventas: [v] }
}

export function useVentasEnCurso(clave) {
  const [estado, setEstado] = useState(() => leer(clave))

  // Si cambia usuario/sucursal/modo, se cargan sus ventas en curso
  useEffect(() => { setEstado(leer(clave)) }, [clave])
  useEffect(() => { localStorage.setItem(clave, JSON.stringify(estado)) }, [clave, estado])

  const actual = estado.ventas.find((v) => v.id === estado.activa) ?? estado.ventas[0]

  const actualizar = useCallback((cambio) => {
    setEstado((e) => ({
      ...e,
      ventas: e.ventas.map((v) => (v.id === (e.activa ?? e.ventas[0].id) ? { ...v, ...cambio(v) } : v)),
    }))
  }, [])

  // Setters compatibles con useState (valor o función)
  const setCarrito = useCallback((x) => actualizar((v) => ({ carrito: typeof x === 'function' ? x(v.carrito) : x })), [actualizar])
  const setCliente = useCallback((x) => actualizar((v) => ({ cliente: typeof x === 'function' ? x(v.cliente) : x })), [actualizar])
  const setVendedor = useCallback((vendedor) => actualizar(() => ({ vendedor })), [actualizar])

  const abrir = useCallback((vendedor) => {
    const v = nuevaVenta(vendedor)
    setEstado((e) => ({ activa: v.id, ventas: [...e.ventas, v] }))
  }, [])

  /**
   * Abre una pestaña NUEVA ya llena (p. ej. una cotización que pasa a venta) sin tocar las que están en curso.
   * Si esa cotización ya está abierta en otra pestaña, solo la selecciona (no se convierte dos veces).
   */
  const abrirCon = useCallback(({ carrito = [], cliente = CLIENTE_CF, vendedor = null, cotizacion = null }) => {
    setEstado((e) => {
      const ya = cotizacion && e.ventas.find((v) => v.cotizacion?.id === cotizacion.id)
      if (ya) return { ...e, activa: ya.id }
      const v = { ...nuevaVenta(vendedor), carrito, cliente, cotizacion }
      return { activa: v.id, ventas: [...e.ventas, v] }
    })
  }, [])

  const seleccionar = useCallback((id) => setEstado((e) => ({ ...e, activa: id })), [])

  /** Descarta una venta en curso (o la vacía si es la única). */
  const cerrar = useCallback((id) => {
    setEstado((e) => {
      const resto = e.ventas.filter((v) => v.id !== id)
      if (!resto.length) {
        const v = nuevaVenta(e.ventas.find((x) => x.id === id)?.vendedor ?? null)
        return { activa: v.id, ventas: [v] }
      }
      return { activa: e.activa === id ? resto[resto.length - 1].id : e.activa, ventas: resto }
    })
  }, [])

  return useMemo(() => ({
    ventas: estado.ventas, actual, carrito: actual.carrito, cliente: actual.cliente, vendedor: actual.vendedor, cotizacion: actual.cotizacion ?? null,
    setCarrito, setCliente, setVendedor, abrir, abrirCon, seleccionar, cerrar,
  }), [estado.ventas, actual, setCarrito, setCliente, setVendedor, abrir, abrirCon, seleccionar, cerrar])
}
