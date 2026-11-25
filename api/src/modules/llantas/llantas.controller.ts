import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Contexto, Permisos } from '../../common/auth/decoradores';
import { Ctx } from '../../common/auth/tipos';
import { LlantasService } from './llantas.service';

/** CONTROL DE LLANTAS: posiciones, montajes, rotaciones, mediciones, reencauches y rendimiento por marca. */
@ApiTags('llantas')
@ApiBearerAuth()
@Controller('llantas-control')
export class LlantasController {
  constructor(private readonly llantas: LlantasService) {}
  @Get('tablero') @Permisos('llantas.ver') tablero(@Query() q: unknown) { return this.llantas.tablero(q); }
  @Get('unidad') @Permisos('llantas.ver') unidad(@Query() q: { cabezalId?: string; remolqueId?: string }) { return this.llantas.unidad(q); }
  @Get('por-marca') @Permisos('llantas.ver') porMarca() { return this.llantas.porMarca(); }
  @Get(':id/historial') @Permisos('llantas.ver') historial(@Param('id', ParseIntPipe) id: number) { return this.llantas.historial(id); }
  @Post(':id/montar') @Permisos('llantas.editar') montar(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Body() b: unknown) { return this.llantas.montar(ctx, id, b); }
  @Post(':id/retirar') @Permisos('llantas.editar') retirar(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Body() b: unknown) { return this.llantas.retirar(ctx, id, b); }
  @Post(':id/rotar') @Permisos('llantas.editar') rotar(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Body() b: unknown) { return this.llantas.rotar(ctx, id, b); }
  @Post(':id/medicion') @Permisos('llantas.editar') medir(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Body() b: unknown) { return this.llantas.medir(ctx, id, b); }
  @Post(':id/reencauche') @Permisos('llantas.editar') reencauchar(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Body() b: unknown) { return this.llantas.reencauchar(ctx, id, b); }
  @Post(':id/desechar') @Permisos('llantas.eliminar') desechar(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Body() b: unknown) { return this.llantas.desechar(ctx, id, b); }
}
