import { Module } from '@nestjs/common';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { CombustibleController } from './combustible.controller';
import { CombustibleService } from './combustible.service';

@Module({ imports: [NotificacionesModule], controllers: [CombustibleController], providers: [CombustibleService] })
export class CombustibleModule {}
