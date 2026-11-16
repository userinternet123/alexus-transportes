import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Errores de dominio con código estable. El front puede reaccionar por
 * `codigo` (ej. CAJA_CERRADA -> abrir modal de apertura de caja).
 */
export class ErrorDominio extends HttpException {
  constructor(
    readonly codigo: string,
    mensaje: string,
    status: HttpStatus = HttpStatus.UNPROCESSABLE_ENTITY,
    readonly detalle?: unknown,
  ) {
    super({ codigo, mensaje, detalle }, status);
    this.message = mensaje;
  }
}

export const reglaNegocio = (codigo: string, mensaje: string, detalle?: unknown) =>
  new ErrorDominio(codigo, mensaje, HttpStatus.UNPROCESSABLE_ENTITY, detalle);

export const noEncontrado = (entidad: string, id?: unknown) =>
  new ErrorDominio('NO_ENCONTRADO', `${entidad}${id != null ? ` #${String(id)}` : ''} no existe`, HttpStatus.NOT_FOUND);

export const conflicto = (codigo: string, mensaje: string) =>
  new ErrorDominio(codigo, mensaje, HttpStatus.CONFLICT);

export const prohibido = (mensaje = 'No tiene permiso para realizar esta acción') =>
  new ErrorDominio('PROHIBIDO', mensaje, HttpStatus.FORBIDDEN);
