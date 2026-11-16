import { Module } from '@nestjs/common';
import { crearCrudController } from '../../common/crud/crud.factory';
import { CATALOGOS } from './catalogos.definiciones';
import { ClasificacionController } from './clasificacion.controller';

@Module({ controllers: [...CATALOGOS.map(crearCrudController), ClasificacionController] })
export class CatalogosModule {}
