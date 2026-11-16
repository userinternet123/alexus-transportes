import { Global, Module } from '@nestjs/common';
import { env } from '../../config/env';
import { FelMockProveedor } from './fel-mock.proveedor';
import { FelProveedor } from './fel.proveedor';
import { FelService } from './fel.service';

/**
 * Selección del adaptador por configuración (FEL_PROVEEDOR).
 * Para producción: implementar InfileProveedor/DigifactProveedor con el
 * contrato del certificador contratado y registrarlo aquí.
 */
@Global()
@Module({
  providers: [
    FelService,
    {
      provide: FelProveedor,
      useFactory: () => {
        switch (env.FEL_PROVEEDOR) {
          case 'mock':
            return new FelMockProveedor();
          default:
            throw new Error(`Adaptador FEL "${env.FEL_PROVEEDOR}" no implementado aún (ver docs/adr/0004-fel.md)`);
        }
      },
    },
  ],
  exports: [FelService],
})
export class FelModule {}
