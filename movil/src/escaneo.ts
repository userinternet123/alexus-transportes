// Comunicación simple entre la pantalla del escáner y quien la abrió.
type Oyente = (codigo: string) => void
let oyente: Oyente | null = null
export const esperarCodigo = (fn: Oyente) => { oyente = fn }
export const entregarCodigo = (codigo: string) => { oyente?.(codigo); oyente = null }
