import { Body, Controller, Get, HttpCode, Ip, Post, Headers } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { Contexto, PermitePasswordPendiente, Publico, SinLicencia } from '../../common/auth/decoradores';
import type { Ctx } from '../../common/auth/tipos';
import { ZodPipe } from '../../common/pipes/zod';
import { AuthService } from './auth.service';

const loginSchema = z.object({
  username: z.string().trim().min(1).max(60),
  password: z.string().min(1).max(200),
});
const refreshSchema = z.object({ refreshToken: z.string().min(20) });
const cambioSchema = z.object({ actual: z.string().min(1), nueva: z.string().min(10).max(200) });
const autorizarSchema = z.object({
  username: z.string().trim().min(1).max(60),
  password: z.string().min(1).max(200),
  permiso: z.string().regex(/^[a-z_.]+$/),
  detalle: z.string().max(300).optional(),
});

@ApiTags('auth')
@SinLicencia() // iniciar sesión, ver mi perfil y cambiar la contraseña: necesarios para activar la licencia
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Publico()
  @Throttle({ default: { limit: 10, ttl: 60_000 } }) // anti fuerza bruta por IP
  @Post('login')
  @HttpCode(200)
  login(@Body(new ZodPipe(loginSchema)) dto: z.infer<typeof loginSchema>, @Ip() ip: string, @Headers('user-agent') ua?: string) {
    return this.auth.login(dto.username, dto.password, ip, ua);
  }

  @Publico()
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body(new ZodPipe(refreshSchema)) dto: z.infer<typeof refreshSchema>, @Ip() ip: string, @Headers('user-agent') ua?: string) {
    return this.auth.refrescar(dto.refreshToken, ip, ua);
  }

  @Publico()
  @Post('logout')
  @HttpCode(204)
  async logout(@Body(new ZodPipe(refreshSchema)) dto: z.infer<typeof refreshSchema>) {
    await this.auth.logout(dto.refreshToken);
  }

  @ApiBearerAuth()
  @PermitePasswordPendiente()
  @Get('me')
  me(@Contexto() ctx: Ctx) {
    return this.auth.perfil(ctx);
  }

  /** Credenciales de un encargado para autorizar UNA acción del usuario en sesión. */
  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('autorizar')
  @HttpCode(200)
  autorizar(@Body(new ZodPipe(autorizarSchema)) dto: z.infer<typeof autorizarSchema>, @Contexto() ctx: Ctx) {
    return this.auth.autorizar(ctx, dto.username, dto.password, dto.permiso, dto.detalle);
  }

  @ApiBearerAuth()
  @PermitePasswordPendiente()
  @Post('cambiar-password')
  @HttpCode(200)
  cambiarPassword(@Body(new ZodPipe(cambioSchema)) dto: z.infer<typeof cambioSchema>, @Contexto() ctx: Ctx) {
    return this.auth.cambiarPassword(ctx, dto.actual, dto.nueva);
  }
}
