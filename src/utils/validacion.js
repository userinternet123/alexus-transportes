// ─────────────────────────────────────────────────────────────────────────────
// VALIDACIÓN DE FORMULARIOS (única para todo el portal).
// Revisa ANTES de enviar: obligatorios (aunque el campo nunca se haya tocado), formato (NIT, DPI, correo,
// teléfono, números, fechas) y límites. Además NORMALIZA lo que se envía (por ejemplo el DPI sin espacios y el
// NIT sin guiones), porque el servidor exige esas formas exactas. Las reglas de NIT, DPI y correo son las mismas
// del servidor (catalogos.definiciones.ts): lo que aquí se acepta, allá no se rechaza.
// ─────────────────────────────────────────────────────────────────────────────

export const esVacio = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0)
export const soloDigitos = (v) => String(v ?? '').replace(/\D/g, '')

// ── NIT ──
/** "1234567-8" → "12345678"; "c/f", "C.F." → "CF"; solo letras y números, en mayúsculas. */
export const normalizarNit = (v) => String(v ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '')

export function validarNit(valor, { permiteCF = true, requerido = true } = {}) {
  const n = normalizarNit(valor)
  if (!n) return requerido ? `Escriba el NIT${permiteCF ? ', o CF si no tiene' : ''}` : null
  if (n === 'CF') return permiteCF ? null : 'Aquí se necesita un NIT: CF no es válido'
  if (!/^[0-9]+K?$/.test(n)) return 'NIT no válido: solo números y una K al final (ej. 1234567K o 1234567-8)'
  if (n.replace('K', '').length < 2) return 'El NIT es demasiado corto'
  if (n.length > 13) return 'El NIT es demasiado largo'
  return null
}

// ── DPI / CUI ──
export function validarCui(valor) {
  const crudo = String(valor ?? '')
  if (/[^\d\s-]/.test(crudo)) return 'El DPI solo lleva números'
  const d = soloDigitos(crudo)
  return d.length === 13 ? null : `El DPI debe tener 13 dígitos (lleva ${d.length})`
}

// ── Correo y teléfono ──
export const validarEmail = (valor) => (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(valor ?? '').trim()) ? null : 'Correo no válido (ej. nombre@correo.com)')
export function validarTelefono(valor) {
  const t = String(valor ?? '').trim()
  if (soloDigitos(t).length < 8) return 'Teléfono no válido: escriba 8 dígitos (ej. 5555-1234)'
  if (t.length > 20 || /[A-Za-z]/.test(t)) return 'Teléfono no válido: máximo 20 caracteres y sin letras'
  return null
}

// ── Números: acepta lo que escribe la máscara de moneda ("Q. 1,250.50") ──
export function numeroDe(v) {
  if (typeof v === 'number') return v
  const t = String(v ?? '').replace(/^Q\.?\s*/i, '').replace(/[,\s]/g, '')
  return t === '' ? NaN : Number(t)
}
export function validarNumero(valor, { min = null, max = null, entero = false } = {}) {
  const n = numeroDe(valor)
  if (!Number.isFinite(n)) return 'Escriba un número válido'
  if (entero && !Number.isInteger(n)) return 'Debe ser un número entero'
  if (min !== null && n < min) return min === 0 ? 'No puede ser negativo' : `Debe ser ${min} o más`
  if (max !== null && n > max) return `No puede ser mayor que ${max}`
  return null
}

// ── Fechas: "2026-11-04" o "04/11/2026", y que exista en el calendario ──
export function validarFecha(valor) {
  const t = String(valor ?? '').trim()
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t) || (() => { const x = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t); return x && [t, x[3], x[2], x[1]] })()
  if (!m) return 'Fecha no válida (ej. 04/11/2026)'
  const [y, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const f = new Date(Date.UTC(y, mes - 1, d))
  return f.getUTCFullYear() === y && f.getUTCMonth() === mes - 1 && f.getUTCDate() === d ? null : 'Esa fecha no existe en el calendario'
}

// ── Qué formato tiene un campo ──
/** Explícito (`formato` en el JSON) o deducido de la máscara y del nombre. */
export function formatoDe(campo) {
  if (campo?.formato) return campo.formato
  const mask = campo?.mask
  if (mask === 'dpi') return 'cui'
  if (mask === 'phone' || mask === 'phone-int') return 'telefono'
  if (mask === 'email') return 'email'
  const n = String(campo?.name ?? '')
  if (n === 'nit' || /^nit[A-Z]/.test(n) || /[a-z]Nit$/.test(n)) return 'nit'
  if (n === 'cui' || n === 'dpi') return 'cui'
  if (n === 'email' || n === 'correo') return 'email'
  if (n === 'telefono' || n === 'celular') return 'telefono'
  return null
}
const esNumerico = (c) => c?.type === 'money' || c?.type === 'number' || c?.mask === 'money' || c?.mask === 'number'

/** Primer problema de UN campo, o null si está bien. `obligatorio` lo exige aunque el campo no lo marque. */
export function validarCampo(campo, valorOriginal, { obligatorio = false } = {}) {
  if (!campo || campo.type === 'button' || campo.type === 'label') return null
  // Un campo de moneda con solo el prefijo "Q." (se escribe al enfocarlo) está vacío
  const valor = esNumerico(campo) && typeof valorOriginal === 'string' && /^Q\.?\s*$/i.test(valorOriginal.trim()) ? '' : valorOriginal
  if (campo.readOnly || campo.disabled) return null // lo que la persona no puede escribir no se le exige
  const requerido = Boolean(campo.required) || obligatorio
  const formato = formatoDe(campo)

  if (campo.type === 'checkbox') return requerido && valor !== true && valor !== 'true' ? 'Debe marcar esta casilla' : null
  if (esVacio(valor)) {
    if (!requerido) return null
    if (campo.mensajeObligatorio) return campo.mensajeObligatorio
    if (formato === 'nit') return validarNit('', { permiteCF: campo.permiteCF !== false })
    if (campo.type === 'select' || campo.optionsUrl || Array.isArray(campo.options)) return 'Elija una opción'
    return 'Este campo es obligatorio'
  }

  if (formato === 'nit') return validarNit(valor, { permiteCF: campo.permiteCF !== false })
  if (formato === 'cui') return validarCui(valor)
  if (formato === 'email') return validarEmail(valor)
  if (formato === 'telefono') return validarTelefono(valor)
  if (campo.type === 'date') return validarFecha(valor)
  if (esNumerico(campo)) {
    const min = campo.min ?? (campo.type === 'money' || campo.mask === 'money' ? 0 : null)
    return validarNumero(valor, { min, max: campo.max ?? null, entero: campo.entero === true })
  }
  const texto = String(valor)
  if (campo.minLength && texto.trim().length < campo.minLength) return `Escriba al menos ${campo.minLength} caracteres`
  if (campo.maxLength && texto.length > campo.maxLength) return `No puede pasar de ${campo.maxLength} caracteres`
  if (campo.pattern && !new RegExp(campo.pattern).test(texto)) return campo.patternMensaje || 'El formato no es válido'
  return null
}

// ── Varios campos ──
/** Acepta secciones ({ fields }), una lista plana de campos o el objeto de configuración ({ section }). */
export function aplanar(entrada) {
  if (!entrada) return []
  if (Array.isArray(entrada)) return entrada.flatMap((x) => (x?.fields ? x.fields : [x])).filter(Boolean)
  if (entrada.section) return aplanar(entrada.section)
  return []
}

/**
 * Revisa todos los campos visibles. `visible(campo, valores)` decide si un campo está a la vista (visibleWhen).
 * `obligatorios`: nombres que el botón exige aunque el campo no los marque.
 * → { ok, errores: { nombre: mensaje }, lista: [{ name, label, mensaje }], primero }
 */
export function validarCampos(entrada, valores, { visible, obligatorios = [] } = {}) {
  const errores = {}
  const lista = []
  for (const c of aplanar(entrada)) {
    if (!c?.name) continue
    if (visible && !visible(c, valores)) continue
    const mensaje = validarCampo(c, valores?.[c.name], { obligatorio: obligatorios.includes(c.name) })
    if (mensaje) { errores[c.name] = mensaje; lista.push({ name: c.name, label: c.label || c.name, mensaje }) }
  }
  return { ok: lista.length === 0, errores, lista, primero: lista[0]?.name ?? null }
}

/** Copia de los valores en la forma que espera el servidor: sin espacios sobrantes, NIT y DPI limpios, correo en minúsculas. */
export function normalizarValores(entrada, valores) {
  const salida = { ...valores }
  for (const c of aplanar(entrada)) {
    const v = salida[c?.name]
    if (typeof v !== 'string') continue
    const f = formatoDe(c)
    if (f === 'nit') salida[c.name] = normalizarNit(v)
    else if (f === 'cui') salida[c.name] = soloDigitos(v)
    else if (f === 'email') salida[c.name] = v.trim().toLowerCase()
    else salida[c.name] = v.trim()
  }
  return salida
}

// ── Errores que devuelve el servidor: se reparten bajo cada campo ──
const TRADUCCIONES = [
  [/^Required$/i, () => 'Este campo es obligatorio'],
  [/Invalid email/i, () => 'Correo no válido'],
  [/Expected (number|integer).*received (nan|string)|received nan/i, () => 'Escriba un número válido'],
  [/Expected boolean/i, () => 'Valor no válido'],
  [/Invalid enum value/i, () => 'Elija una de las opciones'],
  [/String must contain at least (\d+)/i, (m) => `Escriba al menos ${m[1]} caracteres`],
  [/String must contain at most (\d+)/i, (m) => `No puede pasar de ${m[1]} caracteres`],
  [/Number must be greater than or equal to (.+)/i, (m) => `Debe ser ${m[1]} o más`],
]
const traducir = (t) => { for (const [re, f] of TRADUCCIONES) { const m = re.exec(t); if (m) return f(m) } return t }

/** Acepta un error de axios, la respuesta ({ data }) o el cuerpo del error. Devuelve { campo: mensaje } (vacío si no hay detalle por campo). */
export function erroresDelServidor(entrada) {
  const cuerpo = entrada?.response?.data ?? entrada?.data ?? entrada
  const det = cuerpo?.detalle
  if (!det || typeof det !== 'object' || Array.isArray(det)) return {}
  const salida = {}
  for (const [campo, m] of Object.entries(det)) {
    const texto = Array.isArray(m) ? m.find((x) => typeof x === 'string') : typeof m === 'string' ? m : null
    if (texto) salida[campo] = traducir(texto)
  }
  return salida
}

/** Lleva el cursor al campo con problema y lo muestra en pantalla (los campos usan su nombre como id). */
export function enfocarCampo(nombre) {
  if (typeof document === 'undefined' || !nombre) return
  const el = document.getElementById(nombre) ?? document.querySelector(`[name="${nombre}"]`)
  if (!el) return
  try { el.focus({ preventScroll: true }) } catch { /* sin foco */ }
  el.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
}
