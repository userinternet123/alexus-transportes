import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Contexto, Permisos } from '../../common/auth/decoradores';
import { Ctx } from '../../common/auth/tipos';
import { IncidentesService } from './incidentes.service';

/** INCIDENTES Y MULTAS por sede: registro, costo, seguro, descuento al piloto, trámite y resumen. */
@ApiTags('incidentes')
@ApiBearerAuth()
@Controller('incidentes')
export class IncidentesController {
  constructor(private readonly incidentes: IncidentesService) {}
  @Get() @Permisos('incidentes.ver') listar(@Contexto() ctx: Ctx, @Query() q: unknown) { return this.incidentes.listar(ctx, q); }
  @Get('resumen') @Permisos('incidentes.ver') resumen(@Contexto() ctx: Ctx, @Query() q: { desde?: string; hasta?: string }) { return this.incidentes.resumen(ctx, q); }
  @Get(':id') @Permisos('incidentes.ver') detalle(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number) { return this.incidentes.detalle(ctx, id); }
  @Post() @Permisos('incidentes.registrar') crear(@Contexto() ctx: Ctx, @Body() b: unknown) { return this.incidentes.crear(ctx, b); }
  @Put(':id') @Permisos('incidentes.registrar') editar(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Body() b: unknown) { return this.incidentes.editar(ctx, id, b); }
  @Put(':id/gestion') @Permisos('incidentes.gestionar') gestionar(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Body() b: unknown) { return this.incidentes.gestionar(ctx, id, b); }
  @Put(':id/estado') @Permisos('incidentes.gestionar') estado(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Body() b: unknown) { return this.incidentes.cambiarEstado(ctx, id, b); }
}
