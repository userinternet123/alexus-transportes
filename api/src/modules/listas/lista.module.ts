import { Module } from '@nestjs/common';
import { VentasModule } from '../ventas/ventas.module';
import { ListaController } from './lista.controller';
import { ListaService } from './lista.service';

@Module({ imports: [VentasModule], controllers: [ListaController], providers: [ListaService] })
export class ListaModule {}
