import Decimal from 'decimal.js';

/**
 * Aritmética monetaria SIEMPRE con Decimal (nunca number/float).
 * Prisma.Decimal es decimal.js, por lo que son interoperables.
 */
export type Num = Decimal.Value | { toString(): string } | null | undefined;

export const D = (v: Num): Decimal => new Decimal(v == null ? 0 : v.toString());
export const r2 = (v: Num): Decimal => D(v).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
export const r3 = (v: Num): Decimal => D(v).toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
export const r4 = (v: Num): Decimal => D(v).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
export const suma = (valores: Num[]): Decimal => valores.reduce<Decimal>((acc, v) => acc.plus(D(v)), D(0));
export const ZERO = new Decimal(0);

export { Decimal };
