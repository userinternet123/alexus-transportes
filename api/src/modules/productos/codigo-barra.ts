/** Códigos de barras internos: EAN-13 con prefijo 29 (rango GS1 reservado para uso interno de una tienda). */
export const digitoEan13 = (doce: string): number => {
  let suma = 0;
  for (let i = 0; i < 12; i++) suma += Number(doce[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (suma % 10)) % 10;
};
export const esEan13 = (c: string) => /^\d{13}$/.test(c) && digitoEan13(c.slice(0, 12)) === Number(c[12]);
/** n = 1 → 2900000000018. Solo 10 dígitos de serie (hasta 9,999,999,999). */
export function construirInterno(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 9_999_999_999) throw new RangeError('Número de serie fuera de rango');
  const base = `29${String(n).padStart(10, '0')}`;
  return `${base}${digitoEan13(base)}`;
}
