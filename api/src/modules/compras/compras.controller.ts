import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Contexto, Permisos, RequiereSucursal } from '../../common/auth/decoradores';
import type { Ctx } from '../../common/auth/tipos';
import { fechaContable, parseFecha, sumarDias } from '../../common/fecha';
import { validar, zCantidad, zFecha, zId } from '../../common/pipes/zod';
import { ComprasService } from './compras.service';

const compraSchema = z.object({
  proveedorId: zId,
  bodegaId: zId.optional(),
  serieFactura: z.string().trim().toUpperCase().min(1).max(30),
  numeroFactura: z.string().trim().min(1).max(30),
  fechaFactura: zFecha.transform(parseFecha),
  observacion: z.string().max(500).optional(),
  lineas: z
    .array(z.object({
      productoId: zId,
      cantidad: zCantidad,
      costoUnitario: z.coerce.number().nonnegative(),
      descuento: z.coerce.number().nonnegative().default(0),
    }))
    .min(1)
    .max(1000)
    .refine((ls) => new Set(ls.map((l) => l.productoId)).size === ls.length, 'Producto repetido en la factura'),
  nuevosPrecios: z.array(z.object({ productoId: zId, precioVenta: z.coerce.number().positive() })).optional(),
  uuidFel: z.string().trim().toUpperCase().regex(/^[0-9A-F-]{36}$/, 'UUID de SAT inválido').optional(),
  aprendizaje: z.array(z.object({ descripcion: z.string().max(500), productoId: zId, factor: z.coerce.number().positive().max(100000).default(1) })).max(1000).optional(),
});

@ApiTags('compras')
@ApiBearerAuth()
@RequiereSucursal()
@Controller('compras')
export class ComprasController {
  constructor(private readonly compras: ComprasService) {}

  @Get()
  @Permisos('compras.ver')
  listar(@Contexto() ctx: Ctx, @Query() q: Record<string, string>) {
    const hasta = q.hasta ? parseFecha(validar(zFecha, q.hasta)) : fechaContable();
    const desde = q.desde ? parseFecha(validar(zFecha, q.desde)) : sumarDias(hasta, -30);
    return this.compras.listar(ctx, { desde, hasta, proveedorId: q.proveedorId ? Number(q.proveedorId) : undefined, q: q.q });
  }

  @Get(':id')
  @Permisos('compras.ver')
  obtener(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number) {
    return this.compras.obtener(ctx, id);
  }

  @Post()
  @Permisos('compras.crear')
  registrar(@Contexto() ctx: Ctx, @Body() body: unknown) {
    return this.compras.registrar(ctx, validar(compraSchema, body));
  }

  /** Lee el XML de una factura FEL del proveedor y sugiere los productos. No registra nada. */
  @Post('importar-dte')
  @Permisos('compras.crear')
  importar(@Contexto() ctx: Ctx, @Body() body: unknown) {
    const { xml } = validar(z.object({ xml: z.string().min(100).max(3_000_000) }), body);
    return this.compras.importarDte(ctx, xml);
  }

  @Get('importar/capacidades')
  @Permisos('compras.crear')
  capacidades() {
    return this.compras.capacidadesImportacion();
  }

  /** Foto (JPG, PNG, WEBP) o PDF de la factura: la lee la IA y devuelve la misma revisión que el XML. */
  @Post('importar-documento')
  @Permisos('compras.crear')
  importarDocumento(@Contexto() ctx: Ctx, @Body() body: unknown) {
    const { base64, mime } = validar(
      z.object({ base64: z.string().min(100).max(6_000_000), mime: z.enum(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']) }),
      body,
    );
    return this.compras.importarDocumento(ctx, base64, mime);
  }

  @Post(':id/anular')
  @Permisos('compras.anular')
  anular(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    const { motivo } = validar(z.object({ motivo: z.string().trim().min(10).max(300) }), body);
    return this.compras.anular(ctx, id, motivo);
  }
}
