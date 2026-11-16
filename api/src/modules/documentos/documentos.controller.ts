import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { z } from 'zod';
import { Contexto, Permisos, RequiereSucursal } from '../../common/auth/decoradores';
import { Ctx } from '../../common/auth/tipos';
import { validar } from '../../common/pipes/zod';
import { plantillaZ, TipoDocumento } from './documento.logica';
import { DocumentosService, Formato } from './documentos.service';

const tipoZ = z.enum(['COTIZACION', 'VENTA']);

/** COTIZACIONES Y FACTURAS: diseñar el formato, descargarlas en PDF o Word y preparar el envío por WhatsApp o correo. */
@Controller('documentos')
@RequiereSucursal()
export class DocumentosController {
  constructor(private readonly documentos: DocumentosService) {}

  // ── Diseñador (permiso documentos.configurar) ──
  @Get('vista-previa/:tipo')
  @Permisos('documentos.configurar')
  vistaPrevia(@Param('tipo') tipo: string) { return this.documentos.vistaPrevia(tipoZ.parse(tipo.toUpperCase()) as TipoDocumento); }

  @Post('prueba/:tipo')
  @Permisos('documentos.configurar')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async prueba(@Param('tipo') tipo: string, @Body() body: unknown, @Res() res: Response) {
    const { buffer, nombre, mime } = await this.documentos.pruebaPdf(tipoZ.parse(tipo.toUpperCase()) as TipoDocumento, validar(plantillaZ, body));
    res.set({ 'Content-Type': mime, 'Content-Length': String(buffer.length), 'Content-Disposition': `inline; filename="${nombre}"`, 'Cache-Control': 'no-store' });
    res.end(buffer);
  }

  @Put('plantillas/:tipo')
  @Permisos('documentos.configurar')
  guardar(@Contexto() ctx: Ctx, @Param('tipo') tipo: string, @Body() body: unknown) {
    return this.documentos.guardarPlantilla(ctx, tipoZ.parse(tipo.toUpperCase()) as TipoDocumento, validar(plantillaZ, body));
  }

  @Delete('plantillas/:tipo')
  @Permisos('documentos.configurar')
  restablecer(@Contexto() ctx: Ctx, @Param('tipo') tipo: string) { return this.documentos.restablecer(ctx, tipoZ.parse(tipo.toUpperCase()) as TipoDocumento); }

  // ── Documentos de una venta o cotización (permiso ventas.ver) ──
  @Get('venta/:id/envio')
  @Permisos('ventas.ver')
  envio(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number) { return this.documentos.envio(ctx, id); }

  @Get('venta/:id/:formato')
  @Permisos('ventas.ver')
  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  async descargar(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Param('formato') formato: string, @Res() res: Response) {
    const f = z.enum(['pdf', 'docx']).parse(formato) as Formato;
    const { buffer, nombre, mime } = await this.documentos.renderizar(ctx, id, f);
    res.set({ 'Content-Type': mime, 'Content-Length': String(buffer.length), 'Content-Disposition': `attachment; filename="${nombre}"; filename*=UTF-8''${encodeURIComponent(nombre)}`, 'Cache-Control': 'no-store', 'X-Nombre-Archivo': nombre });
    res.end(buffer);
  }
}
