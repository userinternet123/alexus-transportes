// Registro del uso del sistema para mejorar ALEXUS Transportes: solo si el negocio lo aceptó (si no, no hace NADA).
// Se acumula en el navegador y se envía en lotes cada minuto. Solo nombres de pantallas y funciones:
// nunca montos, nombres ni datos de clientes (el servidor además normaliza y descarta lo que no cumpla).
import api from '../services/api'

let activo = false
let cola = []
let reloj = null
const dispositivo = () => (window.innerWidth < 640 ? 'celular' : window.innerWidth < 1024 ? 'tableta' : 'escritorio')

export function activarUso(si) {
  activo = Boolean(si)
  if (!activo) { cola = []; clearInterval(reloj); reloj = null; return }
  if (!reloj) reloj = setInterval(enviarUso, 60_000)
}
// Solo nombres de pantalla o de función (letras minúsculas, números, punto, guion): un texto con nombres o montos
// NI SIQUIERA sale del navegador (el servidor además lo vuelve a filtrar)
const EVENTO_VALIDO = /^(pantalla:\/[a-z0-9/:._-]{0,120}|[a-z][a-z0-9._-]{1,59})$/
export function registrarUso(evento) {
  if (!activo || !evento) return
  const e = String(evento).toLowerCase().startsWith('pantalla:') ? String(evento).toLowerCase() : String(evento)
  if (!EVENTO_VALIDO.test(e)) return
  cola.push({ evento: e, dispositivo: dispositivo() })
  if (cola.length >= 150) enviarUso()
}
/** "/home/ventas/123" → "pantalla:/home/ventas/:id" (sin ids ni búsquedas) */
export const registrarPantalla = (ruta) => registrarUso(`pantalla:${String(ruta).split(/[?#]/)[0].replace(/\/\d+(?=\/|$)/g, '/:id')}`)
export async function enviarUso() {
  if (!activo || !cola.length) return
  const lote = cola.splice(0, 200)
  try { await api.post('/experiencia/uso', { eventos: lote }) } catch { /* sin conexión: se pierde un minuto de conteos; no molesta al usuario */ }
}
export const usoActivo = () => activo
