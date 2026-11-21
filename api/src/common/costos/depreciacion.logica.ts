/**
 * DEPRECIACIÓN DE CABEZALES Y REMOLQUES (lógica pura, sin base de datos).
 *
 * Cada unidad se deprecia con una POLÍTICA: método, vida útil y valor residual. Sale de, en este orden:
 *   1. lo que la unidad tenga propio (ficha del cabezal o remolque);
 *   2. la REGLA más específica que le aplica (por tipo de unidad, marca, tipo de remolque y año del modelo);
 *   3. si no hay nada: la tasa fiscal (Ley del ISR, art. 28: vehículos, remolques y semirremolques, 20 % anual
 *      en línea recta, sin valor residual).
 *
 * Métodos:
 *   LINEA_RECTA        igual cada año:                       (costo − residual) ÷ vida
 *   SUMA_DIGITOS       más al inicio:   año k de n          (costo − residual) × (n − k + 1) ÷ (n(n+1)/2)
 *   SALDO_DECRECIENTE  doble saldo decreciente (2 ÷ vida sobre el valor en libros), pasa a línea recta cuando
 *                      conviene y nunca baja del residual
 *   TABLA              porcentaje de la base por año, ej. 25, 20, 15, 10, 10, 10, 10
 *   POR_KM             (costo − residual) ÷ km de vida útil, por cada km recorrido
 *
 * Dentro de un año de vida la cuota se reparte por días. La depreciación fiscal se calcula aparte, solo como
 * referencia: la de costos es la de gerencia (refleja cuánto pierde de valor la unidad de verdad).
 */
import { D, Decimal, Num, r2, suma, ZERO } from '../money';

export const METODOS = ['LINEA_RECTA', 'SUMA_DIGITOS', 'SALDO_DECRECIENTE', 'TABLA', 'POR_KM'] as const;
export type Metodo = (typeof METODOS)[number];
export const NOMBRE_METODO: Record<Metodo, string> = {
  LINEA_RECTA: 'Línea recta',
  SUMA_DIGITOS: 'Suma de dígitos',
  SALDO_DECRECIENTE: 'Saldo decreciente',
  TABLA: 'Tabla por año',
  POR_KM: 'Por kilómetro',
};
export type TipoUnidad = 'CABEZAL' | 'REMOLQUE';

export interface Regla {
  id: number;
  nombre: string;
  aplicaA: string;
  marca: string | null;
  tipoRemolque: string | null;
  anioDesde: number | null;
  anioHasta: number | null;
  metodo: string;
  vidaUtilAnios: number | null;
  vidaUtilKm: Num;
  valorResidualPct: Num;
  tablaAnual: string | null;
  activo: boolean;
}

export interface Unidad {
  tipo: TipoUnidad;
  id: number;
  codigo: string;
  placa: string;
  marca: string | null;
  tipoRemolque?: string | null;
  anio: number | null;
  costoCompra: Num;
  fechaCompra: Date | null;
  metodoDepreciacion: string | null;
  vidaUtilAnios: number | null;
  vidaUtilKm: Num;
  valorResidual: Num;
  excluirDepreciacion: boolean;
  fechaBaja: Date | null;
  estado?: string;
}

const MS_ANIO = 365.25 * 86_400_000;
export const aniosEntre = (a: Date, b: Date) => Math.max(0, (b.getTime() - a.getTime()) / MS_ANIO);
const normal = (s: string | null | undefined) => (s ?? '').trim().toLocaleLowerCase('es');
const esMetodo = (m: unknown): m is Metodo => METODOS.includes(m as Metodo);

/** "25, 20, 15" → [25, 20, 15]. null si está vacía o no es válida (números ≥ 0 que suman 100). */
export function parsearTabla(t: string | null | undefined): number[] | null {
  if (!t?.trim()) return null;
  const v = t.split(/[,;\s]+/).filter(Boolean).map(Number);
  if (!v.length || v.length > 40 || v.some((x) => !Number.isFinite(x) || x < 0)) return null;
  const total = v.reduce((a, b) => a + b, 0);
  return Math.abs(total - 100) <= 0.5 ? v : null;
}

/** Qué le falta a una regla para poder usarse (para validar al guardarla). */
export function errorRegla(r: Partial<Regla>): string | null {
  if (r.aplicaA !== 'REMOLQUE' && r.tipoRemolque) return 'El tipo de remolque solo aplica a reglas de remolques';
  if (r.anioDesde != null && r.anioHasta != null && r.anioDesde > r.anioHasta) return 'El año «desde» es mayor que el año «hasta»';
  const m = r.metodo ?? 'LINEA_RECTA';
  if (m === 'POR_KM' && !(D(r.vidaUtilKm).gt(0))) return 'El método por kilómetro necesita la vida útil en km';
  if (m === 'TABLA' && !parsearTabla(r.tablaAnual)) return 'La tabla por año necesita los porcentajes de cada año separados por coma, y deben sumar 100 (ej. 25, 20, 15, 10, 10, 10, 10)';
  if (m !== 'POR_KM' && m !== 'TABLA' && !(Number(r.vidaUtilAnios) > 0)) return 'Indique la vida útil en años';
  return null;
}

/** La regla más específica que coincide: marca > tipo de remolque > rango de años; a igualdad, el rango más corto. */
export function reglaQueAplica(u: Unidad, reglas: Regla[]): Regla | null {
  const candidatas = reglas.filter((r) =>
    r.activo && r.aplicaA === u.tipo
    && (!r.marca || normal(r.marca) === normal(u.marca))
    && (!r.tipoRemolque || (u.tipo === 'REMOLQUE' && r.tipoRemolque === u.tipoRemolque))
    && (r.anioDesde == null || (u.anio != null && u.anio >= r.anioDesde))
    && (r.anioHasta == null || (u.anio != null && u.anio <= r.anioHasta)));
  const puntos = (r: Regla) => (r.marca ? 4 : 0) + (r.tipoRemolque ? 2 : 0) + (r.anioDesde != null || r.anioHasta != null ? 1 : 0);
  const ancho = (r: Regla) => (r.anioDesde != null && r.anioHasta != null ? r.anioHasta - r.anioDesde : r.anioDesde != null || r.anioHasta != null ? 1000 : 10_000);
  return candidatas.sort((a, b) => puntos(b) - puntos(a) || ancho(a) - ancho(b) || a.id - b.id)[0] ?? null;
}

export interface Politica {
  metodo: Metodo;
  vidaAnios: number | null;
  vidaKm: Decimal | null;
  residual: Decimal;
  residualPct: Decimal;
  tabla: number[] | null;
  regla: string | null;
  /** De dónde salió cada dato: lo propio de la unidad, la regla o la tasa fiscal. */
  origen: 'UNIDAD' | 'REGLA' | 'FISCAL';
  avisos: string[];
}

export function politica(u: Unidad, reglas: Regla[], tasaFiscal: number): Politica {
  const r = reglaQueAplica(u, reglas);
  const avisos: string[] = [];
  const costo = D(u.costoCompra);
  let metodo: Metodo = esMetodo(u.metodoDepreciacion) ? u.metodoDepreciacion : r && esMetodo(r.metodo) ? r.metodo : 'LINEA_RECTA';
  let tabla = metodo === 'TABLA' ? parsearTabla(r?.tablaAnual) : null;
  if (metodo === 'TABLA' && !tabla) { avisos.push('Método «tabla por año» sin una tabla válida en su regla: se usa línea recta'); metodo = 'LINEA_RECTA'; }
  const vidaKm = u.vidaUtilKm != null && D(u.vidaUtilKm).gt(0) ? D(u.vidaUtilKm) : r?.vidaUtilKm != null && D(r.vidaUtilKm).gt(0) ? D(r.vidaUtilKm) : null;
  if (metodo === 'POR_KM' && !vidaKm) { avisos.push('Método por km sin vida útil en km: se usa línea recta'); metodo = 'LINEA_RECTA'; }
  const vidaFiscal = Math.max(1, Math.round(100 / (tasaFiscal || 20)));
  let vidaAnios = metodo === 'TABLA' ? tabla!.length : metodo === 'POR_KM' ? null : (u.vidaUtilAnios ?? r?.vidaUtilAnios ?? null);
  const propio = u.metodoDepreciacion != null || u.vidaUtilAnios != null || u.vidaUtilKm != null || u.valorResidual != null;
  if (metodo !== 'POR_KM' && metodo !== 'TABLA' && !vidaAnios) vidaAnios = vidaFiscal;
  let residual: Decimal;
  let residualPct: Decimal;
  if (u.valorResidual != null) {
    residual = r2(u.valorResidual);
    residualPct = costo.gt(0) ? residual.div(costo).times(100).toDecimalPlaces(2) : ZERO;
  } else {
    residualPct = D(r?.valorResidualPct ?? 0);
    residual = r2(costo.times(residualPct).div(100));
  }
  if (residual.gt(costo)) { avisos.push('El valor residual es mayor que el costo: no se deprecia'); residual = costo; }
  const origen: Politica['origen'] = propio ? 'UNIDAD' : r ? 'REGLA' : 'FISCAL';
  if (origen === 'FISCAL') avisos.push(`Sin regla ni datos propios: se usa la tasa fiscal (${tasaFiscal} % anual, ${vidaFiscal} años, sin valor residual)`);
  if (metodo !== 'TABLA') tabla = null;
  return { metodo, vidaAnios, vidaKm, residual, residualPct, tabla, regla: r?.nombre ?? null, origen, avisos };
}

/** Cuota de cada año de vida. Redondeadas a centavos; la última absorbe el redondeo para cerrar exacto. */
export function cuotasAnuales(costo: Num, residual: Num, p: Pick<Politica, 'metodo' | 'vidaAnios' | 'tabla'>): Decimal[] {
  const c = D(costo);
  const base = c.minus(D(residual));
  const n = p.metodo === 'TABLA' ? (p.tabla?.length ?? 0) : (p.vidaAnios ?? 0);
  if (p.metodo === 'POR_KM' || n <= 0 || base.lte(0)) return [];
  let cuotas: Decimal[];
  switch (p.metodo) {
    case 'SUMA_DIGITOS': {
      const s = (n * (n + 1)) / 2;
      cuotas = Array.from({ length: n }, (_, k) => base.times(n - k).div(s));
      break;
    }
    case 'SALDO_DECRECIENTE': {
      cuotas = [];
      let libros = c;
      const piso = D(residual);
      for (let k = 0; k < n; k++) {
        const doble = libros.times(2).div(n);
        const recta = libros.minus(piso).div(n - k);
        const cuota = Decimal.min(Decimal.max(doble, recta), libros.minus(piso));
        cuotas.push(cuota);
        libros = libros.minus(cuota);
      }
      break;
    }
    case 'TABLA': {
      const total = p.tabla!.reduce((a, b) => a + b, 0);
      cuotas = p.tabla!.map((x) => base.times(x).div(total));
      break;
    }
    default:
      cuotas = Array.from({ length: n }, () => base.div(n));
  }
  const redondeadas = cuotas.map((x) => r2(x));
  redondeadas[n - 1] = r2(base.minus(suma(redondeadas.slice(0, -1))));
  return redondeadas;
}

/** Depreciación acumulada después de `anios` (fraccional) de vida. */
export function acumuladaAl(cuotas: Decimal[], anios: number): Decimal {
  if (anios <= 0 || !cuotas.length) return ZERO;
  const completos = Math.floor(anios);
  if (completos >= cuotas.length) return suma(cuotas);
  return r2(suma(cuotas.slice(0, completos)).plus(cuotas[completos].times(anios - completos)));
}

export type EstadoDepreciacion = 'SIN_DATOS' | 'SIN_INICIAR' | 'DEPRECIANDO' | 'DEPRECIADA' | 'DE_BAJA' | 'EXCLUIDA';
export const NOMBRE_ESTADO: Record<EstadoDepreciacion, string> = {
  SIN_DATOS: 'Sin costo o fecha de compra', SIN_INICIAR: 'Aún no se compra', DEPRECIANDO: 'Depreciándose',
  DEPRECIADA: 'Totalmente depreciada', DE_BAJA: 'Dada de baja', EXCLUIDA: 'Fuera de los costos',
};

export interface Depreciacion {
  tipo: TipoUnidad;
  id: number;
  codigo: string;
  placa: string;
  marca: string | null;
  anio: number | null;
  tipoRemolque: string | null;
  costo: Decimal;
  fechaCompra: string | null;
  residual: Decimal;
  residualPct: Decimal;
  base: Decimal;
  metodo: Metodo;
  vidaAnios: number | null;
  vidaKm: Decimal | null;
  tabla: number[] | null;
  regla: string | null;
  origen: Politica['origen'];
  aniosUso: number;
  kmUsados: Decimal | null;
  acumulada: Decimal;
  valorLibros: Decimal;
  pctDepreciado: Decimal;
  /** Depreciación dentro del período pedido (la que entra al costo por km). */
  periodo: Decimal;
  kmPeriodo: Decimal;
  /** Depreciación por km del período (o por km de vida útil, en el método por km). */
  porKm: Decimal | null;
  anualActual: Decimal | null;
  mensualActual: Decimal | null;
  terminaEl: string | null;
  estado: EstadoDepreciacion;
  entraEnCostos: boolean;
  fiscal: { tasa: number; anual: Decimal; acumulada: Decimal; valorLibros: Decimal };
  calendario: { anio: number; desde: string; cuota: Decimal; acumulada: Decimal; valorLibros: Decimal }[];
  avisos: string[];
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const sumarAnios = (d: Date, n: number) => { const x = new Date(d); x.setUTCFullYear(x.getUTCFullYear() + n); return x; };

/**
 * Depreciación de una unidad al día `fecha`, y la que le toca al período [desde, fecha].
 * `kmUsados`: km recorridos desde la compra (cabezal: odómetro − odómetro al comprar). `kmPeriodo`: km del período.
 */
export function depreciar(u: Unidad, p: Politica, o: { fecha: Date; desde: Date; tasaFiscal: number; kmUsados?: Num; kmPeriodo?: Num }): Depreciacion {
  const costo = r2(u.costoCompra);
  const base = Decimal.max(ZERO, costo.minus(p.residual));
  const kmPeriodo = D(o.kmPeriodo);
  const kmUsados = o.kmUsados != null ? D(o.kmUsados) : null;
  const avisos = [...p.avisos];
  const vacio = { acumulada: ZERO, valorLibros: costo, pctDepreciado: ZERO, periodo: ZERO, porKm: null, anualActual: null, mensualActual: null, terminaEl: null, aniosUso: 0, calendario: [] };
  const fila = {
    tipo: u.tipo, id: u.id, codigo: u.codigo, placa: u.placa, marca: u.marca, anio: u.anio, tipoRemolque: u.tipoRemolque ?? null,
    costo, fechaCompra: u.fechaCompra ? ymd(u.fechaCompra) : null, residual: p.residual, residualPct: p.residualPct, base,
    metodo: p.metodo, vidaAnios: p.vidaAnios, vidaKm: p.vidaKm, tabla: p.tabla, regla: p.regla, origen: p.origen, kmUsados, kmPeriodo,
  };
  const fiscalVacio = { tasa: o.tasaFiscal, anual: ZERO, acumulada: ZERO, valorLibros: costo };
  if (!costo.gt(0) || !u.fechaCompra) {
    return { ...fila, ...vacio, estado: 'SIN_DATOS', entraEnCostos: false, fiscal: fiscalVacio, avisos: [`Registre el ${!costo.gt(0) ? 'costo' : 'la fecha'} de compra para depreciarla`] };
  }
  if (u.fechaCompra > o.fecha) return { ...fila, ...vacio, estado: 'SIN_INICIAR', entraEnCostos: false, fiscal: fiscalVacio, avisos };

  const fin = u.fechaBaja && u.fechaBaja < o.fecha ? u.fechaBaja : o.fecha;
  const inicio = o.desde > u.fechaCompra ? o.desde : u.fechaCompra;
  const aniosUso = aniosEntre(u.fechaCompra, fin);
  const cuotas = cuotasAnuales(costo, p.residual, p);
  let acumulada: Decimal;
  let periodo: Decimal;
  let porKm: Decimal | null;
  let anualActual: Decimal | null = null;
  let terminaEl: string | null = null;
  if (p.metodo === 'POR_KM') {
    porKm = base.div(p.vidaKm!).toDecimalPlaces(4);
    const usados = kmUsados ?? ZERO;
    if (kmUsados == null) avisos.push('Sin km recorridos desde la compra: registre el odómetro al comprar');
    acumulada = r2(Decimal.min(base, usados.times(porKm)));
    const antes = r2(Decimal.min(base, Decimal.max(ZERO, usados.minus(kmPeriodo)).times(porKm)));
    periodo = inicio > fin ? ZERO : acumulada.minus(antes);
  } else {
    acumulada = acumuladaAl(cuotas, aniosUso);
    periodo = inicio > fin ? ZERO : acumulada.minus(acumuladaAl(cuotas, aniosEntre(u.fechaCompra, inicio)));
    porKm = kmPeriodo.gt(0) ? periodo.div(kmPeriodo).toDecimalPlaces(4) : null;
    anualActual = cuotas[Math.floor(aniosUso)] ?? ZERO;
    terminaEl = cuotas.length ? ymd(sumarAnios(u.fechaCompra, cuotas.length)) : null;
  }
  const valorLibros = costo.minus(acumulada);
  const dadaDeBaja = u.fechaBaja != null && u.fechaBaja <= o.fecha;
  const estado: EstadoDepreciacion = u.excluirDepreciacion ? 'EXCLUIDA' : dadaDeBaja ? 'DE_BAJA' : acumulada.gte(base) ? 'DEPRECIADA' : 'DEPRECIANDO';
  if (u.estado === 'VENDIDO' && !u.fechaBaja) avisos.push('Está marcada como vendida: registre la fecha de baja para que deje de depreciarse');
  const entraEnCostos = !u.excluirDepreciacion && !(u.estado === 'VENDIDO' && !u.fechaBaja);

  const anualFiscal = r2(costo.times(o.tasaFiscal).div(100));
  const acumFiscal = r2(Decimal.min(costo, anualFiscal.times(aniosUso)));

  let libros = costo;
  let acum = ZERO;
  const calendario = cuotas.map((cuota, k) => {
    acum = acum.plus(cuota);
    libros = libros.minus(cuota);
    return { anio: k + 1, desde: ymd(sumarAnios(u.fechaCompra!, k)), cuota, acumulada: acum, valorLibros: libros };
  });

  return {
    ...fila, aniosUso: Math.round(aniosUso * 100) / 100, acumulada, valorLibros,
    pctDepreciado: costo.gt(0) ? acumulada.div(costo).times(100).toDecimalPlaces(1) : ZERO,
    periodo: entraEnCostos ? periodo : ZERO, porKm, anualActual, mensualActual: anualActual ? r2(anualActual.div(12)) : null, terminaEl,
    estado, entraEnCostos, fiscal: { tasa: o.tasaFiscal, anual: anualFiscal, acumulada: acumFiscal, valorLibros: costo.minus(acumFiscal) },
    calendario, avisos,
  };
}
