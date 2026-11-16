/**
 * LICENCIAS FIRMADAS POR CENTRAL. La llave privada vive solo aquí (en la base de Central, que se respalda); la tienda
 * verifica con la pública que va en el instalador. Mismo formato que verifica la tienda:
 *   base64url(JSON) + "." + base64url(Ed25519 sobre ese texto)
 * Entrega por Central (la tienda la recibe en su latido) o por ARCHIVO (tienda sin internet: se dicta el código del equipo).
 */
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createPrivateKey, generateKeyPairSync, sign } from 'node:crypto';
import { z } from 'zod';
import { CODIGO_EQUIPO, Limites, MODULOS, PLANES_INICIO } from './licencias.catalogo';
import { PrismaService } from './prisma.service';

const limiteZ = z.number().int().min(1).max(100000).nullable();
export const emitirZ = z.object({
  clienteId: z.number().int().positive(),
  instalacionId: z.string().min(1).nullish(),
  plan: z.string().min(2).max(30),
  modulos: z.array(z.enum(Object.keys(MODULOS) as [string, ...string[]])).min(1, 'Elija al menos un módulo'),
  reportes: z.union([z.literal('*'), z.array(z.string().max(60)).max(500)]).default('*'),
  reportesConfigurables: z.boolean().default(true),
  limites: z.object({ sucursales: limiteZ, bodegas: limiteZ, cajas: limiteZ, usuarios: limiteZ }),
  vence: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha de vencimiento no válida'),
  diasGracia: z.number().int().min(0).max(60).default(7),
  entrega: z.enum(['CENTRAL', 'ARCHIVO']),
  equipo: z.string().trim().toUpperCase().regex(CODIGO_EQUIPO, 'Código de equipo no válido (ej. K7QM-2XPA-8RTN-4WZB)').nullish(),
  nota: z.string().trim().max(300).nullish(),
}).superRefine((d, c) => {
  if (d.entrega === 'CENTRAL' && !d.instalacionId) c.addIssue({ code: 'custom', path: ['instalacionId'], message: 'Para entregarla por Central elija la instalación' });
  if (d.entrega === 'ARCHIVO' && !d.equipo) c.addIssue({ code: 'custom', path: ['equipo'], message: 'Una licencia por archivo debe llevar el código del equipo (que la tienda le dicta)' });
});
export type EmitirDto = z.infer<typeof emitirZ>;

const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(new Date());

/** Firma igual que la tienda verifica (Ed25519 sobre el texto base64url). */
export function firmarLicencia(contenido: object, privadaPem: string): string {
  const datos = Buffer.from(JSON.stringify(contenido)).toString('base64url');
  return `${datos}.${sign(null, Buffer.from(datos), createPrivateKey(privadaPem)).toString('base64url')}`;
}

@Injectable()
export class LicenciasService {
  private readonly log = new Logger('Licencias');
  private llaveCache: { privada: string; publica: string } | null = null;
  constructor(private readonly prisma: PrismaService) {}

  async llave() {
    if (this.llaveCache) return this.llaveCache;
    let l = await this.prisma.llaveLicencias.findUnique({ where: { id: 1 } });
    if (!l) {
      const { publicKey, privateKey } = generateKeyPairSync('ed25519');
      l = await this.prisma.llaveLicencias.upsert({ where: { id: 1 }, update: {}, create: { id: 1, privada: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), publica: publicKey.export({ type: 'spki', format: 'pem' }).toString() } });
      this.log.log('Llave de licencias creada: copie la llave pública al instalador de SPVI (clave-publica.ts).');
    }
    this.llaveCache = { privada: l.privada, publica: l.publica };
    return this.llaveCache;
  }

  /** Los planes de inicio se crean solos la primera vez; luego son editables. */
  async planes() {
    if ((await this.prisma.planLicencia.count()) === 0) {
      await this.prisma.planLicencia.createMany({ data: PLANES_INICIO.map((p) => ({ clave: p.clave, nombre: p.nombre, modulos: p.modulos, reportesConfigurables: p.reportesConfigurables, limites: p.limites })), skipDuplicates: true });
    }
    return this.prisma.planLicencia.findMany({ orderBy: { id: 'asc' } });
  }

  async guardarPlan(d: { id?: number; clave: string; nombre: string; modulos: string[]; reportesConfigurables: boolean; limites: Limites; vigenciaDias: number; activo: boolean }) {
    const data = { clave: d.clave.toUpperCase(), nombre: d.nombre, modulos: d.modulos, reportesConfigurables: d.reportesConfigurables, limites: d.limites, vigenciaDias: d.vigenciaDias, activo: d.activo };
    return d.id ? this.prisma.planLicencia.update({ where: { id: d.id }, data }) : this.prisma.planLicencia.create({ data });
  }

  async emitir(d: EmitirDto, emitidaPor: string) {
    if (d.vence < hoy()) throw new BadRequestException('La licencia vencería en el pasado');
    const cliente = await this.prisma.cliente.findUnique({ where: { id: d.clienteId } });
    if (!cliente) throw new NotFoundException('Cliente no encontrado');
    const inst = d.instalacionId ? await this.prisma.instalacion.findUnique({ where: { id: d.instalacionId } }) : null;
    if (d.instalacionId && (!inst || inst.clienteId !== d.clienteId)) throw new BadRequestException('La instalación no es de ese cliente');
    // Por Central: si no se indicó, se ata al equipo que la instalación ya reportó
    const equipo = (d.equipo ?? inst?.equipo ?? null)?.trim().toUpperCase() || null; // siempre en mayúsculas: la tienda compara su código exacto
    const { privada } = await this.llave();
    const registro = await this.prisma.$transaction(async (tx) => {
      const fila = await tx.licenciaEmitida.create({ data: { clienteId: d.clienteId, instalacionId: d.instalacionId ?? null, plan: d.plan, contenido: {}, token: '', equipo, entrega: d.entrega, vence: new Date(`${d.vence}T00:00:00Z`), nota: d.nota ?? null, emitidaPor } });
      const contenido = {
        v: 2, id: `L-${String(fila.id).padStart(6, '0')}`, empresa: cliente.empresa, nit: cliente.nit, plan: d.plan, modulos: d.modulos, reportes: d.reportes, reportesConfigurables: d.reportesConfigurables,
        limites: d.limites, maxSucursales: d.limites.sucursales ?? 9999, maxUsuarios: d.limites.usuarios ?? 99999, // compatibles con tiendas de versión anterior
        emitida: hoy(), vence: d.vence, diasGracia: d.diasGracia, equipo, entrega: d.entrega,
      };
      const token = firmarLicencia(contenido, privada);
      // La nueva reemplaza a la vigente de esa instalación (o del mismo equipo)
      await tx.licenciaEmitida.updateMany({ where: { id: { not: fila.id }, estado: 'VIGENTE', OR: [...(d.instalacionId ? [{ instalacionId: d.instalacionId }] : []), ...(equipo ? [{ equipo }] : [])] }, data: { estado: 'REEMPLAZADA' } });
      if (d.entrega === 'CENTRAL' && d.instalacionId) await tx.instalacion.update({ where: { id: d.instalacionId }, data: { licencia: token, licenciaActualizada: new Date() } });
      return tx.licenciaEmitida.update({ where: { id: fila.id }, data: { contenido, token } });
    });
    return { id: registro.id, numero: (registro.contenido as { id: string }).id, token: registro.token, equipo, archivo: `${cliente.nit}-${(registro.contenido as { id: string }).id}.lic` };
  }

  /**
   * Revocar: se marca y, si la licencia llega por Central, se envía una licencia FIRMADA de revocación (nadie más puede
   * fingirla). Una tienda sin internet se entera al conectarse o al vencer su licencia (por eso las de archivo vencen antes).
   */
  async revocar(id: number, motivo: string, porQuien: string) {
    const l = await this.prisma.licenciaEmitida.findUnique({ where: { id } });
    if (!l) throw new NotFoundException('Licencia no encontrada');
    if (l.estado === 'REVOCADA') return { message: 'Ya estaba revocada' };
    const { privada } = await this.llave();
    const contenido = { ...(l.contenido as object), revocada: true, emitida: hoy() };
    await this.prisma.$transaction(async (tx) => {
      await tx.licenciaEmitida.update({ where: { id }, data: { estado: 'REVOCADA', nota: `${l.nota ? `${l.nota} · ` : ''}Revocada por ${porQuien}: ${motivo}` } });
      if (l.instalacionId) await tx.instalacion.update({ where: { id: l.instalacionId }, data: { licencia: firmarLicencia(contenido, privada), licenciaActualizada: new Date() } });
    });
    return { message: l.instalacionId ? 'Revocada: la tienda se bloqueará en su próximo contacto' : 'Revocada (licencia por archivo: la tienda se enterará al conectarse o al vencer)' };
  }

  async listar() {
    const [licencias, instalaciones] = await Promise.all([
      this.prisma.licenciaEmitida.findMany({ orderBy: { emitidaEn: 'desc' }, take: 300, include: { cliente: { select: { empresa: true, nit: true } }, instalacion: { select: { nombre: true } } } }),
      this.prisma.instalacion.findMany({ where: { activa: true }, orderBy: { nombre: 'asc' }, select: { id: true, nombre: true, clienteId: true, equipo: true, ultimoContacto: true, cliente: { select: { empresa: true, nit: true } } } }),
    ]);
    return {
      licencias: licencias.map((l) => ({ id: l.id, numero: (l.contenido as { id?: string }).id, cliente: l.cliente.empresa, nit: l.cliente.nit, instalacion: l.instalacion?.nombre ?? null, plan: l.plan, entrega: l.entrega, estado: l.estado, equipo: l.equipo, vence: l.vence.toISOString().slice(0, 10), emitidaEn: l.emitidaEn, emitidaPor: l.emitidaPor, nota: l.nota, contenido: l.contenido })),
      instalaciones,
    };
  }

  async archivo(id: number) {
    const l = await this.prisma.licenciaEmitida.findUnique({ where: { id }, include: { cliente: { select: { nit: true } } } });
    if (!l) throw new NotFoundException('Licencia no encontrada');
    return { nombre: `${l.cliente.nit}-${(l.contenido as { id?: string }).id ?? l.id}.lic`, token: l.token };
  }
}
