/**
 * QUÉ COMPRAR Y PEDIDOS A PROVEEDORES. Sugiere qué pedir (sin existencia, bajo el mínimo o hasta una cantidad), a qué
 * proveedor (el elegido por el negocio o el de la última compra) y cuánto; el negocio decide con una lista de verificación.
 * Arma un pedido por proveedor y lo comparte en PDF (WhatsApp, correo) — también desde la app móvil.
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import { Ctx, tienePermiso } from '../../common/auth/tipos';
import { noEncontrado, reglaNegocio } from '../../common/errors';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ejecutarLectura } from '../agente/agente.contexto';
import { DocumentosService } from '../documentos/documentos.service';
import { consultaProveedores, consultaSugerido } from './pedidos.consultas';
import { agruparPorProveedor, aplicarRecepcion, cantidadPorCriterio, MEDIOS_ENVIO, NOMBRE_MEDIO, nombreTercero, numeroPedido, OpcionProveedor, pedidoZ, porConseguirZ, proveedorSugerido, rangoVentas, RECIBIBLE, recepcionZ, SIGUIENTE_ESTADO, sugeridoZ } from './pedidos.logica';
import { pdfConsolidado } from './pedidos.pdf';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { TemporadasService } from '../temporadas/temporadas.service';
import { hoyGuatemala } from '../agente/agente.contexto';
import { z } from 'zod';

const sucursal = (ctx: Ctx) => ctx.sucursalId ?? (() => { throw reglaNegocio('SUCURSAL_REQUERIDA', 'Elija la sucursal de trabajo'); })();
const datosProveedor = { id: true, nit: true, razonSocial: true, nombreComercial: true, nombres: true, apellidos: true, telefono: true, email: true, direccion: true } as const;

@Injectable()
export class PedidosService {
  constructor(
    private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly documentos: DocumentosService,
    private readonly notificaciones: NotificacionesService, private readonly temporadas: TemporadasService,
  ) {}

  async sugerido(ctx: Ctx, query: unknown) {
    const q = sugeridoZ.parse(query ?? {});
    const rango = rangoVentas(q, hoyGuatemala());
    type Fila = { id: number; sku: string; nombre: string; presentacion: string | null; minimo: number; existencia: number; vendido: number; cotizado: number; por_listas: number; por_conseguir: boolean; esperado?: number; sugeridoModelo?: number };
    let filas: Fila[];
    let temporada: { id: number; nombre: string } | null = null;
    if (q.criterio === 'temporada') {
      // Modo «por temporada»: lo que el motor analítico espera vender en la temporada (según temporadas anteriores)
      if (!q.temporadaId) throw reglaNegocio('TEMPORADA_REQUERIDA', 'Elija la temporada');
      const c = await this.temporadas.compras(ctx, q.temporadaId);
      temporada = { id: c.data.temporada.id, nombre: c.data.temporada.nombre };
      const faltan = c.data.productos.filter((p) => p.sugerido > 0);
      const extra = new Map((await this.prisma.producto.findMany({ where: { id: { in: faltan.map((p) => p.id) } }, select: { id: true, stockMinimo: true, presentacion: { select: { nombre: true } } } })).map((p) => [p.id, p]));
      filas = faltan.map((p) => ({ id: p.id, sku: p.sku, nombre: p.nombre, presentacion: extra.get(p.id)?.presentacion?.nombre ?? null, minimo: Number(extra.get(p.id)?.stockMinimo ?? 0), existencia: p.existencia, vendido: 0, cotizado: 0, por_listas: 0, por_conseguir: false, esperado: p.esperado ?? 0, sugeridoModelo: Math.ceil(p.sugerido) }));
    } else {
      filas = await ejecutarLectura(this.prisma, consultaSugerido(sucursal(ctx), q, rango)) as Fila[];
    }
    const ids = filas.map((f) => f.id);
    const [historial, asignados] = ids.length
      ? await Promise.all([
        ejecutarLectura(this.prisma, consultaProveedores(ids)) as Promise<{ producto_id: number; proveedor_id: number; ultima: string; ultimo_costo: number; compras: number }[]>,
        this.prisma.proveedorProducto.findMany({ where: { productoId: { in: ids } } }),
      ])
      : [[], []];
    const provIds = [...new Set([...historial.map((h) => h.proveedor_id), ...asignados.map((a) => a.proveedorId)])];
    const proveedores = provIds.length ? await this.prisma.tercero.findMany({ where: { id: { in: provIds } }, select: datosProveedor }) : [];
    const verCostos = tienePermiso(ctx.usuario, 'finanzas.costos'); // el último costo solo lo ve quien puede ver costos
    const productos = filas.map((f) => {
      const opciones = new Map<number, OpcionProveedor & { ultimoCosto?: number }>();
      for (const h of historial.filter((x) => x.producto_id === f.id)) opciones.set(h.proveedor_id, { proveedorId: h.proveedor_id, ultimaCompra: h.ultima, compras: h.compras, asignado: false, principal: false, ...(verCostos ? { ultimoCosto: h.ultimo_costo } : {}) });
      for (const a of asignados.filter((x) => x.productoId === f.id)) {
        const o = opciones.get(a.proveedorId) ?? { proveedorId: a.proveedorId, ultimaCompra: null, compras: 0, asignado: false, principal: false };
        opciones.set(a.proveedorId, { ...o, asignado: true, principal: a.principal });
      }
      const lista = [...opciones.values()];
      const { por_listas: porListas, por_conseguir: porConseguir, ...resto } = f;
      const sugerido = f.sugeridoModelo ?? cantidadPorCriterio({ ...f, porListas }, { ...q, diasVentas: rango.dias });
      return { ...resto, porListas, porConseguir, sugerido, proveedorId: proveedorSugerido(lista), opciones: lista };
    });
    return { data: { productos, proveedores: proveedores.map((p) => ({ id: p.id, nombre: nombreTercero(p), nit: p.nit, telefono: p.telefono, email: p.email })), parametros: { ...q, diasVentas: rango.dias, ventasDesde: rango.desde, ventasHasta: rango.hasta }, temporada, verCostos } };
  }

  /** Crea un pedido por proveedor. Si se pide, recuerda el proveedor elegido para cada producto (queda como principal). */
  async crear(ctx: Ctx, body: unknown) {
    const d = pedidoZ.parse(body);
    const sucursalId = sucursal(ctx);
    const grupos = agruparPorProveedor(d.lineas);
    const provIds = grupos.map((g) => g.proveedorId);
    const validos = await this.prisma.tercero.count({ where: { id: { in: provIds }, esProveedor: true, activo: true } });
    if (validos !== provIds.length) throw reglaNegocio('PROVEEDOR_INVALIDO', 'Alguno de los proveedores elegidos no existe o está inactivo');
    const creados = await this.prisma.$transaction(async (tx) => {
      const salida: { id: number; numero: string; proveedorId: number; lineas: number }[] = [];
      for (const g of grupos) {
        const p = await tx.pedidoCompra.create({ data: { sucursalId, proveedorId: g.proveedorId, usuarioId: ctx.usuario.sub, nota: d.nota || null,
          detalles: { create: g.lineas.map((l) => ({ productoId: l.productoId, cantidad: new Prisma.Decimal(l.cantidad), existencia: l.existencia === undefined ? null : new Prisma.Decimal(l.existencia) })) } } });
        salida.push({ id: p.id, numero: numeroPedido(p.id), proveedorId: g.proveedorId, lineas: g.lineas.length });
      }
      if (d.recordarProveedor) {
        for (const g of grupos) for (const l of g.lineas) {
          await tx.proveedorProducto.updateMany({ where: { productoId: l.productoId, NOT: { proveedorId: g.proveedorId } }, data: { principal: false } });
          await tx.proveedorProducto.upsert({ where: { productoId_proveedorId: { productoId: l.productoId, proveedorId: g.proveedorId } }, create: { productoId: l.productoId, proveedorId: g.proveedorId, principal: true }, update: { principal: true } });
        }
      }
      return salida;
    });
    await this.audit.registrar(ctx, { accion: 'CREAR', entidad: 'PedidoCompra', entidadId: creados.map((c) => c.id).join(','), despues: { pedidos: creados } as unknown as Prisma.InputJsonValue });
    return { data: creados, message: creados.length === 1 ? 'Pedido creado' : `${creados.length} pedidos creados (uno por proveedor)` };
  }

  /** Elegir el proveedor de un producto (queda como principal). */
  async elegirProveedor(ctx: Ctx, body: unknown) {
    const { productoId, proveedorId } = z.object({ productoId: z.number().int().positive(), proveedorId: z.number().int().positive() }).parse(body);
    await this.prisma.$transaction([
      this.prisma.proveedorProducto.updateMany({ where: { productoId, NOT: { proveedorId } }, data: { principal: false } }),
      this.prisma.proveedorProducto.upsert({ where: { productoId_proveedorId: { productoId, proveedorId } }, create: { productoId, proveedorId, principal: true }, update: { principal: true } }),
    ]);
    return { message: 'Proveedor guardado para este producto' };
  }

  async listar(ctx: Ctx, query: unknown) {
    const { estado } = z.object({ estado: z.enum(['BORRADOR', 'ENVIADO', 'RECIBIDO_PARCIAL', 'RECIBIDO', 'ANULADO']).optional() }).parse(query ?? {});
    const filas = await this.prisma.pedidoCompra.findMany({
      where: { sucursalId: sucursal(ctx), ...(estado ? { estado } : {}) }, orderBy: { creadoEn: 'desc' }, take: 500,
      include: { proveedor: { select: datosProveedor }, usuario: { select: { nombre: true } }, _count: { select: { detalles: true } } },
    });
    return { data: filas.map((p) => ({ id: p.id, numero: numeroPedido(p.id), estado: p.estado, creadoEn: p.creadoEn, enviadoEn: p.enviadoEn, medioEnvio: p.medioEnvio, recibidoEn: p.recibidoEn, nota: p.nota, lineas: p._count.detalles, solicita: p.usuario.nombre, proveedor: { id: p.proveedor.id, nombre: nombreTercero(p.proveedor), telefono: p.proveedor.telefono, email: p.proveedor.email } })) };
  }

  private async cargar(ctx: Ctx, id: number) {
    const p = await this.prisma.pedidoCompra.findFirst({
      where: { id, sucursalId: sucursal(ctx) },
      include: { proveedor: { select: datosProveedor }, usuario: { select: { nombre: true } }, detalles: { include: { producto: { select: { sku: true, nombre: true, presentacion: { select: { nombre: true } } } } }, orderBy: { id: 'asc' } } },
    });
    if (!p) throw noEncontrado('Pedido');
    return p;
  }

  async detalle(ctx: Ctx, id: number) {
    const p = await this.cargar(ctx, id);
    return { data: { id: p.id, numero: numeroPedido(p.id), estado: p.estado, creadoEn: p.creadoEn, nota: p.nota, solicita: p.usuario.nombre, proveedor: { id: p.proveedor.id, nombre: nombreTercero(p.proveedor), nit: p.proveedor.nit, telefono: p.proveedor.telefono, email: p.proveedor.email },
      medioEnvio: p.medioEnvio, enviadoEn: p.enviadoEn, recibidoEn: p.recibidoEn, notaRecepcion: p.notaRecepcion,
      lineas: p.detalles.map((d) => ({ productoId: d.productoId, sku: d.producto.sku, nombre: d.producto.nombre, presentacion: d.producto.presentacion?.nombre ?? null, cantidad: Number(d.cantidad), recibida: Number(d.cantidadRecibida) })) } };
  }

  async pdf(ctx: Ctx, id: number) {
    const p = await this.cargar(ctx, id);
    return this.documentos.pdfPedido({
      numero: numeroPedido(p.id), fecha: p.creadoEn, anulado: p.estado === 'ANULADO', solicita: p.usuario.nombre, nota: p.nota,
      proveedor: { nombre: nombreTercero(p.proveedor), nit: p.proveedor.nit ?? '', telefono: p.proveedor.telefono ?? '', correo: p.proveedor.email ?? '', direccion: p.proveedor.direccion ?? '' },
      lineas: p.detalles.map((d) => ({ descripcion: `${d.producto.nombre}${d.producto.presentacion?.nombre ? ` (${d.producto.presentacion.nombre})` : ''} · ${d.producto.sku}`, cantidad: Number(d.cantidad) })),
    });
  }

  async cambiarEstado(ctx: Ctx, id: number, body: unknown) {
    const { estado, medio } = z.object({ estado: z.enum(['ENVIADO', 'ANULADO']), medio: z.enum(MEDIOS_ENVIO).optional() }).parse(body);
    const p = await this.cargar(ctx, id);
    if (p.estado === estado) return { message: 'Sin cambios' };
    if (!SIGUIENTE_ESTADO[p.estado].includes(estado)) throw reglaNegocio('ESTADO_INVALIDO', `Un pedido ${p.estado.toLowerCase().replace('_', ' ')} no puede pasar a ${estado.toLowerCase()}`);
    await this.prisma.pedidoCompra.update({ where: { id }, data: { estado, ...(estado === 'ENVIADO' ? { enviadoEn: new Date(), medioEnvio: medio ?? 'OTRO' } : {}) } });
    await this.audit.registrar(ctx, { accion: `PEDIDO_${estado}`, entidad: 'PedidoCompra', entidadId: String(id), antes: { estado: p.estado }, despues: { estado, medio } });
    if (estado === 'ENVIADO') {
      await this.notificaciones.evento({ sucursalId: p.sucursalId, permiso: 'compras.ver', tipo: 'pedido', titulo: `Pedido ${numeroPedido(id)} enviado`,
        detalle: `A ${nombreTercero(p.proveedor)} por ${NOMBRE_MEDIO[medio ?? 'OTRO']} · ${p.detalles.length} ${p.detalles.length === 1 ? 'producto' : 'productos'} · ${ctx.usuario.nombre ?? p.usuario.nombre}`, ruta: '/home/que-comprar?pestana=pedidos' });
    }
    return { message: estado === 'ENVIADO' ? 'Pedido marcado como enviado' : 'Pedido anulado' };
  }

  /**
   * Registrar lo que llegó (lista de verificación): se suma a lo ya recibido. Completo → RECIBIDO; si falta algo →
   * RECIBIDO_PARCIAL (puede llegar el resto después). Avisa en la campana.
   */
  async recibir(ctx: Ctx, id: number, body: unknown) {
    const d = recepcionZ.parse(body);
    const p = await this.cargar(ctx, id);
    if (!RECIBIBLE.includes(p.estado)) throw reglaNegocio('ESTADO_INVALIDO', `Un pedido ${p.estado.toLowerCase().replace('_', ' ')} ya no admite recepciones`);
    const r = aplicarRecepcion(p.detalles.map((x) => ({ productoId: x.productoId, cantidad: Number(x.cantidad), cantidadRecibida: Number(x.cantidadRecibida) })), d.lineas);
    if ('error' in r) throw reglaNegocio('LINEA_AJENA', r.error!);
    const estado = r.completo ? 'RECIBIDO' : 'RECIBIDO_PARCIAL';
    await this.prisma.$transaction([
      ...r.nuevos!.map((n) => this.prisma.pedidoCompraDetalle.updateMany({ where: { pedidoId: id, productoId: n.productoId }, data: { cantidadRecibida: new Prisma.Decimal(n.cantidadRecibida) } })),
      this.prisma.pedidoCompra.update({ where: { id }, data: { estado, recibidoEn: new Date(), notaRecepcion: d.nota || p.notaRecepcion, ...(p.estado === 'BORRADOR' ? { enviadoEn: new Date(), medioEnvio: p.medioEnvio ?? 'OTRO' } : {}) } }),
    ]);
    await this.audit.registrar(ctx, { accion: `PEDIDO_${estado}`, entidad: 'PedidoCompra', entidadId: String(id), antes: { estado: p.estado }, despues: { estado, llegada: d.lineas, faltan: r.faltan } as unknown as Prisma.InputJsonValue });
    const nombre = new Map(p.detalles.map((x) => [x.productoId, x.producto.nombre]));
    await this.notificaciones.evento({ sucursalId: p.sucursalId, permiso: 'compras.ver', tipo: 'pedido', nivel: r.completo ? 'info' : 'aviso',
      titulo: r.completo ? `Pedido ${numeroPedido(id)} recibido completo` : `Pedido ${numeroPedido(id)} recibido en parte`,
      detalle: r.completo ? `De ${nombreTercero(p.proveedor)}: llegó todo` : `De ${nombreTercero(p.proveedor)}: faltan ${r.faltan!.length} de ${p.detalles.length} productos (${r.faltan!.slice(0, 3).map((f) => nombre.get(f.productoId)).join(', ')}${r.faltan!.length > 3 ? '…' : ''})`,
      ruta: '/home/que-comprar?pestana=pedidos' });
    return { data: { estado, faltan: r.faltan!.map((f) => ({ ...f, nombre: nombre.get(f.productoId) })) }, message: r.completo ? 'Pedido recibido completo' : `Recibido en parte: faltan ${r.faltan!.length} productos` };
  }

  /** Un solo PDF con varios pedidos (los elegidos o los de un periodo), agrupados por proveedor. */
  async pdfConsolidado(ctx: Ctx, query: unknown) {
    const f = z.object({ ids: z.string().regex(/^\d+(,\d+)*$/).optional(), desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), titulo: z.string().max(80).optional() }).parse(query ?? {});
    const ids = f.ids?.split(',').map(Number);
    const fin = f.hasta ? new Date(Date.parse(`${f.hasta}T00:00:00-06:00`) + 86_400_000) : undefined;
    const pedidos = await this.prisma.pedidoCompra.findMany({
      where: { sucursalId: sucursal(ctx), ...(ids ? { id: { in: ids } } : {}), ...(f.desde || fin ? { creadoEn: { ...(f.desde ? { gte: new Date(`${f.desde}T00:00:00-06:00`) } : {}), ...(fin ? { lt: fin } : {}) } } : {}) },
      orderBy: [{ creadoEn: 'asc' }], take: 300,
      include: { proveedor: { select: datosProveedor }, usuario: { select: { nombre: true } }, detalles: { include: { producto: { select: { sku: true, nombre: true, presentacion: { select: { nombre: true } } } } }, orderBy: { id: 'asc' } } },
    });
    const negocio = await this.documentos.negocio();
    const fecha = (x: Date) => new Intl.DateTimeFormat('es-GT', { timeZone: 'America/Guatemala', day: '2-digit', month: 'short', year: 'numeric' }).format(x);
    const periodo = f.titulo ?? (f.desde || f.hasta ? `${f.desde ?? '…'} a ${f.hasta ?? '…'}` : 'Pedidos elegidos');
    const datos = pedidos.map((p) => ({ numero: numeroPedido(p.id), proveedor: nombreTercero(p.proveedor), estado: p.estado, fecha: fecha(p.creadoEn), solicita: p.usuario.nombre, nota: p.nota,
      lineas: p.detalles.map((d) => ({ sku: d.producto.sku, nombre: d.producto.nombre, presentacion: d.producto.presentacion?.nombre ?? null, cantidad: Number(d.cantidad), recibida: Number(d.cantidadRecibida) })) }))
      .sort((a, b) => a.proveedor.localeCompare(b.proveedor) || a.numero.localeCompare(b.numero));
    return { buffer: await pdfConsolidado({ negocio: negocio.nombreComercial || negocio.razonSocial || 'SPVI', periodo, pedidos: datos }), nombre: `Pedidos-${(f.desde ?? 'consolidado').replace(/[^0-9-]/g, '')}.pdf` };
  }


  /**
   * Producto "por conseguir": lo pide un cliente en una cotización y el negocio no lo tiene. Se crea con nombre y precio
   * estimado en "Por clasificar"; se puede cotizar, aparece en "Qué comprar" y al llegar su compra se vuelve normal.
   */
  async crearPorConseguir(ctx: Ctx, body: unknown) {
    const d = porConseguirZ.parse(body);
    const producto = await this.prisma.$transaction(async (tx) => {
      const cat = (await tx.categoria.findFirst({ where: { nombre: 'Por clasificar' } })) ?? (await tx.categoria.create({ data: { nombre: 'Por clasificar' } }));
      const grupo = (await tx.grupo.findFirst({ where: { nombre: 'Por clasificar', categoriaId: cat.id } })) ?? (await tx.grupo.create({ data: { nombre: 'Por clasificar', categoriaId: cat.id } }));
      const sub = (await tx.subgrupo.findFirst({ where: { nombre: 'Por clasificar', grupoId: grupo.id } })) ?? (await tx.subgrupo.create({ data: { nombre: 'Por clasificar', grupoId: grupo.id } }));
      const pres = (await tx.presentacion.findFirst({ where: { nombre: { equals: 'Unidad', mode: 'insensitive' } } })) ?? (await tx.presentacion.create({ data: { nombre: 'Unidad' } }));
      const temporal = `PC-T${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1000)}`;
      const p = await tx.producto.create({ data: { sku: temporal, nombre: d.nombre, precioVenta: new Prisma.Decimal(d.precioVenta), subgrupoId: sub.id, presentacionId: pres.id, porConseguir: true } });
      return tx.producto.update({ where: { id: p.id }, data: { sku: `PC-${String(p.id).padStart(5, '0')}` } });
    });
    await this.audit.registrar(ctx, { accion: 'CREAR_POR_CONSEGUIR', entidad: 'Producto', entidadId: String(producto.id), despues: { nombre: producto.nombre, precioVenta: d.precioVenta } });
    return { data: { id: producto.id, sku: producto.sku, nombre: producto.nombre, precioVenta: Number(producto.precioVenta), porConseguir: true, manejaInventario: producto.manejaInventario, existencia: 0 }, message: `«${producto.nombre}» agregado como producto por conseguir` };
  }
}
