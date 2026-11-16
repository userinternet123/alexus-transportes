/**
 * BLOQUEO POR LICENCIA: sin licencia válida (o vencida y pasada la gracia) el API no atiende NADA, salvo lo
 * necesario para activarla: iniciar sesión, ver el estado de la licencia, activarla y las rutas públicas
 * (salud, marca del negocio para la pantalla de entrada). Ni siquiera el plan Básico funciona sin licencia.
 */
import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { META_PUBLICO, META_SIN_LICENCIA } from '../../common/auth/decoradores';
import { ErrorDominio } from '../../common/errors';
import { LicenciaService } from './licencia.service';

@Injectable()
export class LicenciaGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly licencia: LicenciaService) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    if (contexto.getType() !== 'http') return true;
    const destinos = [contexto.getHandler(), contexto.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(META_PUBLICO, destinos) || this.reflector.getAllAndOverride<boolean>(META_SIN_LICENCIA, destinos)) return true;
    const e = await this.licencia.estado();
    if (!e.bloqueado) return true;
    throw new ErrorDominio('LICENCIA_REQUERIDA', e.motivo ?? 'Este equipo necesita una licencia de ALEXUS Transportes.', HttpStatus.FORBIDDEN);
  }
}
