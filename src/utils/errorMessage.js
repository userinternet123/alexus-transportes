export const CONTROLLED_ERRORS = {
  200: {
    title: 'Solicitud realizada con éxito',
    message: 'Consulta realizada con éxito.',
  },
  400: {
    title: 'Solicitud incorrecta',
    message: 'Los datos no son válidos.',
  },

  401: {
    title: 'Usuario No autorizado',
    message: 'No tienes permisos para realizar esta acción.',
  },

  404: {
    title: 'No encontrado',
    message: 'No se encontró información con los datos ingresados.',
  },

  500: {
    title: 'Error interno',
    message: 'Ocurrió un error en el servicio. Intenta nuevamente.',
  },
}

export function getControlledError(statusCode) {
  return (
    CONTROLLED_ERRORS[statusCode] || {
      title: 'Error desconocido',
      message: 'Ocurrió un error inesperado.',
    }
  )
}
