import { Module } from '@nestjs/common';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { CostoKmService } from './costo-km.service';
import { CotizacionesController, ViajesController } from './viajes.controller';
import { CotizadorService } from './cotizador.service';
import { ViajesService } from './viajes.service';

@Module({ imports: [NotificacionesModule], controllers: [ViajesController, CotizacionesController], providers: [ViajesService, CostoKmService, CotizadorService], exports: [CostoKmService] })
export class ViajesModule {}
