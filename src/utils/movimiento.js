// Preferencia de animaciones de este equipo: "auto" sigue al sistema (reducir movimiento / ahorro de batería),
// "completo" las muestra siempre y "reducido" usa solo desvanecidos cortos. Se guarda en este navegador.
const CLAVE = 'spvi-movimiento'
export const OPCIONES_MOVIMIENTO = [{ id: 'auto', nombre: 'Según el equipo' }, { id: 'completo', nombre: 'Siempre' }, { id: 'reducido', nombre: 'Reducidas' }]

export function leerMovimiento() {
  try { const v = localStorage.getItem(CLAVE); return v === 'completo' || v === 'reducido' ? v : 'auto' } catch { return 'auto' }
}
export function aplicarMovimiento(valor = leerMovimiento()) {
  const v = valor === 'completo' || valor === 'reducido' ? valor : 'auto'
  if (v === 'auto') delete document.documentElement.dataset.movimiento
  else document.documentElement.dataset.movimiento = v
  try { if (v === 'auto') localStorage.removeItem(CLAVE); else localStorage.setItem(CLAVE, v) } catch { /* modo privado */ }
  return v
}
/** ¿Hay que usar animaciones reducidas ahora? (preferencia del usuario, o la del sistema si es "auto") */
export function movimientoReducido() {
  if (typeof document === 'undefined') return false
  const m = document.documentElement.dataset.movimiento
  if (m === 'completo') return false
  if (m === 'reducido') return true
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}
