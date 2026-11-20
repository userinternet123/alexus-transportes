import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { Contexto, Permisos } from '../../common/auth/decoradores';
import { Ctx } from '../../common/auth/tipos';
import { CotizadorService } from './cotizador.service';
import { EventosViajeService } from './eventos.service';
import { ViajesService } from './viajes.service';

/** VIAJES: programar, iniciar, finalizar, liquidar; costos, anticipos y cotizador (sede de trabajo). */
@Controller('viajes')
export class ViajesController {
  constructor(private readonly viajes: ViajesService, private readonly cotizador: CotizadorService, private readonly eventos: EventosViajeService) {}

  @Get() @Permisos('viajes.ver') listar(@Contexto() ctx: Ctx, @Query() q: unknown) { return this.viajes.listar(ctx, q); }
  @Post('cotizar') @Permisos('viajes.cotizar') cotizar(@Body() b: unknown) { return this.cotizador.cotizar(b); }
  @Get('costo-km') @Permisos('finanzas.costos') costoKm() { return this.viajes.costoPorKm(); }
  @Get('rentabilidad') @Permisos('finanzas.costos') rentabilidad(@Contexto() ctx: Ctx, @Query() q: unknown) { return this.viajes.rentabilidad(ctx, q); }
  @Get('en-vivo') @Permisos('viajes.ver') enVivo(@Contexto() ctx: Ctx) { return this.eventos.enVivo(ctx); }
  @Get(':id/eventos') @Permisos('viajes.ver') eventosViaje(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number) { return this.eventos.listar(ctx, id); }
  @Post(':id/eventos') @Permisos('viajes.reportar') reportar(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Body() b: unknown) { return this.eventos.reportar(ctx, id, b); }
  @Get(':id') @Permisos('viajes.ver') detalle(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number) { return this.viajes.detalle(ctx, id); }

  @Post() @Permisos('viajes.crear') programar(@Contexto() ctx: Ctx, @Body() b: unknown) { return this.viajes.programar(ctx, b); }
  @Put(':id') @Permisos('viajes.editar') editar(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Body() b: unknown) { return this.viajes.editar(ctx, id, b); }
  @Post(':id/iniciar') @Permisos('viajes.crear') iniciar(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Body() b: unknown) { return this.viajes.iniciar(ctx, id, b); }
  @Post(':id/finalizar') @Permisos('viajes.cerrar') finalizar(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Body() b: unknown) { return this.viajes.finalizar(ctx, id, b); }
  @Post(':id/liquidar') @Permisos('viajes.liquidar') liquidar(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number) { return this.viajes.liquidar(ctx, id); }
  @Post(':id/cancelar') @Permisos('viajes.anular') cancelar(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Body() b: unknown) { return this.viajes.cancelar(ctx, id, b); }

  @Post(':id/costos') @Permisos('viajes.costos') agregarCosto(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Body() b: unknown) { return this.viajes.agregarCosto(ctx, id, b); }
  @Delete(':id/costos/:costoId') @Permisos('viajes.costos') quitarCosto(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Param('costoId', ParseIntPipe) costoId: number) { return this.viajes.quitarCosto(ctx, id, costoId); }
  @Post(':id/anticipos') @Permisos('viajes.anticipos') agregarAnticipo(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Body() b: unknown) { return this.viajes.agregarAnticipo(ctx, id, b); }
  @Delete(':id/anticipos/:anticipoId') @Permisos('viajes.anticipos') quitarAnticipo(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Param('anticipoId', ParseIntPipe) anticipoId: number) { return this.viajes.quitarAnticipo(ctx, id, anticipoId); }
}

/** COTIZACIONES guardadas: número, vigencia, estado y conversión a viaje. */
@Controller('cotizaciones')
export class CotizacionesController {
  constructor(private readonly cotizador: CotizadorService) {}
  @Get() @Permisos('viajes.cotizar') listar(@Contexto() ctx: Ctx, @Query() q: unknown) { return this.cotizador.listar(ctx, q); }
  @Get(':id') @Permisos('viajes.cotizar') detalle(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number) { return this.cotizador.detalle(ctx, id); }
  @Post() @Permisos('viajes.cotizar') guardar(@Contexto() ctx: Ctx, @Body() b: unknown) { return this.cotizador.guardar(ctx, b); }
  @Put(':id/estado') @Permisos('viajes.cotizar') estado(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Body() b: unknown) { return this.cotizador.cambiarEstado(ctx, id, b); }
  @Post(':id/convertir') @Permisos('viajes.crear') convertir(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Body() b: unknown) { return this.cotizador.convertir(ctx, id, b); }
}
