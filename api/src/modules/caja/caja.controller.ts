import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MedioPago, TipoMovimientoCaja } from '@prisma/client';
import { z } from 'zod';
import { Contexto, Permisos, RequiereSucursal } from '../../common/auth/decoradores';
import type { Ctx } from '../../common/auth/tipos';
import { parseFecha } from '../../common/fecha';
import { validar, zDinero, zFecha, zId } from '../../common/pipes/zod';
import { AuthService } from '../auth/auth.service';
import { CajaService } from './caja.service';

@ApiTags('caja')
@ApiBearerAuth()
@RequiereSucursal()
@Controller('caja')
export class CajaController {
  constructor(
    private readonly caja: CajaService,
    private readonly auth: AuthService,
  ) {}

  /** Sesión abierta del usuario + resumen en vivo (para el POS). */
  @Get('mi-sesion')
  @Permisos('caja.operar')
  miSesion(@Contexto() ctx: Ctx) {
    return this.caja.miSesion(ctx);
  }

  @Post('abrir')
  @Permisos('caja.operar')
  abrir(@Contexto() ctx: Ctx, @Body() body: unknown) {
    const dto = validar(z.object({ cajaId: zId, montoApertura: zDinero }), body);
    return this.caja.abrir(ctx, dto.cajaId, dto.montoApertura);
  }

  @Post('sesiones/:id/movimientos')
  @Permisos('caja.operar')
  movimiento(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    const dto = validar(
      z.object({
        tipo: z.nativeEnum(TipoMovimientoCaja),
        medioPago: z.nativeEnum(MedioPago).default('EFECTIVO'),
        monto: zDinero.refine((n) => n > 0, 'Monto debe ser mayor a cero'),
        concepto: z.string().trim().min(5).max(250),
      }),
      body,
    );
    return this.caja.registrarMovimiento(ctx, id, dto);
  }

  /** Pre-arqueo: lo que el sistema espera (para mostrar al cajero ANTES de contar, si la política lo permite). */
  @Get('sesiones/:id/resumen')
  @Permisos('caja.operar')
  async resumen(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number) {
    const { data } = await this.caja.detalle(ctx, id);
    return { data: data.resumen };
  }

  @Post('sesiones/:id/cerrar')
  @Permisos('caja.operar')
  cerrar(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    const dto = validar(
      z.object({
        conteos: z
          .array(
            z.object({
              medioPago: z.nativeEnum(MedioPago).refine((m) => m !== 'CREDITO', 'El crédito no se arquea'),
              montoContado: zDinero,
              denominaciones: z.record(z.string().regex(/^\d+(\.\d{1,2})?$/), z.number().int().min(0)).optional(),
            }),
          )
          .min(1),
        observacion: z.string().max(500).optional(),
      }),
      body,
    );
    return this.caja.cerrar(ctx, id, dto);
  }

  /**
   * Depósito bancario del efectivo. Requiere que un encargado (permiso
   * caja.validar_deposito) valide la boleta: si el cajero no lo tiene, debe
   * enviar `autorizacion` (POST /auth/autorizar).
   */
  @Post('sesiones/:id/depositos')
  @Permisos('caja.operar')
  async deposito(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    const { autorizacion, ...dto } = validar(
      z.object({
        banco: z.string().trim().min(2).max(60),
        numeroBoleta: z.string().trim().min(3).max(40),
        depositante: z.string().trim().min(3).max(120),
        monto: zDinero.refine((n) => n > 0, 'Monto debe ser mayor a cero'),
        fechaDeposito: zFecha.transform(parseFecha),
        comprobanteId: z.string().uuid().optional(),
        observacion: z.string().max(300).optional(),
        autorizacion: z.string().optional(),
      }),
      body,
    );
    const validadoPor = await this.auth.validarAutorizacion(ctx, 'caja.validar_deposito', autorizacion);
    return this.caja.registrarDeposito(ctx, id, dto, validadoPor);
  }

  @Get('sesiones/:id/depositos')
  @Permisos('caja.operar')
  depositos(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number) {
    return this.caja.depositos(ctx, id);
  }

  @Get('sesiones')
  @Permisos('caja.operar')
  sesiones(@Contexto() ctx: Ctx, @Query() q: Record<string, string>) {
    return this.caja.sesiones(ctx, {
      fecha: q.fecha ? parseFecha(validar(zFecha, q.fecha)) : undefined,
      estado: q.estado === 'ABIERTA' || q.estado === 'CERRADA' ? q.estado : undefined,
    });
  }

  @Get('sesiones/:id')
  @Permisos('caja.operar')
  detalle(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number) {
    return this.caja.detalle(ctx, id);
  }
}
