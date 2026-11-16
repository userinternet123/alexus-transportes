import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { Contexto, Permisos } from '../../common/auth/decoradores';
import { Ctx } from '../../common/auth/tipos';
import { CombustibleService } from './combustible.service';

/** COMBUSTIBLE: cargas, rendimiento km/gal y anulación. */
@Controller('combustible')
export class CombustibleController {
  constructor(private readonly combustible: CombustibleService) {}
  @Get('cargas') @Permisos('combustible.ver') listar(@Contexto() ctx: Ctx, @Query() q: unknown) { return this.combustible.listar(ctx, q); }
  @Get('rendimiento') @Permisos('combustible.ver') rendimiento(@Contexto() ctx: Ctx, @Query() q: unknown) { return this.combustible.rendimiento(ctx, q); }
  @Post('cargas') @Permisos('combustible.registrar') registrar(@Contexto() ctx: Ctx, @Body() b: unknown) { return this.combustible.registrar(ctx, b); }
  @Put('cargas/:id/anular') @Permisos('combustible.anular') anular(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Body() b: unknown) { return this.combustible.anular(ctx, id, b); }
}
