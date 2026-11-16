import { Module } from '@nestjs/common';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { ViajesModule } from '../viajes/viajes.module';
import { CombustibleController } from './combustible.controller';
import { CombustibleService } from './combustible.service';

@Module({ imports: [NotificacionesModule, ViajesModule], controllers: [CombustibleController], providers: [CombustibleService] })
export class CombustibleModule {}
