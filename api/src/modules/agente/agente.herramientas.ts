/**
 * HERRAMIENTAS DEL AGENTE (function calling).
 * Cada herramienta valida sus parámetros (zod), respeta permisos y devuelve un RESULTADO con datos
 * exactos de la base. El modelo recibe un resumen; la respuesta final al usuario se arma con los
 * datos completos guardados aquí, nunca con cifras que la IA haya "copiado".
 */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  AGRUPAR, Agrupar, Clasificacion, Consulta, DIAS_SEMANA, ENTIDADES, ETIQUETA_MEDIDA, Fila, Filtros, MEDIDAS, Medida,
  completarSerie, consultaBuscar, consultaCompras, consultaInventario, consultaRanking, consultaSerie, consultaTotal, redondear, resumirSerie,
} from './agente.consultas';
import { aDefinicion, Definicion, PasoResuelto } from './agente.plantillas.logica';
import { descartarPeriodoIncompleto, ErrorProyeccion, Granularidad, MAXIMO_FUTURO, proyectar, siguientePeriodo } from './proyeccion.logica';

export class ErrorHerramienta extends Error {}

export interface ContextoAgente {
  sucursalId: number;
  sucursalNombre: string;
  veCostos: boolean; // permiso finanzas.costos: sin él, nunca se consulta ni se envía a la IA un costo, utilidad o margen
  hoy: string; // YYYY-MM-DD, hora de Guatemala
  consultar: (c: Consulta) => Promise<Record<string, unknown>[]>;
}
export type Formato = 'moneda' | 'numero' | 'porcentaje' | 'texto';
export interface Columna { clave: string; etiqueta: string; formato: Formato }
export type TipoGrafica = 'barras' | 'barras_horizontales' | 'lineas' | 'area' | 'dona' | 'numero' | 'tabla';
export interface Resultado {
  id: string; titulo: string; columnas: Columna[]; filas: Fila[];
  x: string; ordenada: boolean; series: string[];
  serie?: { granularidad: Granularidad };
  proyeccion?: { metodo: string; descripcion: string; errorPct: number | null; confianza: string; advertencias: string[]; columnas: { proyeccion: string; inferior: string; superior: string } };
  supuestos: string[];
  /** Qué herramienta lo produjo y con qué parámetros (para poder guardarlo como plantilla). */
  origen?: { herramienta: string; entrada: unknown; dependeDe?: string };
}
export const MAX_RESULTADOS = 12;

// ───────────────────────── Validación ─────────────────────────
const esFecha = (s: string) => { const d = new Date(`${s}T00:00:00Z`); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s; };
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use el formato AAAA-MM-DD').refine(esFecha, 'La fecha no existe');
const dias = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000) + 1;
const entero = z.coerce.number().int().positive();
const filtrosZ = {
  producto_id: entero.optional(), vendedor_id: entero.optional(),
  clasificacion_tipo: z.enum(['categoria', 'grupo', 'subgrupo']).optional(), clasificacion_id: entero.optional(),
};
const rango = z.object({ desde: fecha, hasta: fecha });
const validarRango = (a: { desde: string; hasta: string }) => {
  if (a.desde > a.hasta) throw new ErrorHerramienta('"desde" no puede ser posterior a "hasta".');
  if (dias(a.desde, a.hasta) > 3700) throw new ErrorHerramienta('El rango máximo es de 10 años.');
};
function parsear<T extends z.ZodTypeAny>(esquema: T, entrada: unknown): z.infer<T> {
  const r = esquema.safeParse(entrada);
  if (!r.success) throw new ErrorHerramienta(`Parámetros inválidos: ${r.error.issues.map((i) => `${i.path.join('.') || 'entrada'}: ${i.message}`).join('; ')}`);
  return r.data;
}
function filtrosDe(a: { producto_id?: number; vendedor_id?: number; clasificacion_tipo?: Clasificacion['tipo']; clasificacion_id?: number }): Filtros {
  if (Boolean(a.clasificacion_tipo) !== Boolean(a.clasificacion_id)) throw new ErrorHerramienta('Para filtrar por clasificación indique clasificacion_tipo y clasificacion_id juntos (búsquelos con la herramienta "buscar").');
  return {
    ...(a.producto_id ? { productoId: a.producto_id } : {}), ...(a.vendedor_id ? { vendedorId: a.vendedor_id } : {}),
    ...(a.clasificacion_tipo ? { clasificacion: { tipo: a.clasificacion_tipo, id: a.clasificacion_id! } } : {}),
  };
}
function exigirCostos(ctx: ContextoAgente, medida?: string) {
  if (!ctx.veCostos && medida === 'utilidad') {
    throw new ErrorHerramienta('El usuario NO tiene permiso para ver costos, utilidades ni márgenes. Dígaselo con amabilidad y ofrézcale ventas, unidades o número de ventas.');
  }
}
const f = (m: Medida) => ETIQUETA_MEDIDA[m];
const SUPUESTOS_VENTAS = (ctx: ContextoAgente) => [`Sucursal: ${ctx.sucursalNombre}.`, 'Ventas confirmadas (sin anuladas ni cotizaciones), por día contable, con IVA incluido.'];

// ───────────────────────── Definiciones para el modelo ─────────────────────────
const propFiltros = {
  producto_id: { type: 'integer', description: 'Solo este producto (obtenga el id con "buscar").' },
  clasificacion_tipo: { type: 'string', enum: ['categoria', 'grupo', 'subgrupo'], description: 'Tipo de clasificación a filtrar. Una sub-agrupación incluye todas las que tiene dentro.' },
  clasificacion_id: { type: 'integer', description: 'Id de la clasificación (obtenga el id con "buscar").' },
  vendedor_id: { type: 'integer', description: 'Solo las ventas de este vendedor (obtenga el id con "buscar").' },
};
const propMedida = (extra = '') => ({ type: 'string', enum: MEDIDAS, description: `Qué medir. total = ventas en quetzales; transacciones = número de ventas; unidades = piezas vendidas; ticket_promedio = venta promedio; descuentos = quetzales descontados; utilidad = ventas menos costo (requiere permiso).${extra}` });

export const DEFINICIONES = [
  {
    name: 'ventas_por_periodo',
    description: 'Serie de ventas a lo largo del tiempo (por día, semana, mes, año, día de la semana u hora). Úsela para tendencias, comparar meses o ver cuándo se vende más. Para preguntas sobre el futuro, obtenga primero esta serie (mensual o diaria) y luego use "proyectar".',
    input_schema: {
      type: 'object',
      properties: {
        desde: { type: 'string', description: 'Fecha inicial AAAA-MM-DD' }, hasta: { type: 'string', description: 'Fecha final AAAA-MM-DD' },
        agrupar_por: { type: 'string', enum: AGRUPAR, description: 'Cómo agrupar el tiempo. Para proyectar use mes (mínimo 6 meses, ideal 24+) o dia.' },
        medida: propMedida(), ...propFiltros,
      },
      required: ['desde', 'hasta', 'agrupar_por'],
    },
  },
  {
    name: 'ranking',
    description: 'Los que más o menos venden: productos, sub-agrupaciones, grupos, categorías, vendedores o medios de pago. Incluye la participación de cada uno en el total del período.',
    input_schema: {
      type: 'object',
      properties: {
        entidad: { type: 'string', enum: ENTIDADES }, desde: { type: 'string' }, hasta: { type: 'string' },
        medida: propMedida(' Para medio_pago solo sirven total y transacciones.'),
        limite: { type: 'integer', description: 'Cuántos mostrar (1 a 30). Por defecto 10.' },
        orden: { type: 'string', enum: ['mayor', 'menor'], description: 'mayor = los que más venden (por defecto); menor = los que menos.' },
        ...propFiltros,
      },
      required: ['entidad', 'desde', 'hasta'],
    },
  },
  {
    name: 'comparar_periodos',
    description: 'Compara dos períodos (por ejemplo este mes contra el mes pasado, o este año contra el anterior), en total o desglosado por producto, clasificación o vendedor. Calcula diferencia y variación porcentual. El período A es el principal (el más reciente) y el B es contra el que se compara.',
    input_schema: {
      type: 'object',
      properties: {
        medida: propMedida(), por: { type: 'string', enum: ['total', 'producto', 'subgrupo', 'grupo', 'categoria', 'vendedor'], description: 'total = una sola comparación; los demás desglosan.' },
        desde_a: { type: 'string' }, hasta_a: { type: 'string' }, desde_b: { type: 'string' }, hasta_b: { type: 'string' },
        limite: { type: 'integer', description: 'Cuántos mostrar si se desglosa (1 a 30). Por defecto 10.' }, ...propFiltros,
      },
      required: ['medida', 'por', 'desde_a', 'hasta_a', 'desde_b', 'hasta_b'],
    },
  },
  {
    name: 'inventario',
    description: 'Estado de las existencias de la sucursal: productos bajo el mínimo, agotados que sí se venden, sin ventas en N días (mercadería parada) o de mayor valor en inventario (requiere permiso de costos).',
    input_schema: {
      type: 'object',
      properties: {
        consulta: { type: 'string', enum: ['bajo_minimo', 'agotados_con_ventas', 'sin_ventas', 'mayor_valor'] },
        dias: { type: 'integer', description: 'Para agotados_con_ventas y sin_ventas: ventana de días hacia atrás (por defecto 90).' },
        limite: { type: 'integer', description: 'Cuántos mostrar (1 a 50). Por defecto 15.' },
      },
      required: ['consulta'],
    },
  },
  {
    name: 'compras',
    description: 'Compras a proveedores por proveedor, mes o día. Requiere permiso de costos.',
    input_schema: {
      type: 'object',
      properties: { desde: { type: 'string' }, hasta: { type: 'string' }, agrupar_por: { type: 'string', enum: ['proveedor', 'mes', 'dia'] }, limite: { type: 'integer', description: 'Por defecto 10.' } },
      required: ['desde', 'hasta', 'agrupar_por'],
    },
  },
  {
    name: 'buscar',
    description: 'Encuentra el id de un producto, una clasificación (categoría, grupo o sub-agrupación) o un vendedor a partir de su nombre. Úsela antes de filtrar por alguno de ellos.',
    input_schema: { type: 'object', properties: { tipo: { type: 'string', enum: ['producto', 'clasificacion', 'vendedor'] }, texto: { type: 'string', description: 'Parte del nombre (2 a 60 letras).' } }, required: ['tipo', 'texto'] },
  },
  {
    name: 'proyectar',
    description: 'Proyecta hacia adelante una serie obtenida con "ventas_por_periodo" (agrupada por mes, semana o día). Calcula con un método estadístico (tendencia y temporada), con intervalo del 80 % y una medida de qué tan confiable fue en el pasado. NUNCA invente proyecciones: use siempre esta herramienta. Excluye automáticamente el período en curso por estar incompleto.',
    input_schema: {
      type: 'object',
      properties: { resultado_id: { type: 'string', description: 'El resultado_id devuelto por ventas_por_periodo.' }, periodos_futuros: { type: 'integer', description: 'Cuántos períodos proyectar (máx. 24 meses, 52 semanas o 90 días).' } },
      required: ['resultado_id', 'periodos_futuros'],
    },
  },
  {
    name: 'entregar_respuesta',
    description: 'ÚLTIMO PASO: entrega la respuesta al usuario con la gráfica y la explicación. Llámela una sola vez, cuando ya tenga los datos. No repita las cifras en la explicación fila por fila: destaque lo importante.',
    input_schema: {
      type: 'object',
      properties: {
        resultado_id: { type: 'string', description: 'El resultado que se grafica (el último que sirva a la pregunta; si proyectó, el de proyectar).' },
        titulo: { type: 'string', description: 'Título corto de la gráfica (máx. 90 letras).' },
        tipo_grafica: { type: 'string', enum: ['barras', 'barras_horizontales', 'lineas', 'area', 'dona', 'numero', 'tabla'], description: 'Tipo sugerido. Si el usuario pidió uno específico, úselo. lineas/area: evolución en el tiempo; barras: comparar; barras_horizontales: rankings; dona: participación (2 a 8 partes); numero: una sola cifra.' },
        columnas_y: { type: 'array', items: { type: 'string' }, description: 'Columnas numéricas a graficar (por defecto, las principales).' },
        explicacion: { type: 'string', description: 'Explicación en español sencillo para el dueño del negocio: qué dicen los números, 2 a 4 hallazgos, y si hay proyección, el método, el rango y su confiabilidad. Máx. 900 letras. Sin tablas ni encabezados; puede usar guiones para viñetas.' },
      },
      required: ['resultado_id', 'titulo', 'tipo_grafica', 'explicacion'],
    },
  },
] as const;

// ───────────────────────── Tipos de gráfica compatibles con los datos ─────────────────────────
export function tiposDisponibles(r: Resultado, columnasY?: string[]): { tipos: TipoGrafica[]; sugerido: TipoGrafica } {
  const ys = (columnasY?.length ? columnasY : r.series).filter((c) => r.columnas.some((k) => k.clave === c));
  const n = r.filas.length;
  const tipos: TipoGrafica[] = [];
  if (n === 1) tipos.push('numero');
  if (n >= 2 && n <= 80) tipos.push('barras');
  if (n >= 2 && n <= 30 && !r.ordenada && ys.length === 1) tipos.push('barras_horizontales');
  if (n >= 3 && r.ordenada) tipos.push('lineas', 'area');
  const positivos = ys.length === 1 && r.filas.every((fila) => Number(fila[ys[0]] ?? 0) >= 0) && r.filas.reduce((s, fila) => s + Number(fila[ys[0]] ?? 0), 0) > 0;
  if (n >= 2 && n <= 8 && positivos && !r.proyeccion) tipos.push('dona');
  tipos.push('tabla');
  const sugerido: TipoGrafica = n === 1 ? 'numero'
    : r.ordenada ? (n >= 6 ? 'lineas' : 'barras')
    : n <= 5 && positivos && ys.length === 1 ? 'dona'
    : ys.length === 1 && n <= 30 ? 'barras_horizontales' : n <= 80 ? 'barras' : 'tabla';
  return { tipos, sugerido: tipos.includes(sugerido) ? sugerido : tipos[0] };
}

// ───────────────────────── Ejecución ─────────────────────────
const col = (clave: string, etiqueta: string, formato: Formato): Columna => ({ clave, etiqueta, formato });
const nombreAgrupar: Record<Agrupar, string> = { dia: 'día', semana: 'semana', mes: 'mes', anio: 'año', dia_de_la_semana: 'día de la semana', hora: 'hora del día' };
const GRAN: Partial<Record<Agrupar, Granularidad>> = { dia: 'dia', semana: 'semana', mes: 'mes' };
const MAX_PERIODOS: Partial<Record<Agrupar, number>> = { dia: 800, semana: 400, mes: 120, anio: 12 };

export class Herramientas {
  readonly resultados = new Map<string, Resultado>();
  readonly usadas: string[] = [];
  /** El resultado que se entregó al usuario (para proponer la plantilla). */
  entregadoId: string | null = null;
  private entregado: { titulo: string; tipo: string; columnasY?: string[] } | null = null;
  constructor(private readonly ctx: ContextoAgente) {}

  private guardar(r: Omit<Resultado, 'id'>): Resultado {
    if (this.resultados.size >= MAX_RESULTADOS) throw new ErrorHerramienta('Demasiadas consultas en esta pregunta: entregue la respuesta con lo que ya tiene.');
    const completo = { ...r, id: `r${this.resultados.size + 1}-${randomUUID().slice(0, 6)}` };
    this.resultados.set(completo.id, completo);
    return completo;
  }

  /** Lo que ve el modelo: resumen y una muestra de filas (la respuesta final usa los datos completos). */
  paraElModelo(r: Resultado, resumen: Record<string, unknown>) {
    const MAX = 40; const filas = r.filas.length <= MAX ? r.filas : [...r.filas.slice(0, 14), ...r.filas.slice(-14)];
    return {
      resultado_id: r.id, titulo: r.titulo, columnas: r.columnas.map((c) => ({ clave: c.clave, etiqueta: c.etiqueta })),
      total_filas: r.filas.length, ...(r.filas.length > MAX ? { nota: `Se muestran solo las primeras 14 y las últimas 14 de ${r.filas.length} filas; el resumen cubre todas.` } : {}),
      filas, resumen, supuestos: r.supuestos,
    };
  }

  async ejecutar(nombre: string, entrada: unknown): Promise<unknown> {
    this.usadas.push(nombre);
    const salida = await this.despachar(nombre, entrada);
    const id = (salida as { resultado_id?: string } | null)?.resultado_id;
    const r = id ? this.resultados.get(id) : undefined;
    if (r) r.origen = { herramienta: nombre, entrada, ...(nombre === 'proyectar' ? { dependeDe: String((entrada as { resultado_id?: unknown })?.resultado_id) } : {}) };
    return salida;
  }

  private async despachar(nombre: string, entrada: unknown): Promise<unknown> {
    switch (nombre) {
      case 'ventas_por_periodo': return this.ventasPorPeriodo(entrada);
      case 'ranking': return this.ranking(entrada);
      case 'comparar_periodos': return this.comparar(entrada);
      case 'inventario': return this.inventario(entrada);
      case 'compras': return this.compras(entrada);
      case 'buscar': return this.buscar(entrada);
      case 'proyectar': return this.proyectarSerie(entrada);
      default: throw new ErrorHerramienta(`La herramienta «${nombre}» no existe.`);
    }
  }

  private async ventasPorPeriodo(entrada: unknown) {
    const a = parsear(rango.extend({ agrupar_por: z.enum(AGRUPAR as [Agrupar, ...Agrupar[]]), medida: z.enum(MEDIDAS as [Medida, ...Medida[]]).default('total'), ...filtrosZ }), entrada);
    validarRango(a); exigirCostos(this.ctx, a.medida);
    const maxP = MAX_PERIODOS[a.agrupar_por];
    const nDias = dias(a.desde, a.hasta);
    const periodos = a.agrupar_por === 'dia' ? nDias : a.agrupar_por === 'semana' ? Math.ceil(nDias / 7) : a.agrupar_por === 'mes' ? Math.ceil(nDias / 30) : a.agrupar_por === 'anio' ? Math.ceil(nDias / 365) : 0;
    if (maxP && periodos > maxP) throw new ErrorHerramienta(`Ese rango tiene demasiados períodos por ${nombreAgrupar[a.agrupar_por]} (${periodos}; máximo ${maxP}). Use una agrupación más amplia o un rango menor.`);
    const filas = (await this.ctx.consultar(consultaSerie({ sucursalId: this.ctx.sucursalId, desde: a.desde, hasta: a.hasta, agrupar: a.agrupar_por, medida: a.medida, filtros: filtrosDe(a) })))
      .map((x) => ({ clave: String(x.clave), valor: Number(x.valor) }));
    const serie = completarSerie(filas, { desde: a.desde, hasta: a.hasta, agrupar: a.agrupar_por }).map((p) => ({ periodo: p.periodo, valor: redondear(p.valor) }));
    if (!serie.length) return { sin_datos: true, mensaje: 'No hay ventas con esos filtros en ese rango.' };
    const m = f(a.medida);
    const r = this.guardar({
      titulo: `${m.texto.replace(/ \(Q\)$/, '')} por ${nombreAgrupar[a.agrupar_por]}`,
      columnas: [col('periodo', nombreAgrupar[a.agrupar_por][0].toUpperCase() + nombreAgrupar[a.agrupar_por].slice(1), 'texto'), col('valor', m.texto, m.formato)],
      filas: serie, x: 'periodo', ordenada: true, series: ['valor'],
      ...(GRAN[a.agrupar_por] ? { serie: { granularidad: GRAN[a.agrupar_por]! } } : {}),
      supuestos: [...SUPUESTOS_VENTAS(this.ctx), `Del ${a.desde} al ${a.hasta}.`],
    });
    return this.paraElModelo(r, resumirSerie(serie, a.medida === 'ticket_promedio'));
  }

  private async ranking(entrada: unknown) {
    const a = parsear(rango.extend({
      entidad: z.enum(ENTIDADES as [string, ...string[]]), medida: z.enum(MEDIDAS as [Medida, ...Medida[]]).default('total'),
      limite: z.coerce.number().int().min(1).max(30).default(10), orden: z.enum(['mayor', 'menor']).default('mayor'), ...filtrosZ,
    }), entrada);
    validarRango(a); exigirCostos(this.ctx, a.medida);
    if (a.entidad === 'medio_pago' && !['total', 'transacciones'].includes(a.medida)) throw new ErrorHerramienta('Por medio de pago solo se puede medir total o transacciones.');
    const filas = await this.ctx.consultar(consultaRanking({ sucursalId: this.ctx.sucursalId, desde: a.desde, hasta: a.hasta, entidad: a.entidad as never, medida: a.medida, orden: a.orden, limite: a.limite, filtros: filtrosDe(a) }));
    if (!filas.length) return { sin_datos: true, mensaje: 'No hay ventas con esos filtros en ese rango.' };
    const m = f(a.medida);
    const total = Number(filas[0].total_general ?? 0);
    const conParticipacion = a.medida !== 'ticket_promedio' && total > 0;
    const datos: Fila[] = filas.map((x) => ({
      etiqueta: a.entidad === 'medio_pago' ? String(x.etiqueta).charAt(0) + String(x.etiqueta).slice(1).toLowerCase() : String(x.etiqueta),
      ...(x.detalle ? { detalle: String(x.detalle) } : {}), valor: redondear(Number(x.valor)),
      ...(conParticipacion ? { participacion: redondear((Number(x.valor) / total) * 100) } : {}),
    }));
    const NOMBRE: Record<string, string> = { producto: 'Producto', subgrupo: 'Sub-agrupación', grupo: 'Grupo', categoria: 'Categoría', vendedor: 'Vendedor', medio_pago: 'Medio de pago' };
    const r = this.guardar({
      titulo: `${a.orden === 'menor' ? 'Menores' : 'Mayores'} ${datos.length} por ${NOMBRE[a.entidad].toLowerCase()}: ${m.texto.replace(/ \(Q\)$/, '').toLowerCase()}`,
      columnas: [col('etiqueta', NOMBRE[a.entidad], 'texto'), ...(datos[0].detalle ? [col('detalle', 'Código', 'texto')] : []), col('valor', m.texto, m.formato), ...(conParticipacion ? [col('participacion', 'Participación', 'porcentaje')] : [])],
      filas: datos, x: 'etiqueta', ordenada: false, series: ['valor'],
      supuestos: [...SUPUESTOS_VENTAS(this.ctx), `Del ${a.desde} al ${a.hasta}.${a.entidad === 'medio_pago' ? ' Montos recibidos por cada medio.' : ''}`],
    });
    const suma = datos.reduce((s, x) => s + Number(x.valor), 0);
    return this.paraElModelo(r, { total_del_periodo_completo: redondear(total), suma_de_los_mostrados: redondear(suma), participacion_de_los_mostrados_pct: total > 0 ? redondear((suma / total) * 100) : null });
  }

  private async comparar(entrada: unknown) {
    const a = parsear(z.object({
      medida: z.enum(MEDIDAS as [Medida, ...Medida[]]), por: z.enum(['total', 'producto', 'subgrupo', 'grupo', 'categoria', 'vendedor']),
      desde_a: fecha, hasta_a: fecha, desde_b: fecha, hasta_b: fecha, limite: z.coerce.number().int().min(1).max(30).default(10), ...filtrosZ,
    }), entrada);
    validarRango({ desde: a.desde_a, hasta: a.hasta_a }); validarRango({ desde: a.desde_b, hasta: a.hasta_b }); exigirCostos(this.ctx, a.medida);
    const filtros = filtrosDe(a); const m = f(a.medida);
    const etA = `${a.desde_a} a ${a.hasta_a}`; const etB = `${a.desde_b} a ${a.hasta_b}`;
    let filas: { etiqueta: string; a: number; b: number }[];
    if (a.por === 'total') {
      const [ra, rb] = await Promise.all([a.desde_a, a.desde_b].map((d, i) => this.ctx.consultar(consultaTotal({ sucursalId: this.ctx.sucursalId, desde: d, hasta: i ? a.hasta_b : a.hasta_a, medida: a.medida, filtros }))));
      filas = [{ etiqueta: 'Total', a: Number(ra[0]?.valor ?? 0), b: Number(rb[0]?.valor ?? 0) }];
    } else {
      const entidad = a.por; // ya sin 'total' (el tipo se conserva dentro de la función)
      const pedir = (d: string, h: string) => this.ctx.consultar(consultaRanking({ sucursalId: this.ctx.sucursalId, desde: d, hasta: h, entidad, medida: a.medida, orden: 'mayor', limite: 500, filtros }));
      const [ra, rb] = await Promise.all([pedir(a.desde_a, a.hasta_a), pedir(a.desde_b, a.hasta_b)]);
      const mapa = new Map<string, { etiqueta: string; a: number; b: number }>();
      for (const x of ra) mapa.set(String(x.id), { etiqueta: String(x.etiqueta), a: Number(x.valor), b: 0 });
      for (const x of rb) { const k = String(x.id); const e = mapa.get(k) ?? { etiqueta: String(x.etiqueta), a: 0, b: 0 }; e.b = Number(x.valor); mapa.set(k, e); }
      filas = [...mapa.values()].sort((p, q) => Math.abs(q.a - q.b) - Math.abs(p.a - p.b)).slice(0, a.limite);
    }
    if (!filas.length || filas.every((x) => x.a === 0 && x.b === 0)) return { sin_datos: true, mensaje: 'No hay ventas en ninguno de los dos períodos con esos filtros.' };
    const datos: Fila[] = filas.map((x) => ({ etiqueta: x.etiqueta, a: redondear(x.a), b: redondear(x.b), diferencia: redondear(x.a - x.b), variacion_pct: x.b !== 0 ? redondear(((x.a - x.b) / Math.abs(x.b)) * 100) : null }));
    const r = this.guardar({
      titulo: `${m.texto.replace(/ \(Q\)$/, '')}: ${etA} contra ${etB}`,
      columnas: [col('etiqueta', a.por === 'total' ? 'Comparación' : a.por[0].toUpperCase() + a.por.slice(1), 'texto'), col('a', `Período A (${etA})`, m.formato), col('b', `Período B (${etB})`, m.formato), col('diferencia', 'Diferencia', m.formato), col('variacion_pct', 'Variación', 'porcentaje')],
      filas: datos, x: 'etiqueta', ordenada: false, series: ['a', 'b'],
      supuestos: [...SUPUESTOS_VENTAS(this.ctx), `A = ${etA}. B = ${etB}. Variación = (A − B) / B.${filas.length === a.limite && a.por !== 'total' ? ` Se muestran los ${a.limite} con mayor cambio.` : ''}`],
    });
    const tA = filas.reduce((s, x) => s + x.a, 0); const tB = filas.reduce((s, x) => s + x.b, 0);
    return this.paraElModelo(r, { total_a: redondear(tA), total_b: redondear(tB), variacion_total_pct: tB !== 0 ? redondear(((tA - tB) / Math.abs(tB)) * 100) : null });
  }

  private async inventario(entrada: unknown) {
    const a = parsear(z.object({ consulta: z.enum(['bajo_minimo', 'agotados_con_ventas', 'sin_ventas', 'mayor_valor']), dias: z.coerce.number().int().min(1).max(730).default(90), limite: z.coerce.number().int().min(1).max(50).default(15) }), entrada);
    if (a.consulta === 'mayor_valor' && !this.ctx.veCostos) throw new ErrorHerramienta('El usuario NO tiene permiso para ver el valor del inventario (costos). Ofrezca ver productos bajo el mínimo o sin movimiento.');
    const filas = await this.ctx.consultar(consultaInventario({ sucursalId: this.ctx.sucursalId, estado: a.consulta, dias: a.dias, hoy: this.ctx.hoy, limite: a.limite, conCostos: this.ctx.veCostos }));
    if (!filas.length) return { sin_datos: true, mensaje: 'No hay productos en esa situación.' };
    const titulos = { bajo_minimo: 'Productos bajo el stock mínimo', agotados_con_ventas: `Agotados que se vendieron en los últimos ${a.dias} días`, sin_ventas: `Con existencia y sin ventas en ${a.dias} días`, mayor_valor: 'Mayor valor en inventario' };
    const columnas = [col('etiqueta', 'Producto', 'texto'), col('existencia', 'Existencia', 'numero')];
    if (a.consulta === 'bajo_minimo') columnas.push(col('minimo', 'Mínimo', 'numero'));
    if (a.consulta === 'agotados_con_ventas') columnas.push(col('vendidas_periodo', `Vendidas (${a.dias} días)`, 'numero'));
    if (a.consulta === 'sin_ventas') columnas.push(col('ultima_venta', 'Última venta', 'texto'));
    if (this.ctx.veCostos && 'valor' in filas[0]) columnas.push(col('valor', 'Valor a costo (Q)', 'moneda'));
    const datos = filas.map((x) => Object.fromEntries(columnas.map((c) => [c.clave, typeof x[c.clave] === 'number' ? redondear(x[c.clave] as number) : (x[c.clave] as string | null) ?? null]))) as Fila[];
    const r = this.guardar({
      titulo: titulos[a.consulta], columnas, filas: datos, x: 'etiqueta', ordenada: false,
      series: [a.consulta === 'mayor_valor' ? 'valor' : a.consulta === 'agotados_con_ventas' ? 'vendidas_periodo' : 'existencia'],
      supuestos: [`Sucursal: ${this.ctx.sucursalNombre}.`, 'Existencias de las bodegas activas de la sucursal.'],
    });
    return this.paraElModelo(r, { productos: datos.length });
  }

  private async compras(entrada: unknown) {
    const a = parsear(rango.extend({ agrupar_por: z.enum(['proveedor', 'mes', 'dia']), limite: z.coerce.number().int().min(1).max(50).default(10) }), entrada);
    validarRango(a);
    if (!this.ctx.veCostos) throw new ErrorHerramienta('El usuario NO tiene permiso para ver las compras (costos). Ofrézcale información de ventas o inventario.');
    const filas = (await this.ctx.consultar(consultaCompras({ sucursalId: this.ctx.sucursalId, desde: a.desde, hasta: a.hasta, agrupar: a.agrupar_por, limite: a.limite }))).map((x) => ({ clave: String(x.clave), valor: Number(x.valor) }));
    if (!filas.length) return { sin_datos: true, mensaje: 'No hay compras en ese rango.' };
    const datos = (a.agrupar_por === 'mes' ? completarSerie(filas, { desde: a.desde, hasta: a.hasta, agrupar: 'mes' }).map((p) => ({ etiqueta: p.periodo, valor: redondear(p.valor) })) : filas.map((x) => ({ etiqueta: x.clave, valor: redondear(x.valor) }))) as Fila[];
    const r = this.guardar({
      titulo: `Compras por ${a.agrupar_por}`, columnas: [col('etiqueta', a.agrupar_por === 'proveedor' ? 'Proveedor' : a.agrupar_por === 'mes' ? 'Mes' : 'Día', 'texto'), col('valor', 'Compras (Q)', 'moneda')],
      filas: datos, x: 'etiqueta', ordenada: a.agrupar_por !== 'proveedor', series: ['valor'], supuestos: [`Sucursal: ${this.ctx.sucursalNombre}.`, 'Compras confirmadas por día contable.', `Del ${a.desde} al ${a.hasta}.`],
    });
    return this.paraElModelo(r, resumirSerie(datos.map((x) => ({ periodo: String(x.etiqueta), valor: Number(x.valor) }))));
  }

  private async buscar(entrada: unknown) {
    const a = parsear(z.object({ tipo: z.enum(['producto', 'clasificacion', 'vendedor']), texto: z.string().trim().min(2).max(60) }), entrada);
    const filas = await this.ctx.consultar(consultaBuscar(a));
    return { encontrados: filas.map((x) => ({ id: Number(x.id), nombre: String(x.etiqueta), ...(x.tipo ? { tipo: String(x.tipo) } : {}), ...(x.sku ? { codigo: String(x.sku) } : {}) })), ...(filas.length ? {} : { mensaje: 'No se encontró nada con ese texto. Pruebe con una parte más corta del nombre.' }) };
  }

  private async proyectarSerie(entrada: unknown) {
    const a = parsear(z.object({ resultado_id: z.string().min(1), periodos_futuros: z.coerce.number().int().min(1).max(90) }), entrada);
    const base = this.resultados.get(a.resultado_id);
    if (!base) throw new ErrorHerramienta(`No existe el resultado «${a.resultado_id}». Obtenga primero la serie con ventas_por_periodo.`);
    if (!base.serie) throw new ErrorHerramienta('Solo se pueden proyectar series por mes, semana o día obtenidas con ventas_por_periodo.');
    const g = base.serie.granularidad;
    const { puntos, descartado } = descartarPeriodoIncompleto(base.filas.map((x) => ({ periodo: String(x.periodo), valor: Number(x.valor) })), g, this.ctx.hoy);
    // El período en curso se excluye de la historia (está incompleto) pero se proyecta aparte:
    // los N períodos pedidos son los SIGUIENTES a él ("próximos 3 meses" = nov, dic y ene si hoy es octubre).
    const extra = descartado ? 1 : 0;
    const total = Math.min(a.periodos_futuros + extra, MAXIMO_FUTURO[g]);
    let p;
    try { p = proyectar(puntos, g, total); } catch (e) { if (e instanceof ErrorProyeccion) throw new ErrorHerramienta(e.message); throw e; }
    const enCurso = descartado ? p.puntos[0] : null;
    const futuros = p.puntos.slice(extra);
    const acumulado = descartado ? Number(base.filas.find((x) => x.periodo === descartado)?.valor ?? 0) : null;
    const advertencias = [...p.advertencias, ...(descartado ? [`${descartado} aún está en curso (incompleto): no se usó como historia y se proyecta aparte.`] : []), ...(total < a.periodos_futuros + extra ? [`Se limitó a ${MAXIMO_FUTURO[g]} períodos, el máximo que se puede proyectar.`] : [])];
    const ultimo = puntos[puntos.length - 1];
    const filas: Fila[] = [
      ...puntos.map((x) => ({ periodo: x.periodo, valor: redondear(x.valor), proyeccion: x === ultimo ? redondear(x.valor) : null, inferior: x === ultimo ? redondear(x.valor) : null, superior: x === ultimo ? redondear(x.valor) : null })),
      ...p.puntos.map((x) => ({ periodo: x.periodo, valor: null, proyeccion: x.proyeccion, inferior: x.inferior, superior: x.superior })),
    ];
    const unidad = base.columnas.find((c) => c.clave === 'valor')!;
    const r = this.guardar({
      titulo: `${base.titulo}: historia y proyección`,
      columnas: [col('periodo', base.columnas[0].etiqueta, 'texto'), col('valor', `${unidad.etiqueta} (real)`, unidad.formato), col('proyeccion', 'Proyección', unidad.formato), col('inferior', 'Mínimo probable', unidad.formato), col('superior', 'Máximo probable', unidad.formato)],
      filas, x: 'periodo', ordenada: true, series: ['valor'],
      proyeccion: { metodo: p.metodo, descripcion: p.descripcion, errorPct: p.errorPct, confianza: p.confianza, advertencias, columnas: { proyeccion: 'proyeccion', inferior: 'inferior', superior: 'superior' } },
      supuestos: [...base.supuestos, `Proyección: ${p.descripcion}. Intervalo del 80 %.`, ...(descartado ? [`${descartado} (en curso) se proyecta aparte y no cuenta en la historia.`] : [])],
    });
    // Comparación con el mismo período del año anterior (solo series mensuales)
    let vsAnioAnterior: number | null = null;
    if (g === 'mes') {
      const hist = new Map(puntos.map((x) => [x.periodo, x.valor]));
      const previos = futuros.map((x) => hist.get(`${Number(x.periodo.slice(0, 4)) - 1}${x.periodo.slice(4)}`));
      if (futuros.length && previos.every((v) => v != null)) { const sp = futuros.reduce((s, x) => s + x.proyeccion, 0); const sa = previos.reduce((s, v) => s + (v as number), 0); vsAnioAnterior = sa > 0 ? redondear(((sp - sa) / sa) * 100) : null; }
    }
    return {
      resultado_id: r.id, titulo: r.titulo, metodo: p.descripcion, confianza: p.confianza,
      error_de_la_prueba_retrospectiva_pct: p.errorPct, periodos_de_historia_usados: p.periodosUsados, advertencias,
      ...(enCurso ? { periodo_en_curso: { periodo: descartado, vendido_hasta_hoy: redondear(acumulado ?? 0), proyeccion_al_cierre: enCurso.proyeccion, rango_probable: [enCurso.inferior, enCurso.superior] } } : {}),
      proyeccion: futuros, total_proyectado_de_los_periodos_futuros: redondear(futuros.reduce((s, x) => s + x.proyeccion, 0)),
      comparacion_con_mismos_periodos_del_anio_anterior_pct: vsAnioAnterior, ultimos_periodos_reales: puntos.slice(-12).map((x) => ({ periodo: x.periodo, valor: redondear(x.valor) })),
      nota: 'Las cifras proyectadas las calculó un método estadístico, no usted: explíquelas con sus palabras, indique el rango y la confiabilidad.',
    };
  }

  /** Arma la respuesta final con los DATOS COMPLETOS del resultado elegido. */
  entregar(entrada: unknown, opciones: { exigirExplicacion?: boolean } = {}) {
    const a = parsear(z.object({
      resultado_id: z.string().min(1), titulo: z.string().trim().min(1).max(120), tipo_grafica: z.enum(['barras', 'barras_horizontales', 'lineas', 'area', 'dona', 'numero', 'tabla']),
      columnas_y: z.array(z.string()).max(6).optional(), explicacion: z.string().trim().max(2500),
    }), entrada);
    if ((opciones.exigirExplicacion ?? true) && !a.explicacion) throw new ErrorHerramienta('Falta la explicación para el usuario.');
    const r = this.resultados.get(a.resultado_id);
    if (!r) throw new ErrorHerramienta(`No existe el resultado «${a.resultado_id}». Use el resultado_id que devolvió una herramienta.`);
    const validas = (a.columnas_y ?? []).filter((c) => r.columnas.some((k) => k.clave === c && k.formato !== 'texto'));
    const ys = validas.length ? validas : r.series;
    const { tipos, sugerido } = tiposDisponibles(r, ys);
    const tipo = tipos.includes(a.tipo_grafica) ? a.tipo_grafica : sugerido;
    this.entregadoId = r.id;
    this.entregado = { titulo: a.titulo, tipo, columnasY: validas.length ? validas : undefined };
    const avisos = tipo !== a.tipo_grafica ? [`El tipo de gráfica pedido («${a.tipo_grafica}») no sirve para estos datos; se usó «${tipo}».`] : [];
    return {
      titulo: a.titulo, explicacion: a.explicacion,
      grafica: {
        tipo, tiposDisponibles: tipos, x: r.x, ordenada: r.ordenada,
        series: ys.map((c) => { const k = r.columnas.find((x) => x.clave === c)!; return { clave: c, etiqueta: k.etiqueta, formato: k.formato }; }),
        proyeccion: r.proyeccion ? r.proyeccion.columnas : null,
      },
      columnas: r.columnas, filas: r.filas,
      proyeccion: r.proyeccion ? { metodo: r.proyeccion.descripcion, errorPct: r.proyeccion.errorPct, confianza: r.proyeccion.confianza, advertencias: r.proyeccion.advertencias } : null,
      supuestos: r.supuestos, avisos,
    };
  }

  // ───────────── Plantillas: encadenar, ejecutar y proponer ─────────────

  /** Pasos (en orden) que llevaron a un resultado: p. ej. serie mensual → proyección. */
  cadenaDe(id: string): PasoResuelto[] {
    const pasos: PasoResuelto[] = []; const vistos = new Set<string>(); let actual: string | undefined = id;
    while (actual && !vistos.has(actual)) {
      vistos.add(actual);
      const o: Resultado['origen'] = this.resultados.get(actual)?.origen;
      if (!o) break;
      pasos.unshift({ herramienta: o.herramienta, entrada: { ...(o.entrada as Record<string, unknown>) } });
      actual = o.dependeDe;
    }
    return pasos;
  }

  /** La plantilla que equivale a lo que se acaba de responder (null si no se puede guardar). */
  plantillaSugerida(hoy: string): { definicion: Definicion; fijos: string[] } | null {
    if (!this.entregadoId || !this.entregado) return null;
    const cadena = this.cadenaDe(this.entregadoId);
    if (!cadena.length) return null;
    try { return aDefinicion(cadena, this.entregado.titulo, { tipoGrafica: this.entregado.tipo as never, columnasY: this.entregado.columnasY }, hoy); } catch { return null; }
  }

  /** Ejecuta pasos ya resueltos ("@anterior" = el resultado del paso previo). Devuelve el id del último resultado. */
  async ejecutarPlan(pasos: PasoResuelto[]): Promise<string> {
    let anterior = '';
    for (const p of pasos) {
      const entrada = { ...p.entrada };
      if (entrada.resultado_id === '@anterior') {
        if (!anterior) throw new ErrorHerramienta('El análisis guardado está mal armado: la proyección no tiene una serie antes.');
        entrada.resultado_id = anterior;
      }
      const salida = (await this.ejecutar(p.herramienta, entrada)) as { resultado_id?: string; sin_datos?: boolean; mensaje?: string };
      if (salida.sin_datos || !salida.resultado_id) throw new ErrorHerramienta(salida.mensaje ?? 'No hay datos para ese período.');
      anterior = salida.resultado_id;
    }
    return anterior;
  }

  /** Entrega un resultado ya ejecutado, sin explicación de la IA. */
  entregarPlantilla(resultadoId: string, titulo: string, tipoGrafica?: string, columnasY?: string[]) {
    const r = this.resultados.get(resultadoId);
    if (!r) throw new ErrorHerramienta('No se pudo preparar el resultado.');
    const tipo = (tipoGrafica ?? tiposDisponibles(r, columnasY).sugerido) as TipoGrafica;
    return this.entregar({ resultado_id: resultadoId, titulo, tipo_grafica: tipo, columnas_y: columnasY, explicacion: '' }, { exigirExplicacion: false });
  }

  /** Lo que ve la IA cuando solo hay que explicar un resultado (resumen + muestra de filas). */
  paraExplicar(resultadoId: string) {
    const r = this.resultados.get(resultadoId);
    if (!r) throw new ErrorHerramienta('No se pudo preparar el resultado.');
    const pts = r.ordenada && r.series[0] ? r.filas.filter((x) => x[r.series[0]] != null).map((x) => ({ periodo: String(x[r.x]), valor: Number(x[r.series[0]]) })) : [];
    const resumen = pts.length ? resumirSerie(pts) : { filas: r.filas.length };
    return { ...this.paraElModelo(r, resumen), ...(r.proyeccion ? { proyeccion: { metodo: r.proyeccion.descripcion, confianza: r.proyeccion.confianza, error_pct: r.proyeccion.errorPct, advertencias: r.proyeccion.advertencias } } : {}) };
  }
}
export { DIAS_SEMANA, siguientePeriodo };
