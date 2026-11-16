// Validación de un formulario con estado propio (pantallas que no usan el motor de formularios JSON):
//   const v = useValidacion(CAMPOS)
//   const { ok, valores } = v.validar(f)   // marca lo que falta, lleva el cursor al primero y devuelve los datos ya normalizados
//   v.error('nit') · v.props('nit') · v.alCambiar('nit') · v.alSalir('nit', f) · v.delServidor(error)
import { useCallback, useMemo, useState } from 'react'
import { enfocarCampo, erroresDelServidor, normalizarValores, validarCampo, validarCampos } from '../utils/validacion'

const sin = (obj, clave) => { if (!(clave in obj)) return obj; const c = { ...obj }; delete c[clave]; return c }

export function useValidacion(campos, { visible } = {}) {
  const [errores, setErrores] = useState({})
  const [lista, setLista] = useState([])
  const [intento, setIntento] = useState(false)
  const porNombre = useMemo(() => new Map(campos.map((c) => [c.name, c])), [campos])

  const validar = useCallback((valores) => {
    const r = validarCampos(campos, valores, { visible })
    setErrores(r.errores); setLista(r.lista); setIntento(true)
    if (!r.ok) enfocarCampo(r.primero)
    return { ok: r.ok, valores: r.ok ? normalizarValores(campos, valores) : valores, lista: r.lista }
  }, [campos, visible])

  /** Al escribir: el aviso de ese campo desaparece (se vuelve a revisar al enviar). */
  const alCambiar = useCallback((nombre) => {
    setErrores((p) => sin(p, nombre))
    setLista((p) => (p.some((e) => e.name === nombre) ? p.filter((e) => e.name !== nombre) : p))
  }, [])

  /** Al salir del campo: si ya se intentó enviar, se revisa ese campo para corregirlo sin esperar al botón. */
  const alSalir = useCallback((nombre, valores) => {
    if (!intento) return
    const c = porNombre.get(nombre)
    if (!c) return
    const m = validarCampo(c, valores?.[nombre])
    setErrores((p) => (m ? { ...p, [nombre]: m } : sin(p, nombre)))
    setLista((p) => (m ? [...p.filter((e) => e.name !== nombre), { name: nombre, label: c.label || nombre, mensaje: m }] : p.filter((e) => e.name !== nombre)))
  }, [intento, porNombre])

  /** Reparte bajo cada campo lo que el servidor rechazó. Devuelve true si pudo (para no repetir el aviso general). */
  const delServidor = useCallback((error) => {
    const det = erroresDelServidor(error)
    const nombres = Object.keys(det).filter((n) => porNombre.has(n))
    if (!nombres.length) return false
    setErrores(Object.fromEntries(nombres.map((n) => [n, det[n]])))
    setLista(nombres.map((n) => ({ name: n, label: porNombre.get(n).label || n, mensaje: det[n] })))
    enfocarCampo(nombres[0])
    return true
  }, [porNombre])

  const limpiar = useCallback(() => { setErrores({}); setLista([]); setIntento(false) }, [])
  const error = useCallback((n) => errores[n], [errores])
  const props = useCallback((n) => ({ id: n, name: n, 'aria-invalid': errores[n] ? true : undefined, 'aria-describedby': errores[n] ? `${n}-error` : undefined }), [errores])
  return { errores, lista, error, props, validar, alCambiar, alSalir, delServidor, limpiar }
}
