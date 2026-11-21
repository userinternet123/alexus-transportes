/**
 * CUENTAS POR COBRAR: facturar viajes terminados, registrar abonos (pagos, retenciones, descuentos), dar seguimiento
 * (llamadas, promesas de pago) y avisar lo que vence, lo vencido y lo que nadie ha facturado.
 * Todo por sede de trabajo. Lógica de cálculo en `cobros.logica.ts`.
 */
import { Injectable } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { Ctx } from '../../common/auth/tipos';
import { conflicto, noEncontrado, reglaNegocio } from '../../common/errors';
import { hoyGuatemala } from '../../common/fecha';
import { D, Decimal, r2, suma } from '../../common/money';
import { ParametrosService } from '../../common/parametros/parametros.service';
import { z } from 'zod';
import { validar, zIdOpt, zNum } from '../../common/pipes/zod';
import { PrismaService, Tx } from '../../common/prisma/prisma.service';
import { siguienteNumero } from '../viajes/viajes.logica';
import {
  abonoZ, antiguedad, anularZ, crearCuentaZ, diasDeCobro, diasVencida, documentoDe, estadoPorSaldo, estadoPromesa, filtroCuentasZ, gestionZ,
  MEDIOS_NO_EFECTIVO, mensajeRecordatorio, NOMBRE_MEDIO, parsearTramos, saldoDe, telefonoWhatsapp, tramoDe, tramos, vencimiento,
} from './cobros.logica';

const filtroResumenZ = z.object({ dias: zNum(z.number().int().min(7).max(730).default(90)) });
const filtroSinFacturarZ = z.object({ clienteId: zIdOpt });

const LOCK_NUMERO_CUENTA = 710_010;
const DIA = 86_400_000;
const TERMINADOS = ['FINALIZADO', 'LIQUIDADO'] as const;
const ABIERTAS = ['PENDIENTE', 'PARCIAL'] as const;

type Nombre = { razonSocial: string | null; nombreComercial: string | null; nombres: string | null; apellidos: string | null };
const nombreTercero = (t: Nombre) => t.nombreComercial || t.razonSocial || [t.nombres, t.apellidos].filter(Boolean).join(' ') || '—';
const CLIENTE = { select: { id: true, razonSocial: true, nombreComercial: true, nombres: true, apellidos: true, nit: true, telefono: true, email: true, contacto: true, diasCredito: true, limiteCredito: true } } as const;
const hoy = () => new Date(`${hoyGuatemala()}T00:00:00.000Z`);
const ymd = (d: Date) => d.toISOString().slice(0, 10);

@Injectable()
export class CobrosService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly parametros: ParametrosService) {}

  private sucursal(ctx: Ctx) {
    if (!ctx.sucursalId) throw reglaNegocio('SUCURSAL_REQUERIDA', 'Elija la sede de trabajo');
    return ctx.sucursalId;
  }
  private async limites() { return parsearTramos(await this.parametros.texto('cobros.tramos')); }

  private fila(c: { id: number; numero: string; clienteId: number; cliente: Nombre; tipoDocumento: string; serie: string | null; numeroDocumento: string | null; fechaEmision: Date; fechaVencimiento: Date; diasCredito: number; monto: Decimal | object; saldo: Decimal | object; estado: string; _count?: { viajes: number } }, t: ReturnType<typeof tramos>, h: Date) {
    const dias = diasVencida(c.fechaVencimiento, h);
    const abierta = c.estado === 'PENDIENTE' || c.estado === 'PARCIAL';
    return {
      id: c.id, numero: c.numero, documento: documentoDe(c), clienteId: c.clienteId, cliente: nombreTercero(c.cliente),
      fechaEmision: ymd(c.fechaEmision), fechaVencimiento: ymd(c.fechaVencimiento), diasCredito: c.diasCredito,
      monto: c.monto, saldo: c.saldo, estado: c.estado, viajes: c._count?.viajes ?? 0,
      diasVencida: abierta ? dias : null, tramo: abierta ? tramoDe(dias, t).nombre : null, vencida: abierta && dias > 0,
    };
  }

  // ─────────────────────────────── Consultas ───────────────────────────────

  async listar(ctx: Ctx, q: unknown) {
    const f = validar(filtroCuentasZ, q);
    const h = hoy();
    const avisarDias = await this.parametros.numero('cobros.avisar_dias_antes');
    const where: Record<string, unknown> = { sucursalId: this.sucursal(ctx), ...(f.clienteId ? { clienteId: f.clienteId } : {}) };
    if (f.vista === 'ABIERTAS') where.estado = { in: ABIERTAS };
    if (f.vista === 'VENCIDAS') Object.assign(where, { estado: { in: ABIERTAS }, fechaVencimiento: { lt: h } });
    if (f.vista === 'POR_VENCER') Object.assign(where, { estado: { in: ABIERTAS }, fechaVencimiento: { gte: h, lte: new Date(h.getTime() + avisarDias * DIA) } });
    if (f.vista === 'PAGADAS') where.estado = 'PAGADA';
    if (f.vista === 'ANULADAS') where.estado = 'ANULADA';
    if (f.q) where.OR = [{ numero: { contains: f.q, mode: 'insensitive' } }, { numeroDocumento: { contains: f.q, mode: 'insensitive' } }, { cliente: { OR: [{ razonSocial: { contains: f.q, mode: 'insensitive' } }, { nombreComercial: { contains: f.q, mode: 'insensitive' } }, { nit: { contains: f.q } }] } }];
    const filas = await this.prisma.cuentaCobrar.findMany({
      where, take: f.limit, orderBy: f.vista === 'PAGADAS' || f.vista === 'ANULADAS' || f.vista === 'TODAS' ? { fechaEmision: 'desc' } : { fechaVencimiento: 'asc' },
      include: { cliente: CLIENTE, _count: { select: { viajes: true } } },
    });
    const t = tramos(await this.limites());
    return { data: filas.map((c) => this.fila(c, t, h)) };
  }

  /** Tablero: antigüedad de saldos por cliente, días de cobro, cobrado en el período, por vencer y sin facturar. */
  async resumen(ctx: Ctx, q: unknown) {
    const sucursalId = this.sucursal(ctx);
    const { dias } = validar(filtroResumenZ, q);
    const h = hoy();
    const desde = new Date(h.getTime() - dias * DIA);
    const [abiertas, emitidas, abonos, sinFacturar, avisarDias, limites] = await Promise.all([
      this.prisma.cuentaCobrar.findMany({ where: { sucursalId, estado: { in: [...ABIERTAS] } }, include: { cliente: CLIENTE } }),
      this.prisma.cuentaCobrar.aggregate({ where: { sucursalId, estado: { not: 'ANULADA' }, fechaEmision: { gte: desde, lte: h } }, _sum: { monto: true }, _count: true }),
      this.prisma.abonoCobro.findMany({ where: { anulado: false, fecha: { gte: desde, lte: h }, cuenta: { sucursalId } }, select: { monto: true, medio: true } }),
      this.prisma.viaje.aggregate({ where: { sucursalId, estado: { in: [...TERMINADOS] }, cuentaCobrarId: null, montoCobrado: { gt: 0 } }, _sum: { montoCobrado: true }, _count: true }),
      this.parametros.numero('cobros.avisar_dias_antes'),
      this.limites(),
    ]);
    const a = antiguedad(abiertas.map((c) => ({ id: c.id, clienteId: c.clienteId, cliente: nombreTercero(c.cliente), monto: c.monto, saldo: c.saldo, fechaVencimiento: c.fechaVencimiento, fechaEmision: c.fechaEmision })), h, limites);
    const porVencer = abiertas.filter((c) => { const d = diasVencida(c.fechaVencimiento, h); return d <= 0 && d >= -avisarDias; });
    const cobrado = suma(abonos.filter((x) => !MEDIOS_NO_EFECTIVO.has(x.medio)).map((x) => x.monto));
    const retenciones = suma(abonos.filter((x) => MEDIOS_NO_EFECTIVO.has(x.medio)).map((x) => x.monto));
    // Límite de crédito: clientes que lo pasan
    const sobreLimite = a.clientes.flatMap((c) => {
      const cli = abiertas.find((x) => x.clienteId === c.clienteId)!.cliente;
      return D(cli.limiteCredito).gt(0) && c.saldo.gt(D(cli.limiteCredito)) ? [{ clienteId: c.clienteId, cliente: c.cliente, saldo: c.saldo, limite: cli.limiteCredito }] : [];
    });
    return {
      data: {
        hoy: ymd(h), dias, ...a,
        diasDeCobro: diasDeCobro(a.total.saldo, emitidas._sum.monto ?? 0, dias),
        facturado: { monto: r2(emitidas._sum.monto ?? 0), cuentas: emitidas._count },
        cobrado: r2(cobrado), retenciones: r2(retenciones),
        porVencer: { dias: avisarDias, cuentas: porVencer.length, monto: r2(suma(porVencer.map((c) => c.saldo))) },
        sinFacturar: { viajes: sinFacturar._count, monto: r2(sinFacturar._sum.montoCobrado ?? 0) },
        sobreLimite,
      },
    };
  }

  /** Viajes terminados que aún no están en ninguna cuenta, por cliente (lo que se está quedando sin cobrar). */
  async sinFacturar(ctx: Ctx, q: unknown) {
    const { clienteId } = validar(filtroSinFacturarZ, q);
    const h = hoy();
    const viajes = await this.prisma.viaje.findMany({
      where: { sucursalId: this.sucursal(ctx), estado: { in: [...TERMINADOS] }, cuentaCobrarId: null, montoCobrado: { gt: 0 }, ...(clienteId ? { clienteId } : {}) },
      orderBy: { fechaLlegada: 'asc' },
      select: { id: true, numero: true, estado: true, clienteId: true, origen: true, destino: true, referencia: true, fechaLlegada: true, montoCobrado: true, cliente: CLIENTE, ruta: { select: { nombre: true } } },
    });
    const grupos = new Map<number, { clienteId: number; cliente: string; diasCredito: number; monto: Decimal; viajes: unknown[] }>();
    for (const v of viajes) {
      const g = grupos.get(v.clienteId) ?? { clienteId: v.clienteId, cliente: nombreTercero(v.cliente), diasCredito: v.cliente.diasCredito, monto: D(0), viajes: [] };
      g.monto = g.monto.plus(v.montoCobrado);
      g.viajes.push({ id: v.id, numero: v.numero, estado: v.estado, ruta: v.ruta?.nombre ?? `${v.origen} → ${v.destino}`, referencia: v.referencia, fechaLlegada: v.fechaLlegada, montoCobrado: v.montoCobrado, diasSinFacturar: v.fechaLlegada ? Math.max(0, diasVencida(v.fechaLlegada, h)) : null });
      grupos.set(v.clienteId, g);
    }
    return { data: [...grupos.values()].sort((a, b) => b.monto.comparedTo(a.monto)) };
  }

  async detalle(ctx: Ctx, id: number) {
    const c = await this.prisma.cuentaCobrar.findFirst({
      where: { id, sucursalId: this.sucursal(ctx) },
      include: {
        cliente: CLIENTE, creadoPor: { select: { nombre: true } },
        viajes: { select: { id: true, numero: true, estado: true, origen: true, destino: true, referencia: true, fechaLlegada: true, montoCobrado: true, ruta: { select: { nombre: true } } }, orderBy: { fechaSalida: 'asc' } },
        abonos: { include: { registradoPor: { select: { nombre: true } } }, orderBy: [{ fecha: 'desc' }, { id: 'desc' }] },
        gestiones: { include: { usuario: { select: { nombre: true } } }, orderBy: { creadoEn: 'desc' } },
      },
    });
    if (!c) throw noEncontrado('Cuenta por cobrar', id);
    const h = hoy();
    const t = tramos(await this.limites());
    const abierta = c.estado === 'PENDIENTE' || c.estado === 'PARCIAL';
    return {
      data: {
        ...this.fila({ ...c, _count: { viajes: c.viajes.length } }, t, h),
        serie: c.serie, numeroDocumento: c.numeroDocumento, tipoDocumento: c.tipoDocumento, autorizacionFel: c.autorizacionFel,
        descripcion: c.descripcion, archivoId: c.archivoId, motivoAnulacion: c.motivoAnulacion, anuladaEn: c.anuladaEn, creadoPor: c.creadoPor.nombre, creadoEn: c.creadoEn,
        clienteDatos: { nit: c.cliente.nit, telefono: c.cliente.telefono, email: c.cliente.email, contacto: c.cliente.contacto, diasCredito: c.cliente.diasCredito, limiteCredito: c.cliente.limiteCredito },
        viajesDetalle: c.viajes.map((v) => ({ id: v.id, numero: v.numero, estado: v.estado, ruta: v.ruta?.nombre ?? `${v.origen} → ${v.destino}`, referencia: v.referencia, fechaLlegada: v.fechaLlegada, montoCobrado: v.montoCobrado })),
        abonos: c.abonos.map((x) => ({ id: x.id, fecha: ymd(x.fecha), monto: x.monto, medio: x.medio, medioNombre: NOMBRE_MEDIO[x.medio], referencia: x.referencia, banco: x.banco, archivoId: x.archivoId, anulado: x.anulado, motivoAnulacion: x.motivoAnulacion, registradoPor: x.registradoPor.nombre, creadoEn: x.creadoEn })),
        gestiones: c.gestiones.map((g) => ({ id: g.id, tipo: g.tipo, nota: g.nota, promesaFecha: g.promesaFecha ? ymd(g.promesaFecha) : null, promesaMonto: g.promesaMonto, usuario: g.usuario.nombre, creadoEn: g.creadoEn })),
        promesa: abierta || c.estado === 'PAGADA' ? estadoPromesa(c.gestiones, c.abonos, c.saldo, h) : null,
        recordatorio: abierta ? await this.recordatorio(c.cliente, [c], h) : null,
      },
    };
  }

  /** Estado de cuenta de un cliente: todo lo abierto y un solo recordatorio con todo. */
  async estadoCliente(ctx: Ctx, clienteId: number) {
    const cliente = await this.prisma.tercero.findUnique({ where: { id: clienteId }, ...CLIENTE });
    if (!cliente) throw noEncontrado('Cliente', clienteId);
    const h = hoy();
    const cuentas = await this.prisma.cuentaCobrar.findMany({ where: { sucursalId: this.sucursal(ctx), clienteId, estado: { in: [...ABIERTAS] } }, orderBy: { fechaVencimiento: 'asc' }, include: { cliente: CLIENTE, _count: { select: { viajes: true } } } });
    const t = tramos(await this.limites());
    const saldo = r2(suma(cuentas.map((c) => c.saldo)));
    return {
      data: {
        clienteId, cliente: nombreTercero(cliente), saldo, limiteCredito: cliente.limiteCredito, diasCredito: cliente.diasCredito,
        vencido: r2(suma(cuentas.filter((c) => diasVencida(c.fechaVencimiento, h) > 0).map((c) => c.saldo))),
        cuentas: cuentas.map((c) => this.fila(c, t, h)),
        recordatorio: cuentas.length ? await this.recordatorio(cliente, cuentas, h) : null,
      },
    };
  }

  private async recordatorio(cliente: { telefono: string | null; email: string | null; contacto: string | null } & Nombre, cuentas: { tipoDocumento: string; serie: string | null; numeroDocumento: string | null; numero: string; saldo: Decimal | object; fechaVencimiento: Date }[], h: Date) {
    const empresa = await this.prisma.empresa.findFirst({ where: { activo: true }, select: { nombreComercial: true, nombre: true } });
    const nombreEmpresa = empresa?.nombreComercial || empresa?.nombre || 'su transportista';
    const texto = mensajeRecordatorio({ empresa: nombreEmpresa, contacto: cliente.contacto, cuentas: cuentas.map((c) => ({ documento: documentoDe(c), saldo: c.saldo as Decimal, fechaVencimiento: c.fechaVencimiento })), hoy: h });
    const tel = telefonoWhatsapp(cliente.telefono);
    const asunto = `Estado de cuenta — ${nombreTercero(cliente)}`;
    return {
      texto,
      whatsapp: tel ? `https://wa.me/${tel}?text=${encodeURIComponent(texto)}` : null,
      correo: cliente.email ? `mailto:${encodeURIComponent(cliente.email)}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(texto)}` : null,
    };
  }

  // ─────────────────────────────── Operaciones ─────────────────────────────

  async crear(ctx: Ctx, body: unknown) {
    const d = validar(crearCuentaZ, body);
    const sucursalId = this.sucursal(ctx);
    if (d.fechaEmision > new Date(hoy().getTime() + DIA)) throw reglaNegocio('FECHA_FUTURA', 'La fecha de emisión no puede ser futura');
    if (d.archivoId && !(await this.prisma.archivo.count({ where: { id: d.archivoId, creadoPorId: ctx.usuario.sub } }))) throw reglaNegocio('ARCHIVO_AJENO', 'Solo puede adjuntar archivos que usted subió');
    const diasDefecto = await this.parametros.numero('cobros.dias_credito_defecto');
    const avisos: string[] = [];
    const r = await this.prisma.enTransaccion(async (tx) => {
      const cliente = await tx.tercero.findUnique({ where: { id: d.clienteId } });
      if (!cliente || !cliente.esCliente) throw reglaNegocio('CLIENTE_INVALIDO', 'Elija un cliente');
      if (d.numeroDocumento) {
        const repetida = await tx.cuentaCobrar.findFirst({ where: { tipoDocumento: d.tipoDocumento, serie: d.serie, numeroDocumento: d.numeroDocumento, estado: { not: 'ANULADA' } }, select: { numero: true } });
        if (repetida) throw conflicto('DOCUMENTO_REPETIDO', `Ese documento ya está registrado en la cuenta ${repetida.numero}`);
      }
      // Viajes: del cliente, de la sede, terminados y sin facturar (se bloquean para que no entren en dos cuentas)
      let viajes: { id: number; numero: string; montoCobrado: Decimal | object }[] = [];
      if (d.viajeIds.length) {
        await tx.$executeRaw`SELECT id FROM viajes WHERE id = ANY(${d.viajeIds}::int[]) FOR UPDATE`;
        const encontrados = await tx.viaje.findMany({ where: { id: { in: d.viajeIds } }, select: { id: true, numero: true, sucursalId: true, clienteId: true, estado: true, cuentaCobrarId: true, montoCobrado: true } });
        for (const id of d.viajeIds) {
          const v = encontrados.find((x) => x.id === id);
          if (!v || v.sucursalId !== sucursalId) throw reglaNegocio('VIAJE_INVALIDO', `El viaje ${id} no es de esta sede`);
          if (v.clienteId !== d.clienteId) throw reglaNegocio('VIAJE_OTRO_CLIENTE', `El viaje ${v.numero} es de otro cliente`);
          if (!(TERMINADOS as readonly string[]).includes(v.estado)) throw reglaNegocio('VIAJE_SIN_TERMINAR', `El viaje ${v.numero} aún no ha terminado`);
          if (v.cuentaCobrarId) throw conflicto('VIAJE_FACTURADO', `El viaje ${v.numero} ya está en otra cuenta por cobrar`);
        }
        viajes = encontrados;
      }
      const sumaViajes = r2(suma(viajes.map((v) => v.montoCobrado as Decimal)));
      const monto = d.monto != null ? r2(d.monto) : sumaViajes;
      if (monto.lte(0)) throw reglaNegocio('MONTO_CERO', 'El monto a cobrar debe ser mayor que cero');
      if (viajes.length && !monto.eq(sumaViajes)) avisos.push(`El monto (Q${monto.toFixed(2)}) es distinto de lo cobrado en los viajes (Q${sumaViajes.toFixed(2)}).`);
      const diasCredito = d.diasCredito ?? (cliente.diasCredito || diasDefecto);

      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_NUMERO_CUENTA})`;
      const ultima = await tx.cuentaCobrar.findFirst({ orderBy: { numero: 'desc' }, select: { numero: true } });
      const cuenta = await tx.cuentaCobrar.create({
        data: {
          numero: siguienteNumero(ultima?.numero, 'CC-'), sucursalId, clienteId: d.clienteId, tipoDocumento: d.tipoDocumento, serie: d.serie, numeroDocumento: d.numeroDocumento,
          autorizacionFel: d.autorizacionFel, fechaEmision: d.fechaEmision, diasCredito, fechaVencimiento: vencimiento(d.fechaEmision, diasCredito),
          monto, saldo: monto, estado: 'PENDIENTE', descripcion: d.descripcion, archivoId: d.archivoId ?? null, creadoPorId: ctx.usuario.sub,
        },
      });
      if (viajes.length) await tx.viaje.updateMany({ where: { id: { in: viajes.map((v) => v.id) } }, data: { cuentaCobrarId: cuenta.id } });
      await this.audit.registrar(ctx, { accion: 'CREAR', entidad: 'CuentaCobrar', entidadId: cuenta.id, despues: { numero: cuenta.numero, clienteId: d.clienteId, monto, diasCredito, viajes: viajes.map((v) => v.numero) } }, tx);
      return cuenta;
    });
    return { data: { id: r.id, numero: r.numero, fechaVencimiento: ymd(r.fechaVencimiento), avisos }, message: `Cuenta ${r.numero} por Q${D(r.monto).toFixed(2)}: vence el ${ymd(r.fechaVencimiento)} (${r.diasCredito} días)` };
  }

  /** Bloquea la cuenta para que dos abonos al mismo tiempo no dejen mal el saldo. */
  private async cargarParaCambiar(tx: Tx, ctx: Ctx, id: number) {
    await tx.$executeRaw`SELECT id FROM cuentas_cobrar WHERE id = ${id} FOR UPDATE`;
    const c = await tx.cuentaCobrar.findFirst({ where: { id, sucursalId: this.sucursal(ctx) }, include: { abonos: true } });
    if (!c) throw noEncontrado('Cuenta por cobrar', id);
    return c;
  }
  private async recalcular(tx: Tx, c: { id: number; monto: Decimal | object }) {
    const abonos = await tx.abonoCobro.findMany({ where: { cuentaId: c.id }, select: { monto: true, anulado: true } });
    const saldo = saldoDe(c.monto as Decimal, abonos);
    const estado = estadoPorSaldo(c.monto as Decimal, saldo);
    await tx.cuentaCobrar.update({ where: { id: c.id }, data: { saldo, estado } });
    return { saldo, estado };
  }

  async abonar(ctx: Ctx, id: number, body: unknown) {
    const d = validar(abonoZ, body);
    if (d.fecha > hoy()) throw reglaNegocio('FECHA_FUTURA', 'La fecha del abono no puede ser futura');
    if (d.archivoId && !(await this.prisma.archivo.count({ where: { id: d.archivoId, creadoPorId: ctx.usuario.sub } }))) throw reglaNegocio('ARCHIVO_AJENO', 'Solo puede adjuntar archivos que usted subió');
    const r = await this.prisma.enTransaccion(async (tx) => {
      const c = await this.cargarParaCambiar(tx, ctx, id);
      if (c.estado === 'ANULADA') throw reglaNegocio('CUENTA_ANULADA', `La cuenta ${c.numero} está anulada`);
      if (c.estado === 'PAGADA') throw reglaNegocio('CUENTA_PAGADA', `La cuenta ${c.numero} ya está pagada`);
      if (D(d.monto).gt(D(c.saldo))) throw reglaNegocio('ABONO_MAYOR', `El abono (Q${D(d.monto).toFixed(2)}) es mayor que el saldo (Q${D(c.saldo).toFixed(2)})`);
      const abono = await tx.abonoCobro.create({ data: { cuentaId: c.id, fecha: d.fecha, monto: r2(d.monto), medio: d.medio, referencia: d.referencia, banco: d.banco, archivoId: d.archivoId ?? null, registradoPorId: ctx.usuario.sub } });
      const n = await this.recalcular(tx, c);
      await this.audit.registrar(ctx, { accion: 'ABONAR', entidad: 'CuentaCobrar', entidadId: c.id, antes: { saldo: c.saldo }, despues: { abonoId: abono.id, monto: abono.monto, medio: abono.medio, saldo: n.saldo } }, tx);
      return { c, n };
    });
    return { data: { saldo: r.n.saldo, estado: r.n.estado }, message: r.n.estado === 'PAGADA' ? `Cuenta ${r.c.numero} pagada` : `Abono aplicado a ${r.c.numero}: queda un saldo de Q${r.n.saldo.toFixed(2)}` };
  }

  async anularAbono(ctx: Ctx, id: number, abonoId: number, body: unknown) {
    const { motivo } = validar(anularZ, body);
    const r = await this.prisma.enTransaccion(async (tx) => {
      const c = await this.cargarParaCambiar(tx, ctx, id);
      if (c.estado === 'ANULADA') throw reglaNegocio('CUENTA_ANULADA', `La cuenta ${c.numero} está anulada`);
      const a = c.abonos.find((x) => x.id === abonoId);
      if (!a) throw noEncontrado('Abono', abonoId);
      if (a.anulado) throw reglaNegocio('ABONO_ANULADO', 'Ese abono ya está anulado');
      await tx.abonoCobro.update({ where: { id: a.id }, data: { anulado: true, motivoAnulacion: motivo } });
      const n = await this.recalcular(tx, c);
      await this.audit.registrar(ctx, { accion: 'ANULAR_ABONO', entidad: 'CuentaCobrar', entidadId: c.id, antes: { abonoId: a.id, monto: a.monto, saldo: c.saldo }, despues: { motivo, saldo: n.saldo } }, tx);
      return { c, n };
    });
    return { data: { saldo: r.n.saldo, estado: r.n.estado }, message: `Abono anulado: el saldo de ${r.c.numero} vuelve a Q${r.n.saldo.toFixed(2)}` };
  }

  /** Anula la cuenta y libera sus viajes para facturarlos de nuevo. Solo sin abonos vigentes. */
  async anular(ctx: Ctx, id: number, body: unknown) {
    const { motivo } = validar(anularZ, body);
    const c = await this.prisma.enTransaccion(async (tx) => {
      const c = await this.cargarParaCambiar(tx, ctx, id);
      if (c.estado === 'ANULADA') throw reglaNegocio('CUENTA_ANULADA', `La cuenta ${c.numero} ya está anulada`);
      if (c.abonos.some((a) => !a.anulado)) throw reglaNegocio('CUENTA_CON_ABONOS', 'Tiene abonos: anúlelos primero (con su motivo) si de verdad no corresponden');
      await tx.viaje.updateMany({ where: { cuentaCobrarId: c.id }, data: { cuentaCobrarId: null } });
      await tx.cuentaCobrar.update({ where: { id: c.id }, data: { estado: 'ANULADA', saldo: 0, motivoAnulacion: motivo, anuladaEn: new Date() } });
      await this.audit.registrar(ctx, { accion: 'ANULAR', entidad: 'CuentaCobrar', entidadId: c.id, antes: { estado: c.estado, saldo: c.saldo }, despues: { motivo } }, tx);
      return c;
    });
    return { message: `Cuenta ${c.numero} anulada; sus viajes quedan otra vez por facturar` };
  }

  async gestionar(ctx: Ctx, id: number, body: unknown) {
    const d = validar(gestionZ, body);
    const c = await this.prisma.cuentaCobrar.findFirst({ where: { id, sucursalId: this.sucursal(ctx) } });
    if (!c) throw noEncontrado('Cuenta por cobrar', id);
    if (c.estado === 'ANULADA') throw reglaNegocio('CUENTA_ANULADA', `La cuenta ${c.numero} está anulada`);
    if (d.promesaMonto != null && D(d.promesaMonto).gt(D(c.saldo))) throw reglaNegocio('PROMESA_MAYOR', `Lo prometido es más que el saldo (Q${D(c.saldo).toFixed(2)})`);
    if (d.promesaFecha && d.promesaFecha < hoy()) throw reglaNegocio('PROMESA_PASADA', 'La fecha prometida ya pasó');
    const g = await this.prisma.gestionCobro.create({ data: { cuentaId: c.id, tipo: d.tipo, nota: d.nota, promesaFecha: d.tipo === 'PROMESA' ? d.promesaFecha : null, promesaMonto: d.tipo === 'PROMESA' && d.promesaMonto != null ? r2(d.promesaMonto) : null, usuarioId: ctx.usuario.sub } });
    return { data: { id: g.id }, message: d.tipo === 'PROMESA' ? `Promesa de pago para el ${ymd(d.promesaFecha!)}: se le avisará si no se cumple` : 'Seguimiento registrado' };
  }

  // ───────────────────────── Avisos y control de crédito ─────────────────────────

  /** Para la campana: por vencer, vencidas (se repite cada N días), promesas incumplidas y viajes sin facturar. */
  async avisos(sucursalId: number) {
    const h = hoy();
    const [avisarDias, repetir, diasSinFacturar, limites] = await Promise.all([
      this.parametros.numero('cobros.avisar_dias_antes'), this.parametros.numero('cobros.repetir_aviso_dias'),
      this.parametros.numero('cobros.dias_sin_facturar'), this.limites(),
    ]);
    const ronda = Math.floor(h.getTime() / DIA / Math.max(1, repetir));
    const abiertas = await this.prisma.cuentaCobrar.findMany({
      where: { sucursalId, estado: { in: [...ABIERTAS] } },
      select: { id: true, saldo: true, fechaVencimiento: true, gestiones: { where: { tipo: 'PROMESA' }, select: { tipo: true, promesaFecha: true, promesaMonto: true, creadoEn: true } }, abonos: { select: { monto: true, anulado: true, fecha: true, creadoEn: true } } },
    });
    const lista: { id: string; tipo: string; nivel: 'info' | 'aviso' | 'critico'; titulo: string; detalle: string; ruta: string }[] = [];
    const Q = (n: Decimal) => `Q${n.toNumber().toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const vencidas = abiertas.filter((c) => diasVencida(c.fechaVencimiento, h) > 0);
    const ultimo = limites[limites.length - 1];
    if (vencidas.length) {
      const graves = vencidas.filter((c) => diasVencida(c.fechaVencimiento, h) > ultimo);
      lista.push({
        id: `cobros-vencidas:${ronda}:${vencidas.length}`, tipo: 'cobros', nivel: graves.length ? 'critico' : 'aviso',
        titulo: `${vencidas.length} cuenta(s) por cobrar vencida(s): ${Q(suma(vencidas.map((c) => c.saldo)))}`,
        detalle: graves.length ? `${graves.length} con más de ${ultimo} días: ${Q(suma(graves.map((c) => c.saldo)))}. Dé seguimiento hoy.` : 'Envíe el recordatorio al cliente desde Cuentas por cobrar.',
        ruta: '/home/cobros?vista=VENCIDAS',
      });
    }
    const pronto = abiertas.filter((c) => { const d = diasVencida(c.fechaVencimiento, h); return d <= 0 && d >= -avisarDias; });
    if (pronto.length) lista.push({ id: `cobros-por-vencer:${ymd(h)}:${pronto.length}`, tipo: 'cobros', nivel: 'info', titulo: `${pronto.length} cuenta(s) vencen en los próximos ${avisarDias} días`, detalle: `Por cobrar: ${Q(suma(pronto.map((c) => c.saldo)))}.`, ruta: '/home/cobros?vista=POR_VENCER' });
    const incumplidas = abiertas.filter((c) => estadoPromesa(c.gestiones, c.abonos, c.saldo, h)?.estado === 'INCUMPLIDA');
    if (incumplidas.length) lista.push({ id: `cobros-promesas:${ymd(h)}:${incumplidas.map((c) => c.id).join('-')}`, tipo: 'cobros', nivel: 'aviso', titulo: `${incumplidas.length} promesa(s) de pago incumplida(s)`, detalle: 'El cliente no pagó lo prometido en la fecha: vuelva a llamarlo.', ruta: '/home/cobros?vista=VENCIDAS' });
    const viejos = await this.prisma.viaje.aggregate({ where: { sucursalId, estado: { in: [...TERMINADOS] }, cuentaCobrarId: null, montoCobrado: { gt: 0 }, fechaLlegada: { lte: new Date(h.getTime() - diasSinFacturar * DIA) } }, _count: true, _sum: { montoCobrado: true } });
    if (viejos._count) lista.push({ id: `cobros-sin-facturar:${ronda}:${viejos._count}`, tipo: 'cobros', nivel: 'aviso', titulo: `${viejos._count} viaje(s) terminado(s) sin facturar`, detalle: `Llevan más de ${diasSinFacturar} días: ${Q(r2(viejos._sum.montoCobrado ?? 0))} que aún no se cobran.`, ruta: '/home/cobros?vista=SIN_FACTURAR' });
    return lista;
  }

  /** Al programar un viaje: deuda, límite de crédito y mora del cliente. Bloquea solo si el parámetro lo pide. */
  async revisarCredito(db: Tx | PrismaService, clienteId: number, cliente: { limiteCredito: Decimal | object }, nombre: string): Promise<string[]> {
    const cuentas = await db.cuentaCobrar.findMany({ where: { clienteId, estado: { in: [...ABIERTAS] } }, select: { saldo: true, fechaVencimiento: true } });
    if (!cuentas.length) return [];
    const h = hoy();
    const saldo = r2(suma(cuentas.map((c) => c.saldo)));
    const vencidas = cuentas.filter((c) => diasVencida(c.fechaVencimiento, h) > 0);
    const masVieja = vencidas.length ? Math.max(...vencidas.map((c) => diasVencida(c.fechaVencimiento, h))) : 0;
    const bloquear = await this.parametros.numero('cobros.bloquear_mora_dias');
    if (bloquear > 0 && masVieja > bloquear) throw reglaNegocio('CLIENTE_EN_MORA', `${nombre} tiene una cuenta vencida hace ${masVieja} días (el límite es ${bloquear}). Cobre antes de programarle otro viaje o cambie el parámetro «cobros.bloquear_mora_dias».`);
    const avisos: string[] = [];
    const limite = D(cliente.limiteCredito);
    if (limite.gt(0) && saldo.gt(limite)) avisos.push(`${nombre} debe Q${saldo.toFixed(2)}: pasa su límite de crédito de Q${limite.toFixed(2)}`);
    if (vencidas.length) avisos.push(`${nombre} tiene ${vencidas.length} cuenta(s) vencida(s) por Q${r2(suma(vencidas.map((c) => c.saldo))).toFixed(2)} (la más vieja, ${masVieja} días)`);
    return avisos;
  }
}
