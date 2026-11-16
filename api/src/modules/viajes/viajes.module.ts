import { Module } from '@nestjs/common';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { CotizadorService } from './cotizador.service';
import { ViajesController } from './viajes.controller';
import { ViajesService } from './viajes.service';

@Module({ imports: [NotificacionesModule], controllers: [ViajesController], providers: [ViajesService, CotizadorService], exports: [ViajesService] })
export class ViajesModule {}
