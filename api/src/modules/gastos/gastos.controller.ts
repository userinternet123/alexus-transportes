import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { Contexto, Permisos } from '../../common/auth/decoradores';
import { Ctx } from '../../common/auth/tipos';
import { GastosService } from './gastos.service';

/** GASTOS FUERA DE CAJA (sucursal de trabajo). */
@Controller('gastos')
export class GastosController {
  constructor(private readonly gastos: GastosService) {}
  @Get('categorias') @Permisos('gastos.ver') categorias() { return this.gastos.categorias(); }
  @Post('categorias') @Permisos('gastos.registrar') crearCategoria(@Contexto() ctx: Ctx, @Body() b: unknown) { return this.gastos.crearCategoria(ctx, b); }
  @Get() @Permisos('gastos.ver') listar(@Contexto() ctx: Ctx, @Query() q: unknown) { return this.gastos.listar(ctx, q); }
  @Post() @Permisos('gastos.registrar') crear(@Contexto() ctx: Ctx, @Body() b: unknown) { return this.gastos.crear(ctx, b); }
  @Put(':id/anular') @Permisos('gastos.anular') anular(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Body() b: unknown) { return this.gastos.anular(ctx, id, b); }
}
