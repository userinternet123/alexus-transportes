import { Module } from '@nestjs/common';
import { NotificacionesController } from './notificaciones.controller';
import { NotificacionesService } from './notificaciones.service';
import { CobrosModule } from '../cobros/cobros.module';
import { TallerModule } from '../taller/taller.module';
import { IncidentesModule } from '../incidentes/incidentes.module';
import { LlantasModule } from '../llantas/llantas.module';
import { GerenciaModule } from '../gerencia/gerencia.module';

@Module({ imports: [CobrosModule, TallerModule, IncidentesModule, LlantasModule, GerenciaModule], controllers: [NotificacionesController], providers: [NotificacionesService], exports: [NotificacionesService] })
export class NotificacionesModule {}
