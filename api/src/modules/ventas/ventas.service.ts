import { LicenciaService } from '../licencia/licencia.service';
import { Injectable, Logger } from '@nestjs/common';
import { EstadoVenta, MedioPago, Prisma, TipoVenta } from '@prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import { Ctx, tienePermiso } from '../../common/auth/tipos';
import { noEncontrado, prohibido, reglaNegocio } from '../../common/errors';
import { fechaContable, sumarDias } from '../../common/fecha';
import { D, r2, suma } from '../../common/money';
import { ParametrosService } from '../../common/parametros/parametros.service';
import { PrismaService, Tx } from '../../common/prisma/prisma.service';
import { CierreService } from '../cierre/cierre.service';
import { FelService } from '../fel/fel.service';
import { KardexService } from '../inventario/kardex.service';
import { DescuentosService } from './descuentos.service';
import { SecuenciasService } from './secuencias.service';
import { calcularVenta, validarPagos } from './venta.calculo';

export interface CrearVentaDto {
  tipo: TipoVenta;
  clienteId?: number;
  bodegaId?: number;
  lineas: { productoId: number; cantidad: number; porcentajeDescuento: number }[];
  pagos: { medioPago: MedioPago; monto: number; referencia?: string }[];
  observaciones?: string;
  /** false = venta sin factura FEL (se puede emitir después). Por defecto: parámetro ventas.fel_por_defecto */
  emitirFel?: boolean;
  /** Código del vendedor (código de empleado o usuario). Vacío = el usuario en sesión. */
  vendedorCodigo?: string;
  /** Venta hecha en el POS a partir de una cotización (con lo que el cliente decidió llevar) */
  cotizacionId?: number;
  /** Solo cotizaciones: lista reutilizable (se vende varias veces) */
  reutilizable?: boolean;
  nombreLista?: string;
  compradoresEsperados?: number;
}

export interface DevolucionDto {
  motivo: string;
  reingresaInventario: boolean;
  lineas: { productoId: number; cantidad: number }[];
}

const includeDetalle = {
  cliente: { select: { id: true, nit: true, nombres: true, apellidos: true, razonSocial: true } },
  vendedor: { select: { id: true, nombre: true } },
  detalles: { orderBy: { id: 'asc' } },
  pagos: true,
  devoluciones: { include: { detalles: true } },
} satisfies Prisma.VentaInclude;

/**
 * CASO DE USO CENTRAL: VENTA en una sola transacción ACID.
 *   validar período -> validar caja -> precios desde BD -> políticas de
 *   descuento -> totales -> pagos -> correlativo -> kardex (con bloqueo) ->
 *   auditoría -> COMMIT -> FEL (asíncrono, tolerante a fallos)
 *
 * Sistema actual: VentaUI guardaba encabezado, detalle y stock en llamadas
 * separadas y sin transacción (una falla a mitad dejaba datos inconsistentes).
 */
@Injectable()
export class VentasService {
  private readonly log = new Logger('Ventas');

  constructor(
    private readonly prisma: PrismaService,
    private readonly kardex: KardexService,
    private readonly cierre: CierreService,
    private readonly descuentos: DescuentosService,
    private readonly secuencias: SecuenciasService,
    private readonly parametros: ParametrosService,
    private readonly audit: AuditService,
    private readonly fel: FelService,
    private readonly licencia: LicenciaService,
  ) {}

  async crear(ctx: Ctx, dto: CrearVentaDto) {
    const venta = await this.prisma.enTransaccion(async (tx) => {
      const origen = dto.cotizacionId ? await this.tomarCotizacion(tx, ctx, dto) : null;
      if (!origen) return this.crearEnTx(tx, ctx, dto);
      const observaciones = dto.observaciones || (origen.reutilizable ? `Desde la lista ${origen.nombreLista ?? `${origen.serie}-${origen.numero}`}` : `Desde cotización ${origen.serie}-${origen.numero}`);
      // El vendedor de la venta: el elegido en la pestaña; si no, quien hizo la cotización
      return this.crearEnTx(tx, ctx, { ...dto, observaciones }, origen.id, dto.vendedorCodigo ? undefined : origen.vendedorId);
    });
    if (venta.felEstado === 'PENDIENTE') this.certificarEnSegundoPlano(venta.id);
    return this.obtener(ctx, venta.id);
  }

  /** Convierte una cotización vigente en venta (precios se recalculan a HOY). */
  async convertirCotizacion(ctx: Ctx, cotizacionId: number, pagos: CrearVentaDto['pagos'], emitirFel?: boolean, lineas?: { productoId: number; cantidad: number }[]) {
    const venta = await this.prisma.enTransaccion(async (tx) => {
      const [fila] = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM ventas WHERE id = ${cotizacionId} FOR UPDATE`;
      if (!fila) throw noEncontrado('Cotización', cotizacionId);
      const cot = await tx.venta.findUniqueOrThrow({ where: { id: cotizacionId }, include: { detalles: true } });
      if (cot.tipo !== 'COTIZACION' || cot.sucursalId !== ctx.sucursalId) throw noEncontrado('Cotización', cotizacionId);
      if (cot.estado !== 'CONFIRMADA') throw reglaNegocio('COTIZACION_ESTADO', `La cotización está ${cot.estado}`);
      // Una lista reutilizable no vence por fecha: se cierra anulándola
      if (!cot.reutilizable && cot.validaHasta && cot.validaHasta < new Date()) throw reglaNegocio('COTIZACION_VENCIDA', 'La cotización está vencida');

      // Se puede vender solo una parte (p. ej. un alumno que ya tiene algunos útiles), pero solo productos de la cotización
      const deCot = new Map(cot.detalles.map((d) => [d.productoId, d]));
      if (lineas?.some((l) => !deCot.has(l.productoId))) throw reglaNegocio('LINEA_AJENA', 'Solo se pueden vender productos que están en la cotización');
      const detalles = lineas?.length
        ? lineas.map((l) => ({ productoId: l.productoId, cantidad: l.cantidad, porcentajeDescuento: D(deCot.get(l.productoId)!.porcentajeDescuento).toNumber() }))
        : cot.detalles.map((d) => ({ productoId: d.productoId, cantidad: D(d.cantidad).toNumber(), porcentajeDescuento: D(d.porcentajeDescuento).toNumber() }));

      const nueva = await this.crearEnTx(tx, ctx, {
        tipo: 'VENTA',
        clienteId: cot.clienteId,
        bodegaId: cot.bodegaId,
        lineas: detalles,
        pagos,
        emitirFel,
        observaciones: cot.reutilizable ? `Desde la lista ${cot.nombreLista ?? `${cot.serie}-${cot.numero}`}` : `Desde cotización ${cot.serie}-${cot.numero}`,
      }, cot.id, cot.vendedorId);
      if (!cot.reutilizable) await tx.venta.update({ where: { id: cot.id }, data: { estado: 'CONVERTIDA' } }); // la lista sigue abierta
      return nueva;
    });
    if (venta.felEstado === 'PENDIENTE') this.certificarEnSegundoPlano(venta.id);
    return this.obtener(ctx, venta.id);
  }

  private async crearEnTx(tx: Tx, ctx: Ctx, dto: CrearVentaDto, cotizacionOrigenId?: number, vendedorOrigenId?: number) {
    const sucursalId = ctx.sucursalId!;
    const hoy = fechaContable();
    const esVenta = dto.tipo === 'VENTA';

    await this.cierre.validarPeriodoAbierto(tx, sucursalId, hoy);

    // Caja abierta del usuario (solo ventas; las cotizaciones no mueven dinero)
    let cajaSesionId: number | null = null;
    if (esVenta) {
      const sesion = await tx.cajaSesion.findFirst({
        where: { usuarioId: ctx.usuario.sub, estado: 'ABIERTA', caja: { sucursalId } },
        select: { id: true, fechaContable: true },
      });
      if (!sesion) throw reglaNegocio('CAJA_CERRADA', 'Debe abrir su caja antes de vender');
      if (sesion.fechaContable.getTime() !== hoy.getTime()) {
        throw reglaNegocio('CAJA_DIA_ANTERIOR', 'Su caja es de un día anterior: ciérrela y abra una nueva');
      }
      cajaSesionId = sesion.id;
    }

    const bodegaId = dto.bodegaId ?? (await this.kardex.bodegaPrincipal(tx, sucursalId));
    if (dto.bodegaId) await this.kardex.validarBodega(tx, bodegaId, sucursalId);

    const clienteId = dto.clienteId ?? (await this.consumidorFinal(tx));
    const cliente = await tx.tercero.findFirst({ where: { id: clienteId, activo: true } });
    if (!cliente) throw noEncontrado('Cliente', clienteId);

    // Precios SIEMPRE desde BD
    const ids = [...new Set(dto.lineas.map((l) => l.productoId))];
    const productos = await tx.producto.findMany({
      where: { id: { in: ids }, activo: true },
      include: { marca: { select: { nombre: true } }, presentacion: { select: { nombre: true, permiteDecimales: true } } },
    });
    const porId = new Map(productos.map((p) => [p.id, p]));
    const faltantes = ids.filter((id) => !porId.has(id));
    if (faltantes.length) throw reglaNegocio('PRODUCTO_NO_DISPONIBLE', `Productos inactivos o inexistentes: ${faltantes.join(', ')}`);
    // Un producto "por conseguir" se cotiza, pero no se vende hasta que llegue su primera compra
    const sinConseguir = esVenta ? productos.filter((p) => p.porConseguir) : [];
    if (sinConseguir.length) throw reglaNegocio('POR_CONSEGUIR', `Todavía no se ha conseguido ${sinConseguir.map((p) => `«${p.nombre}»`).join(', ')}: solo se puede cotizar. Se podrá vender cuando se registre su compra.`);

    const topes = await this.descuentos.topesPara(tx, ctx, productos);
    const calc = calcularVenta(
      dto.lineas.map((l) => {
        const p = porId.get(l.productoId)!;
        if (!p.presentacion.permiteDecimales && !Number.isInteger(l.cantidad)) {
          throw reglaNegocio('CANTIDAD_ENTERA', `"${p.nombre}" se vende por unidad entera`);
        }
        const tope = topes.get(p.id);
        return {
          productoId: p.id,
          descripcion: [p.nombre, p.marca?.nombre, p.presentacion.nombre].filter(Boolean).join(' · '),
          cantidad: l.cantidad,
          precioLista: p.precioVenta,
          porcentajeDescuento: l.porcentajeDescuento,
          topeDescuento: tope?.porcentajeMax ?? 0,
          cantidadMaximaDescuento: tope?.cantidadMaxima,
          exentoIva: p.exentoIva,
        };
      }),
      await this.parametros.numero('ventas.iva_porcentaje'),
    );

    // Pagos
    let cambio = D(0);
    if (esVenta) {
      ({ cambio } = validarPagos(calc.total, dto.pagos));
      const credito = suma(dto.pagos.filter((p) => p.medioPago === 'CREDITO').map((p) => p.monto));
      if (credito.gt(0)) {
        if (!cliente.nit || cliente.nit === 'CF') throw reglaNegocio('CREDITO_CF', 'No se otorga crédito a Consumidor Final');
        if (credito.gt(D(cliente.limiteCredito))) throw reglaNegocio('CREDITO_LIMITE', `Excede el límite de crédito del cliente (Q${D(cliente.limiteCredito).toFixed(2)})`);
      }
    }

    // Vendedor: por código (varios vendedores en una misma caja) o el usuario en sesión
    const vendedorId = dto.vendedorCodigo
      ? (await this.resolverVendedor(tx, ctx, dto.vendedorCodigo)).id
      : (vendedorOrigenId ?? ctx.usuario.sub);
    // Sin el módulo FEL en la licencia: la venta sale sin factura (no se interrumpe la caja); pedirla a propósito sí avisa
    const felLicenciado = await this.licencia.tieneModulo('fel');
    if (esVenta && dto.emitirFel === true && !felLicenciado) throw reglaNegocio('FEL_NO_INCLUIDO', 'Su licencia no incluye factura electrónica (FEL). Venda sin factura o amplíe su licencia con ALEXUS.');
    const emitirFel = esVenta && felLicenciado && (dto.emitirFel ?? (await this.parametros.booleano('ventas.fel_por_defecto')));

    const { serie, numero } = await this.secuencias.siguiente(tx, sucursalId, dto.tipo);
    const diasValidez = esVenta ? 0 : await this.parametros.numero('ventas.validez_cotizacion_dias');

    const venta = await tx.venta.create({
      data: {
        sucursalId, bodegaId, cajaSesionId, tipo: dto.tipo, estado: 'CONFIRMADA', serie, numero,
        fechaContable: hoy, clienteId, vendedorId,
        subtotal: calc.subtotal, descuentoTotal: calc.descuentoTotal, ivaIncluido: calc.ivaIncluido, total: calc.total, cambio,
        validaHasta: esVenta ? null : sumarDias(hoy, diasValidez + 1),
        ...(esVenta ? {} : { reutilizable: dto.reutilizable ?? false, nombreLista: dto.nombreLista?.trim() || null, compradoresEsperados: dto.compradoresEsperados ?? null }),
        cotizacionOrigenId: cotizacionOrigenId ?? null,
        felEstado: emitirFel ? 'PENDIENTE' : 'NO_APLICA',
        observaciones: dto.observaciones,
        pagos: esVenta ? { create: dto.pagos.map((p) => ({ medioPago: p.medioPago, monto: r2(p.monto), referencia: p.referencia })) } : undefined,
      },
    });

    // Kardex: productos ORDENADOS por id (anti-deadlock entre cajas)
    let costoTotal = D(0);
    const lineasOrdenadas = [...calc.lineas].sort((a, b) => a.productoId - b.productoId);
    for (const l of lineasOrdenadas) {
      const p = porId.get(l.productoId)!;
      let costoUnitario = D(0);
      if (esVenta && p.manejaInventario) {
        const mov = await this.kardex.registrar(tx, {
          bodegaId, productoId: p.id, tipo: 'SALIDA_VENTA', cantidad: l.cantidad,
          documentoTipo: 'VENTA', documentoId: venta.id, usuarioId: ctx.usuario.sub, productoNombre: p.nombre,
        });
        costoUnitario = mov.costoUnitario;
        costoTotal = costoTotal.plus(costoUnitario.times(l.cantidad));
      }
      await tx.ventaDetalle.create({
        data: {
          ventaId: venta.id, productoId: l.productoId, descripcion: l.descripcion, cantidad: l.cantidad,
          precioLista: l.precioLista, porcentajeDescuento: l.porcentajeDescuento, descuento: l.descuento,
          precioUnitario: l.precioUnitario, subtotal: l.subtotal, costoUnitario,
        },
      });
    }
    if (esVenta) await tx.venta.update({ where: { id: venta.id }, data: { costoTotal: r2(costoTotal) } });

    await this.audit.registrar(ctx, {
      accion: esVenta ? 'VENTA' : 'COTIZACION', entidad: 'Venta', entidadId: venta.id,
      despues: { serie, numero, total: calc.total, lineas: dto.lineas.length },
    }, tx);
    return venta;
  }

  /**
   * Anulación: solo el MISMO día contable y con la caja aún abierta (el dinero
   * no ha sido arqueado). Para días cerrados => devolución / nota de crédito.
   */
  async anular(ctx: Ctx, id: number, motivo: string, autorizadoPor: { id: number; nombre: string } | null = null) {
    await this.prisma.enTransaccion(async (tx) => {
      const [fila] = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM ventas WHERE id = ${id} FOR UPDATE`;
      if (!fila) throw noEncontrado('Venta', id);
      const v = await tx.venta.findUniqueOrThrow({ where: { id }, include: { detalles: true, cajaSesion: true, devoluciones: true } });
      if (v.sucursalId !== ctx.sucursalId) throw noEncontrado('Venta', id);
      if (v.estado !== 'CONFIRMADA') throw reglaNegocio('VENTA_ESTADO', `La venta está ${v.estado}`);
      if (v.devoluciones.length) throw reglaNegocio('VENTA_CON_DEVOLUCION', 'La venta tiene devoluciones registradas');
      await this.cierre.validarPeriodoAbierto(tx, v.sucursalId, v.fechaContable);

      if (v.tipo === 'VENTA') {
        if (v.fechaContable.getTime() !== fechaContable().getTime()) {
          throw reglaNegocio('ANULACION_FUERA_DE_DIA', 'Solo se anulan ventas del día. Registre una devolución.');
        }
        if (v.cajaSesion?.estado !== 'ABIERTA') throw reglaNegocio('CAJA_YA_CERRADA', 'La caja de esta venta ya fue cerrada. Registre una devolución.');
        const esSuya = v.vendedorId === ctx.usuario.sub || v.cajaSesion?.usuarioId === ctx.usuario.sub;
        if (!esSuya && !tienePermiso(ctx.usuario, 'caja.supervisar') && !autorizadoPor) {
          throw prohibido('Solo el vendedor o un supervisor pueden anular esta venta');
        }
        for (const d of [...v.detalles].sort((a, b) => a.productoId - b.productoId)) {
          const p = await tx.producto.findUniqueOrThrow({ where: { id: d.productoId }, select: { manejaInventario: true } });
          if (!p.manejaInventario) continue;
          await this.kardex.registrar(tx, {
            bodegaId: v.bodegaId, productoId: d.productoId, tipo: 'ANULACION_VENTA', cantidad: d.cantidad,
            costoUnitario: d.costoUnitario, documentoTipo: 'VENTA', documentoId: v.id, usuarioId: ctx.usuario.sub,
            observacion: `Anulación: ${motivo}`,
          });
        }
      }
      await tx.venta.update({
        where: { id },
        data: { estado: 'ANULADA', motivoAnulacion: motivo, anuladaPorId: ctx.usuario.sub, anuladaEn: new Date() },
      });
      await this.audit.registrar(ctx, { accion: 'ANULAR', entidad: 'Venta', entidadId: id, antes: { estado: v.estado }, despues: { motivo, autorizadoPor } }, tx);
    });
    void this.fel.anularVenta(id, motivo);
    return { message: 'Documento anulado' };
  }

  /** Devolución parcial o total (nota de crédito). Devuelve efectivo desde la caja ABIERTA del usuario. */
  async devolver(ctx: Ctx, ventaId: number, dto: DevolucionDto, autorizadoPor: { id: number; nombre: string } | null = null) {
    const data = await this.prisma.enTransaccion(async (tx) => {
      const hoy = fechaContable();
      await this.cierre.validarPeriodoAbierto(tx, ctx.sucursalId!, hoy);
      const [fila] = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM ventas WHERE id = ${ventaId} FOR UPDATE`;
      if (!fila) throw noEncontrado('Venta', ventaId);
      const v = await tx.venta.findUniqueOrThrow({ where: { id: ventaId }, include: { detalles: true, devoluciones: { include: { detalles: true } } } });
      if (v.sucursalId !== ctx.sucursalId || v.tipo !== 'VENTA') throw noEncontrado('Venta', ventaId);
      if (v.estado !== 'CONFIRMADA') throw reglaNegocio('VENTA_ESTADO', `La venta está ${v.estado}`);

      const sesion = await tx.cajaSesion.findFirst({ where: { usuarioId: ctx.usuario.sub, estado: 'ABIERTA', caja: { sucursalId: v.sucursalId } } });
      if (!sesion) throw reglaNegocio('CAJA_CERRADA', 'Abra su caja para registrar la devolución');

      let total = D(0);
      const lineas: { productoId: number; cantidad: number; monto: Prisma.Decimal | string; costoUnitario: Prisma.Decimal }[] = [];
      for (const l of dto.lineas) {
        const vendida = v.detalles.filter((d) => d.productoId === l.productoId);
        if (!vendida.length) throw reglaNegocio('DEVOLUCION_INVALIDA', `El producto ${l.productoId} no está en la venta`);
        const cantVendida = suma(vendida.map((d) => d.cantidad));
        const cantDevuelta = suma(v.devoluciones.flatMap((dv) => dv.detalles.filter((x) => x.productoId === l.productoId).map((x) => x.cantidad)));
        if (D(l.cantidad).gt(cantVendida.minus(cantDevuelta))) {
          throw reglaNegocio('DEVOLUCION_EXCEDE', `Solo puede devolver ${cantVendida.minus(cantDevuelta).toFixed(3)} del producto ${l.productoId}`);
        }
        const precioUnitario = D(vendida[0].precioUnitario);
        const monto = r2(precioUnitario.times(l.cantidad));
        total = total.plus(monto);
        lineas.push({ productoId: l.productoId, cantidad: l.cantidad, monto: monto.toFixed(2), costoUnitario: vendida[0].costoUnitario });
      }

      const dev = await tx.devolucion.create({
        data: {
          ventaId, fechaContable: hoy, motivo: dto.motivo, total: r2(total), reingresaInventario: dto.reingresaInventario,
          usuarioId: ctx.usuario.sub,
          detalles: { create: lineas.map((l) => ({ productoId: l.productoId, cantidad: l.cantidad, monto: l.monto })) },
        },
      });

      if (dto.reingresaInventario) {
        for (const l of [...lineas].sort((a, b) => a.productoId - b.productoId)) {
          const p = await tx.producto.findUniqueOrThrow({ where: { id: l.productoId }, select: { manejaInventario: true } });
          if (!p.manejaInventario) continue;
          await this.kardex.registrar(tx, {
            bodegaId: v.bodegaId, productoId: l.productoId, tipo: 'DEVOLUCION_CLIENTE', cantidad: l.cantidad,
            costoUnitario: l.costoUnitario, documentoTipo: 'DEVOLUCION', documentoId: dev.id, usuarioId: ctx.usuario.sub,
          });
        }
      }

      // Salida de efectivo de la caja => queda reflejada en el cuadre
      await tx.cajaMovimiento.create({
        data: {
          sesionId: sesion.id, tipo: 'EGRESO', medioPago: 'EFECTIVO', monto: r2(total),
          concepto: `Devolución venta ${v.serie}-${v.numero}: ${dto.motivo}`.slice(0, 250), usuarioId: ctx.usuario.sub,
        },
      });
      await this.audit.registrar(ctx, { accion: 'DEVOLUCION', entidad: 'Venta', entidadId: ventaId, despues: { devolucionId: dev.id, total, autorizadoPor } }, tx);
      return dev;
    });
    return { data, message: `Devolución registrada por Q${D(data.total).toFixed(2)}` };
  }

  async obtener(ctx: Ctx, id: number) {
    const data = await this.prisma.venta.findFirst({ where: { id, sucursalId: ctx.sucursalId! }, include: includeDetalle });
    if (!data) throw noEncontrado('Venta', id);
    return { data };
  }

  async listar(ctx: Ctx, f: { tipo?: TipoVenta; estado?: EstadoVenta; desde: Date; hasta: Date; vendedorId?: number; q?: string; page: number; limit: number }) {
    const where: Prisma.VentaWhereInput = {
      sucursalId: ctx.sucursalId!,
      fechaContable: { gte: f.desde, lte: f.hasta },
      ...(f.tipo ? { tipo: f.tipo } : {}),
      ...(f.estado ? { estado: f.estado } : {}),
      ...(f.vendedorId ? { vendedorId: f.vendedorId } : {}),
      ...(f.q
        ? {
            OR: [
              ...(Number.isInteger(Number(f.q)) ? [{ numero: Number(f.q) }] : []),
              { cliente: { nit: { contains: f.q, mode: 'insensitive' as const } } },
              { cliente: { nombres: { contains: f.q, mode: 'insensitive' as const } } },
              { cliente: { razonSocial: { contains: f.q, mode: 'insensitive' as const } } },
              { felNumero: f.q },
            ],
          }
        : {}),
    };
    const [total, data] = await this.prisma.$transaction([
      this.prisma.venta.count({ where }),
      this.prisma.venta.findMany({
        where,
        include: { cliente: { select: { nit: true, nombres: true, apellidos: true, razonSocial: true } }, vendedor: { select: { nombre: true } } },
        orderBy: { id: 'desc' },
        skip: f.limit > 0 ? (f.page - 1) * f.limit : 0,
        take: f.limit > 0 ? f.limit : 5000,
      }),
    ]);
    return { data, meta: { page: f.page, limit: f.limit, total } };
  }

  async reintentarFel(ctx: Ctx, id: number) {
    await this.exigirFel();
    await this.obtener(ctx, id);
    await this.fel.certificarVenta(id);
    return this.obtener(ctx, id);
  }

  private certificarEnSegundoPlano(ventaId: number): void {
    // Fire-and-forget controlado. Evolución: cola (BullMQ/Redis) con reintentos exponenciales.
    setImmediate(() => {
      this.fel.certificarVenta(ventaId).catch((e) => this.log.error(`FEL ${ventaId}: ${(e as Error).message}`));
    });
  }

  /**
   * Vendedor por código: código de empleado (RRHH) vinculado a un usuario, o el
   * nombre de usuario. Debe estar activo y tener acceso a la sucursal.
   */
  async resolverVendedor(db: Tx | PrismaService, ctx: Ctx, codigo: string) {
    const c = codigo.trim();
    const u = await db.usuario.findFirst({
      where: {
        activo: true,
        OR: [{ username: c.toLowerCase() }, { empleado: { codigo: c.toUpperCase(), estado: 'ACTIVO' } }],
      },
      select: { id: true, nombre: true, username: true, empleado: { select: { codigo: true } }, sucursales: { select: { sucursalId: true } } },
    });
    if (!u) throw reglaNegocio('VENDEDOR_NO_EXISTE', `No existe un vendedor activo con el código "${c}"`);
    if (!u.sucursales.some((s) => s.sucursalId === ctx.sucursalId)) {
      throw reglaNegocio('VENDEDOR_SUCURSAL', `${u.nombre} no está asignado a esta sucursal`);
    }
    return { id: u.id, nombre: u.nombre, codigo: u.empleado?.codigo ?? u.username };
  }

  /** Emite la FEL de una venta que se registró sin factura. */
  async emitirFel(ctx: Ctx, id: number) {
    await this.exigirFel();
    const v = await this.prisma.venta.findFirst({ where: { id, sucursalId: ctx.sucursalId! } });
    if (!v) throw noEncontrado('Venta', id);
    if (v.tipo !== 'VENTA' || v.estado !== 'CONFIRMADA') throw reglaNegocio('VENTA_ESTADO', 'Solo ventas confirmadas');
    if (v.felEstado !== 'NO_APLICA') throw reglaNegocio('FEL_YA_EMITIDA', `La venta ya tiene FEL (${v.felEstado})`);
    await this.prisma.venta.update({ where: { id }, data: { felEstado: 'PENDIENTE' } });
    await this.audit.registrar(ctx, { accion: 'EMITIR_FEL', entidad: 'Venta', entidadId: id });
    await this.fel.certificarVenta(id);
    return this.obtener(ctx, id);
  }

  private async consumidorFinal(tx: Tx): Promise<number> {
    const cf = await tx.tercero.findFirst({ where: { nit: 'CF', esCliente: true, activo: true }, orderBy: { id: 'asc' }, select: { id: true } });
    if (!cf) throw reglaNegocio('SIN_CF', 'No existe el cliente "Consumidor Final" (NIT CF)');
    return cf.id;
  }

  /** Marcar (o desmarcar) una cotización como lista reutilizable. */
  async marcarLista(ctx: Ctx, id: number, d: { reutilizable: boolean; nombreLista?: string | null; compradoresEsperados?: number | null }) {
    const cot = await this.prisma.venta.findFirst({ where: { id, sucursalId: ctx.sucursalId ?? -1, tipo: 'COTIZACION' } });
    if (!cot) throw noEncontrado('Cotización', id);
    if (cot.estado !== 'CONFIRMADA') throw reglaNegocio('COTIZACION_ESTADO', `La cotización está ${cot.estado}`);
    await this.prisma.venta.update({ where: { id }, data: { reutilizable: d.reutilizable, nombreLista: d.nombreLista?.trim() || null, compradoresEsperados: d.compradoresEsperados ?? null } });
    await this.audit.registrar(ctx, { accion: d.reutilizable ? 'LISTA_REUTILIZABLE' : 'LISTA_NORMAL', entidad: 'Venta', entidadId: id, despues: d });
    return { message: d.reutilizable ? 'Ahora es una lista reutilizable: se puede vender varias veces' : 'Ya no es una lista reutilizable' };
  }

  /** Listas reutilizables abiertas de la sucursal, con cuántas veces se han vendido. */
  async listasReutilizables(ctx: Ctx) {
    const listas = await this.prisma.venta.findMany({
      where: { sucursalId: ctx.sucursalId ?? -1, tipo: 'COTIZACION', estado: 'CONFIRMADA', reutilizable: true }, orderBy: { fecha: 'desc' }, take: 200,
      include: { cliente: { select: { nombres: true, apellidos: true, razonSocial: true } }, _count: { select: { detalles: true } } },
    });
    const usos = listas.length
      ? await this.prisma.venta.groupBy({ by: ['cotizacionOrigenId'], where: { cotizacionOrigenId: { in: listas.map((l) => l.id) }, tipo: 'VENTA', estado: 'CONFIRMADA' }, _count: { _all: true } })
      : [];
    const veces = new Map(usos.map((u) => [u.cotizacionOrigenId, u._count._all]));
    return { data: listas.map((l) => ({
      id: l.id, serie: l.serie, numero: l.numero, nombreLista: l.nombreLista, total: l.total, fecha: l.fecha, lineas: l._count.detalles,
      compradoresEsperados: l.compradoresEsperados, usos: veces.get(l.id) ?? 0,
      cliente: l.cliente.razonSocial || [l.cliente.nombres, l.cliente.apellidos].filter(Boolean).join(' ') || 'Consumidor final',
    })) };
  }

  private async exigirFel() {
    if (!(await this.licencia.tieneModulo('fel'))) throw reglaNegocio('FEL_NO_INCLUIDO', 'Su licencia no incluye factura electrónica (FEL). Amplíe su licencia con ALEXUS.');
  }

  /**
   * Venta hecha en el POS a partir de una cotización: el cliente, los productos y las cantidades pueden cambiar
   * (otro comprador, otra marca…). La cotización queda CONVERTIDA (salvo las listas reutilizables), con candado: si dos
   * cajas la cobran al mismo tiempo, solo una lo logra.
   */
  private async tomarCotizacion(tx: Tx, ctx: Ctx, dto: CrearVentaDto) {
    if (dto.tipo !== 'VENTA') throw reglaNegocio('COTIZACION_ORIGEN', 'Solo una venta puede venir de una cotización');
    const cot = await tx.venta.findFirst({ where: { id: dto.cotizacionId, sucursalId: ctx.sucursalId ?? -1, tipo: 'COTIZACION' } });
    if (!cot) throw noEncontrado('Cotización', dto.cotizacionId!);
    if (cot.estado !== 'CONFIRMADA') throw reglaNegocio('COTIZACION_ESTADO', `La cotización ${cot.serie}-${cot.numero} ya está ${cot.estado.toLowerCase()}: no se puede volver a vender`);
    if (!cot.reutilizable && cot.validaHasta && cot.validaHasta < new Date()) throw reglaNegocio('COTIZACION_VENCIDA', `La cotización ${cot.serie}-${cot.numero} está vencida`);
    if (!cot.reutilizable) {
      const r = await tx.venta.updateMany({ where: { id: cot.id, estado: 'CONFIRMADA' }, data: { estado: 'CONVERTIDA' } });
      if (r.count === 0) throw reglaNegocio('COTIZACION_ESTADO', `La cotización ${cot.serie}-${cot.numero} ya se cobró en otra caja`);
    }
    return cot;
  }
}
