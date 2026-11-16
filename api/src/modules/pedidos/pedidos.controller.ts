import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Contexto, Permisos } from '../../common/auth/decoradores';
import { Ctx } from '../../common/auth/tipos';
import { PedidosService } from './pedidos.service';

/** QUÉ COMPRAR Y PEDIDOS A PROVEEDORES (sucursal de trabajo). */
@Controller('pedidos')
export class PedidosController {
  constructor(private readonly pedidos: PedidosService) {}

  @Post('por-conseguir') @Permisos('ventas.cotizar') porConseguir(@Contexto() ctx: Ctx, @Body() b: unknown) { return this.pedidos.crearPorConseguir(ctx, b); }
  @Get('sugerido') @Permisos('compras.ver') sugerido(@Contexto() ctx: Ctx, @Query() q: unknown) { return this.pedidos.sugerido(ctx, q); }
  @Put('proveedor-producto') @Permisos('compras.crear') elegir(@Contexto() ctx: Ctx, @Body() b: unknown) { return this.pedidos.elegirProveedor(ctx, b); }
  @Post() @Permisos('compras.crear') crear(@Contexto() ctx: Ctx, @Body() b: unknown) { return this.pedidos.crear(ctx, b); }
  @Get('pdf')
  @Permisos('compras.ver')
  async pdfConsolidado(@Contexto() ctx: Ctx, @Query() q: unknown, @Res() res: Response) {
    const { buffer, nombre } = await this.pedidos.pdfConsolidado(ctx, q);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Length': String(buffer.length), 'Content-Disposition': `inline; filename="${nombre}"`, 'Cache-Control': 'no-store' });
    res.end(buffer);
  }
  @Put(':id/recepcion') @Permisos('compras.crear') recibir(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Body() b: unknown) { return this.pedidos.recibir(ctx, id, b); }
  @Get() @Permisos('compras.ver') listar(@Contexto() ctx: Ctx, @Query() q: unknown) { return this.pedidos.listar(ctx, q); }
  @Get(':id') @Permisos('compras.ver') detalle(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number) { return this.pedidos.detalle(ctx, id); }
  @Put(':id/estado') @Permisos('compras.crear') estado(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Body() b: unknown) { return this.pedidos.cambiarEstado(ctx, id, b); }

  @Get(':id/pdf')
  @Permisos('compras.ver')
  async pdf(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const { buffer, nombre, mime, mensajes } = await this.pedidos.pdf(ctx, id);
    res.set({ 'Content-Type': mime, 'Content-Length': String(buffer.length), 'Content-Disposition': `inline; filename="${nombre}"; filename*=UTF-8''${encodeURIComponent(nombre)}`, 'Cache-Control': 'no-store',
      // Textos listos para WhatsApp y correo (el portal los lee de los encabezados)
      'X-Mensaje-Whatsapp': encodeURIComponent(mensajes.whatsapp), 'X-Mensaje-Asunto': encodeURIComponent(mensajes.asunto), 'X-Mensaje-Cuerpo': encodeURIComponent(mensajes.cuerpo), 'Access-Control-Expose-Headers': 'X-Mensaje-Whatsapp, X-Mensaje-Asunto, X-Mensaje-Cuerpo, Content-Disposition' });
    res.end(buffer);
  }
}
