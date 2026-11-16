/**
 * PROYECCIONES (lógica pura, sin IA ni base de datos).
 * Método: Holt-Winters aditivo con tendencia amortiguada (estacional si hay al menos dos
 * temporadas completas de historia; si no, solo tendencia). Los parámetros se eligen
 * minimizando el error, y la confiabilidad se mide con una prueba retrospectiva:
 * se "esconden" los últimos períodos reales, se proyectan y se compara contra lo que pasó.
 * La IA NO calcula nada de esto: solo explica el resultado.
 */
export type Granularidad = 'dia' | 'semana' | 'mes';
export interface Punto { periodo: string; valor: number }
export interface PuntoProyectado { periodo: string; proyeccion: number; inferior: number; superior: number }
export interface Proyeccion {
  metodo: 'estacional' | 'tendencia';
  descripcion: string;
  puntos: PuntoProyectado[];
  errorPct: number | null; // error porcentual de la prueba retrospectiva (WAPE)
  confianza: 'alta' | 'media' | 'baja';
  periodosUsados: number;
  advertencias: string[];
}
export class ErrorProyeccion extends Error {}

const TEMPORADA: Record<Granularidad, number> = { mes: 12, dia: 7, semana: 52 };
const MINIMO: Record<Granularidad, number> = { mes: 6, dia: 14, semana: 8 };
export const MAXIMO_FUTURO: Record<Granularidad, number> = { mes: 24, dia: 90, semana: 52 };
const NOMBRE: Record<Granularidad, string> = { mes: 'meses', dia: 'días', semana: 'semanas' };
const FI = 0.9; // amortiguación de la tendencia: no se proyecta crecimiento infinito
const Z80 = 1.2816;
const PASOS = [0.1, 0.3, 0.5, 0.7, 0.9];

const dia = (iso: string) => new Date(`${iso.length === 7 ? `${iso}-01` : iso}T00:00:00Z`);
const fmtDia = (d: Date) => d.toISOString().slice(0, 10);
const fmtMes = (d: Date) => d.toISOString().slice(0, 7);

/** Período siguiente al dado: '2026-10' → '2026-11'; '2026-10-30' + dia → '2026-10-31'. */
export function siguientePeriodo(periodo: string, g: Granularidad): string {
  const d = dia(periodo);
  if (g === 'mes') { d.setUTCMonth(d.getUTCMonth() + 1, 1); return fmtMes(d); }
  d.setUTCDate(d.getUTCDate() + (g === 'semana' ? 7 : 1));
  return fmtDia(d);
}

/** El último período puede estar en curso (incompleto): se descarta para no proyectar una caída falsa. */
export function descartarPeriodoIncompleto(puntos: Punto[], g: Granularidad, hoy: string): { puntos: Punto[]; descartado: string | null } {
  if (!puntos.length) return { puntos, descartado: null };
  const ultimo = puntos[puntos.length - 1].periodo;
  const hoyD = dia(hoy);
  let incompleto = false;
  if (g === 'mes') incompleto = ultimo === hoy.slice(0, 7);
  else if (g === 'dia') incompleto = ultimo === hoy;
  else { const fin = dia(ultimo); fin.setUTCDate(fin.getUTCDate() + 6); incompleto = hoyD <= fin; }
  return incompleto ? { puntos: puntos.slice(0, -1), descartado: ultimo } : { puntos, descartado: null };
}

interface Modelo { nivel: number; tendencia: number; estacion: number[]; sigma: number; m: number; n: number }

const media = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;

/**
 * Ajusta Holt-Winters aditivo amortiguado con parámetros dados. m = 1 → sin temporada.
 * (Cuando todas las cifras son positivas se trabaja en logaritmos: así la temporada crece junto con el
 * negocio, que es lo que pasa en ventas: diciembre es "+40 %", no "+400 quetzales" para siempre.)
 */
function ajustar(y: number[], m: number, a: number, b: number, g: number) {
  const n = y.length;
  let nivel: number; let tendencia: number; const est: number[] = new Array(n).fill(0);
  let inicio: number;
  if (m > 1) {
    // Estado al final de la primera temporada, quitando la tendencia que ya traía esa temporada
    const t0 = (media(y.slice(m, 2 * m)) - media(y.slice(0, m))) / m;
    const l0 = media(y.slice(0, m));
    for (let i = 0; i < m; i++) est[i] = y[i] - (l0 + t0 * (i - (m - 1) / 2));
    nivel = l0 + (t0 * (m - 1)) / 2;
    tendencia = t0;
    inicio = m;
  } else {
    const k = Math.min(n, 6); // recta por mínimos cuadrados sobre los primeros puntos
    const xm = (k - 1) / 2; const ym = media(y.slice(0, k));
    let sxy = 0; let sxx = 0;
    for (let i = 0; i < k; i++) { sxy += (i - xm) * (y[i] - ym); sxx += (i - xm) ** 2; }
    tendencia = sxx > 0 ? sxy / sxx : 0;
    nivel = ym - tendencia * xm;
    inicio = 0;
  }
  let sse = 0; const errores: number[] = [];
  for (let t = inicio; t < n; t++) {
    const previsto = nivel + FI * tendencia + (m > 1 ? est[t - m] : 0);
    const e = y[t] - previsto; sse += e * e; errores.push(e);
    const nuevoNivel = a * (y[t] - (m > 1 ? est[t - m] : 0)) + (1 - a) * (nivel + FI * tendencia);
    tendencia = b * (nuevoNivel - nivel) + (1 - b) * FI * tendencia;
    if (m > 1) est[t] = g * (y[t] - nuevoNivel) + (1 - g) * est[t - m];
    nivel = nuevoNivel;
  }
  const sigma = Math.sqrt(sse / Math.max(1, errores.length));
  return { sse, modelo: { nivel, tendencia, estacion: est, sigma, m, n } as Modelo };
}

function mejorModelo(y: number[], m: number): Modelo {
  let mejor: { sse: number; modelo: Modelo } | null = null;
  for (const a of PASOS) for (const b of PASOS) for (const g of m > 1 ? PASOS : [0]) {
    const r = ajustar(y, m, a, b, g);
    if (!mejor || r.sse < mejor.sse) mejor = r;
  }
  return mejor!.modelo;
}

function pronosticar(mod: Modelo, h: number): { valor: number; sigma: number }[] {
  const out: { valor: number; sigma: number }[] = [];
  let acumFi = 0;
  for (let k = 1; k <= h; k++) {
    acumFi += FI ** k;
    const idx = mod.n + k - 1;
    const est = mod.m > 1 ? mod.estacion[idx - mod.m * Math.ceil((idx - mod.n + 1) / mod.m)] : 0;
    out.push({ valor: mod.nivel + acumFi * mod.tendencia + est, sigma: mod.sigma * Math.sqrt(k) });
  }
  return out;
}

/** Ajusta y proyecta h períodos en la escala original (con o sin logaritmos). Devuelve valor y semi-ancho en z. */
function proyectarSerie(y: number[], m: number, h: number) {
  const usarLog = y.every((v) => v > 0);
  const z = usarLog ? y.map(Math.log) : y;
  const pron = pronosticar(mejorModelo(z, m), h);
  return pron.map((p) => ({ valor: usarLog ? Math.exp(p.valor) : p.valor, z: p.valor, sigma: p.sigma, usarLog }));
}

/**
 * Prueba retrospectiva por ventanas móviles: se esconden los últimos períodos (con el mismo horizonte
 * que se pide proyectar), se proyectan y se comparan con lo que de verdad pasó; se repite desplazando
 * el punto de corte. Devuelve el error porcentual (WAPE) y cuánto hay que ensanchar el intervalo.
 */
function evaluar(y: number[], g: Granularidad, futuros: number, estacional: boolean) {
  const m = TEMPORADA[g];
  const h = Math.max(1, Math.min(futuros, g === 'mes' ? 6 : g === 'dia' ? 14 : 4));
  const paso = g === 'mes' ? 3 : g === 'dia' ? 7 : 2;
  const minimoTrain = estacional ? 2 * m : MINIMO[g];
  let err = 0; let suma = 0; const zs: number[] = []; let ventanas = 0;
  for (let i = 0; i < 3; i++) {
    const corte = y.length - h - i * paso;
    if (corte < minimoTrain) break;
    const train = y.slice(0, corte); const real = y.slice(corte, corte + h);
    const f = proyectarSerie(train, estacional ? m : 1, h);
    ventanas++;
    real.forEach((v, j) => {
      err += Math.abs(v - Math.max(0, f[j].valor)); suma += Math.abs(v);
      const sesgo = f[j].usarLog ? Math.log(Math.max(v, 1e-9)) - f[j].z : v - f[j].valor;
      if (f[j].sigma > 0) zs.push(Math.abs(sesgo) / f[j].sigma);
    });
  }
  if (!ventanas || suma === 0) return { errorPct: null as number | null, ensanche: 1.25 };
  zs.sort((a, b) => a - b);
  const z80 = zs[Math.min(zs.length - 1, Math.floor(zs.length * 0.8))] ?? Z80;
  return { errorPct: (err / suma) * 100, ensanche: Math.min(3, Math.max(1, z80 / Z80)) };
}

export function proyectar(serie: Punto[], g: Granularidad, futuros: number): Proyeccion {
  const y = serie.map((p) => p.valor);
  const n = y.length;
  if (y.some((v) => !Number.isFinite(v))) throw new ErrorProyeccion('La serie tiene valores inválidos');
  if (n < MINIMO[g]) throw new ErrorProyeccion(`Se necesitan al menos ${MINIMO[g]} ${NOMBRE[g]} de historia para proyectar (hay ${n}).`);
  if (!Number.isInteger(futuros) || futuros < 1 || futuros > MAXIMO_FUTURO[g]) {
    throw new ErrorProyeccion(`Se puede proyectar de 1 a ${MAXIMO_FUTURO[g]} ${NOMBRE[g]}.`);
  }
  const m = TEMPORADA[g];
  const estacional = n >= 2 * m;
  const advertencias: string[] = [];
  if (!estacional) advertencias.push(`Con menos de ${2 * m} ${NOMBRE[g]} de historia no se puede medir la temporada: la proyección solo sigue la tendencia reciente.`);
  if (y.every((v) => v === 0)) advertencias.push('Todas las cifras históricas son cero.');

  const { errorPct, ensanche } = evaluar(y, g, futuros, estacional);
  const pron = proyectarSerie(y, estacional ? m : 1, futuros);
  const puntos: PuntoProyectado[] = [];
  let per = serie[n - 1].periodo;
  for (const p of pron) {
    per = siguientePeriodo(per, g);
    const ancho = Z80 * p.sigma * ensanche; // semi-ancho del intervalo del 80 %, calibrado con la prueba retrospectiva
    const inf = p.usarLog ? Math.exp(p.z - ancho) : p.valor - ancho;
    const sup = p.usarLog ? Math.exp(p.z + ancho) : p.valor + ancho;
    const r2 = (v: number) => Math.max(0, Math.round(v * 100) / 100);
    puntos.push({ periodo: per, proyeccion: r2(p.valor), inferior: r2(inf), superior: r2(sup) });
  }
  const confianza = errorPct == null ? 'baja' : errorPct < 12 ? 'alta' : errorPct < 25 ? 'media' : 'baja';
  if (errorPct == null) advertencias.push('No hubo historia suficiente para medir qué tan acertada es la proyección.');
  else if (confianza === 'baja') advertencias.push('En la prueba retrospectiva el error fue alto: tome la proyección solo como referencia.');
  return {
    metodo: estacional ? 'estacional' : 'tendencia',
    descripcion: estacional
      ? `Suavizado exponencial de Holt-Winters con tendencia amortiguada y temporada de ${m} ${NOMBRE[g]}`
      : 'Suavizado exponencial con tendencia amortiguada (sin temporada)',
    puntos, errorPct: errorPct == null ? null : Math.round(errorPct * 10) / 10, confianza, periodosUsados: n, advertencias,
  };
}
