import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Contexto, Permisos } from '../../common/auth/decoradores';
import { Ctx } from '../../common/auth/tipos';
import { CobrosService } from './cobros.service';

/** CUENTAS POR COBRAR por sede: facturar viajes, abonos, seguimiento, antigüedad y recordatorios. */
@ApiTags('cobros')
@ApiBearerAuth()
@Controller('cobros')
export class CobrosController {
  constructor(private readonly cobros: CobrosService) {}
  @Get() @Permisos('cobros.ver') listar(@Contexto() ctx: Ctx, @Query() q: unknown) { return this.cobros.listar(ctx, q); }
  @Get('resumen') @Permisos('cobros.ver') resumen(@Contexto() ctx: Ctx, @Query() q: unknown) { return this.cobros.resumen(ctx, q); }
  @Get('sin-facturar') @Permisos('cobros.ver') sinFacturar(@Contexto() ctx: Ctx, @Query() q: unknown) { return this.cobros.sinFacturar(ctx, q); }
  @Get('clientes/:id') @Permisos('cobros.ver') cliente(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number) { return this.cobros.estadoCliente(ctx, id); }
  @Get(':id') @Permisos('cobros.ver') detalle(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number) { return this.cobros.detalle(ctx, id); }
  @Post() @Permisos('cobros.facturar') crear(@Contexto() ctx: Ctx, @Body() b: unknown) { return this.cobros.crear(ctx, b); }
  @Post(':id/abonos') @Permisos('cobros.abonar') abonar(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Body() b: unknown) { return this.cobros.abonar(ctx, id, b); }
  @Put(':id/abonos/:abonoId/anular') @Permisos('cobros.anular') anularAbono(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Param('abonoId', ParseIntPipe) abonoId: number, @Body() b: unknown) { return this.cobros.anularAbono(ctx, id, abonoId, b); }
  @Post(':id/gestiones') @Permisos('cobros.gestionar') gestionar(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Body() b: unknown) { return this.cobros.gestionar(ctx, id, b); }
  @Put(':id/anular') @Permisos('cobros.anular') anular(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Body() b: unknown) { return this.cobros.anular(ctx, id, b); }
}
