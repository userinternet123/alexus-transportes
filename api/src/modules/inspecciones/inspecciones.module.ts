import { Module } from '@nestjs/common';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { CasosModule } from '../casos/casos.module';
import { InspeccionesController } from './inspecciones.controller';
import { InspeccionesService } from './inspecciones.service';

@Module({ imports: [NotificacionesModule, CasosModule], controllers: [InspeccionesController], providers: [InspeccionesService] })
export class InspeccionesModule {}
