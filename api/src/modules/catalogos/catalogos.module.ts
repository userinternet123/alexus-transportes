import { Module } from '@nestjs/common';
import { crearCrudController } from '../../common/crud/crud.factory';
import { CATALOGOS } from './catalogos.definiciones';

@Module({ controllers: CATALOGOS.map(crearCrudController) })
export class CatalogosModule {}
