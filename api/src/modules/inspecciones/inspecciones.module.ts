import { Module } from '@nestjs/common';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { InspeccionesController } from './inspecciones.controller';
import { InspeccionesService } from './inspecciones.service';

@Module({ imports: [NotificacionesModule], controllers: [InspeccionesController], providers: [InspeccionesService] })
export class InspeccionesModule {}
