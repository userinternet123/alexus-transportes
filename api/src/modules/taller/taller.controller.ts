import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Contexto, Permisos } from '../../common/auth/decoradores';
import { Ctx } from '../../common/auth/tipos';
import { TallerService } from './taller.service';

/** TALLER por sede: órdenes de trabajo, repuestos, alertas de mantenimiento y duración de repuestos por marca. */
@ApiTags('taller')
@ApiBearerAuth()
@Controller('taller')
export class TallerController {
  constructor(private readonly taller: TallerService) {}
  @Get('ordenes') @Permisos('mantenimiento.ver') listar(@Contexto() ctx: Ctx, @Query() q: unknown) { return this.taller.listar(ctx, q); }
  @Get('ordenes/:id') @Permisos('mantenimiento.ver') detalle(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number) { return this.taller.detalle(ctx, id); }
  @Post('ordenes') @Permisos('mantenimiento.crear') crear(@Contexto() ctx: Ctx, @Body() b: unknown) { return this.taller.crear(ctx, b); }
  @Put('ordenes/:id') @Permisos('mantenimiento.editar') editar(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Body() b: unknown) { return this.taller.editar(ctx, id, b); }
  @Post('ordenes/:id/repuestos') @Permisos('mantenimiento.editar') agregar(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Body() b: unknown) { return this.taller.agregarRepuesto(ctx, id, b); }
  @Delete('ordenes/:id/repuestos/:linea') @Permisos('mantenimiento.editar') quitar(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Param('linea', ParseIntPipe) linea: number) { return this.taller.quitarRepuesto(ctx, id, linea); }
  @Put('ordenes/:id/estado') @Permisos('mantenimiento.editar') estado(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Body() b: unknown) { return this.taller.cambiarEstado(ctx, id, b); }
  @Get('mantenimiento') @Permisos('mantenimiento.ver') mantenimiento(@Contexto() ctx: Ctx) { return this.taller.mantenimiento(ctx); }
  @Get('repuestos-por-marca') @Permisos('mantenimiento.ver') marcas(@Contexto() ctx: Ctx) { return this.taller.repuestosPorMarca(ctx); }
}
