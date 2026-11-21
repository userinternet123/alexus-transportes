import { Module } from '@nestjs/common';
import { TallerController } from './taller.controller';
import { TallerService } from './taller.service';

@Module({ controllers: [TallerController], providers: [TallerService], exports: [TallerService] })
export class TallerModule {}
