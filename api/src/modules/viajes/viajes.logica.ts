/**
 * VIAJES (lógica pura, sin base de datos): estados, tarifa sugerida, liquidación y cotizador.
 * Todo monto se calcula con Decimal y se redondea a 2 decimales al final de cada partida.
 */
import { z } from 'zod';
import { D, Decimal, Num, r2, suma, ZERO } from '../../common/money';
import { zBool, zIdOpt, zIdReq, zMontoOpt, zNum } from '../../common/pipes/zod';

// ─────────────────────────────── Estados ───────────────────────────────────

export type Estado = 'PROGRAMADO' | 'EN_RUTA' | 'FINALIZADO' | 'LIQUIDADO' | 'CANCELADO';

/** Qué acción lleva de qué estado a cuál. Cualquier otra combinación se rechaza. */
export const TRANSICIONES: Record<'iniciar' | 'finalizar' | 'liquidar' | 'cancelar', Estado[]> = {
  iniciar: ['PROGRAMADO'],
  finalizar: ['EN_RUTA'],
  liquidar: ['FINALIZADO'],
  cancelar: ['PROGRAMADO', 'EN_RUTA'],
};

/** Costos y anticipos se pueden tocar mientras el viaje no esté liquidado ni cancelado. */
export const admiteCostos = (e: Estado) => e === 'PROGRAMADO' || e === 'EN_RUTA' || e === 'FINALIZADO';

export const ETIQUETA_ESTADO: Record<Estado, string> = {
  PROGRAMADO: 'programado', EN_RUTA: 'en ruta', FINALIZADO: 'finalizado', LIQUIDADO: 'liquidado', CANCELADO: 'cancelado',
};

// ─────────────────────────────── Tarifa ────────────────────────────────────

/** Monto a cobrar según el tipo de tarifa: fijo por viaje, por km de la ruta o por tonelada. */
export function montoPorTarifa(t: { tipo: 'POR_VIAJE' | 'POR_KM' | 'POR_TONELADA'; monto: Num }, km: Num, toneladas: Num): Decimal {
  if (t.tipo === 'POR_KM') return r2(D(t.monto).times(D(km)));
  if (t.tipo === 'POR_TONELADA') return r2(D(t.monto).times(D(toneladas)));
  return r2(t.monto);
}

/** Tarifa vigente en una fecha: primero la de esa ruta, si no la general del cliente (sin ruta). */
export function elegirTarifa<T extends { rutaId: number | null; vigenteDesde: Date; vigenteHasta: Date | null; activo: boolean }>(tarifas: T[], rutaId: number | null, fecha: Date): T | null {
  const vigentes = tarifas.filter((t) => t.activo && t.vigenteDesde <= fecha && (!t.vigenteHasta || t.vigenteHasta >= fecha))
    .sort((a, b) => b.vigenteDesde.getTime() - a.vigenteDesde.getTime());
  return (rutaId != null ? vigentes.find((t) => t.rutaId === rutaId) : undefined) ?? vigentes.find((t) => t.rutaId == null) ?? null;
}

// ─────────────────────────────── Liquidación ───────────────────────────────

export interface CostoLiq { tipo: string; monto: Num; pagadoPorPiloto: boolean }

export interface Liquidacion {
  cobrado: Decimal;
  costosDirectos: Decimal;
  porTipo: { tipo: string; monto: Decimal }[];
  pagadoPorPiloto: Decimal; // salió del anticipo
  pagadoPorEmpresa: Decimal; // crédito, tarjeta de flota…
  anticipos: Decimal;
  /** + el piloto devuelve efectivo · − la empresa le debe (gastó más de lo que recibió) */
  saldoPiloto: Decimal;
  pagoPiloto: Decimal; // bono por viaje (va a planilla)
  kmRecorridos: Decimal;
  costoKmFijo: Decimal;
  prorrateo: Decimal;
  ganancia: Decimal;
  /** ganancia ÷ cobrado × 100; null si no se cobró nada */
  margen: Decimal | null;
}

export function liquidar(d: { montoCobrado: Num; pagoPiloto: Num; costos: CostoLiq[]; anticipos: Num[]; kmRecorridos: Num; costoKmFijo: Num }): Liquidacion {
  const porTipo = new Map<string, Decimal>();
  for (const c of d.costos) porTipo.set(c.tipo, (porTipo.get(c.tipo) ?? ZERO).plus(D(c.monto)));
  const costosDirectos = r2(suma(d.costos.map((c) => c.monto)));
  const pagadoPorPiloto = r2(suma(d.costos.filter((c) => c.pagadoPorPiloto).map((c) => c.monto)));
  const anticipos = r2(suma(d.anticipos));
  const cobrado = r2(d.montoCobrado);
  const pagoPiloto = r2(d.pagoPiloto);
  const km = D(d.kmRecorridos).isNegative() ? ZERO : D(d.kmRecorridos);
  const prorrateo = r2(km.times(D(d.costoKmFijo)));
  const ganancia = r2(cobrado.minus(costosDirectos).minus(pagoPiloto).minus(prorrateo));
  return {
    cobrado, costosDirectos, pagadoPorPiloto, anticipos, pagoPiloto, prorrateo, ganancia,
    porTipo: [...porTipo].map(([tipo, monto]) => ({ tipo, monto: r2(monto) })).sort((a, b) => b.monto.cmp(a.monto)),
    pagadoPorEmpresa: r2(costosDirectos.minus(pagadoPorPiloto)),
    saldoPiloto: r2(anticipos.minus(pagadoPorPiloto)),
    kmRecorridos: km,
    costoKmFijo: D(d.costoKmFijo),
    margen: cobrado.isZero() ? null : ganancia.div(cobrado).times(100).toDecimalPlaces(1),
  };
}

// ─────────────────────────────── Cotizador ─────────────────────────────────

export type Regreso = 'VACIO' | 'CARGADO' | 'NINGUNO';
export type Terreno = 'PLANO' | 'ONDULADO' | 'MONTANA';
export type Trafico = 'FLUIDO' | 'NORMAL' | 'LENTO' | 'MUY_LENTO';

/** Más tiempo por tráfico (multiplica la duración en ruta). Fijos: solo estiman la duración, no el costo. */
export const FACTOR_TIEMPO: Record<Trafico, number> = { FLUIDO: 0.9, NORMAL: 1, LENTO: 1.35, MUY_LENTO: 1.8 };

/** Factores configurables (parámetros cotizador.*), en %. */
export interface Factores {
  combustibleTerreno: Record<Terreno, Num>;
  desgasteTerreno: Record<Terreno, Num>;
  combustibleTrafico: Record<Trafico, Num>;
  galonesPor100mSubida: Num;
  velocidadPromedio: Num; // km/h
  costoHoraEspera: Num;
}

export interface EntradaCotizacion {
  kmIda: Num;
  regreso: Regreso; // VACIO: vuelve sin carga · CARGADO: ida y vuelta con carga del cliente · NINGUNO: solo ida
  terreno: Terreno;
  trafico: Trafico;
  subidaMetros?: Num | null; // ascenso acumulado de ida; si se conoce reemplaza el % de terreno en el combustible
  horasEspera: Num; // colas en aduana, puerto o planta (total del viaje)
  horasIda?: Num | null; // duración conocida de la ruta (si no, km ÷ velocidad promedio)
  rendimiento: Num; // km/gal
  rendimientoDeRuta?: boolean; // el rendimiento ya es el histórico de esta ruta: no se le suman % de terreno ni tráfico
  precioGalon: Num;
  peajes: Num; // por sentido
  viatico: Num; // por sentido
  pagoPiloto: Num; // por viaje
  costoKmIndirecto: Num; // taller, llantas, sueldos y fijos ÷ km
  extras: { concepto: string; monto: Num }[];
  margenObjetivo: Num; // % sobre el costo
  factores: Factores;
  tarifaActual?: Num | null;
}

export function cotizar(e: EntradaCotizacion) {
  const f = e.factores;
  const ida = D(e.kmIda);
  const sentidos = e.regreso === 'NINGUNO' ? 1 : 2;
  const kmVacios = e.regreso === 'VACIO' ? ida : D(0);
  const kmCargados = e.regreso === 'CARGADO' ? ida.times(2) : ida;
  const kmTotal = kmCargados.plus(kmVacios);
  const rend = D(e.rendimiento);
  const galBase = rend.gt(0) ? kmTotal.div(rend) : D(0);

  // Combustible extra por terreno (o por subida medida) y por tráfico
  const conSubida = e.subidaMetros != null && D(e.subidaMetros).gt(0);
  const pctTerreno = e.rendimientoDeRuta || conSubida ? D(0) : D(f.combustibleTerreno[e.terreno]);
  const pctTrafico = e.rendimientoDeRuta ? D(0) : D(f.combustibleTrafico[e.trafico]);
  // La subida pesa con carga: cada sentido cargado sube lo suyo (el regreso vacío consume mucho menos y se ignora)
  const sentidosCargados = e.regreso === 'CARGADO' ? 2 : 1;
  const galSubida = conSubida && !e.rendimientoDeRuta ? D(e.subidaMetros).div(100).times(D(f.galonesPor100mSubida)).times(sentidosCargados) : D(0);
  const galones = galBase.times(D(1).plus(pctTerreno.plus(pctTrafico).div(100))).plus(galSubida);
  const combustible = r2(galones.times(D(e.precioGalon)));

  const pctDesgaste = D(f.desgasteTerreno[e.terreno]);
  const indirectos = r2(kmTotal.times(D(e.costoKmIndirecto)).times(D(1).plus(pctDesgaste.div(100))));

  const horasRuta = (e.horasIda != null && D(e.horasIda).gt(0) ? D(e.horasIda) : D(f.velocidadPromedio).gt(0) ? ida.div(D(f.velocidadPromedio)) : D(0))
    .times(sentidos).times(FACTOR_TIEMPO[e.trafico]);
  const horasTotal = horasRuta.plus(D(e.horasEspera));
  const espera = r2(D(e.horasEspera).times(D(f.costoHoraEspera)));

  const supuestosComb = [
    `${kmTotal.toFixed(0)} km ÷ ${rend.toFixed(2)} km/gal = ${galBase.toFixed(1)} gal`,
    pctTerreno.gt(0) ? `+${pctTerreno.toFixed(0)} % terreno` : null,
    pctTrafico.gt(0) ? `+${pctTrafico.toFixed(0)} % tráfico` : null,
    galSubida.gt(0) ? `+${galSubida.toFixed(1)} gal por ${D(e.subidaMetros).toFixed(0)} m de subida` : null,
    e.rendimientoDeRuta ? 'rendimiento histórico de la ruta' : null,
  ].filter(Boolean).join(' · ');
  const partidas = [
    { concepto: 'Combustible', monto: combustible, detalle: `${supuestosComb} → ${galones.toFixed(1)} gal × Q${D(e.precioGalon).toFixed(2)}` },
    { concepto: 'Peajes', monto: r2(D(e.peajes).times(sentidos)), detalle: `${sentidos} sentido(s)` },
    { concepto: 'Viáticos', monto: r2(D(e.viatico).times(sentidos)), detalle: `${sentidos} sentido(s)` },
    { concepto: 'Pago al piloto', monto: r2(e.pagoPiloto), detalle: 'bono por viaje' },
    { concepto: 'Taller, llantas, sueldos y fijos', monto: indirectos, detalle: `${kmTotal.toFixed(0)} km × Q${D(e.costoKmIndirecto).toFixed(2)}/km${pctDesgaste.gt(0) ? ` +${pctDesgaste.toFixed(0)} % desgaste por terreno` : ''}` },
    ...(espera.gt(0) ? [{ concepto: 'Esperas y colas', monto: espera, detalle: `${D(e.horasEspera).toFixed(1)} h × Q${D(f.costoHoraEspera).toFixed(2)}` }] : []),
    ...e.extras.filter((x) => D(x.monto).gt(0)).map((x) => ({ concepto: x.concepto, monto: r2(x.monto), detalle: 'extra' })),
  ].filter((p) => !(p.monto.isZero() && ['Peajes', 'Viáticos'].includes(p.concepto)));
  const costoTotal = r2(suma(partidas.map((p) => p.monto)));
  const precioSugerido = r2(costoTotal.times(D(1).plus(D(e.margenObjetivo).div(100))));
  const redondear = (v: Decimal) => v.div(50).ceil().times(50); // cotizar en números limpios (a Q50)
  const tarifa = e.tarifaActual != null ? r2(e.tarifaActual) : null;
  return {
    kmTotal, kmCargados, kmVacios, galones: galones.toDecimalPlaces(1), horasEstimadas: horasTotal.toDecimalPlaces(1), partidas, costoTotal,
    costoPorKm: kmTotal.gt(0) ? costoTotal.div(kmTotal).toDecimalPlaces(2) : ZERO,
    precioSugerido, precioRedondeado: redondear(precioSugerido),
    tarifaActual: tarifa,
    margenTarifaActual: tarifa && !tarifa.isZero() ? tarifa.minus(costoTotal).div(tarifa).times(100).toDecimalPlaces(1) : null,
  };
}

// ─────────────────────────────── Validación ────────────────────────────────

const zFechaHora = z.coerce.date({ errorMap: () => ({ message: 'Fecha y hora no válidas' }) });
const zKm = zNum(z.number({ invalid_type_error: 'Escriba los km' }).nonnegative('Los km no pueden ser negativos').max(9_999_999));
const zKmOpt = zNum(z.number().nonnegative().max(9_999_999).nullable().optional());
const texto = (max: number) => z.string().trim().max(max).nullish().transform((v) => v || null);

export const programarZ = z.object({
  clienteId: zIdReq,
  rutaId: zIdOpt,
  tarifaId: zIdOpt,
  cabezalId: zIdReq,
  remolqueId: zIdOpt,
  pilotoId: zIdReq,
  origen: texto(120),
  destino: texto(120),
  carga: texto(200),
  toneladas: zNum(z.number().nonnegative().max(200).nullable().optional()),
  referencia: texto(80),
  fechaSalida: zFechaHora,
  fechaCompromiso: zFechaHora.nullish(),
  montoCobrado: zMontoOpt, // vacío = según la tarifa
  pagoPiloto: zMontoOpt, // vacío = el del piloto
  kmVacios: zKmOpt,
  observaciones: texto(500),
});
export type Programar = z.infer<typeof programarZ>;

export const iniciarZ = z.object({
  kmSalida: zKmOpt, // vacío = odómetro del cabezal
  fecha: zFechaHora.optional(),
  inspeccionId: zIdOpt,
  sinInspeccion: zBool, // quien tiene viajes.liquidar puede autorizar salir sin inspección (queda en bitácora)
});

export const finalizarZ = z.object({
  kmLlegada: zKm,
  kmVacios: zKmOpt,
  fecha: zFechaHora.optional(),
  observaciones: texto(500),
});

export const TIPOS_COSTO = ['COMBUSTIBLE', 'PEAJE', 'VIATICO', 'HORAS_EXTRA', 'PARQUEO', 'CARGA_DESCARGA', 'MULTA', 'REPARACION_EN_RUTA', 'OTRO'] as const;
export const costoZ = z.object({
  tipo: z.enum(TIPOS_COSTO, { errorMap: () => ({ message: 'Elija el tipo de costo' }) }),
  monto: zNum(z.number({ invalid_type_error: 'Escriba el monto' }).positive('El monto debe ser mayor que cero').max(1_000_000).multipleOf(0.01, 'Máximo 2 decimales')),
  descripcion: texto(200),
  documento: texto(60),
  pagadoPorPiloto: zBool.transform((v) => v ?? true),
  fecha: zFechaHora.optional(),
  archivoId: z.string().uuid().nullish(),
});

export const anticipoZ = z.object({
  monto: zNum(z.number({ invalid_type_error: 'Escriba el monto' }).positive('El monto debe ser mayor que cero').max(1_000_000).multipleOf(0.01, 'Máximo 2 decimales')),
  medio: z.enum(['EFECTIVO', 'TRANSFERENCIA', 'CHEQUE', 'TARJETA', 'DEBITO']).default('EFECTIVO'),
  nota: texto(200),
  archivoId: z.string().uuid().nullish(),
});

export const cancelarZ = z.object({ motivo: z.string().trim().min(10, 'Explique el motivo (al menos 10 caracteres)').max(300) });

export const filtroViajesZ = z.object({
  estado: z.enum(['PROGRAMADO', 'EN_RUTA', 'FINALIZADO', 'LIQUIDADO', 'CANCELADO', 'ABIERTOS']).optional(),
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  cabezalId: zIdOpt,
  pilotoId: zIdOpt,
  clienteId: zIdOpt,
  q: z.string().trim().max(60).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

const zExtras = z.array(z.object({ concepto: z.string().trim().min(2, 'Escriba el concepto del extra').max(80), monto: zNum(z.number().nonnegative().max(1_000_000)) })).max(15).default([]);

export const cotizarZ = z.object({
  rutaId: zIdOpt,
  clienteId: zIdOpt,
  cabezalId: zIdOpt,
  kmIda: zKmOpt, // si no hay ruta (o para corregirla)
  origen: texto(120),
  destino: texto(120),
  regreso: z.enum(['VACIO', 'CARGADO', 'NINGUNO']).default('VACIO'),
  terreno: z.enum(['PLANO', 'ONDULADO', 'MONTANA']).optional(), // vacío = el de la ruta
  trafico: z.enum(['FLUIDO', 'NORMAL', 'LENTO', 'MUY_LENTO']).optional(),
  subidaMetros: zNum(z.number().int().nonnegative().max(10_000).nullable().optional()),
  horasEspera: zNum(z.number().nonnegative().max(240).nullable().optional()),
  extras: zExtras,
  peajes: zMontoOpt,
  viatico: zMontoOpt,
  pagoPiloto: zMontoOpt,
  precioGalon: zMontoOpt,
  rendimiento: zNum(z.number().positive().max(30).nullable().optional()),
  margen: zNum(z.number().min(0).max(300).nullable().optional()),
  toneladas: zNum(z.number().nonnegative().max(200).nullable().optional()),
});

export const guardarCotizacionZ = cotizarZ.extend({
  precioOfrecido: zMontoOpt, // vacío = el sugerido redondeado
  notas: texto(500),
});

export const convertirZ = z.object({
  cabezalId: zIdReq,
  remolqueId: zIdOpt,
  pilotoId: zIdReq,
  fechaSalida: zFechaHora,
  fechaCompromiso: zFechaHora.nullish(),
  carga: texto(200),
  referencia: texto(80),
});

export const filtroRentabilidadZ = z.object({
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/** "V-000123" a partir del último número usado. */
export const siguienteNumero = (ultimo: string | null | undefined, prefijo = 'V-') => {
  const n = ultimo ? Number(ultimo.replace(/\D/g, '')) || 0 : 0;
  return `${prefijo}${String(n + 1).padStart(6, '0')}`;
};
