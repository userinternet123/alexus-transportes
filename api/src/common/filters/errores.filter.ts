import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Injectable, Logger, Optional } from '@nestjs/common';
import { CentralService } from '../../modules/central/central.service';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';

/**
 * Formato único de error (compatible con el portal React, que lee
 * `response.data.error` y `error.message`):
 * { ok: false, codigo, error, message, detalle?, requestId }
 */
@Catch()
@Injectable()
export class ErroresFilter implements ExceptionFilter {
  private readonly log = new Logger('Errores');

  // Opcional: en pruebas o scripts puede no existir el módulo de Central
  constructor(@Optional() private readonly central?: CentralService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { id?: string }>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let codigo = 'ERROR_INTERNO';
    let mensaje = 'Ocurrió un error inesperado. Intente de nuevo.';
    let detalle: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse() as Record<string, unknown> | string;
      if (typeof body === 'string') {
        mensaje = body;
        codigo = HttpStatus[status] ?? 'ERROR';
      } else {
        codigo = (body.codigo as string) ?? HttpStatus[status] ?? 'ERROR';
        mensaje = (body.mensaje as string) ?? (body.message as string) ?? mensaje;
        detalle = body.detalle;
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      ({ status, codigo, mensaje } = this.mapearPrisma(exception));
      detalle = exception.meta;
    } else {
      this.log.error(exception instanceof Error ? exception.stack : String(exception));
    }

    if (status >= 500) {
      this.log.error(`${req.method} ${req.url} -> ${codigo}: ${mensaje}`);
      // Monitoreo: el error técnico (sin datos del cuerpo de la petición) se envía agrupado a ALEXUS Central
      const ruta = `${req.method} ${(req as Request & { route?: { path?: string } }).route?.path ?? req.path}`;
      this.central?.reportarError({
        origen: 'api',
        mensaje: exception instanceof Error ? exception.message : `${codigo}: ${mensaje}`,
        stack: exception instanceof Error ? exception.stack : undefined,
        ruta,
      });
    }

    res.status(status).json({
      ok: false,
      codigo,
      error: mensaje,
      message: mensaje,
      ...(detalle !== undefined ? { detalle } : {}),
      requestId: req.id,
    });
  }

  private mapearPrisma(e: Prisma.PrismaClientKnownRequestError) {
    switch (e.code) {
      case 'P2002':
        return {
          status: HttpStatus.CONFLICT,
          codigo: 'DUPLICADO',
          mensaje: `Ya existe un registro con el mismo valor en: ${String((e.meta?.target as string[] | undefined)?.join(', ') ?? 'campo único')}`,
        };
      case 'P2003':
        return {
          status: HttpStatus.CONFLICT,
          codigo: 'REFERENCIA_INVALIDA',
          mensaje: 'El registro referencia datos inexistentes o está siendo utilizado por otros registros',
        };
      case 'P2025':
        return { status: HttpStatus.NOT_FOUND, codigo: 'NO_ENCONTRADO', mensaje: 'El registro no existe' };
      case 'P2021':
      case 'P2022':
        // Tabla o columna inexistente: el código es más nuevo que la base de datos
        this.log.error(`Base de datos desactualizada (${e.code}): ${JSON.stringify(e.meta)}. Ejecute: npx prisma migrate deploy`);
        return {
          status: HttpStatus.SERVICE_UNAVAILABLE,
          codigo: 'BD_DESACTUALIZADA',
          mensaje: 'La base de datos no tiene todas las actualizaciones. Avise al administrador del sistema para aplicar las migraciones pendientes.',
        };
      case 'P2010': {
        // Consulta SQL directa (reportes, analítica): se registra el error REAL de PostgreSQL para poder corregirlo
        const meta = (e.meta ?? {}) as { code?: string; message?: string };
        this.log.error(`Consulta SQL falló (PostgreSQL ${meta.code ?? '?'}): ${meta.message ?? e.message}`);
        const faltaAlgo = meta.code === '42P01' || meta.code === '42703'; // tabla o columna inexistente
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR, codigo: faltaAlgo ? 'BD_CONSULTA_ESTRUCTURA' : 'BD_CONSULTA',
          mensaje: faltaAlgo ? 'Este reporte no pudo leer la base de datos (falta una tabla o columna). Avise al administrador: puede faltar una migración o haber un error en el reporte.' : 'Error de base de datos',
        };
      }
      case 'P2034':
        return {
          status: HttpStatus.CONFLICT,
          codigo: 'CONCURRENCIA',
          mensaje: 'Otro usuario modificó los mismos datos. Intente de nuevo.',
        };
      default:
        this.log.error(`Prisma ${e.code}: ${e.message.split('\n').slice(-3).join(' ')}`);
        return { status: HttpStatus.INTERNAL_SERVER_ERROR, codigo: `BD_${e.code}`, mensaje: 'Error de base de datos' };
    }
  }
}
