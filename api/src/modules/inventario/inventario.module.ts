import { Global, Module } from '@nestjs/common';
import { InventarioController } from './inventario.controller';
import { InventarioService } from './inventario.service';
import { ConteosService } from './conteos.service';
import { KardexService } from './kardex.service';

@Global() // KardexService lo consumen Compras y Ventas
@Module({ controllers: [InventarioController], providers: [KardexService, InventarioService, ConteosService], exports: [KardexService] })
export class InventarioModule {}
