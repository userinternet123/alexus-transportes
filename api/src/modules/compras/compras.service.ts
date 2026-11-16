import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import { Ctx, tienePermiso } from '../../common/auth/tipos';
import { noEncontrado, prohibido, reglaNegocio } from '../../common/errors';
import { fechaContable } from '../../common/fecha';
import { D, r2, r4, suma } from '../../common/money';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CierreService } from '../cierre/cierre.service';
import { KardexService } from '../inventario/kardex.service';
import { ErrorDte, FacturaDte, leerFacturaDte, normalizar } from './dte.parser';
import { ErrorLectorIa, leerFacturaConIa } from './lector-ia';
import { env } from '../../config/env';
import { LicenciaService } from '../licencia/licencia.service';

export interface CompraDto {
  proveedorId: number;
  bodegaId?: number;
  serieFactura: string;
  numeroFactura: string;
  fechaFactura: Date;
  observacion?: string;
  lineas: { productoId: number; cantidad: number; costoUnitario: number; descuento: number }[];
  /** Actualiza precio de venta en el mismo acto (requiere productos.precios) */
  nuevosPrecios?: { productoId: number; precioVenta: number }[];
  /** Número de autorización SAT (compra importada del XML FEL): evita registrar la misma factura dos veces */
  uuidFel?: string;
  /** Renglones de la factura asignados a productos: se recuerdan para la próxima factura del proveedor */
  aprendizaje?: { descripcion: string; productoId: number; factor: number }[];
}

type Sugerencia = { productoId: number; nombre: string; sku: string; precioVenta: string; metodo: 'aprendido' | 'codigo' | 'similar'; similitud?: number; factor: number };

@Injectable()
export class ComprasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kardex: KardexService,
    private readonly cierre: CierreService,
    private readonly audit: AuditService,
    private readonly licencia: LicenciaService,
  ) {}

  async registrar(ctx: Ctx, dto: CompraDto) {
    if (dto.nuevosPrecios?.length && !tienePermiso(ctx.usuario, 'productos.precios')) {
      throw prohibido('No tiene permiso para actualizar precios de venta');
    }
    const data = await this.prisma.enTransaccion(async (tx) => {
      const sucursalId = ctx.sucursalId!;
      const hoy = fechaContable();
      await this.cierre.validarPeriodoAbierto(tx, sucursalId, hoy);

      const proveedor = await tx.tercero.findFirst({ where: { id: dto.proveedorId, esProveedor: true, activo: true } });
      if (!proveedor) throw noEncontrado('Proveedor', dto.proveedorId);
      const bodegaId = dto.bodegaId ?? (await this.kardex.bodegaPrincipal(tx, sucursalId));
      if (dto.bodegaId) await this.kardex.validarBodega(tx, bodegaId, sucursalId);

      const productos = await tx.producto.findMany({ where: { id: { in: dto.lineas.map((l) => l.productoId) } }, select: { id: true, nombre: true, manejaInventario: true } });
      const porId = new Map(productos.map((p) => [p.id, p]));

      const lineas = dto.lineas.map((l) => {
        const p = porId.get(l.productoId);
        if (!p) throw noEncontrado('Producto', l.productoId);
        if (!p.manejaInventario) throw reglaNegocio('PRODUCTO_SERVICIO', `"${p.nombre}" es un servicio y no se ingresa a inventario`);
        const bruto = D(l.cantidad).times(l.costoUnitario);
        const subtotal = r2(bruto.minus(l.descuento));
        if (subtotal.lt(0)) throw reglaNegocio('DESCUENTO_INVALIDO', `Descuento mayor al importe en "${p.nombre}"`);
        // Costo neto unitario (con descuento prorrateado) => valuación correcta del kardex
        return { ...l, subtotal, costoNeto: r4(subtotal.div(l.cantidad)) };
      });
      const subtotal = suma(lineas.map((l) => D(l.cantidad).times(l.costoUnitario)));
      const descuento = suma(lineas.map((l) => l.descuento));
      const total = suma(lineas.map((l) => l.subtotal));

      const compra = await tx.compra.create({
        data: {
          sucursalId, bodegaId, proveedorId: dto.proveedorId,
          serieFactura: dto.serieFactura, numeroFactura: dto.numeroFactura, fechaFactura: dto.fechaFactura, fechaContable: hoy,
          uuidFel: dto.uuidFel ?? null,
          subtotal: r2(subtotal), descuento: r2(descuento), total: r2(total), usuarioId: ctx.usuario.sub, observacion: dto.observacion,
          detalles: {
            create: lineas.map((l) => ({ productoId: l.productoId, cantidad: l.cantidad, costoUnitario: l.costoUnitario, descuento: l.descuento, subtotal: l.subtotal })),
          },
        },
      });

      for (const l of [...lineas].sort((a, b) => a.productoId - b.productoId)) {
        await this.kardex.registrar(tx, {
          bodegaId, productoId: l.productoId, tipo: 'ENTRADA_COMPRA', cantidad: l.cantidad, costoUnitario: l.costoNeto,
          documentoTipo: 'COMPRA', documentoId: compra.id, usuarioId: ctx.usuario.sub,
          observacion: `Factura ${dto.serieFactura}-${dto.numeroFactura}`,
        });
      }

      for (const np of dto.nuevosPrecios ?? []) {
        const actual = await tx.producto.findUniqueOrThrow({ where: { id: np.productoId }, select: { precioVenta: true } });
        if (D(actual.precioVenta).equals(np.precioVenta)) continue;
        await tx.historialPrecio.create({ data: { productoId: np.productoId, precioAnterior: actual.precioVenta, precioNuevo: np.precioVenta, usuarioId: ctx.usuario.sub } });
        await tx.producto.update({ where: { id: np.productoId }, data: { precioVenta: np.precioVenta } });
      }

      // Un producto "por conseguir" que ya llegó se vuelve normal (ya se puede vender)
      await tx.producto.updateMany({ where: { id: { in: dto.lineas.map((l) => l.productoId) }, porConseguir: true }, data: { porConseguir: false } });

      // Aprendizaje: "este renglón de este proveedor = este producto" (con su factor de empaque)
      for (const a of dto.aprendizaje ?? []) {
        const descripcion = normalizar(a.descripcion).slice(0, 300);
        if (!descripcion) continue;
        await tx.productoProveedor.upsert({
          where: { proveedorId_descripcion: { proveedorId: dto.proveedorId, descripcion } },
          create: { proveedorId: dto.proveedorId, descripcion, productoId: a.productoId, factor: a.factor },
          update: { productoId: a.productoId, factor: a.factor, usos: { increment: 1 } },
        });
      }

      await this.audit.registrar(ctx, { accion: 'COMPRA', entidad: 'Compra', entidadId: compra.id, despues: { ...dto, total } }, tx);
      return tx.compra.findUniqueOrThrow({ where: { id: compra.id }, include: { detalles: true, proveedor: true } });
    });
    return { data, message: `Compra registrada por Q${D(data.total).toFixed(2)}` };
  }

  /**
   * IMPORTAR FACTURA FEL (XML): devuelve la factura leída y, por renglón, el
   * producto sugerido. No registra nada: el usuario revisa y confirma.
   */
  async importarDte(ctx: Ctx, xml: string) {
    let f;
    try {
      f = leerFacturaDte(xml);
    } catch (e) {
      if (e instanceof ErrorDte) throw reglaNegocio('DTE_INVALIDO', e.message);
      throw e;
    }
    return this.revisar(f, 'xml');
  }

  /** ¿Qué formas de importar están disponibles? (la IA depende del plan y de la clave del servidor) */
  async capacidadesImportacion() {
    const plan = (await this.licencia.estado()).modulos.includes('ia');
    return { data: { xml: true, ia: plan && Boolean(env.IA_API_KEY), iaEnPlan: plan, iaConfigurada: Boolean(env.IA_API_KEY) } };
  }

  /** FOTO O PDF: la IA lee la factura; luego sigue la misma revisión que el XML. */
  async importarDocumento(ctx: Ctx, archivoBase64: string, mime: string) {
    if (!(await this.licencia.estado()).modulos.includes('ia')) {
      throw prohibido('Su plan no incluye la lectura de facturas con IA. Puede importar el XML de la factura.');
    }
    if (!env.IA_API_KEY) throw reglaNegocio('IA_NO_CONFIGURADA', 'La lectura con IA no está configurada en este servidor (falta IA_API_KEY).');
    let f;
    try {
      f = await leerFacturaConIa(archivoBase64, mime, { apiKey: env.IA_API_KEY, modelo: env.IA_MODELO });
    } catch (e) {
      if (e instanceof ErrorLectorIa) throw reglaNegocio('LECTURA_IA', e.message);
      throw e;
    }
    await this.audit.registrar(ctx, { accion: 'LECTURA_IA', entidad: 'Compra', entidadId: f.numero || 'sin-numero', despues: { emisor: f.emisor.nit, renglones: f.lineas.length, modelo: env.IA_MODELO } });
    return this.revisar(f, 'ia', f.observaciones);
  }

  /** Revisión común (XML o IA): proveedor, duplicados, cuadre y producto sugerido por renglón. */
  private async revisar(f: FacturaDte, origen: 'xml' | 'ia', observaciones = '') {
    const advertencias: string[] = [];
    if (origen === 'ia') {
      advertencias.push('Factura leída con IA: revise cantidades, precios y el número de factura antes de registrar.');
      if (observaciones) advertencias.push(`Notas de la lectura: ${observaciones}`);
      if (!f.serie && !f.numero) advertencias.push('No se leyó el número de la factura: escríbalo antes de registrar.');
      // Cuadre: la suma de los renglones debe coincidir con el total de la factura
      const suma = f.lineas.reduce((a, l) => a + l.total, 0);
      if (f.total > 0 && Math.abs(suma - f.total) > Math.max(0.05, f.total * 0.005)) {
        advertencias.push(`La suma de los renglones (Q${suma.toFixed(2)}) no coincide con el total leído (Q${f.total.toFixed(2)}): puede haber un renglón mal leído o faltante.`);
      }
    }

    // Proveedor por NIT (sin guiones ni ceros a la izquierda)
    const [proveedor] = await this.prisma.$queryRaw<{ id: number; nombre: string }[]>`
      SELECT id, COALESCE(razon_social, TRIM(CONCAT(nombres, ' ', apellidos))) AS nombre FROM terceros
      WHERE es_proveedor AND ${f.emisor.nit} <> '' AND ltrim(regexp_replace(upper(coalesce(nit, '')), '[^0-9K]', '', 'g'), '0') = ltrim(${f.emisor.nit}, '0')
      LIMIT 1`;

    // ¿La factura es para esta empresa?
    const empresa = await this.prisma.empresa.findFirst({ select: { nit: true } });
    if (empresa?.nit && f.receptorNit && f.receptorNit.replace(/^0+/, '') !== empresa.nit.toUpperCase().replace(/[^0-9K]/g, '').replace(/^0+/, '')) {
      advertencias.push(`La factura está a nombre del NIT ${f.receptorNit}, que no es el de su empresa.`);
    }
    // ¿Ya se registró?
    const previa = await this.prisma.compra.findFirst({
      where: { OR: [...(f.uuid ? [{ uuidFel: f.uuid }] : []), ...(proveedor && f.numero ? [{ proveedorId: proveedor.id, serieFactura: f.serie, numeroFactura: f.numero }] : []), { id: -1 }] },
      select: { id: true, fechaContable: true },
    });
    if (previa) advertencias.push(`Esta factura ya fue registrada (compra #${previa.id} del ${previa.fechaContable.toISOString().slice(0, 10)}).`);

    const lineas = [];
    for (const l of f.lineas) {
      lineas.push({ ...l, sugerencia: l.tipo === 'BIEN' ? await this.sugerir(proveedor?.id ?? null, l.descripcionNormalizada, l.codigoBarra) : null });
    }
    return { data: { origen, factura: { ...f, lineas: undefined }, proveedor: proveedor ?? null, lineas, yaRegistrada: Boolean(previa), advertencias } };
  }

  /** Producto sugerido: lo aprendido > código de barras > nombre parecido (pg_trgm). */
  private async sugerir(proveedorId: number | null, descripcion: string, codigoBarra: string | null): Promise<Sugerencia | null> {
    const datos = { id: true, nombre: true, sku: true, precioVenta: true } as const;
    if (proveedorId) {
      const m = await this.prisma.productoProveedor.findUnique({ where: { proveedorId_descripcion: { proveedorId, descripcion } } });
      if (m) {
        const p = await this.prisma.producto.findFirst({ where: { id: m.productoId, activo: true }, select: datos });
        if (p) return { productoId: p.id, nombre: p.nombre, sku: p.sku, precioVenta: p.precioVenta.toString(), metodo: 'aprendido', factor: Number(m.factor) };
      }
    }
    if (codigoBarra) {
      const p = await this.prisma.producto.findFirst({ where: { codigoBarra, activo: true }, select: datos });
      if (p) return { productoId: p.id, nombre: p.nombre, sku: p.sku, precioVenta: p.precioVenta.toString(), metodo: 'codigo', factor: 1 };
    }
    const [similar] = await this.prisma.$queryRaw<{ id: number; nombre: string; sku: string; precioVenta: string; similitud: number }[]>`
      SELECT id, nombre, sku, precio_venta::text AS "precioVenta", similarity(nombre, ${descripcion})::float AS similitud
      FROM productos WHERE activo AND nombre % ${descripcion}  -- usa ix_productos_nombre_trgm; pg_trgm no distingue mayúsculas
      ORDER BY similitud DESC LIMIT 1`;
    if (similar && similar.similitud >= 0.45) {
      return { productoId: similar.id, nombre: similar.nombre, sku: similar.sku, precioVenta: similar.precioVenta, metodo: 'similar', similitud: Math.round(similar.similitud * 100), factor: 1 };
    }
    return null;
  }

  async anular(ctx: Ctx, id: number, motivo: string) {
    await this.prisma.enTransaccion(async (tx) => {
      const [fila] = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM compras WHERE id = ${id} FOR UPDATE`;
      if (!fila) throw noEncontrado('Compra', id);
      const c = await tx.compra.findUniqueOrThrow({ where: { id }, include: { detalles: true } });
      if (c.sucursalId !== ctx.sucursalId) throw noEncontrado('Compra', id);
      if (c.estado !== 'CONFIRMADO') throw reglaNegocio('COMPRA_ESTADO', `La compra está ${c.estado}`);
      await this.cierre.validarPeriodoAbierto(tx, c.sucursalId, c.fechaContable);

      for (const d of [...c.detalles].sort((a, b) => a.productoId - b.productoId)) {
        // Si ya se vendió parte de la mercadería, el kardex lo impide (STOCK_INSUFICIENTE)
        await this.kardex.registrar(tx, {
          bodegaId: c.bodegaId, productoId: d.productoId, tipo: 'ANULACION_COMPRA', cantidad: d.cantidad,
          documentoTipo: 'COMPRA', documentoId: c.id, usuarioId: ctx.usuario.sub, observacion: `Anulación: ${motivo}`,
        });
      }
      await tx.compra.update({ where: { id }, data: { estado: 'ANULADO', observacion: `${c.observacion ?? ''} | ANULADA: ${motivo}`.slice(0, 500) } });
      await this.audit.registrar(ctx, { accion: 'ANULAR', entidad: 'Compra', entidadId: id, despues: { motivo } }, tx);
    });
    return { message: 'Compra anulada y mercadería descargada del inventario' };
  }

  async listar(ctx: Ctx, f: { desde: Date; hasta: Date; proveedorId?: number; q?: string }) {
    const where: Prisma.CompraWhereInput = {
      sucursalId: ctx.sucursalId!,
      fechaContable: { gte: f.desde, lte: f.hasta },
      ...(f.proveedorId ? { proveedorId: f.proveedorId } : {}),
      ...(f.q ? { OR: [{ numeroFactura: { contains: f.q } }, { proveedor: { razonSocial: { contains: f.q, mode: 'insensitive' } } }] } : {}),
    };
    const data = await this.prisma.compra.findMany({
      where,
      include: { proveedor: { select: { nit: true, razonSocial: true, nombres: true } }, _count: { select: { detalles: true } } },
      orderBy: { id: 'desc' },
      take: 1000,
    });
    return { data };
  }

  async obtener(ctx: Ctx, id: number) {
    const data = await this.prisma.compra.findFirst({
      where: { id, sucursalId: ctx.sucursalId! },
      include: { proveedor: true, detalles: { include: { producto: { select: { sku: true, nombre: true } } } } },
    });
    if (!data) throw noEncontrado('Compra', id);
    return { data };
  }
}
