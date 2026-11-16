import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { Contexto, Permisos, RequiereSucursal } from '../../common/auth/decoradores';
import { Ctx } from '../../common/auth/tipos';
import { validar } from '../../common/pipes/zod';
import { temporadaZ } from './temporada.logica';
import { TemporadasService } from './temporadas.service';

/** TEMPORADAS DE VENTA: definidas por el dueño o detectadas por el motor analítico local. */
@Controller('temporadas')
@RequiereSucursal()
@Permisos('reportes.analitica.temporadas')
export class TemporadasController {
  constructor(private readonly temporadas: TemporadasService) {}

  @Get() listar() { return this.temporadas.listar(); }
  @Post() crear(@Contexto() ctx: Ctx, @Body() b: unknown) { return this.temporadas.crear(ctx, validar(temporadaZ, b)); }
  @Put(':id') actualizar(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Body() b: unknown) { return this.temporadas.actualizar(ctx, id, validar(temporadaZ, b)); }
  @Put(':id/estado') estado(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Body() b: unknown) {
    return this.temporadas.cambiarEstado(ctx, id, validar(z.object({ estado: z.enum(['ACTIVA', 'DESCARTADA', 'INACTIVA']) }), b).estado);
  }
  @Delete(':id') eliminar(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number) { return this.temporadas.eliminar(ctx, id); }

  @Post('detectar')
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  detectar(@Contexto() ctx: Ctx) { return this.temporadas.detectar(ctx); }

  @Get(':id/compras') compras(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number) { return this.temporadas.compras(ctx, id); }
  @Get('alertas/hoy') async alertas(@Contexto() ctx: Ctx) { return { data: await this.temporadas.alertas(ctx) }; }
}
