import { Module } from '@nestjs/common';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { CostoKmService } from './costo-km.service';
import { CotizacionesController, ViajesController } from './viajes.controller';
import { CotizadorService } from './cotizador.service';
import { EventosViajeService } from './eventos.service';
import { CasosModule } from '../casos/casos.module';
import { ViajesService } from './viajes.service';

@Module({ imports: [NotificacionesModule, CasosModule], controllers: [ViajesController, CotizacionesController], providers: [ViajesService, CostoKmService, CotizadorService, EventosViajeService], exports: [CostoKmService] })
export class ViajesModule {}
