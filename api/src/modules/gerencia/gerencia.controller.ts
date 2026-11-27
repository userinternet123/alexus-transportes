import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Contexto, Permisos } from '../../common/auth/decoradores';
import { Ctx } from '../../common/auth/tipos';
import { GerenciaService } from './gerencia.service';

/** GERENCIA por sede: tablero de la flota, costo total por cabezal, scorecard de pilotos y presupuesto de mantenimiento. */
@ApiTags('gerencia')
@ApiBearerAuth()
@Controller('gerencia')
export class GerenciaController {
  constructor(private readonly gerencia: GerenciaService) {}
  @Get('tablero') @Permisos('reportes.tablero') tablero(@Contexto() ctx: Ctx, @Query() q: unknown) { return this.gerencia.tablero(ctx, q); }
  @Get('unidades') @Permisos('reportes.tablero', 'finanzas.costos') unidades(@Contexto() ctx: Ctx, @Query() q: unknown) { return this.gerencia.unidades(ctx, q); }
  @Get('pilotos') @Permisos('reportes.tablero') pilotos(@Contexto() ctx: Ctx, @Query() q: unknown) { return this.gerencia.scorecard(ctx, q); }
  @Get('presupuesto') @Permisos('mantenimiento.ver') presupuesto(@Contexto() ctx: Ctx, @Query() q: { anio?: string; mes?: string }) { return this.gerencia.presupuesto(ctx, q); }
  @Put('presupuesto') @Permisos('mantenimiento.presupuesto') guardar(@Contexto() ctx: Ctx, @Body() b: unknown) { return this.gerencia.guardarPresupuesto(ctx, b); }
}
