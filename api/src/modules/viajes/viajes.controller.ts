import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { Contexto, Permisos } from '../../common/auth/decoradores';
import { Ctx } from '../../common/auth/tipos';
import { CotizadorService } from './cotizador.service';
import { ViajesService } from './viajes.service';

/** VIAJES: programar → en ruta → finalizar → liquidar, con sus costos; cotizador. */
@Controller('viajes')
export class ViajesController {
  constructor(private readonly viajes: ViajesService, private readonly cotizador: CotizadorService) {}

  @Get('opciones') @Permisos('viajes.ver') opciones(@Contexto() ctx: Ctx) { return this.viajes.opciones(ctx); }
  @Post('cotizar') @Permisos('viajes.cotizar') cotizar(@Contexto() ctx: Ctx, @Body() b: unknown) { return this.cotizador.cotizar(ctx, b); }
  @Get() @Permisos('viajes.ver') listar(@Contexto() ctx: Ctx, @Query() q: unknown) { return this.viajes.listar(ctx, q); }
  @Get(':id') @Permisos('viajes.ver') detalle(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number) { return this.viajes.detalle(ctx, id); }
  @Post() @Permisos('viajes.crear') programar(@Contexto() ctx: Ctx, @Body() b: unknown) { return this.viajes.programar(ctx, b); }
  @Put(':id') @Permisos('viajes.editar') editar(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Body() b: unknown) { return this.viajes.editar(ctx, id, b); }
  @Put(':id/iniciar') @Permisos('viajes.crear') iniciar(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Body() b: unknown) { return this.viajes.iniciar(ctx, id, b); }
  @Put(':id/finalizar') @Permisos('viajes.cerrar') finalizar(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Body() b: unknown) { return this.viajes.finalizar(ctx, id, b); }
  @Put(':id/liquidar') @Permisos('viajes.liquidar') liquidar(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Body() b: unknown) { return this.viajes.liquidar(ctx, id, b); }
  @Put(':id/cancelar') @Permisos('viajes.anular') cancelar(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Body() b: unknown) { return this.viajes.cancelar(ctx, id, b); }
  @Post(':id/costos') @Permisos('viajes.editar') agregarCosto(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Body() b: unknown) { return this.viajes.agregarCosto(ctx, id, b); }
  @Delete(':id/costos/:costoId') @Permisos('viajes.editar') quitarCosto(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Param('costoId', ParseIntPipe) costoId: number) { return this.viajes.quitarCosto(ctx, id, costoId); }
}
