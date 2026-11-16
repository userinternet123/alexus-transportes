/**
 * CONTEO FÍSICO por sesiones.
 * - Varias personas cuentan; cada conteo guarda lo que decía el sistema en ese
 *   momento (sistemaAlContar). Al aprobar se ajusta la diferencia de ESE momento:
 *   las ventas posteriores al conteo de un producto no se descuentan dos veces.
 * - Conteo ciego: quien solo cuenta no ve la existencia del sistema.
 * - Parcial: los productos que no se contaron no se modifican.
 */
import { Injectable } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { Ctx, tienePermiso } from '../../common/auth/tipos';
import { conflicto, noEncontrado, reglaNegocio } from '../../common/errors';
import { D, r3 } from '../../common/money';
import { PrismaService, Tx } from '../../common/prisma/prisma.service';
import { KardexService } from './kardex.service';

@Injectable()
export class ConteosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kardex: KardexService,
    private readonly audit: AuditService,
  ) {}

  private async conteoAbierto(db: PrismaService | Tx, ctx: Ctx, id: number) {
    const c = await db.conteo.findFirst({ where: { id, sucursalId: ctx.sucursalId! } });
    if (!c) throw noEncontrado('Conteo', id);
    if (c.estado !== 'ABIERTO') throw reglaNegocio('CONTEO_CERRADO', `El conteo ya está ${c.estado === 'APROBADO' ? 'aprobado' : 'cancelado'}`);
    return c;
  }

  async listar(ctx: Ctx) {
    const data = await this.prisma.conteo.findMany({
      where: { sucursalId: ctx.sucursalId! },
      orderBy: { id: 'desc' },
      take: 100,
      include: { _count: { select: { lineas: true } } },
    });
    const bodegas = new Map((await this.prisma.bodega.findMany({ where: { sucursalId: ctx.sucursalId! }, select: { id: true, nombre: true } })).map((b) => [b.id, b.nombre]));
    return { data: data.map((c) => ({ ...c, bodega: bodegas.get(c.bodegaId), productosContados: c._count.lineas })) };
  }

  /** Ve la existencia del sistema: conteo no ciego, quien aprueba ajustes o quien tiene el permiso de cuadre. */
  private verSistema(ctx: Ctx, ciego: boolean) {
    return !ciego || tienePermiso(ctx.usuario, 'inventario.ajustar') || tienePermiso(ctx.usuario, 'inventario.cuadre');
  }

  /** Sub-agrupaciones del alcance (incluye las anidadas). null = toda la bodega. */
  private async subgruposDelAlcance(db: PrismaService | Tx, c: { alcanceTipo: string | null; alcanceId: number | null }): Promise<number[] | null> {
    if (!c.alcanceTipo || !c.alcanceId) return null;
    if (c.alcanceTipo === 'CATEGORIA') return (await db.subgrupo.findMany({ where: { grupo: { categoriaId: c.alcanceId } }, select: { id: true } })).map((x) => x.id);
    if (c.alcanceTipo === 'GRUPO') return (await db.subgrupo.findMany({ where: { grupoId: c.alcanceId }, select: { id: true } })).map((x) => x.id);
    const raiz = await db.subgrupo.findUnique({ where: { id: c.alcanceId }, select: { grupoId: true } });
    if (!raiz) return [];
    const hermanos = await db.subgrupo.findMany({ where: { grupoId: raiz.grupoId }, select: { id: true, padreId: true } });
    const ids = new Set([c.alcanceId]);
    for (let cambio = true; cambio;) {
      cambio = false;
      for (const h of hermanos) if (h.padreId != null && ids.has(h.padreId) && !ids.has(h.id)) { ids.add(h.id); cambio = true; }
    }
    return [...ids];
  }

  async crear(ctx: Ctx, dto: { bodegaId: number; nombre: string; ciego: boolean; alcance?: { tipo: 'CATEGORIA' | 'GRUPO' | 'SUBGRUPO'; id: number } }) {
    await this.kardex.validarBodega(this.prisma, dto.bodegaId, ctx.sucursalId!);
    let alcance: { alcanceTipo: string; alcanceId: number; alcanceNombre: string } | null = null;
    if (dto.alcance) {
      const { tipo, id } = dto.alcance;
      let nombre: string | null = null;
      if (tipo === 'CATEGORIA') nombre = (await this.prisma.categoria.findUnique({ where: { id } }))?.nombre ?? null;
      else if (tipo === 'GRUPO') {
        const g = await this.prisma.grupo.findUnique({ where: { id }, include: { categoria: true } });
        nombre = g ? `${g.categoria.nombre} › ${g.nombre}` : null;
      } else {
        const sg = await this.prisma.subgrupo.findUnique({ where: { id }, include: { grupo: { include: { categoria: true } } } });
        nombre = sg ? `${sg.grupo.categoria.nombre} › ${sg.grupo.nombre} › ${sg.nombre}` : null;
      }
      if (!nombre) throw noEncontrado('Clasificación', id);
      alcance = { alcanceTipo: tipo, alcanceId: id, alcanceNombre: nombre };
    }
    const abierto = await this.prisma.conteo.findFirst({ where: { bodegaId: dto.bodegaId, estado: 'ABIERTO' } });
    if (abierto) throw conflicto('CONTEO_ABIERTO', `Ya hay un conteo abierto en esta bodega: «${abierto.nombre}». Termínelo o cancélelo antes de abrir otro.`);
    const c = await this.prisma.conteo.create({ data: { bodegaId: dto.bodegaId, nombre: dto.nombre, ciego: dto.ciego, ...(alcance ?? {}), sucursalId: ctx.sucursalId!, creadoPorId: ctx.usuario.sub } });
    await this.audit.registrar(ctx, { accion: 'CONTEO_ABIERTO', entidad: 'Conteo', entidadId: c.id, despues: dto });
    return { data: c, message: 'Conteo abierto: ya se puede contar' };
  }

  /** Detalle. La existencia del sistema y las diferencias solo se muestran si el conteo no es ciego o el usuario aprueba ajustes. */
  async obtener(ctx: Ctx, id: number) {
    const c = await this.prisma.conteo.findFirst({ where: { id, sucursalId: ctx.sucursalId! } });
    if (!c) throw noEncontrado('Conteo', id);
    const verSistema = this.verSistema(ctx, c.ciego);
    const lineas = await this.prisma.conteoLinea.findMany({
      where: { conteoId: id },
      orderBy: { actualizado: 'desc' },
      include: { producto: { select: { id: true, sku: true, nombre: true, codigoBarra: true, presentacion: { select: { nombre: true, permiteDecimales: true } } } } },
    });
    const costos = verSistema
      ? new Map((await this.prisma.existencia.findMany({ where: { bodegaId: c.bodegaId, productoId: { in: lineas.map((l) => l.productoId) } }, select: { productoId: true, costoPromedio: true } })).map((e) => [e.productoId, D(e.costoPromedio)]))
      : new Map();
    const data = lineas.map((l) => {
      const base = { productoId: l.productoId, producto: l.producto, cantidadFisica: l.cantidadFisica, actualizado: l.actualizado };
      if (!verSistema) return base;
      const diferencia = r3(D(l.cantidadFisica).minus(l.sistemaAlContar));
      const costo = costos.get(l.productoId) ?? D(0);
      // costoPromedio y valorCosto los quita el interceptor a quien no tiene permiso de costos
      return { ...base, sistemaAlContar: l.sistemaAlContar, diferencia, costoPromedio: costo, valorCosto: diferencia.times(costo).toDecimalPlaces(2) };
    });
    const resumen = verSistema
      ? {
          contados: data.length,
          faltantes: data.filter((l) => 'diferencia' in l && l.diferencia.lt(0)).length,
          sobrantes: data.filter((l) => 'diferencia' in l && l.diferencia.gt(0)).length,
          exactos: data.filter((l) => 'diferencia' in l && l.diferencia.isZero()).length,
        }
      : { contados: data.length };
    return { data: { ...c, verSistema, resumen, lineas: data } };
  }

  /** Registra lo contado de un producto. "sumar" agrega a lo ya contado (otro estante); "reemplazar" corrige. */
  async contar(ctx: Ctx, id: number, dto: { productoId: number; cantidad: number; modo: 'sumar' | 'reemplazar' }) {
    const c = await this.conteoAbierto(this.prisma, ctx, id);
    const p = await this.prisma.producto.findFirst({ where: { id: dto.productoId, activo: true }, select: { nombre: true, subgrupoId: true, manejaInventario: true, presentacion: { select: { permiteDecimales: true } } } });
    if (!p) throw noEncontrado('Producto', dto.productoId);
    const alcance = await this.subgruposDelAlcance(this.prisma, c);
    if (alcance && !alcance.includes(p.subgrupoId)) throw reglaNegocio('FUERA_DEL_ALCANCE', `«${p.nombre}» no pertenece a ${c.alcanceNombre}: este conteo es solo de esa clasificación`);
    if (!p.manejaInventario) throw reglaNegocio('SIN_INVENTARIO', `«${p.nombre}» no controla existencia (es un servicio)`);
    if (!p.presentacion.permiteDecimales && !Number.isInteger(dto.cantidad)) throw reglaNegocio('CANTIDAD_ENTERA', `«${p.nombre}» se cuenta en unidades enteras`);

    const existencia = await this.prisma.existencia.findUnique({ where: { productoId_bodegaId: { productoId: dto.productoId, bodegaId: c.bodegaId } } });
    const sistema = D(existencia?.cantidad ?? 0);
    const previa = await this.prisma.conteoLinea.findUnique({ where: { conteoId_productoId: { conteoId: id, productoId: dto.productoId } } });
    const total = dto.modo === 'sumar' && previa ? D(previa.cantidadFisica).plus(dto.cantidad) : D(dto.cantidad);
    if (total.lt(0)) throw reglaNegocio('CANTIDAD_NEGATIVA', 'La cantidad contada no puede ser negativa');

    const linea = await this.prisma.conteoLinea.upsert({
      where: { conteoId_productoId: { conteoId: id, productoId: dto.productoId } },
      create: { conteoId: id, productoId: dto.productoId, cantidadFisica: total, sistemaAlContar: sistema, contadoPorId: ctx.usuario.sub },
      update: { cantidadFisica: total, sistemaAlContar: sistema, contadoPorId: ctx.usuario.sub },
    });
    return { data: { productoId: linea.productoId, cantidadFisica: linea.cantidadFisica }, message: `${p.nombre}: ${total.toString()}` };
  }

  async quitar(ctx: Ctx, id: number, productoId: number) {
    await this.conteoAbierto(this.prisma, ctx, id);
    await this.prisma.conteoLinea.deleteMany({ where: { conteoId: id, productoId } });
    return { message: 'Producto quitado del conteo' };
  }

  /** Aprueba: genera el ajuste CONTEO_FISICO y los movimientos del kardex por la diferencia de cada línea. */
  async aprobar(ctx: Ctx, id: number, observacion?: string) {
    const resultado = await this.prisma.enTransaccion(async (tx) => {
      await tx.$queryRaw`SELECT id FROM conteos WHERE id = ${id} FOR UPDATE`;
      const c = await this.conteoAbierto(tx, ctx, id);
      const lineas = await tx.conteoLinea.findMany({ where: { conteoId: id }, orderBy: { productoId: 'asc' } }); // orden fijo: evita bloqueos cruzados
      if (!lineas.length) throw reglaNegocio('CONTEO_VACIO', 'No hay productos contados');

      const ajuste = await tx.ajuste.create({
        data: { bodegaId: c.bodegaId, motivo: 'CONTEO_FISICO', observacion: `Conteo #${c.id} «${c.nombre}»${observacion ? `: ${observacion}` : ''}`, usuarioId: ctx.usuario.sub, estado: 'CONFIRMADO' },
      });
      let movimientos = 0;
      for (const l of lineas) {
        const diferencia = r3(D(l.cantidadFisica).minus(l.sistemaAlContar));
        await tx.ajusteDetalle.create({ data: { ajusteId: ajuste.id, productoId: l.productoId, cantidadSistema: l.sistemaAlContar, cantidadFisica: l.cantidadFisica, diferencia } });
        if (diferencia.isZero()) continue;
        await this.kardex.registrar(tx, {
          bodegaId: c.bodegaId, productoId: l.productoId,
          tipo: diferencia.gt(0) ? 'AJUSTE_POSITIVO' : 'AJUSTE_NEGATIVO',
          cantidad: diferencia.abs(), documentoTipo: 'AJUSTE', documentoId: ajuste.id,
          usuarioId: ctx.usuario.sub, observacion: `Conteo físico #${c.id}`,
        });
        movimientos++;
      }
      await tx.conteo.update({ where: { id }, data: { estado: 'APROBADO', aprobadoPorId: ctx.usuario.sub, ajusteId: ajuste.id, cerradoEn: new Date(), observacion } });
      await this.audit.registrar(ctx, { accion: 'CONTEO_APROBADO', entidad: 'Conteo', entidadId: id, despues: { ajusteId: ajuste.id, productos: lineas.length, movimientos } }, tx);
      return { ajusteId: ajuste.id, productos: lineas.length, movimientos };
    });
    return { data: resultado, message: `Conteo aprobado: ${resultado.movimientos} productos ajustados de ${resultado.productos} contados` };
  }

  async cancelar(ctx: Ctx, id: number, motivo: string) {
    await this.conteoAbierto(this.prisma, ctx, id);
    await this.prisma.conteo.update({ where: { id }, data: { estado: 'CANCELADO', observacion: motivo, cerradoEn: new Date() } });
    await this.audit.registrar(ctx, { accion: 'CONTEO_CANCELADO', entidad: 'Conteo', entidadId: id, despues: { motivo } });
    return { message: 'Conteo cancelado: no se modificó el inventario' };
  }

  /**
   * Productos del alcance con su estado (contado o pendiente). La existencia del sistema
   * solo se incluye si el usuario puede verla (gerencia, aprobadores o conteo no ciego).
   */
  async lista(ctx: Ctx, id: number, filtro: { estado?: 'pendientes' | 'contados' | 'todos'; q?: string }) {
    const c = await this.prisma.conteo.findFirst({ where: { id, sucursalId: ctx.sucursalId! } });
    if (!c) throw noEncontrado('Conteo', id);
    const ver = this.verSistema(ctx, c.ciego);
    const alcance = await this.subgruposDelAlcance(this.prisma, c);
    const contados = new Map((await this.prisma.conteoLinea.findMany({ where: { conteoId: id }, select: { productoId: true, cantidadFisica: true } })).map((l) => [l.productoId, l.cantidadFisica]));
    const q = filtro.q?.trim();
    const productos = await this.prisma.producto.findMany({
      where: {
        activo: true, manejaInventario: true,
        ...(alcance ? { subgrupoId: { in: alcance } } : {}),
        ...(q ? { OR: [{ nombre: { contains: q, mode: 'insensitive' as const } }, { sku: { contains: q, mode: 'insensitive' as const } }, { codigoBarra: q }] } : {}),
      },
      select: { id: true, sku: true, nombre: true, presentacion: { select: { permiteDecimales: true } }, existencias: { where: { bodegaId: c.bodegaId }, select: { cantidad: true } } },
      orderBy: { nombre: 'asc' },
      take: 3000,
    });
    const filas = productos.map((p) => {
      const contado = contados.get(p.id);
      const sistema = D(p.existencias[0]?.cantidad ?? 0);
      return {
        productoId: p.id, sku: p.sku, nombre: p.nombre, decimales: p.presentacion.permiteDecimales,
        contado: contado ?? null,
        ...(ver ? { sistema, diferencia: contado != null ? r3(D(contado).minus(sistema)) : null } : {}),
      };
    });
    const total = filas.length;
    const hechos = filas.filter((f) => f.contado != null).length;
    const data = filtro.estado === 'contados' ? filas.filter((f) => f.contado != null) : filtro.estado === 'pendientes' ? filas.filter((f) => f.contado == null) : filas;
    return { data, resumen: { total, contados: hechos, pendientes: total - hechos }, verSistema: ver, alcance: c.alcanceNombre ?? 'Toda la bodega' };
  }

  /** Gerencia: "cuadra" = lo físico coincide con lo que dice el sistema en este momento. */
  async cuadra(ctx: Ctx, id: number, productoId: number) {
    const c = await this.conteoAbierto(this.prisma, ctx, id);
    const existencia = await this.prisma.existencia.findUnique({ where: { productoId_bodegaId: { productoId, bodegaId: c.bodegaId } } });
    return this.contar(ctx, id, { productoId, cantidad: Number(D(existencia?.cantidad ?? 0)), modo: 'reemplazar' });
  }
}
