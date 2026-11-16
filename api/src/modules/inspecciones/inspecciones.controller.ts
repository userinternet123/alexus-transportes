import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { Contexto, Permisos } from '../../common/auth/decoradores';
import { Ctx } from '../../common/auth/tipos';
import { InspeccionesService } from './inspecciones.service';

/** INSPECCIÓN PRE VIAJE: checklist, registro y consulta. */
@Controller('inspecciones')
export class InspeccionesController {
  constructor(private readonly inspecciones: InspeccionesService) {}
  @Get('checklist') @Permisos('inspecciones.ver') checklist() { return this.inspecciones.checklist(); }
  @Get() @Permisos('inspecciones.ver') listar(@Contexto() ctx: Ctx, @Query() q: unknown) { return this.inspecciones.listar(ctx, q); }
  @Get(':id') @Permisos('inspecciones.ver') detalle(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number) { return this.inspecciones.detalle(ctx, id); }
  @Post() @Permisos('inspecciones.registrar') registrar(@Contexto() ctx: Ctx, @Body() b: unknown) { return this.inspecciones.registrar(ctx, b); }
}
