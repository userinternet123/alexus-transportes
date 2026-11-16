/**
 * EXPERIENCIA: cómo usan SPVI los negocios y qué opinan, para que ALEXUS mejore el producto.
 * - El USO (conteos de pantallas y funciones) solo se registra si el administrador lo aceptó.
 * - Las OPINIONES son voluntarias: el usuario decide enviarlas (y si incluye su nombre).
 * - Todo viaja cifrado a SPVI Central (ver central.service): ni montos, ni nombres de clientes, ni productos.
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import { Ctx, tienePermiso } from '../../common/auth/tipos';
import { PrismaService } from '../../common/prisma/prisma.service';
import { hoyGuatemala } from '../agente/agente.contexto';
import { DIAS_ENTRE_NPS, normalizarEvento, opinionZ, perfilZ, usoZ } from './experiencia.logica';
import { z } from 'zod';

const P = { consentimiento: 'privacidad.uso', fecha: 'privacidad.uso.fecha', perfil: 'negocio.perfil' } as const;

@Injectable()
export class ExperienciaService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private async param(clave: string) { return (await this.prisma.parametroSistema.findUnique({ where: { clave } }))?.valor ?? null; }
  private guardarParam(clave: string, valor: string, descripcion: string) {
    return this.prisma.parametroSistema.upsert({ where: { clave }, create: { clave, valor, tipo: 'texto', modulo: 'Privacidad', descripcion }, update: { valor } });
  }

  async estado(ctx: Ctx) {
    const [consentimiento, perfil, ultimoNps] = await Promise.all([
      this.param(P.consentimiento), this.param(P.perfil),
      this.prisma.opinion.findFirst({ where: { tipo: 'NPS' }, orderBy: { creadoEn: 'desc' }, select: { creadoEn: true } }),
    ]);
    const administra = tienePermiso(ctx.usuario, 'config.parametros');
    const nps = !ultimoNps || Date.now() - ultimoNps.creadoEn.getTime() > DIAS_ENTRE_NPS * 86_400_000;
    return { data: {
      consentimiento: consentimiento === 'si' ? 'si' : consentimiento === 'no' ? 'no' : null,
      perfil: perfil ? JSON.parse(perfil) : null,
      administra,
      // La encuesta de recomendación se le pide a quien administra, cuando ya respondió lo inicial y cada 90 días
      npsPendiente: administra && consentimiento !== null && nps,
    } };
  }

  async consentimiento(ctx: Ctx, acepta: boolean) {
    await this.guardarParam(P.consentimiento, acepta ? 'si' : 'no', 'Compartir el uso del sistema con ALEXUS para mejorarlo (sin montos, nombres ni datos de clientes)');
    await this.guardarParam(P.fecha, new Date().toISOString(), 'Cuándo se decidió compartir o no el uso');
    // Si deja de compartir, lo pendiente se borra aquí y Central borra lo recibido de este equipo
    if (!acepta) await this.prisma.usoDiario.deleteMany({ where: { enviado: false } });
    await this.audit.registrar(ctx, { accion: 'PRIVACIDAD_USO', entidad: 'ParametroSistema', entidadId: P.consentimiento, despues: { acepta } });
    return { message: acepta ? 'Gracias: el uso del sistema se compartirá con ALEXUS, sin datos de su negocio' : 'Listo: no se compartirá el uso del sistema' };
  }

  /** Suma los eventos del día (solo con consentimiento). Por rol y tipo de dispositivo; nunca por persona. */
  async registrarUso(ctx: Ctx, body: unknown) {
    if ((await this.param(P.consentimiento)) !== 'si') return { data: { registrados: 0 } };
    const { eventos } = usoZ.parse(body);
    const fecha = new Date(`${hoyGuatemala()}T00:00:00Z`);
    const rol = (ctx.usuario.roles[0] ?? 'SIN_ROL').slice(0, 40);
    const conteo = new Map<string, { evento: string; dispositivo: string; veces: number }>();
    for (const e of eventos) {
      const evento = normalizarEvento(e.evento);
      if (!evento) continue;
      const k = `${evento}|${e.dispositivo}`;
      conteo.set(k, { evento, dispositivo: e.dispositivo, veces: (conteo.get(k)?.veces ?? 0) + 1 });
    }
    for (const c of conteo.values()) {
      await this.prisma.$executeRaw`
        INSERT INTO uso_diario (fecha, evento, rol, dispositivo, veces, enviado) VALUES (${fecha}::date, ${c.evento}, ${rol}, ${c.dispositivo}, ${c.veces}, false)
        ON CONFLICT (fecha, evento, rol, dispositivo) DO UPDATE SET veces = uso_diario.veces + EXCLUDED.veces, enviado = false`;
    }
    return { data: { registrados: conteo.size } };
  }

  async opinar(ctx: Ctx, body: unknown) {
    const o = opinionZ.parse(body);
    const u = o.incluirNombre ? await this.prisma.usuario.findUnique({ where: { id: ctx.usuario.sub }, select: { nombre: true } }) : null;
    await this.prisma.opinion.create({ data: { tipo: o.tipo, puntaje: o.puntaje ?? null, texto: o.texto || null, pantalla: o.pantalla ?? null, contacto: u?.nombre ?? null, rol: ctx.usuario.roles[0] ?? null } });
    return { message: o.tipo === 'SUGERENCIA' ? '¡Gracias! Su sugerencia llegará al equipo de ALEXUS' : '¡Gracias por su opinión!' };
  }

  async perfil(ctx: Ctx, body: unknown) {
    const p = perfilZ.parse(body) as z.infer<typeof perfilZ>;
    await this.guardarParam(P.perfil, JSON.stringify(p), 'Perfil del negocio (para que ALEXUS conozca a sus clientes)');
    await this.audit.registrar(ctx, { accion: 'PERFIL_NEGOCIO', entidad: 'ParametroSistema', entidadId: P.perfil, despues: p as unknown as Prisma.InputJsonValue });
    return { message: '¡Gracias por contarnos de su negocio!' };
  }
}
