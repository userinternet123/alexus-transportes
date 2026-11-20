// Textos de la app (los mismos códigos que el API).
export const EVENTOS: { valor: string; texto: string; icono: string }[] = [
  { valor: 'SALIDA', texto: 'Salí', icono: 'navigate' },
  { valor: 'LLEGADA_CARGA', texto: 'Llegué a cargar', icono: 'flag' },
  { valor: 'CARGANDO', texto: 'Cargando', icono: 'cube' },
  { valor: 'EN_RUTA', texto: 'En ruta', icono: 'car' },
  { valor: 'EN_COLA', texto: 'En cola', icono: 'hourglass' },
  { valor: 'ADUANA', texto: 'En aduana', icono: 'document-text' },
  { valor: 'PARADA', texto: 'Parada', icono: 'cafe' },
  { valor: 'LLEGADA_DESTINO', texto: 'Llegué al destino', icono: 'location' },
  { valor: 'DESCARGANDO', texto: 'Descargando', icono: 'download' },
  { valor: 'ENTREGADO', texto: 'Entregué', icono: 'checkmark-done' },
  { valor: 'INCIDENTE', texto: 'Incidente', icono: 'warning' },
  { valor: 'NOTA', texto: 'Nota', icono: 'chatbox-ellipses' },
]
export const textoEvento = (v: string) => EVENTOS.find((e) => e.valor === v)?.texto ?? v

export const TIPOS_GASTO: { valor: string; texto: string }[] = [
  { valor: 'PEAJE', texto: 'Peaje' }, { valor: 'VIATICO', texto: 'Comida u hospedaje' }, { valor: 'PARQUEO', texto: 'Parqueo' },
  { valor: 'CARGA_DESCARGA', texto: 'Carga o descarga' }, { valor: 'REPARACION_EN_RUTA', texto: 'Reparación en ruta' }, { valor: 'MULTA', texto: 'Multa' }, { valor: 'OTRO', texto: 'Otro' },
]
export const PRIORIDADES: { valor: string; texto: string; color: string }[] = [
  { valor: 'URGENTE', texto: 'Urgente', color: '#D70015' }, { valor: 'ALTA', texto: 'Alta', color: '#B25000' },
  { valor: 'MODERADA', texto: 'Moderada', color: '#0060C0' }, { valor: 'BAJA', texto: 'Baja', color: '#6E6E73' },
]
export const TIPOS_CASO: { valor: string; texto: string }[] = [
  { valor: 'MECANICO', texto: 'Mecánico' }, { valor: 'LLANTAS', texto: 'Llantas' }, { valor: 'SEGURIDAD', texto: 'Seguridad' },
  { valor: 'DOCUMENTOS', texto: 'Documentos' }, { valor: 'CARGA', texto: 'Carga' }, { valor: 'OTRO', texto: 'Otro' },
]
export const ESTADO_VIAJE: Record<string, string> = { PROGRAMADO: 'Programado', EN_RUTA: 'En ruta', FINALIZADO: 'Por liquidar' }
