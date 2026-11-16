import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import { Ctx, tienePermiso } from '../../common/auth/tipos';
import { noEncontrado, prohibido, reglaNegocio } from '../../common/errors';
import { D, r3 } from '../../common/money';
import { PrismaService } from '../../common/prisma/prisma.service';
import { KardexService } from './kardex.service';

export interface LineaConteo { productoId: number; cantidadFisica: number }
export interface LineaCantidadCosto { productoId: number; cantidad: number; costoUnitario?: number }

@Injectable()
export class InventarioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kardex: KardexService,
    private readonly audit: AuditService,
  ) {}

  /** Existencias de la sucursal activa (o de una bodega), con valorización. */
  async existencias(ctx: Ctx, f: { bodegaId?: number; q?: string; bajoMinimo?: boolean }) {
    const where: Prisma.ExistenciaWhereInput = {
      bodega: { sucursalId: ctx.sucursalId! },
      ...(f.bodegaId ? { bodegaId: f.bodegaId } : {}),
      ...(f.q
        ? { producto: { OR: [{ nombre: { contains: f.q, mode: 'insensitive' } }, { sku: { contains: f.q, mode: 'insensitive' } }, { codigoBarra: f.q }] } }
        : {}),
    };
    const filas = await this.prisma.existencia.findMany({
      where,
      include: {
        bodega: { select: { nombre: true } },
        producto: { select: { sku: true, nombre: true, stockMinimo: true, precioVenta: true, marca: { select: { nombre: true } } } },
      },
      orderBy: { producto: { nombre: 'asc' } },
      take: 5000,
    });
    const data = filas
      .map((e) => ({
        productoId: e.productoId,
        sku: e.producto.sku,
        producto: e.producto.nombre,
        marca: e.producto.marca?.nombre ?? null,
        bodegaId: e.bodegaId,
        bodega: e.bodega.nombre,
        cantidad: e.cantidad,
        stockMinimo: e.producto.stockMinimo,
        bajoMinimo: D(e.cantidad).lte(D(e.producto.stockMinimo)),
        costoPromedio: e.costoPromedio,
        valorCosto: D(e.cantidad).times(D(e.costoPromedio)).toDecimalPlaces(2),
        precioVenta: e.producto.precioVenta,
      }))
      .filter((e) => (f.bajoMinimo ? e.bajoMinimo : true));
    return { data };
  }

  async kardexProducto(ctx: Ctx, productoId: number, bodegaId: number | undefined, desde?: Date, hasta?: Date) {
    const data = await this.prisma.movimientoInventario.findMany({
      where: {
        productoId,
        bodega: { sucursalId: ctx.sucursalId! },
        ...(bodegaId ? { bodegaId } : {}),
        ...(desde || hasta ? { fecha: { ...(desde ? { gte: desde } : {}), ...(hasta ? { lt: hasta } : {}) } } : {}),
      },
      orderBy: { id: 'asc' },
      take: 10_000,
    });
    return { data };
  }

  /** Conteo físico / ajuste: compara contra sistema y genera movimientos por la diferencia. */
  async ajustar(ctx: Ctx, dto: { bodegaId: number; motivo: string; observacion?: string; lineas: LineaConteo[] }) {
    const resultado = await this.prisma.enTransaccion(async (tx) => {
      await this.kardex.validarBodega(tx, dto.bodegaId, ctx.sucursalId!);
      const ajuste = await tx.ajuste.create({
        data: { bodegaId: dto.bodegaId, motivo: dto.motivo, observacion: dto.observacion, usuarioId: ctx.usuario.sub, estado: 'CONFIRMADO' },
      });
      const lineas = [...dto.lineas].sort((a, b) => a.productoId - b.productoId); // anti-deadlock
      for (const l of lineas) {
        const actual = await tx.existencia.findUnique({ where: { productoId_bodegaId: { productoId: l.productoId, bodegaId: dto.bodegaId } } });
        const sistema = D(actual?.cantidad ?? 0);
        const diferencia = r3(D(l.cantidadFisica).minus(sistema));
        await tx.ajusteDetalle.create({
          data: { ajusteId: ajuste.id, productoId: l.productoId, cantidadSistema: sistema, cantidadFisica: l.cantidadFisica, diferencia },
        });
        if (diferencia.isZero()) continue;
        await this.kardex.registrar(tx, {
          bodegaId: dto.bodegaId, productoId: l.productoId,
          tipo: diferencia.gt(0) ? 'AJUSTE_POSITIVO' : 'AJUSTE_NEGATIVO',
          cantidad: diferencia.abs(), documentoTipo: 'AJUSTE', documentoId: ajuste.id,
          usuarioId: ctx.usuario.sub, observacion: `${dto.motivo}${dto.observacion ? `: ${dto.observacion}` : ''}`,
        });
      }
      await this.audit.registrar(ctx, { accion: 'AJUSTE_INVENTARIO', entidad: 'Ajuste', entidadId: ajuste.id, despues: dto }, tx);
      return tx.ajuste.findUniqueOrThrow({ where: { id: ajuste.id }, include: { detalles: true } });
    });
    return { data: resultado, message: 'Ajuste aplicado' };
  }

  /** Carga de inventario inicial (arranque de sucursal / migración). */
  async inventarioInicial(ctx: Ctx, dto: { bodegaId: number; lineas: LineaCantidadCosto[] }) {
    await this.prisma.enTransaccion(async (tx) => {
      await this.kardex.validarBodega(tx, dto.bodegaId, ctx.sucursalId!);
      const ajuste = await tx.ajuste.create({
        data: { bodegaId: dto.bodegaId, motivo: 'INVENTARIO_INICIAL', usuarioId: ctx.usuario.sub, estado: 'CONFIRMADO' },
      });
      for (const l of [...dto.lineas].sort((a, b) => a.productoId - b.productoId)) {
        await this.kardex.registrar(tx, {
          bodegaId: dto.bodegaId, productoId: l.productoId, tipo: 'INVENTARIO_INICIAL', cantidad: l.cantidad,
          costoUnitario: l.costoUnitario ?? 0, documentoTipo: 'INICIAL', documentoId: ajuste.id, usuarioId: ctx.usuario.sub,
        });
      }
      await this.audit.registrar(ctx, { accion: 'INVENTARIO_INICIAL', entidad: 'Ajuste', entidadId: ajuste.id, despues: { lineas: dto.lineas.length } }, tx);
    });
    return { message: `Inventario inicial cargado (${dto.lineas.length} productos)` };
  }

  /** Traslado en dos pasos: sale de origen (en tránsito) y entra al recibir. */
  async enviarTraslado(ctx: Ctx, dto: { bodegaOrigenId: number; bodegaDestinoId: number; observacion?: string; lineas: { productoId: number; cantidad: number }[] }) {
    if (dto.bodegaOrigenId === dto.bodegaDestinoId) throw reglaNegocio('TRASLADO_INVALIDO', 'Origen y destino deben ser distintos');
    const data = await this.prisma.enTransaccion(async (tx) => {
      await this.kardex.validarBodega(tx, dto.bodegaOrigenId, ctx.sucursalId!);
      const destino = await tx.bodega.findUnique({ where: { id: dto.bodegaDestinoId } });
      if (!destino?.activo) throw noEncontrado('Bodega destino', dto.bodegaDestinoId);

      const traslado = await tx.traslado.create({
        data: {
          sucursalOrigenId: ctx.sucursalId!, bodegaOrigenId: dto.bodegaOrigenId,
          sucursalDestinoId: destino.sucursalId, bodegaDestinoId: destino.id,
          usuarioEnviaId: ctx.usuario.sub, observacion: dto.observacion,
        },
      });
      for (const l of [...dto.lineas].sort((a, b) => a.productoId - b.productoId)) {
        const mov = await this.kardex.registrar(tx, {
          bodegaId: dto.bodegaOrigenId, productoId: l.productoId, tipo: 'TRASLADO_SALIDA', cantidad: l.cantidad,
          documentoTipo: 'TRASLADO', documentoId: traslado.id, usuarioId: ctx.usuario.sub,
        });
        await tx.trasladoDetalle.create({
          data: { trasladoId: traslado.id, productoId: l.productoId, cantidad: l.cantidad, costoUnitario: mov.costoUnitario },
        });
      }
      await this.audit.registrar(ctx, { accion: 'ENVIAR_TRASLADO', entidad: 'Traslado', entidadId: traslado.id, despues: dto }, tx);
      return traslado;
    });
    return { data, message: 'Traslado enviado (en tránsito)' };
  }

  /**
   * Recibir: cada línea entra con la cantidad que realmente llegó (por defecto, lo enviado).
   * Lo que no llegó queda registrado como faltante en tránsito: salió del origen y no entra al destino.
   */
  async recibirTraslado(ctx: Ctx, trasladoId: number, dto: { lineas?: { productoId: number; cantidadRecibida: number }[]; observacion?: string } = {}) {
    const resultado = await this.prisma.enTransaccion(async (tx) => {
      const [bloqueado] = await tx.$queryRaw<{ estado: string }[]>`SELECT estado FROM traslados WHERE id = ${trasladoId} FOR UPDATE`;
      if (!bloqueado) throw noEncontrado('Traslado', trasladoId);
      if (bloqueado.estado !== 'EN_TRANSITO') throw reglaNegocio('TRASLADO_ESTADO', `El traslado está ${bloqueado.estado}`);
      const t = await tx.traslado.findUniqueOrThrow({ where: { id: trasladoId }, include: { detalles: { include: { producto: { select: { nombre: true } } } } } });
      if (t.sucursalDestinoId !== ctx.sucursalId && !tienePermiso(ctx.usuario, 'sucursales.todas')) {
        throw prohibido('Solo la sucursal destino puede recibir el traslado');
      }
      const recibidas = new Map((dto.lineas ?? []).map((l) => [l.productoId, D(l.cantidadRecibida)]));
      const faltantes: string[] = [];
      for (const d of [...t.detalles].sort((a, b) => a.productoId - b.productoId)) {
        const recibida = r3(recibidas.get(d.productoId) ?? D(d.cantidad));
        if (recibida.lt(0)) throw reglaNegocio('CANTIDAD_INVALIDA', `Cantidad recibida inválida en «${d.producto.nombre}»`);
        if (recibida.gt(d.cantidad)) {
          throw reglaNegocio('CANTIDAD_MAYOR', `«${d.producto.nombre}»: se enviaron ${D(d.cantidad).toString()} y no se puede recibir más. Si llegó de más, regístrelo en otro traslado o en un ajuste.`);
        }
        if (recibida.gt(0)) {
          await this.kardex.registrar(tx, {
            bodegaId: t.bodegaDestinoId, productoId: d.productoId, tipo: 'TRASLADO_ENTRADA', cantidad: recibida,
            costoUnitario: d.costoUnitario, documentoTipo: 'TRASLADO', documentoId: t.id, usuarioId: ctx.usuario.sub,
          });
        }
        await tx.trasladoDetalle.update({ where: { id: d.id }, data: { cantidadRecibida: recibida } });
        if (recibida.lt(d.cantidad)) faltantes.push(`${d.producto.nombre}: faltan ${D(d.cantidad).minus(recibida).toString()}`);
      }
      if (faltantes.length && !dto.observacion?.trim()) throw reglaNegocio('OBSERVACION_REQUERIDA', 'Hay diferencias: explique qué pasó con lo que no llegó');
      await tx.traslado.update({
        where: { id: t.id },
        data: { estado: 'RECIBIDO', usuarioRecibeId: ctx.usuario.sub, fechaRecepcion: new Date(), observacionRecepcion: dto.observacion?.trim() || null },
      });
      await this.audit.registrar(ctx, { accion: 'RECIBIR_TRASLADO', entidad: 'Traslado', entidadId: t.id, despues: { faltantes, observacion: dto.observacion } }, tx);
      return faltantes;
    });
    return { data: { faltantes: resultado }, message: resultado.length ? `Traslado recibido con ${resultado.length} diferencia(s)` : 'Traslado recibido e ingresado al inventario' };
  }

  /** Anular un traslado en tránsito: la mercadería regresa a la bodega de origen, con su mismo costo. */
  async anularTraslado(ctx: Ctx, trasladoId: number, motivo: string) {
    await this.prisma.enTransaccion(async (tx) => {
      const [bloqueado] = await tx.$queryRaw<{ estado: string }[]>`SELECT estado FROM traslados WHERE id = ${trasladoId} FOR UPDATE`;
      if (!bloqueado) throw noEncontrado('Traslado', trasladoId);
      if (bloqueado.estado !== 'EN_TRANSITO') throw reglaNegocio('TRASLADO_ESTADO', `Solo se anula un traslado en tránsito (está ${bloqueado.estado})`);
      const t = await tx.traslado.findUniqueOrThrow({ where: { id: trasladoId }, include: { detalles: true } });
      if (t.sucursalOrigenId !== ctx.sucursalId && !tienePermiso(ctx.usuario, 'sucursales.todas')) {
        throw prohibido('Solo la sucursal de origen puede anular el traslado');
      }
      for (const d of [...t.detalles].sort((a, b) => a.productoId - b.productoId)) {
        await this.kardex.registrar(tx, {
          bodegaId: t.bodegaOrigenId, productoId: d.productoId, tipo: 'TRASLADO_ENTRADA', cantidad: d.cantidad,
          costoUnitario: d.costoUnitario, documentoTipo: 'TRASLADO', documentoId: t.id, usuarioId: ctx.usuario.sub,
          observacion: `Anulación del traslado #${t.id}: regresa al origen`,
        });
      }
      await tx.traslado.update({ where: { id: t.id }, data: { estado: 'ANULADO', motivoAnulacion: motivo, usuarioAnulaId: ctx.usuario.sub } });
      await this.audit.registrar(ctx, { accion: 'ANULAR_TRASLADO', entidad: 'Traslado', entidadId: t.id, despues: { motivo } }, tx);
    });
    return { message: 'Traslado anulado: la mercadería regresó a la bodega de origen' };
  }

  /** Nombres de bodegas y usuarios (el modelo guarda solo los ids). */
  private async nombres(ids: { bodegas: number[]; usuarios: number[] }) {
    const [bodegas, usuarios] = await Promise.all([
      this.prisma.bodega.findMany({ where: { id: { in: ids.bodegas } }, select: { id: true, nombre: true } }),
      this.prisma.usuario.findMany({ where: { id: { in: ids.usuarios } }, select: { id: true, nombre: true } }),
    ]);
    return { bodega: new Map(bodegas.map((b) => [b.id, b.nombre])), usuario: new Map(usuarios.map((u) => [u.id, u.nombre])) };
  }

  async traslados(ctx: Ctx, filtro: { vista?: 'por-recibir' | 'enviados' | 'todos'; estado?: string } = {}) {
    const lado = filtro.vista === 'por-recibir' ? { sucursalDestinoId: ctx.sucursalId! }
      : filtro.vista === 'enviados' ? { sucursalOrigenId: ctx.sucursalId! }
      : { OR: [{ sucursalOrigenId: ctx.sucursalId! }, { sucursalDestinoId: ctx.sucursalId! }] };
    const filas = await this.prisma.traslado.findMany({
      where: { ...lado, ...(filtro.estado ? { estado: filtro.estado } : {}) },
      include: {
        sucursalOrigen: { select: { nombre: true } },
        sucursalDestino: { select: { nombre: true } },
        detalles: { include: { producto: { select: { sku: true, nombre: true } } } },
      },
      orderBy: { id: 'desc' },
      take: 200,
    });
    const n = await this.nombres({
      bodegas: [...new Set(filas.flatMap((t) => [t.bodegaOrigenId, t.bodegaDestinoId]))],
      usuarios: [...new Set(filas.flatMap((t) => [t.usuarioEnviaId, t.usuarioRecibeId, t.usuarioAnulaId].filter((x): x is number => x != null)))],
    });
    const data = filas.map((t) => ({
      ...t,
      bodegaOrigen: n.bodega.get(t.bodegaOrigenId), bodegaDestino: n.bodega.get(t.bodegaDestinoId),
      usuarioEnvia: n.usuario.get(t.usuarioEnviaId), usuarioRecibe: t.usuarioRecibeId ? n.usuario.get(t.usuarioRecibeId) : null,
      esOrigen: t.sucursalOrigenId === ctx.sucursalId, esDestino: t.sucursalDestinoId === ctx.sucursalId,
      conDiferencias: t.detalles.some((d) => d.cantidadRecibida != null && D(d.cantidadRecibida).lt(d.cantidad)),
    }));
    return { data };
  }

  /** Bodegas a las que se puede enviar: todas las activas, de todas las sucursales. */
  async destinos() {
    const data = await this.prisma.bodega.findMany({
      where: { activo: true, sucursal: { activo: true } },
      select: { id: true, nombre: true, sucursalId: true, sucursal: { select: { nombre: true, codigo: true } } },
      orderBy: [{ sucursalId: 'asc' }, { nombre: 'asc' }],
    });
    return { data };
  }

  /** Traslados que esta sucursal tiene por recibir (para el aviso en Inicio). */
  async pendientes(ctx: Ctx) {
    return { data: { porRecibir: await this.prisma.traslado.count({ where: { sucursalDestinoId: ctx.sucursalId!, estado: 'EN_TRANSITO' } }) } };
  }
}
