/**
 * API DEL PANEL DEL PROVEEDOR: clientes, instalaciones (tokens), soporte,
 * errores, anuncios y versiones. Solo personal autenticado del proveedor.
 */
import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, ParseIntPipe, Post, Put, Query, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Throttle } from '@nestjs/throttler';
import * as argon2 from 'argon2';
import type { Response } from 'express';
import { z } from 'zod';
import { Admin, AdminGuard, AdminReq, compararVersion, nuevoSecreto, sha256, validar } from './comun';
import { PrismaService } from './prisma.service';
import { env } from './env';

const fechaOpc = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional();
const anuncioSchema = z.object({
  tipo: z.enum(['aviso', 'publicidad']),
  titulo: z.string().trim().min(3).max(80),
  texto: z.string().trim().min(3).max(300),
  enlace: z.string().url().nullable().optional(),
  imagenUrl: z.string().url().nullable().optional(),
  ubicaciones: z.array(z.enum(['inicio', 'login'])).min(1),
  planes: z.array(z.string().max(30)).default([]),
  desde: fechaOpc,
  hasta: fechaOpc,
  activo: z.boolean().default(true),
});

@Controller('panel')
export class AccesoController {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(@Body() body: unknown) {
    const { email, password } = validar(z.object({ email: z.string().email(), password: z.string().min(1) }), body);
    const u = await this.prisma.adminUsuario.findUnique({ where: { email: email.toLowerCase() } });
    if (!u || !u.activo || !(await argon2.verify(u.passwordHash, password).catch(() => false))) throw new UnauthorizedException('Correo o contraseña incorrectos');
    return { token: await this.jwt.signAsync({ sub: u.id, nombre: u.nombre, email: u.email }, { expiresIn: '10h' }), nombre: u.nombre };
  }
}

@Controller('panel')
@UseGuards(AdminGuard)
export class PanelController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('resumen')
  async resumen() {
    const hace24 = new Date(Date.now() - 86_400_000);
    const [instalaciones, enLinea, ticketsAbiertos, errores24, versiones] = await Promise.all([
      this.prisma.instalacion.count({ where: { activa: true } }),
      this.prisma.instalacion.count({ where: { activa: true, ultimoContacto: { gte: hace24 } } }),
      this.prisma.ticket.count({ where: { estado: { not: 'RESUELTO' } } }),
      this.prisma.errorAgrupado.count({ where: { resuelto: false, ultimaVez: { gte: hace24 } } }),
      this.prisma.instalacion.groupBy({ by: ['version'], where: { activa: true }, _count: true }),
    ]);
    return { instalaciones, enLinea, ticketsAbiertos, errores24, urlPublica: env.URL_PUBLICA ?? null, versiones: versiones.map((v) => ({ version: v.version ?? 'sin datos', instalaciones: v._count })) };
  }

  // ── Clientes ────────────────────────────────────────────────────────────
  @Get('clientes')
  clientes() {
    return this.prisma.cliente.findMany({ orderBy: { empresa: 'asc' }, include: { _count: { select: { instalaciones: true } } } });
  }

  @Post('clientes')
  crearCliente(@Body() body: unknown) {
    const d = validar(z.object({
      empresa: z.string().trim().min(2).max(120), nit: z.string().trim().min(2).max(20), contacto: z.string().max(120).optional(),
      telefono: z.string().max(30).optional(), email: z.string().email().optional(), giro: z.string().max(60).optional(), notas: z.string().max(1000).optional(),
    }), body);
    return this.prisma.cliente.create({ data: { ...d, nit: d.nit.toUpperCase() } });
  }

  // ── Instalaciones (token por servidor) ───────────────────────────────────
  @Get('instalaciones')
  instalaciones() {
    return this.prisma.instalacion.findMany({
      orderBy: { ultimoContacto: { sort: 'desc', nulls: 'last' } },
      select: { id: true, nombre: true, activa: true, canal: true, version: true, plan: true, sistema: true, ultimoContacto: true, creadoEn: true, licencia: true, licenciaActualizada: true, cliente: { select: { empresa: true, nit: true } } },
    });
  }

  /** Crea la instalación y devuelve el token UNA sola vez (se pega en el .env de la tienda). */
  @Post('instalaciones')
  async crearInstalacion(@Body() body: unknown) {
    const d = validar(z.object({ clienteId: z.number().int(), nombre: z.string().trim().min(3).max(120), canal: z.enum(['estable', 'pruebas']).default('estable') }), body);
    const secreto = nuevoSecreto();
    const inst = await this.prisma.instalacion.create({ data: { clienteId: d.clienteId, nombre: d.nombre, canal: d.canal, tokenHash: sha256(secreto) } });
    return { id: inst.id, token: `${inst.id}.${secreto}`, aviso: 'Copie el token ahora: no se volverá a mostrar.' };
  }

  @Put('instalaciones/:id')
  async editarInstalacion(@Param('id') id: string, @Body() body: unknown) {
    const d = validar(z.object({ activa: z.boolean().optional(), canal: z.enum(['estable', 'pruebas']).optional(), nombre: z.string().min(3).max(120).optional() }), body);
    return this.prisma.instalacion.update({ where: { id }, data: d, select: { id: true, activa: true, canal: true, nombre: true } });
  }

  /**
   * Licencia de la instalación: se pega la licencia ya FIRMADA (npm run licencia:emitir en la PC de ALEXUS).
   * Central no firma ni verifica: la tienda comprueba la firma con su llave pública antes de instalarla.
   */
  @Put('instalaciones/:id/licencia')
  async asignarLicencia(@Param('id') id: string, @Body() body: unknown) {
    const { licencia } = validar(z.object({ licencia: z.string().trim().regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, 'No parece una licencia de SPVI (datos.firma)').max(8000).nullable() }), body);
    if (licencia) {
      try { JSON.parse(Buffer.from(licencia.split('.')[0], 'base64url').toString('utf8')); } catch { throw new BadRequestException('La licencia no se puede leer'); }
    }
    await this.prisma.instalacion.update({ where: { id }, data: { licencia, licenciaActualizada: new Date() } });
    return { ok: true, message: 'Licencia guardada: la tienda la instalará en su próximo contacto (máximo 6 horas, o al reiniciar SPVI)' };
  }

  /** Nuevo token (si se filtró o se reinstaló el servidor): el anterior deja de funcionar. */
  @Post('instalaciones/:id/token')
  async nuevoToken(@Param('id') id: string) {
    const secreto = nuevoSecreto();
    await this.prisma.instalacion.update({ where: { id }, data: { tokenHash: sha256(secreto) } });
    return { token: `${id}.${secreto}`, aviso: 'Copie el token ahora: no se volverá a mostrar.' };
  }

  // ── Soporte ─────────────────────────────────────────────────────────────
  @Get('tickets')
  tickets(@Query('estado') estado?: string) {
    return this.prisma.ticket.findMany({
      where: estado ? { estado } : { estado: { not: 'RESUELTO' } },
      orderBy: [{ prioridad: 'asc' }, { actualizadoEn: 'desc' }],
      select: { id: true, asunto: true, estado: true, prioridad: true, usuarioNombre: true, creadoEn: true, actualizadoEn: true, instalacion: { select: { nombre: true, version: true, cliente: { select: { empresa: true } } } }, _count: { select: { mensajes: true } } },
      take: 200,
    });
  }

  @Get('tickets/:id')
  async ticket(@Param('id', ParseIntPipe) id: number) {
    const t = await this.prisma.ticket.findUnique({
      where: { id },
      include: { mensajes: { orderBy: { id: 'asc' } }, instalacion: { select: { nombre: true, version: true, plan: true, cliente: { select: { empresa: true, telefono: true, email: true } } } } },
    });
    if (!t) throw new NotFoundException('Ticket no encontrado');
    const { captura, ...resto } = t;
    return { ...resto, tieneCaptura: Boolean(captura) };
  }

  @Get('tickets/:id/captura')
  async captura(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const t = await this.prisma.ticket.findUnique({ where: { id }, select: { captura: true } });
    if (!t?.captura) throw new NotFoundException('Sin captura');
    res.setHeader('Content-Type', 'image/jpeg');
    res.send(Buffer.from(t.captura));
  }

  @Post('tickets/:id/mensajes')
  async responder(@Admin() admin: AdminReq, @Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    const { texto, estado } = validar(z.object({ texto: z.string().trim().min(1).max(5000), estado: z.enum(['ABIERTO', 'EN_PROCESO', 'RESUELTO']).optional() }), body);
    await this.prisma.ticketMensaje.create({ data: { ticketId: id, autor: 'soporte', nombre: admin.nombre, texto } });
    await this.prisma.ticket.update({ where: { id }, data: { estado: estado ?? 'EN_PROCESO' } });
    return { ok: true };
  }

  @Put('tickets/:id')
  estadoTicket(@Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    const d = validar(z.object({ estado: z.enum(['ABIERTO', 'EN_PROCESO', 'RESUELTO']).optional(), prioridad: z.enum(['NORMAL', 'ALTA']).optional() }), body);
    return this.prisma.ticket.update({ where: { id }, data: d, select: { id: true, estado: true, prioridad: true } });
  }

  // ── Errores ─────────────────────────────────────────────────────────────
  @Get('errores')
  errores(@Query('resueltos') resueltos?: string) {
    return this.prisma.errorAgrupado.findMany({
      where: { resuelto: resueltos === 'true' },
      orderBy: { ultimaVez: 'desc' },
      take: 300,
      select: { id: true, origen: true, mensaje: true, stack: true, ruta: true, version: true, conteo: true, primeraVez: true, ultimaVez: true, resuelto: true, instalacion: { select: { nombre: true, cliente: { select: { empresa: true } } } } },
    });
  }

  @Put('errores/:id')
  resolverError(@Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    const { resuelto } = validar(z.object({ resuelto: z.boolean() }), body);
    return this.prisma.errorAgrupado.update({ where: { id }, data: { resuelto }, select: { id: true, resuelto: true } });
  }

  // ── Anuncios ────────────────────────────────────────────────────────────
  @Get('anuncios')
  async anuncios() {
    const lista = await this.prisma.anuncio.findMany({ orderBy: { creadoEn: 'desc' } });
    const totales = await this.prisma.anuncioMetrica.groupBy({ by: ['anuncioId'], _sum: { impresiones: true, clics: true } });
    const m = new Map(totales.map((t) => [t.anuncioId, t._sum]));
    return lista.map((a) => ({ ...a, impresiones: m.get(a.id)?.impresiones ?? 0, clics: m.get(a.id)?.clics ?? 0 }));
  }

  @Post('anuncios')
  crearAnuncio(@Body() body: unknown) {
    const d = validar(anuncioSchema, body);
    return this.prisma.anuncio.create({ data: { ...d, desde: d.desde ? new Date(d.desde) : undefined, hasta: d.hasta ? new Date(`${d.hasta}T23:59:59Z`) : null } });
  }

  @Put('anuncios/:id')
  editarAnuncio(@Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    const d = validar(anuncioSchema.partial(), body);
    return this.prisma.anuncio.update({
      where: { id },
      data: { ...d, desde: d.desde ? new Date(d.desde) : undefined, hasta: d.hasta === undefined ? undefined : d.hasta ? new Date(`${d.hasta}T23:59:59Z`) : null },
    });
  }

  @Delete('anuncios/:id')
  async borrarAnuncio(@Param('id', ParseIntPipe) id: number) {
    await this.prisma.anuncio.delete({ where: { id } });
    return { ok: true };
  }

  // ── Versiones ───────────────────────────────────────────────────────────
  @Get('versiones')
  async versiones() {
    const lista = await this.prisma.version.findMany();
    return lista.sort((a, b) => compararVersion(b.numero, a.numero));
  }

  @Post('versiones')
  publicar(@Body() body: unknown) {
    const d = validar(z.object({
      numero: z.string().regex(/^\d+\.\d+\.\d+$/), canal: z.enum(['estable', 'pruebas']), notas: z.string().trim().min(5).max(5000),
      url: z.string().url(), sha256: z.string().regex(/^[0-9a-fA-F]{64}$/, 'SHA-256 de 64 caracteres (archivo .sha256 del instalador)'), critica: z.boolean().default(false),
    }), body);
    return this.prisma.version.create({ data: { ...d, sha256: d.sha256.toLowerCase() } });
  }
}
