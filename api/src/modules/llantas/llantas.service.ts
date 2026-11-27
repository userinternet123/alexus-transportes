/**
 * CONTROL DE LLANTAS: dónde está montada cada llanta (unidad y posición), montar, rotar, retirar, medir el labrado,
 * reencauchar y desechar; km y costo por km de cada llanta y por marca; y avisos de labrado bajo o sin medir.
 * El registro de la llanta (serie, marca, precio) es el catálogo genérico /llantas. Cálculos en llantas.logica.ts.
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import { Ctx } from '../../common/auth/tipos';
import { noEncontrado, reglaNegocio } from '../../common/errors';
import { D, Decimal, r2, ZERO } from '../../common/money';
import { ParametrosService } from '../../common/parametros/parametros.service';
import { validar } from '../../common/pipes/zod';
import { PrismaService, Tx } from '../../common/prisma/prisma.service';
import {
  desecharZ, filtroLlantasZ, kmMontajeCabezal, kmViajesRemolque, medicionZ, montarZ, nombrePosicion, posiciones, reencaucheZ, rendimientoPorMarca, retirarZ, rotarZ, Umbrales, vidaLlanta,
} from './llantas.logica';

const TERMINADOS = ['EN_RUTA', 'FINALIZADO', 'LIQUIDADO'] as const;
const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const INCLUIR = {
  marca: { select: { nombre: true } },
  montajes: { where: { fechaRetiro: null }, take: 1, include: { cabezal: { select: { id: true, codigo: true, odometro: true } }, remolque: { select: { id: true, codigo: true } } } },
  mediciones: { orderBy: [{ fecha: 'desc' }, { id: 'desc' }], take: 1, select: { profundidadMm: true, presionPsi: true, fecha: true } },
  reencauchesHechos: { orderBy: { id: 'desc' }, take: 1, select: { kmAlEnviar: true, fecha: true } },
} satisfies Prisma.LlantaInclude;
type LlantaVida = Prisma.LlantaGetPayload<{ include: typeof INCLUIR }>;
type Unidad = { tipo: 'CABEZAL' | 'REMOLQUE'; id: number };

@Injectable()
export class LlantasService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly parametros: ParametrosService) {}

  private async umbrales(): Promise<Umbrales & { kmEsperados: number }> {
    const n = (k: string) => this.parametros.numero(k);
    const [minimoMm, avisoMm, diasSinMedir, kmEsperados] = await Promise.all([n('llantas.profundidad_minima_mm'), n('llantas.profundidad_aviso_mm'), n('llantas.dias_sin_medir'), n('llantas.km_esperados')]);
    return { minimoMm, avisoMm, diasSinMedir, kmEsperados };
  }

  /** Km del montaje abierto de cada llanta (cabezal: odómetro; remolque: viajes desde el montaje). */
  private async kmAbiertos(llantas: LlantaVida[], db: Tx | PrismaService = this.prisma) {
    const km = new Map<number, Decimal>();
    const enRemolque = llantas.filter((l) => l.montajes[0]?.remolqueId);
    const viajes = enRemolque.length
      ? await db.viaje.findMany({ where: { remolqueId: { in: [...new Set(enRemolque.map((l) => l.montajes[0].remolqueId!))] }, estado: { in: [...TERMINADOS] }, fechaSalida: { gte: new Date(Math.min(...enRemolque.map((l) => l.montajes[0].fechaMontaje.getTime()))) } }, select: { remolqueId: true, fechaSalida: true, kmSalida: true, kmLlegada: true } })
      : [];
    for (const l of llantas) {
      const m = l.montajes[0];
      if (!m) continue;
      km.set(l.id, m.cabezal ? kmMontajeCabezal(m, m.cabezal.odometro) : kmViajesRemolque(viajes.filter((v) => v.remolqueId === m.remolqueId), m.fechaMontaje, null));
    }
    return km;
  }

  private vista(l: LlantaVida, kmAbierto: Decimal | undefined, u: Awaited<ReturnType<LlantasService['umbrales']>>, hoy: Date) {
    const m = l.montajes[0];
    const kmTotales = D(l.kmAcumulados).plus(kmAbierto ?? ZERO);
    const kmVidaActual = kmTotales.minus(D(l.reencauchesHechos[0]?.kmAlEnviar ?? 0));
    const v = vidaLlanta({
      precio: l.precio, costoReencauches: l.costoReencauches, kmTotales, kmVidaActual, profundidadInicialMm: l.profundidadInicialMm,
      ultimaMedicion: l.mediciones[0] ?? null, kmEsperados: l.kmEsperados ?? u.kmEsperados, montada: l.estado === 'MONTADA',
    }, u, hoy);
    return {
      id: l.id, codigo: l.codigo, marca: l.marca?.nombre ?? 'Sin marca', marcaId: l.marcaId, modelo: l.modelo, medida: l.medida, estado: l.estado,
      precio: l.precio, reencauches: l.reencauches, kmTotales: kmTotales.toDecimalPlaces(0), kmVidaActual: kmVidaActual.toDecimalPlaces(0), kmEsperados: l.kmEsperados ?? u.kmEsperados,
      profundidadInicialMm: l.profundidadInicialMm, presionPsi: l.mediciones[0]?.presionPsi ?? null, ultimaMedicion: ymd(l.mediciones[0]?.fecha),
      montaje: m ? { id: m.id, unidad: m.cabezal?.codigo ?? m.remolque?.codigo, tipo: m.cabezalId ? 'CABEZAL' : 'REMOLQUE', unidadId: m.cabezalId ?? m.remolqueId, posicion: m.posicion, nombrePosicion: nombrePosicion(m.posicion), desde: ymd(m.fechaMontaje) } : null,
      motivoBaja: l.motivoBaja, ...v,
    };
  }

  private async vidas(where: Prisma.LlantaWhereInput) {
    const [llantas, u] = await Promise.all([this.prisma.llanta.findMany({ where, include: INCLUIR, orderBy: { codigo: 'asc' } }), this.umbrales()]);
    const km = await this.kmAbiertos(llantas);
    const hoy = new Date();
    return { filas: llantas.map((l) => this.vista(l, km.get(l.id), u, hoy)), u };
  }

  // ─────────────────────────────── Consultas ───────────────────────────────

  async tablero(q: unknown) {
    const f = validar(filtroLlantasZ, q);
    const where: Prisma.LlantaWhereInput = { activo: true, ...(f.marcaId ? { marcaId: f.marcaId } : {}) };
    if (['EN_BODEGA', 'MONTADA', 'EN_REENCAUCHE', 'DESECHADA'].includes(f.estado)) where.estado = f.estado as Prisma.LlantaWhereInput['estado'];
    else if (f.estado !== 'TODAS') where.estado = { not: 'DESECHADA' };
    if (f.cabezalId) where.montajes = { some: { cabezalId: f.cabezalId, fechaRetiro: null } };
    if (f.q) where.OR = [{ codigo: { contains: f.q, mode: 'insensitive' } }, { medida: { contains: f.q, mode: 'insensitive' } }, { modelo: { contains: f.q, mode: 'insensitive' } }];
    const { filas, u } = await this.vidas(where);
    const lista = f.estado === 'ALERTAS' ? filas.filter((x) => x.alerta !== 'BIEN') : filas;
    const orden = { CAMBIAR: 0, PRONTO: 1, KM_EXCEDIDO: 2, SIN_MEDIR: 3, BIEN: 4 };
    lista.sort((a, b) => orden[a.alerta] - orden[b.alerta] || a.codigo.localeCompare(b.codigo));
    const resumen = { MONTADA: 0, EN_BODEGA: 0, EN_REENCAUCHE: 0, CAMBIAR: 0, PRONTO: 0, KM_EXCEDIDO: 0, SIN_MEDIR: 0 };
    // Alertas de todas las llantas activas (no solo las del filtro); montadas, en bodega y en reencauche por situación
    const todas = f.estado === 'ACTIVAS' && !f.cabezalId && !f.marcaId && !f.q ? filas : (await this.vidas({ activo: true, estado: { not: 'DESECHADA' } })).filas;
    for (const x of todas) if (x.alerta !== 'BIEN') resumen[x.alerta] += 1;
    const situaciones = await this.prisma.llanta.groupBy({ by: ['estado'], where: { activo: true }, _count: true });
    for (const g of situaciones) if (g.estado !== 'DESECHADA') resumen[g.estado] = g._count;
    return { data: { filas: lista, resumen, umbrales: u } };
  }

  /** Posiciones de un cabezal o remolque con la llanta que tiene cada una. */
  async unidad(q: { cabezalId?: string; remolqueId?: string }) {
    const u = this.leerUnidad(q);
    const datos = u.tipo === 'CABEZAL'
      ? await this.prisma.cabezal.findUnique({ where: { id: u.id }, select: { id: true, codigo: true, placa: true, ejes: true, odometro: true } })
      : await this.prisma.remolque.findUnique({ where: { id: u.id }, select: { id: true, codigo: true, placa: true, ejes: true } });
    if (!datos) throw noEncontrado(u.tipo === 'CABEZAL' ? 'Cabezal' : 'Remolque', u.id);
    const { filas } = await this.vidas({ montajes: { some: { fechaRetiro: null, ...(u.tipo === 'CABEZAL' ? { cabezalId: u.id } : { remolqueId: u.id }) } } });
    const porPos = new Map(filas.map((f) => [f.montaje!.posicion, f]));
    const lista = posiciones(datos.ejes, u.tipo);
    for (const p of porPos.keys()) if (!lista.includes(p)) lista.push(p);
    return { data: { unidad: { ...datos, tipo: u.tipo }, posiciones: lista.map((p) => ({ posicion: p, nombre: nombrePosicion(p), llanta: porPos.get(p) ?? null })) } };
  }

  async historial(id: number) {
    if (!(await this.prisma.llanta.count({ where: { id } }))) throw noEncontrado('Llanta', id);
    const [montajes, mediciones, reencauches] = await Promise.all([
      this.prisma.montajeLlanta.findMany({ where: { llantaId: id }, orderBy: { fechaMontaje: 'desc' }, include: { cabezal: { select: { codigo: true, odometro: true } }, remolque: { select: { codigo: true } } } }),
      this.prisma.medicionLlanta.findMany({ where: { llantaId: id }, orderBy: [{ fecha: 'desc' }, { id: 'desc' }], take: 50, include: { creadoPor: { select: { nombre: true } } } }),
      this.prisma.reencaucheLlanta.findMany({ where: { llantaId: id }, orderBy: { fecha: 'desc' }, include: { proveedor: { select: { razonSocial: true, nombreComercial: true } } } }),
    ]);
    const { filas } = await this.vidas({ id });
    return {
      data: {
        ...filas[0],
        montajes: montajes.map((m) => ({ id: m.id, unidad: m.cabezal?.codigo ?? m.remolque?.codigo, posicion: m.posicion, nombrePosicion: nombrePosicion(m.posicion), desde: ymd(m.fechaMontaje), hasta: ymd(m.fechaRetiro), kmMontaje: m.kmMontaje, kmRetiro: m.kmRetiro, km: m.kmRetiro != null ? D(m.kmRetiro).minus(D(m.kmMontaje)) : null, profundidadMm: m.profundidadMm, motivo: m.motivoRetiro })),
        mediciones: mediciones.map((x) => ({ fecha: ymd(x.fecha), profundidadMm: x.profundidadMm, presionPsi: x.presionPsi, km: x.km, observacion: x.observacion, por: x.creadoPor.nombre })),
        reencauchesHechos: reencauches.map((x) => ({ fecha: ymd(x.fecha), costo: x.costo, documento: x.documento, proveedor: x.proveedor ? x.proveedor.nombreComercial || x.proveedor.razonSocial : null, kmAlEnviar: x.kmAlEnviar })),
      },
    };
  }

  async porMarca() {
    const { filas } = await this.vidas({ activo: true });
    return { data: rendimientoPorMarca(filas.map((f) => ({ marca: f.marca, modelo: f.modelo, estado: f.estado, costo: f.costo, kmTotales: f.kmTotales, desgaste1000: f.desgaste1000, reencauches: f.reencauches }))) };
  }

  // ─────────────────────────────── Movimientos ───────────────────────────────

  private leerUnidad(d: { cabezalId?: number | string | null; remolqueId?: number | string | null }): Unidad {
    if (d.cabezalId) return { tipo: 'CABEZAL', id: Number(d.cabezalId) };
    if (d.remolqueId) return { tipo: 'REMOLQUE', id: Number(d.remolqueId) };
    throw reglaNegocio('UNIDAD_REQUERIDA', 'Indique el cabezal o el remolque');
  }

  private async llanta(tx: Tx, id: number) {
    const l = await tx.llanta.findUnique({ where: { id } });
    if (!l || !l.activo) throw noEncontrado('Llanta', id);
    return l;
  }

  private async montarEn(tx: Tx, ctx: Ctx, llantaId: number, u: Unidad, posicion: string, fecha: Date, km?: number | null) {
    const l = await this.llanta(tx, llantaId);
    if (l.estado !== 'EN_BODEGA') throw reglaNegocio('LLANTA_NO_DISPONIBLE', `La llanta ${l.codigo} está ${l.estado.toLowerCase().replace('_', ' ')}: solo se montan llantas en bodega`);
    const unidad = u.tipo === 'CABEZAL' ? await tx.cabezal.findUnique({ where: { id: u.id } }) : await tx.remolque.findUnique({ where: { id: u.id } });
    if (!unidad || !unidad.activo || unidad.estado === 'VENDIDO') throw reglaNegocio('UNIDAD_INVALIDA', 'Elija un cabezal o remolque activo');
    if (!posiciones(unidad.ejes, u.tipo).includes(posicion)) throw reglaNegocio('POSICION_INVALIDA', `${unidad.codigo} tiene ${unidad.ejes} ejes: la posición ${posicion} no existe`);
    const ocupada = await tx.montajeLlanta.findFirst({ where: { fechaRetiro: null, posicion, ...(u.tipo === 'CABEZAL' ? { cabezalId: u.id } : { remolqueId: u.id }) }, include: { llanta: { select: { codigo: true } } } });
    if (ocupada) throw reglaNegocio('POSICION_OCUPADA', `En ${unidad.codigo} ${nombrePosicion(posicion).toLowerCase()} ya está la llanta ${ocupada.llanta.codigo}: retírela o rótela primero`);
    const odometro = u.tipo === 'CABEZAL' ? D((unidad as { odometro: Decimal }).odometro) : ZERO;
    const kmMontaje = u.tipo === 'CABEZAL' ? (km != null ? D(km) : odometro) : ZERO;
    if (u.tipo === 'CABEZAL' && km != null && D(km).gt(odometro)) await tx.cabezal.update({ where: { id: u.id }, data: { odometro: D(km) } });
    const m = await tx.montajeLlanta.create({ data: { llantaId, cabezalId: u.tipo === 'CABEZAL' ? u.id : null, remolqueId: u.tipo === 'REMOLQUE' ? u.id : null, posicion, fechaMontaje: fecha, kmMontaje } });
    await tx.llanta.update({ where: { id: llantaId }, data: { estado: 'MONTADA' } });
    await this.audit.registrar(ctx, { accion: 'MONTAR', entidad: 'Llanta', entidadId: llantaId, despues: { unidad: unidad.codigo, posicion, kmMontaje } }, tx);
    return { l, unidad, m };
  }

  private async retirarDe(tx: Tx, ctx: Ctx, llantaId: number, d: { fecha: Date; km?: number | null; profundidadMm?: number | null; motivo: string; destino: 'EN_BODEGA' | 'EN_REENCAUCHE' | 'DESECHADA' }) {
    const l = await this.llanta(tx, llantaId);
    const m = await tx.montajeLlanta.findFirst({ where: { llantaId, fechaRetiro: null }, include: { cabezal: { select: { codigo: true, odometro: true } }, remolque: { select: { codigo: true } } } });
    if (!m) throw reglaNegocio('LLANTA_NO_MONTADA', `La llanta ${l.codigo} no está montada`);
    if (d.fecha < m.fechaMontaje) throw reglaNegocio('FECHA_INVALIDA', `La llanta se montó el ${ymd(m.fechaMontaje)}: la fecha de retiro no puede ser anterior`);
    let kmRetiro: Decimal;
    if (m.cabezal) {
      kmRetiro = d.km != null ? D(d.km) : D(m.cabezal.odometro);
      if (kmRetiro.lt(D(m.kmMontaje))) throw reglaNegocio('KM_INVALIDO', `El odómetro al retirar (${kmRetiro.toString()}) es menor que al montar (${D(m.kmMontaje).toString()})`);
    } else {
      const viajes = await tx.viaje.findMany({ where: { remolqueId: m.remolqueId, estado: { in: [...TERMINADOS] }, fechaSalida: { gte: m.fechaMontaje } }, select: { fechaSalida: true, kmSalida: true, kmLlegada: true } });
      kmRetiro = D(m.kmMontaje).plus(kmViajesRemolque(viajes, m.fechaMontaje, d.fecha));
    }
    const km = kmRetiro.minus(D(m.kmMontaje));
    await tx.montajeLlanta.update({ where: { id: m.id }, data: { fechaRetiro: d.fecha, kmRetiro, profundidadMm: d.profundidadMm ?? null, motivoRetiro: d.motivo } });
    if (d.profundidadMm != null) await tx.medicionLlanta.create({ data: { llantaId, montajeId: m.id, fecha: d.fecha, km: m.cabezal ? kmRetiro : null, profundidadMm: d.profundidadMm, observacion: `Al retirar: ${d.motivo}`, creadoPorId: ctx.usuario.sub } });
    await tx.llanta.update({ where: { id: llantaId }, data: { estado: d.destino, kmAcumulados: D(l.kmAcumulados).plus(km), ...(d.destino === 'DESECHADA' ? { motivoBaja: d.motivo } : {}) } });
    await this.audit.registrar(ctx, { accion: 'RETIRAR', entidad: 'Llanta', entidadId: llantaId, despues: { unidad: m.cabezal?.codigo ?? m.remolque?.codigo, posicion: m.posicion, km, destino: d.destino } }, tx);
    return { l, km, unidad: m.cabezal?.codigo ?? m.remolque?.codigo };
  }

  async montar(ctx: Ctx, id: number, body: unknown) {
    const d = validar(montarZ, body);
    const r = await this.prisma.enTransaccion((tx) => this.montarEn(tx, ctx, id, this.leerUnidad(d), d.posicion, d.fecha, d.km));
    return { message: `Llanta ${r.l.codigo} montada en ${r.unidad.codigo} · ${nombrePosicion(d.posicion).toLowerCase()}` };
  }

  async retirar(ctx: Ctx, id: number, body: unknown) {
    const d = validar(retirarZ, body);
    const r = await this.prisma.enTransaccion((tx) => this.retirarDe(tx, ctx, id, d));
    const destino = { EN_BODEGA: 'a bodega', EN_REENCAUCHE: 'a reencauche', DESECHADA: 'y desechada' }[d.destino];
    return { message: `Llanta ${r.l.codigo} retirada de ${r.unidad} ${destino} · dio ${r.km.toFixed(0)} km en ese montaje` };
  }

  /** Rotación: se retira de su posición y se monta en otra (de la misma u otra unidad) el mismo día. */
  async rotar(ctx: Ctx, id: number, body: unknown) {
    const d = validar(rotarZ, body);
    const r = await this.prisma.enTransaccion(async (tx) => {
      const ret = await this.retirarDe(tx, ctx, id, { fecha: d.fecha, km: null, profundidadMm: d.profundidadMm, motivo: 'Rotación', destino: 'EN_BODEGA' });
      const u = this.leerUnidad(d);
      const mon = await this.montarEn(tx, ctx, id, u, d.posicion, d.fecha, u.tipo === 'CABEZAL' ? d.km : null);
      return { ret, mon };
    });
    return { message: `Llanta ${r.ret.l.codigo} rotada a ${r.mon.unidad.codigo} · ${nombrePosicion(d.posicion).toLowerCase()}` };
  }

  async medir(ctx: Ctx, id: number, body: unknown) {
    const d = validar(medicionZ, body);
    const r = await this.prisma.enTransaccion(async (tx) => {
      const l = await this.llanta(tx, id);
      if (l.estado === 'DESECHADA') throw reglaNegocio('LLANTA_DESECHADA', 'La llanta ya se desechó');
      if (l.profundidadInicialMm != null && D(d.profundidadMm).gt(D(l.profundidadInicialMm))) throw reglaNegocio('MEDICION_INVALIDA', `El labrado medido (${d.profundidadMm} mm) es mayor que el de la llanta nueva (${D(l.profundidadInicialMm).toString()} mm)`);
      const m = await tx.montajeLlanta.findFirst({ where: { llantaId: id, fechaRetiro: null }, include: { cabezal: { select: { odometro: true } } } });
      await tx.medicionLlanta.create({ data: { llantaId: id, montajeId: m?.id ?? null, fecha: d.fecha, km: d.km ?? m?.cabezal?.odometro ?? null, profundidadMm: d.profundidadMm, presionPsi: d.presionPsi ?? null, observacion: d.observacion, creadoPorId: ctx.usuario.sub } });
      return l;
    });
    const u = await this.umbrales();
    const nivel = d.profundidadMm <= u.minimoMm ? ': está en el mínimo, retírela' : d.profundidadMm <= u.avisoMm ? ': ya está cerca del mínimo' : '';
    return { message: `Medición de ${r.codigo}: ${d.profundidadMm} mm${nivel}` };
  }

  /** Vuelve del reencauche: suma el costo, cuenta un reencauche y queda en bodega con su labrado nuevo. */
  async reencauchar(ctx: Ctx, id: number, body: unknown) {
    const d = validar(reencaucheZ, body);
    const r = await this.prisma.enTransaccion(async (tx) => {
      const l = await this.llanta(tx, id);
      if (l.estado !== 'EN_REENCAUCHE' && l.estado !== 'EN_BODEGA') throw reglaNegocio('LLANTA_ESTADO', `La llanta ${l.codigo} está ${l.estado.toLowerCase().replace('_', ' ')}: retírela primero`);
      if (d.proveedorId && !(await tx.tercero.count({ where: { id: d.proveedorId } }))) throw reglaNegocio('PROVEEDOR_INVALIDO', 'Elija un proveedor registrado');
      await tx.reencaucheLlanta.create({ data: { llantaId: id, fecha: d.fecha, proveedorId: d.proveedorId ?? null, costo: r2(d.costo), documento: d.documento, kmAlEnviar: l.kmAcumulados } });
      await tx.llanta.update({ where: { id }, data: { estado: 'EN_BODEGA', reencauches: { increment: 1 }, costoReencauches: r2(D(l.costoReencauches).plus(d.costo)), ...(d.profundidadMm ? { profundidadInicialMm: d.profundidadMm } : {}) } });
      if (d.profundidadMm) await tx.medicionLlanta.create({ data: { llantaId: id, fecha: d.fecha, profundidadMm: d.profundidadMm, observacion: 'Labrado nuevo del reencauche', creadoPorId: ctx.usuario.sub } });
      await this.audit.registrar(ctx, { accion: 'REENCAUCHAR', entidad: 'Llanta', entidadId: id, despues: { costo: d.costo, reencauche: l.reencauches + 1 } }, tx);
      return l;
    });
    return { message: `Llanta ${r.codigo}: reencauche ${r.reencauches + 1} registrado, queda en bodega` };
  }

  async desechar(ctx: Ctx, id: number, body: unknown) {
    const d = validar(desecharZ, body);
    const l = await this.prisma.enTransaccion(async (tx) => {
      const l = await this.llanta(tx, id);
      if (l.estado === 'MONTADA') throw reglaNegocio('LLANTA_MONTADA', 'Retire la llanta antes de desecharla (así se cuentan sus km)');
      if (l.estado === 'DESECHADA') throw reglaNegocio('LLANTA_DESECHADA', 'La llanta ya se desechó');
      await tx.llanta.update({ where: { id }, data: { estado: 'DESECHADA', motivoBaja: d.motivo } });
      await this.audit.registrar(ctx, { accion: 'DESECHAR', entidad: 'Llanta', entidadId: id, despues: { motivo: d.motivo } }, tx);
      return l;
    });
    return { message: `Llanta ${l.codigo} desechada` };
  }

  // ─────────────────────────────── Avisos ───────────────────────────────

  async avisos() {
    const { filas, u } = await this.vidas({ activo: true, estado: 'MONTADA' });
    const h = ymd(new Date());
    const lista: { id: string; tipo: string; nivel: 'info' | 'aviso' | 'critico'; titulo: string; detalle: string; ruta: string }[] = [];
    const de = (e: string) => filas.filter((f) => f.alerta === e);
    const det = (xs: typeof filas) => xs.slice(0, 4).map((f) => `${f.montaje?.unidad} ${f.montaje?.posicion}: ${f.codigo}`).join(' · ') + (xs.length > 4 ? '…' : '');
    const cambiar = de('CAMBIAR');
    const pronto = de('PRONTO');
    const km = de('KM_EXCEDIDO');
    const sinMedir = de('SIN_MEDIR');
    if (cambiar.length) lista.push({ id: `llantas-cambiar:${h}:${cambiar.length}`, tipo: 'llantas', nivel: 'critico', titulo: `${cambiar.length} llanta(s) en el labrado mínimo (${u.minimoMm} mm)`, detalle: det(cambiar), ruta: '/home/control-llantas?vista=ALERTAS' });
    if (pronto.length) lista.push({ id: `llantas-pronto:${h}:${pronto.length}`, tipo: 'llantas', nivel: 'aviso', titulo: `${pronto.length} llanta(s) cerca del mínimo`, detalle: det(pronto), ruta: '/home/control-llantas?vista=ALERTAS' });
    if (km.length) lista.push({ id: `llantas-km:${h}:${km.length}`, tipo: 'llantas', nivel: 'aviso', titulo: `${km.length} llanta(s) pasaron los km esperados`, detalle: 'Mídalas: pueden seguir, pero revise que el labrado sea parejo.', ruta: '/home/control-llantas?vista=ALERTAS' });
    if (sinMedir.length) lista.push({ id: `llantas-sin-medir:${h}:${sinMedir.length}`, tipo: 'llantas', nivel: 'info', titulo: `${sinMedir.length} llanta(s) montadas sin medir hace más de ${u.diasSinMedir} días`, detalle: 'Mida el labrado y la presión en la próxima inspección.', ruta: '/home/control-llantas?vista=ALERTAS' });
    return lista;
  }
}
