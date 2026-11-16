import { Module } from '@nestjs/common';
import { TemporadasModule } from '../temporadas/temporadas.module';
import { NotificacionesController } from './notificaciones.controller';
import { NotificacionesService } from './notificaciones.service';

@Module({ imports: [TemporadasModule], controllers: [NotificacionesController], providers: [NotificacionesService], exports: [NotificacionesService] })
export class NotificacionesModule {}
