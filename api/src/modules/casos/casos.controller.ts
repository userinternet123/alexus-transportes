import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { Contexto, Permisos } from '../../common/auth/decoradores';
import { Ctx } from '../../common/auth/tipos';
import { CasosService } from './casos.service';

/** CASOS Y REQUERIMIENTOS con prioridad y plazo (sede de trabajo). */
@Controller('casos')
export class CasosController {
  constructor(private readonly casos: CasosService) {}
  @Get() @Permisos('casos.crear') listar(@Contexto() ctx: Ctx, @Query() q: unknown) { return this.casos.listar(ctx, q); }
  @Get('responsables') @Permisos('casos.gestionar') responsables(@Contexto() ctx: Ctx) { return this.casos.responsables(ctx); }
  @Get(':id') @Permisos('casos.crear') detalle(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number) { return this.casos.detalle(ctx, id); }
  @Post() @Permisos('casos.crear') crear(@Contexto() ctx: Ctx, @Body() b: unknown) { return this.casos.crear(ctx, b); }
  @Put(':id') @Permisos('casos.gestionar') editar(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Body() b: unknown) { return this.casos.editar(ctx, id, b); }
  @Put(':id/estado') @Permisos('casos.gestionar') estado(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Body() b: unknown) { return this.casos.cambiarEstado(ctx, id, b); }
}
