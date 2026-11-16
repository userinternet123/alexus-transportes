import { Injectable, Logger } from '@nestjs/common';
import { env } from '../../config/env';
import { D, r2 } from '../../common/money';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ParametrosService } from '../../common/parametros/parametros.service';
import { DocumentoFel, FelProveedor } from './fel.proveedor';

/**
 * Orquesta la certificación FEL FUERA de la transacción de la venta:
 * la venta nunca se pierde si el certificador está caído. Queda en
 * PENDIENTE/ERROR y se reintenta (endpoint manual o job programado).
 */
@Injectable()
export class FelService {
  private readonly log = new Logger('FEL');

  constructor(
    private readonly prisma: PrismaService,
    private readonly proveedor: FelProveedor,
    private readonly parametros: ParametrosService,
  ) {}

  async certificarVenta(ventaId: number): Promise<void> {
    const v = await this.prisma.venta.findUniqueOrThrow({
      where: { id: ventaId },
      include: {
        cliente: true,
        sucursal: true,
        detalles: { include: { producto: { include: { presentacion: true } } } },
      },
    });
    if (v.tipo !== 'VENTA' || v.estado !== 'CONFIRMADA' || v.felEstado === 'CERTIFICADO') return;

    const iva = D(await this.parametros.numero('ventas.iva_porcentaje')).div(100);
    const doc: DocumentoFel = {
      tipo: 'FACT',
      referenciaInterna: `${v.sucursal.codigo}-${v.serie}-${v.numero}`,
      fechaEmision: v.fecha.toISOString(),
      establecimiento: v.sucursal.establecimientoFel ?? 1,
      receptor: {
        nit: v.cliente.nit ?? 'CF',
        nombre: v.cliente.razonSocial || [v.cliente.nombres, v.cliente.apellidos].filter(Boolean).join(' ') || 'CONSUMIDOR FINAL',
        correo: v.cliente.email,
      },
      items: v.detalles.map((d, i) => {
        const total = D(d.subtotal);
        const gravable = d.producto.exentoIva ? total : r2(total.div(iva.plus(1)));
        return {
          numeroLinea: i + 1,
          bienOServicio: d.producto.manejaInventario ? 'B' : 'S',
          cantidad: D(d.cantidad).toFixed(3),
          unidadMedida: d.producto.presentacion.abreviatura ?? 'UNI',
          descripcion: d.descripcion.slice(0, 500),
          precioUnitario: D(d.precioLista).toFixed(2),
          precio: r2(D(d.precioLista).times(D(d.cantidad))).toFixed(2),
          descuento: D(d.descuento).toFixed(2),
          total: total.toFixed(2),
          montoGravable: gravable.toFixed(2),
          montoIva: d.producto.exentoIva ? '0.00' : total.minus(gravable).toFixed(2),
        };
      }),
      totalIva: D(v.ivaIncluido).toFixed(2),
      granTotal: D(v.total).toFixed(2),
    };

    try {
      const r = await this.proveedor.certificar(doc);
      await this.prisma.venta.update({
        where: { id: v.id },
        data: r.ok
          ? { felEstado: 'CERTIFICADO', felUuid: r.uuid, felSerie: r.serie, felNumero: r.numero, felMensaje: r.mensaje }
          : { felEstado: 'ERROR', felMensaje: r.mensaje?.slice(0, 1000) },
      });
    } catch (e) {
      this.log.error(`FEL venta ${v.id} (${env.FEL_PROVEEDOR}): ${(e as Error).message}`);
      await this.prisma.venta.update({ where: { id: v.id }, data: { felEstado: 'ERROR', felMensaje: (e as Error).message.slice(0, 1000) } });
    }
  }

  async anularVenta(ventaId: number, motivo: string): Promise<void> {
    const v = await this.prisma.venta.findUniqueOrThrow({ where: { id: ventaId }, include: { cliente: true } });
    if (!v.felUuid || v.felEstado !== 'CERTIFICADO') return;
    try {
      const r = await this.proveedor.anular(v.felUuid, motivo, v.cliente.nit ?? 'CF', v.fecha.toISOString());
      if (r.ok) await this.prisma.venta.update({ where: { id: v.id }, data: { felEstado: 'ANULADO', felMensaje: r.mensaje } });
    } catch (e) {
      this.log.error(`Anulación FEL venta ${v.id}: ${(e as Error).message}`);
    }
  }

  /** Para job programado (cada 5 min) o botón "Reintentar FEL". */
  async reintentarPendientes(limite = 50): Promise<number> {
    const pendientes = await this.prisma.venta.findMany({
      where: { tipo: 'VENTA', estado: 'CONFIRMADA', felEstado: { in: ['PENDIENTE', 'ERROR'] } },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: limite,
    });
    for (const p of pendientes) await this.certificarVenta(p.id);
    return pendientes.length;
  }
}
