import { Module } from '@nestjs/common';
import { DocumentosModule } from '../documentos/documentos.module';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { TemporadasModule } from '../temporadas/temporadas.module';
import { PedidosController } from './pedidos.controller';
import { PedidosService } from './pedidos.service';

@Module({ imports: [DocumentosModule, NotificacionesModule, TemporadasModule], controllers: [PedidosController], providers: [PedidosService] })
export class PedidosModule {}
