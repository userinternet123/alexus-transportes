import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TipoAusencia } from '@prisma/client';
import { z } from 'zod';
import { Contexto, Permisos } from '../../common/auth/decoradores';
import type { Ctx } from '../../common/auth/tipos';
import { fechaContable, parseFecha, sumarDias } from '../../common/fecha';
import { validar, zFecha, zId } from '../../common/pipes/zod';
import { RrhhService } from './rrhh.service';

@ApiTags('rrhh')
@ApiBearerAuth()
@Controller('rrhh')
export class RrhhController {
  constructor(private readonly rrhh: RrhhService) {}

  @Get('asistencias')
  @Permisos('rrhh.asistencia')
  asistencias(@Query() q: Record<string, string>) {
    const hasta = q.hasta ? parseFecha(validar(zFecha, q.hasta)) : fechaContable();
    const desde = q.desde ? parseFecha(validar(zFecha, q.desde)) : sumarDias(hasta, -15);
    return this.rrhh.asistencias(desde, hasta, q.empleadoId ? Number(q.empleadoId) : undefined);
  }

  @Post('asistencias')
  @Permisos('rrhh.asistencia')
  registrarAsistencia(@Contexto() ctx: Ctx, @Body() body: unknown) {
    const dto = validar(
      z.object({
        empleadoId: zId,
        fecha: zFecha,
        entrada: z.string().datetime({ offset: true }).optional(),
        salida: z.string().datetime({ offset: true }).optional(),
        origen: z.enum(['MANUAL', 'BIOMETRICO', 'APP']).optional(),
        horasNormales: z.coerce.number().min(0).max(24).optional(),
        horasExtra: z.coerce.number().min(0).max(16).optional(),
      }),
      body,
    );
    return this.rrhh.registrarAsistencia(ctx, dto);
  }

  @Get('ausencias')
  @Permisos('rrhh.ausencias')
  ausencias(@Query('estado') estado?: string) {
    return this.rrhh.ausencias(estado);
  }

  @Post('ausencias')
  @Permisos('rrhh.ausencias')
  solicitarAusencia(@Contexto() ctx: Ctx, @Body() body: unknown) {
    const dto = validar(
      z.object({ empleadoId: zId, tipo: z.nativeEnum(TipoAusencia), desde: zFecha, hasta: zFecha, observacion: z.string().max(300).optional() }),
      body,
    );
    return this.rrhh.solicitarAusencia(ctx, dto);
  }

  @Post('ausencias/:id/aprobar')
  @Permisos('rrhh.ausencias')
  aprobar(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number) {
    return this.rrhh.resolverAusencia(ctx, id, true);
  }

  @Post('ausencias/:id/rechazar')
  @Permisos('rrhh.ausencias')
  rechazar(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number) {
    return this.rrhh.resolverAusencia(ctx, id, false);
  }

  @Get('planillas')
  @Permisos('rrhh.planilla.ver')
  planillas() {
    return this.rrhh.planillas();
  }

  @Get('planillas/:id')
  @Permisos('rrhh.planilla.ver')
  planilla(@Param('id', ParseIntPipe) id: number) {
    return this.rrhh.planilla(id);
  }

  @Post('planillas/generar')
  @Permisos('rrhh.planilla.generar')
  generar(@Contexto() ctx: Ctx, @Body() body: unknown) {
    const dto = validar(
      z.object({
        anio: z.number().int().min(2020).max(2100),
        mes: z.number().int().min(1).max(12),
        tipo: z.enum(['MENSUAL', 'QUINCENAL']),
        quincena: z.union([z.literal(1), z.literal(2)]).optional(),
      }),
      body,
    );
    return this.rrhh.generarPlanilla(ctx, dto);
  }

  @Put('planillas/:id/empleados/:empleadoId')
  @Permisos('rrhh.planilla.generar')
  ajustar(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Param('empleadoId', ParseIntPipe) empleadoId: number, @Body() body: unknown) {
    const dto = validar(
      z.object({
        isr: z.coerce.number().nonnegative().optional(),
        otrosDescuentos: z.coerce.number().nonnegative().optional(),
        otrosIngresos: z.coerce.number().nonnegative().optional(),
      }),
      body,
    );
    return this.rrhh.ajustarLinea(ctx, id, empleadoId, dto);
  }

  @Post('planillas/:id/aprobar')
  @Permisos('rrhh.planilla.aprobar')
  aprobarPlanilla(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number) {
    return this.rrhh.aprobarPlanilla(ctx, id);
  }
}
