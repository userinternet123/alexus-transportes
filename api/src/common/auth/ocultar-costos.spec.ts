import { Prisma } from '@prisma/client';
import { Decimal } from '../money';
import { sinCostos } from './ocultar-costos';

describe('ocultar costos', () => {
  it('quita campos sensibles y deja los montos Decimal intactos', () => {
    const r = sinCostos({ montoCobrado: new Prisma.Decimal('2800.5'), ganancia: new Decimal(10), lista: [{ odometro: new Decimal('342170'), margen: 3 }] });
    expect(JSON.parse(JSON.stringify(r))).toEqual({ montoCobrado: '2800.5', lista: [{ odometro: '342170' }] });
  });
});
