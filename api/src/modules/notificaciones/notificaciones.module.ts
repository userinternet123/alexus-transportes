import { Module } from '@nestjs/common';
import { NotificacionesController } from './notificaciones.controller';
import { NotificacionesService } from './notificaciones.service';
import { CobrosModule } from '../cobros/cobros.module';
import { TallerModule } from '../taller/taller.module';

@Module({ imports: [CobrosModule, TallerModule], controllers: [NotificacionesController], providers: [NotificacionesService], exports: [NotificacionesService] })
export class NotificacionesModule {}
