import { Module } from '@nestjs/common';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { CasosController } from './casos.controller';
import { CasosService } from './casos.service';

@Module({ imports: [NotificacionesModule], controllers: [CasosController], providers: [CasosService], exports: [CasosService] })
export class CasosModule {}
