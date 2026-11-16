/**
 * TEMPORADAS (lógica pura): fechas que se repiten cada año, cuándo avisar para comprar, ventanas de años
 * anteriores, series para el motor analítico y depuración de las propuestas que este devuelve.
 */
import { z } from 'zod';

export interface Fechas { inicioMes: number; inicioDia: number; finMes: number; finDia: number }
export interface Ventana { inicio: string; fin: string }
const pad = (n: number) => String(n).padStart(2, '0');
const diasDelMes = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m: 1..12
/** 29 de febrero en un año no bisiesto → 28. */
const fecha = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(Math.min(d, diasDelMes(y, m)))}`;
const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export const cruzaAnio = (t: Fechas) => t.finMes < t.inicioMes || (t.finMes === t.inicioMes && t.finDia < t.inicioDia);
export const ventanaDel = (t: Fechas, anio: number): Ventana => ({ inicio: fecha(anio, t.inicioMes, t.inicioDia), fin: fecha(anio + (cruzaAnio(t) ? 1 : 0), t.finMes, t.finDia) });

export interface Situacion { enCurso: boolean; ventana: Ventana; diasParaInicio: number; diasParaFin: number }
/** ¿Está en curso hoy? Si no, ¿cuándo empieza la próxima? */
export function situacion(t: Fechas, hoy: string): Situacion {
  const y = Number(hoy.slice(0, 4));
  const candidatas = [ventanaDel(t, y - 1), ventanaDel(t, y), ventanaDel(t, y + 1)];
  const actual = candidatas.find((v) => v.inicio <= hoy && hoy <= v.fin);
  const v = actual ?? candidatas.find((x) => x.inicio > hoy)!;
  return { enCurso: Boolean(actual), ventana: v, diasParaInicio: diasEntre(hoy, v.inicio), diasParaFin: diasEntre(hoy, v.fin) };
}
/** Avisar desde "anticipación" días antes de que empiece, hasta que empiece. */
export const debeAlertar = (t: Fechas & { anticipacionDias: number }, hoy: string) => { const s = situacion(t, hoy); return !s.enCurso && s.diasParaInicio <= t.anticipacionDias; };
/** Las n temporadas anteriores YA TERMINADAS (de la más antigua a la más reciente), para estimar la demanda. */
export function ventanasAnteriores(t: Fechas, hoy: string, n: number): Ventana[] {
  const y = Number(hoy.slice(0, 4));
  return Array.from({ length: n + 3 }, (_, i) => ventanaDel(t, y - n - 2 + i)).filter((v) => v.fin < hoy).slice(-n);
}
/** Meses detectados [12, 1, 2] → del 1 de diciembre al 28/29 de febrero. */
export function desdeMeses(meses: number[]): Fechas {
  const fin = meses[meses.length - 1];
  return { inicioMes: meses[0], inicioDia: 1, finMes: fin, finDia: diasDelMes(2024, fin) }; // 2024 es bisiesto: febrero = 29 (se ajusta solo)
}
export const mesesDe = (t: Fechas): number[] => { const r: number[] = []; let m = t.inicioMes; for (;;) { r.push(m); if (m === t.finMes && (r.length > 1 || !cruzaAnio(t))) break; m = (m % 12) + 1; if (r.length > 12) break; } return r; };
export const seSolapan = (a: number[], b: number[]) => a.filter((m) => b.includes(m)).length / Math.min(a.length, b.length) >= 0.5;
export const describirFechas = (t: Fechas) => `${t.inicioDia} de ${MESES[t.inicioMes - 1]} al ${t.finDia} de ${MESES[t.finMes - 1]}`;

// ───────── Validación ─────────
const diaValido = (m: number, d: number) => d >= 1 && d <= diasDelMes(2024, m);
export const TIPOS_ALCANCE = ['CATEGORIA', 'GRUPO', 'SUBGRUPO', 'PRODUCTO'] as const;
export const temporadaZ = z.object({
  nombre: z.string().trim().min(1, 'Escriba un nombre').max(80),
  inicioMes: z.coerce.number().int().min(1).max(12), inicioDia: z.coerce.number().int().min(1).max(31),
  finMes: z.coerce.number().int().min(1).max(12), finDia: z.coerce.number().int().min(1).max(31),
  anticipacionDias: z.coerce.number().int().min(0).max(365).default(45),
  notas: z.string().trim().max(500).nullish(),
  alcance: z.array(z.object({ tipo: z.enum(TIPOS_ALCANCE), refId: z.coerce.number().int().positive() })).min(1, 'Elija al menos una categoría, grupo, subgrupo o producto').max(200),
}).refine((t) => diaValido(t.inicioMes, t.inicioDia), { message: 'El día de inicio no existe en ese mes', path: ['inicioDia'] })
  .refine((t) => diaValido(t.finMes, t.finDia), { message: 'El día de fin no existe en ese mes', path: ['finDia'] })
  .refine((t) => !(t.inicioMes === t.finMes && t.inicioDia === t.finDia), { message: 'La temporada debe durar más de un día', path: ['finDia'] });
export type TemporadaDto = z.infer<typeof temporadaZ>;

// ───────── Series para el motor analítico ─────────
export interface FilaVenta { mes: string; subgrupo_id: number; subgrupo: string; grupo_id: number; grupo: string; categoria_id: number; categoria: string; total: number }
export interface Serie { clave: string; nombre: string; inicio: string; valores: number[] }
export const mesesDesde = (inicio: string, n: number) => Array.from({ length: n }, (_, i) => { const d = new Date(Date.UTC(Number(inicio.slice(0, 4)), Number(inicio.slice(5, 7)) - 1 + i, 1)); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`; });
/** Ventas mensuales por subgrupo → series completas (meses sin ventas = 0) por categoría, grupo y subgrupo. */
export function armarSeries(filas: FilaVenta[], inicio: string, n: number): Serie[] {
  const meses = mesesDesde(inicio, n); const pos = new Map(meses.map((m, i) => [m, i]));
  const series = new Map<string, Serie>();
  const sumar = (clave: string, nombre: string, mes: string, v: number) => {
    const i = pos.get(mes); if (i === undefined) return;
    if (!series.has(clave)) series.set(clave, { clave, nombre, inicio, valores: new Array(n).fill(0) });
    series.get(clave)!.valores[i] += v;
  };
  for (const f of filas) {
    const v = Number(f.total) || 0;
    sumar(`CATEGORIA:${f.categoria_id}`, f.categoria, f.mes, v);
    sumar(`GRUPO:${f.grupo_id}`, `${f.categoria} › ${f.grupo}`, f.mes, v);
    sumar(`SUBGRUPO:${f.subgrupo_id}`, `${f.categoria} › ${f.grupo} › ${f.subgrupo}`, f.mes, v);
  }
  return [...series.values()].map((s) => ({ ...s, valores: s.valores.map((x) => Math.round(x * 100) / 100) }));
}

// ───────── Propuestas del motor ─────────
export interface Propuesta { tipo: 'CATEGORIA' | 'GRUPO' | 'SUBGRUPO'; refId: number; nombre: string; meses: number[]; factor: number; participacion: number; confianza: string; descripcion: string; indices: number[] }
export interface Jerarquia { grupoDeSubgrupo: Map<number, number>; categoriaDeGrupo: Map<number, number> }
/** Quita las de confianza baja y las que solo repiten la temporada de su categoría o grupo (con meses que se solapan). */
export function depurarPropuestas(lista: Propuesta[], j: Jerarquia): Propuesta[] {
  const buenas = lista.filter((p) => p.confianza !== 'baja');
  const tiene = (tipo: string, id: number | undefined, meses: number[]) => id !== undefined && buenas.some((x) => x.tipo === tipo && x.refId === id && seSolapan(x.meses, meses));
  return buenas.filter((p) => {
    if (p.tipo === 'GRUPO') return !tiene('CATEGORIA', j.categoriaDeGrupo.get(p.refId), p.meses);
    if (p.tipo === 'SUBGRUPO') { const g = j.grupoDeSubgrupo.get(p.refId); return !tiene('GRUPO', g, p.meses) && !tiene('CATEGORIA', g === undefined ? undefined : j.categoriaDeGrupo.get(g), p.meses); }
    return true;
  });
}
