import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { EstadoVenta, MedioPago, TipoVenta } from '@prisma/client';
import { z } from 'zod';
import { Contexto, Permisos, RequiereSucursal } from '../../common/auth/decoradores';
import { Ctx, tienePermiso } from '../../common/auth/tipos';
import { prohibido } from '../../common/errors';
import { fechaContable, parseFecha } from '../../common/fecha';
import { validar, zCantidad, zFecha, zId, zPaginacion } from '../../common/pipes/zod';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LicenciaService } from '../licencia/licencia.service';
import { AuthService } from '../auth/auth.service';
import { VentasService } from './ventas.service';

const pagoSchema = z.object({
  medioPago: z.nativeEnum(MedioPago),
  monto: z.coerce.number().positive().multipleOf(0.01),
  referencia: z.string().trim().max(100).optional(),
});

const ventaSchema = z.object({
  tipo: z.nativeEnum(TipoVenta).default('VENTA'),
  clienteId: zId.optional(),
  bodegaId: zId.optional(),
  lineas: z
    .array(z.object({ productoId: zId, cantidad: zCantidad, porcentajeDescuento: z.coerce.number().min(0).max(100).default(0) }))
    .min(1, 'Agregue al menos un producto')
    .max(500),
  pagos: z.array(pagoSchema).max(10).default([]),
  observaciones: z.string().max(500).optional(),
  emitirFel: z.boolean().optional(),
  vendedorCodigo: z.string().trim().min(1).max(40).optional(),
  cotizacionId: zId.optional(), // venta que viene de una cotización (POS)
  // Solo cotizaciones: lista reutilizable
  reutilizable: z.boolean().optional(),
  nombreLista: z.string().trim().max(120).optional(),
  compradoresEsperados: z.coerce.number().int().min(1).max(100000).optional(),
});

const listaSchema = zPaginacion.extend({
  tipo: z.nativeEnum(TipoVenta).optional(),
  estado: z.nativeEnum(EstadoVenta).optional(),
  desde: zFecha.optional(),
  hasta: zFecha.optional(),
  vendedorId: zId.optional(),
});

@ApiTags('ventas')
@ApiBearerAuth()
@RequiereSucursal()
@Controller('ventas')
export class VentasController {
  constructor(
    private readonly ventas: VentasService,
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
    private readonly licencia: LicenciaService,
  ) {}

  @Get()
  @Permisos('ventas.ver')
  listar(@Contexto() ctx: Ctx, @Query() query: Record<string, string>) {
    const f = validar(listaSchema, query);
    const hoy = fechaContable();
    return this.ventas.listar(ctx, {
      ...f,
      desde: f.desde ? parseFecha(f.desde) : hoy,
      hasta: f.hasta ? parseFecha(f.hasta) : hoy,
    });
  }

  /** Datos del ticket térmico: venta + empresa + sucursal + textos configurables. */
  @Get(':id/ticket')
  @Permisos('ventas.ver')
  async ticket(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number) {
    const { data: venta } = await this.ventas.obtener(ctx, id);
    const [empresa, sucursal, parametros] = await Promise.all([
      this.prisma.empresa.findFirst({ select: { nombre: true, nombreComercial: true, nit: true, direccion: true, telefono: true } }),
      this.prisma.sucursal.findUnique({ where: { id: ctx.sucursalId! }, select: { nombre: true, direccion: true, telefono: true } }),
      this.prisma.parametroSistema.findMany({ where: { clave: { in: ['ticket.frases', 'ticket.pie', 'ticket.ancho_mm', 'negocio.nombre'] } } }),
    ]);
    const p = Object.fromEntries(parametros.map((x) => [x.clave, x.valor]));
    return {
      data: {
        venta, empresa, sucursal,
        frases: p['ticket.frases'] ?? 'Sujeto a pagos trimestrales ISR',
        pie: p['ticket.pie'] ?? 'Gracias por su compra',
        anchoMm: Number(p['ticket.ancho_mm'] ?? 80),
        // "SPVI by ALEXUS" en el ticket, salvo que el negocio tenga la licencia para quitarla
        conMarca: !(await this.licencia.estado()).modulos.includes('sinmarca'),
        nombreComercial: p['negocio.nombre'] ?? empresa?.nombreComercial ?? empresa?.nombre,
      },
    };
  }

  /** Valida el código de un vendedor antes de iniciar su venta en el POS. */
  @Get('vendedores/:codigo')
  @Permisos('ventas.ver')
  async vendedor(@Contexto() ctx: Ctx, @Param('codigo') codigo: string) {
    return { data: await this.ventas.resolverVendedor(this.prisma, ctx, codigo) };
  }

  /** Listas reutilizables abiertas (p. ej. listas de útiles) con cuántas veces se han vendido. */
  @Get('listas/reutilizables')
  @Permisos('ventas.ver')
  listasReutilizables(@Contexto() ctx: Ctx) { return this.ventas.listasReutilizables(ctx); }

  /** Marcar una cotización como lista reutilizable (se vende varias veces sin cerrarse). */
  @Put(':id/lista')
  @Permisos('ventas.cotizar')
  marcarLista(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    return this.ventas.marcarLista(ctx, id, validar(z.object({ reutilizable: z.boolean(), nombreLista: z.string().trim().max(120).nullish(), compradoresEsperados: z.coerce.number().int().min(1).max(100000).nullish() }), body));
  }

  @Get(':id')
  @Permisos('ventas.ver')
  obtener(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number) {
    return this.ventas.obtener(ctx, id);
  }

  /** POST /ventas  { tipo: 'VENTA'|'COTIZACION', lineas, pagos, clienteId? } */
  @Post()
  @Permisos('ventas.ver')
  crear(@Contexto() ctx: Ctx, @Body() body: unknown) {
    const dto = validar(ventaSchema, body);
    const requerido = dto.tipo === 'VENTA' ? 'ventas.crear' : 'ventas.cotizar';
    if (!tienePermiso(ctx.usuario, requerido)) throw prohibido(`Permiso requerido: ${requerido}`);
    return this.ventas.crear(ctx, dto);
  }

  @Post(':id/convertir')
  @Permisos('ventas.crear')
  convertir(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    const { pagos, emitirFel, lineas } = validar(z.object({ pagos: z.array(pagoSchema).min(1), emitirFel: z.boolean().optional(), lineas: z.array(z.object({ productoId: zId, cantidad: zCantidad })).min(1).optional() }), body);
    return this.ventas.convertirCotizacion(ctx, id, pagos, emitirFel, lineas);
  }

  /** Sin permiso propio => requiere `autorizacion` de un encargado (POST /auth/autorizar). */
  @Post(':id/anular')
  @Permisos('ventas.ver')
  async anular(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    const { motivo, autorizacion } = validar(
      z.object({ motivo: z.string().trim().min(10, 'Indique el motivo (mín. 10 caracteres)').max(300), autorizacion: z.string().optional() }),
      body,
    );
    const autorizadoPor = await this.auth.validarAutorizacion(ctx, 'ventas.anular', autorizacion);
    return this.ventas.anular(ctx, id, motivo, autorizadoPor);
  }

  @Post(':id/devoluciones')
  @Permisos('ventas.ver')
  async devolver(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    const { autorizacion, ...dto } = validar(
      z.object({
        motivo: z.string().trim().min(5).max(300),
        reingresaInventario: z.boolean().default(true),
        lineas: z.array(z.object({ productoId: zId, cantidad: zCantidad })).min(1),
        autorizacion: z.string().optional(),
      }),
      body,
    );
    const autorizadoPor = await this.auth.validarAutorizacion(ctx, 'ventas.devolver', autorizacion);
    return this.ventas.devolver(ctx, id, dto, autorizadoPor);
  }

  @Post(':id/fel/emitir')
  @Permisos('ventas.crear')
  emitirFel(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number) {
    return this.ventas.emitirFel(ctx, id);
  }

  @Post(':id/fel/reintentar')
  @Permisos('ventas.crear')
  reintentarFel(@Contexto() ctx: Ctx, @Param('id', ParseIntPipe) id: number) {
    return this.ventas.reintentarFel(ctx, id);
  }
}
