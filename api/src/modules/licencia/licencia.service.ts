import { huellaEquipo } from './equipo';
import { Injectable, Logger } from '@nestjs/common';
import { createPublicKey, verify } from 'node:crypto';
import { reglaNegocio } from '../../common/errors';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CLAVE_PUBLICA_LICENCIAS } from './clave-publica';
import { MODULOS, moduloDe, PLANES } from './modulos';

export interface Licencia {
  v: 1 | 2;
  empresa: string;
  nit: string;
  plan: string;
  modulos: string[];
  /** '*' = todos los reportes de los módulos contratados; o la lista de claves contratadas */
  reportes: '*' | string[];
  /** La empresa puede ocultar/mostrar reportes contratados a sus usuarios */
  reportesConfigurables: boolean;
  maxSucursales: number;
  maxUsuarios: number;
  emitida: string; // YYYY-MM-DD
  vence: string; // YYYY-MM-DD
  // ── Versión 2 (emitidas por SPVI Central) ──
  id?: string; // número de la licencia en Central
  equipo?: string | null; // código del equipo al que está atada (null = cualquiera)
  limites?: Limites; // null en un límite = sin límite
  diasGracia?: number; // días que sigue funcionando después de vencer
  entrega?: 'CENTRAL' | 'ARCHIVO';
  revocada?: boolean; // ALEXUS la revocó: el sistema se bloquea
}

export interface Limites { sucursales: number | null; cabezales: number | null; pilotos: number | null; usuarios: number | null }
export type TipoLimite = keyof Limites;
const NOMBRE_LIMITE: Record<TipoLimite, [string, string]> = { sucursales: ['sede', 'sedes'], cabezales: ['cabezal', 'cabezales'], pilotos: ['piloto', 'pilotos'], usuarios: ['usuario activo', 'usuarios activos'] };
/** Límites de cualquier versión: la v1 solo traía sucursales y usuarios. */
export const limitesDe = (l: Licencia): Limites => l.limites ?? { sucursales: l.maxSucursales, cabezales: null, pilotos: null, usuarios: l.maxUsuarios };

/** Días que el sistema sigue funcionando (con aviso) después de que la licencia vence. */
export const DIAS_GRACIA = 7;

export interface EstadoLicencia extends Licencia {
  modo: 'abierto' | 'licenciado' | 'vencida' | 'sin-licencia' | 'invalida';
  diasRestantes: number | null;
  /** Sin licencia válida NO se puede trabajar (ni siquiera con el plan Básico): solo iniciar sesión y activar la licencia. */
  bloqueado: boolean;
  motivo: string | null;
  limites: Limites;
  /** Código de ESTE equipo (para pedir una licencia por archivo o una transferencia). */
  codigoEquipo: string;
}

const ABIERTA: Licencia = {
  v: 1, empresa: 'Desarrollo', nit: 'CF', plan: 'EMPRESARIAL', modulos: Object.keys(MODULOS), reportes: '*',
  reportesConfigurables: true, maxSucursales: 999, maxUsuarios: 9999, emitida: '2026-01-01', vence: '2999-12-31',
};
const SIN_LICENCIA: Licencia = { ...ABIERTA, empresa: 'Sin licencia', plan: 'BASICO', modulos: PLANES.BASICO.modulos, reportes: [], reportesConfigurables: false, maxSucursales: 1, maxUsuarios: 3, vence: '2999-12-31' };

/**
 * Licencia = base64url(JSON) + "." + base64url(firma Ed25519).
 * Solo el proveedor (dueño de la clave privada) puede emitirlas: el cliente
 * no puede editarla para habilitar módulos.
 */
export function decodificarLicencia(token: string, clavePublica = CLAVE_PUBLICA_LICENCIAS): Licencia {
  const [datos, firma] = token.trim().split('.');
  if (!datos || !firma) throw reglaNegocio('LICENCIA_INVALIDA', 'El texto de la licencia está incompleto');
  const ok = verify(null, Buffer.from(datos), createPublicKey(clavePublica), Buffer.from(firma, 'base64url'));
  if (!ok) throw reglaNegocio('LICENCIA_INVALIDA', 'La licencia no es auténtica o fue modificada');
  const lic = JSON.parse(Buffer.from(datos, 'base64url').toString('utf8')) as Licencia;
  if ((lic.v !== 1 && lic.v !== 2) || !Array.isArray(lic.modulos)) throw reglaNegocio('LICENCIA_INVALIDA', 'Formato de licencia no reconocido');
  return lic;
}

@Injectable()
export class LicenciaService {
  private readonly log = new Logger('Licencia');
  private cache: { estado: EstadoLicencia; expira: number } | null = null;

  constructor(private readonly prisma: PrismaService) {
    if (!CLAVE_PUBLICA_LICENCIAS) this.log.warn('Licencias en MODO ABIERTO (desarrollo): todos los módulos habilitados');
  }

  async estado(): Promise<EstadoLicencia> {
    if (this.cache && this.cache.expira > Date.now()) return this.cache.estado;
    const codigoEquipo = huellaEquipo();
    const con = (l: Licencia, extra: Omit<EstadoLicencia, keyof Licencia | 'limites' | 'codigoEquipo'>): EstadoLicencia => {
      const limites = limitesDe(l);
      return { ...l, ...extra, limites, codigoEquipo, maxSucursales: limites.sucursales ?? 9999, maxUsuarios: limites.usuarios ?? 99999 };
    };
    let estado: EstadoLicencia;
    if (!CLAVE_PUBLICA_LICENCIAS) {
      estado = con({ ...ABIERTA, limites: { sucursales: null, cabezales: null, pilotos: null, usuarios: null } }, { modo: 'abierto', diasRestantes: null, bloqueado: false, motivo: null });
    } else {
      const p = await this.prisma.parametroSistema.findUnique({ where: { clave: 'licencia.token' } });
      let lic: Licencia | null = null;
      let invalida = false;
      try { lic = p ? decodificarLicencia(p.valor) : null; } catch (e) { invalida = true; this.log.error(`Licencia guardada inválida: ${(e as Error).message}`); }
      if (!lic) {
        estado = invalida
          ? con(SIN_LICENCIA, { modo: 'invalida', diasRestantes: null, bloqueado: true, motivo: 'La licencia guardada no es válida (fue modificada o no corresponde a este sistema). Active una licencia nueva.' })
          : con(SIN_LICENCIA, { modo: 'sin-licencia', diasRestantes: null, bloqueado: true, motivo: 'Este equipo no tiene licencia de ALEXUS Transportes. Actívela para empezar a trabajar.' });
      } else if (lic.revocada) {
        estado = con({ ...SIN_LICENCIA, empresa: lic.empresa, id: lic.id }, { modo: 'invalida', diasRestantes: null, bloqueado: true, motivo: 'ALEXUS revocó esta licencia. Comuníquese con ALEXUS para regularizarla.' });
      } else if (lic.equipo && lic.equipo.trim().toUpperCase() !== codigoEquipo) {
        estado = con({ ...SIN_LICENCIA, empresa: lic.empresa, id: lic.id }, { modo: 'invalida', diasRestantes: null, bloqueado: true, motivo: `Esta licencia es de otro equipo (${lic.equipo}). El código de este equipo es ${codigoEquipo}: pida a ALEXUS que se la transfiera.` });
      } else {
        const gracia = lic.diasGracia ?? DIAS_GRACIA;
        const dias = Math.floor((new Date(`${lic.vence}T23:59:59Z`).getTime() - Date.now()) / 86_400_000);
        if (dias >= 0) estado = con(lic, { modo: 'licenciado', diasRestantes: dias, bloqueado: false, motivo: null });
        else if (-dias <= gracia) {
          // Vencida pero dentro de la gracia: sigue funcionando completa, con aviso (no se detiene una tienda de golpe)
          const quedan = gracia + dias;
          estado = con(lic, { modo: 'vencida', diasRestantes: dias, bloqueado: false, motivo: `La licencia venció el ${lic.vence}. Renuévela: ${quedan === 0 ? 'hoy es el último día' : `en ${quedan} ${quedan === 1 ? 'día' : 'días'}`} el sistema dejará de funcionar.` });
        } else {
          estado = con(lic, { modo: 'vencida', diasRestantes: dias, bloqueado: true, motivo: `La licencia venció el ${lic.vence}. Renuévela para seguir trabajando.` });
        }
      }
    }
    this.cache = { estado, expira: Date.now() + 60_000 };
    return estado;
  }

  invalidar(): void {
    this.cache = null;
  }

  /** ¿El permiso pertenece a un módulo contratado? (el núcleo siempre sí) */
  async permisoHabilitado(permiso: string): Promise<boolean> {
    const m = moduloDe(permiso);
    return m === null || (await this.estado()).modulos.includes(m);
  }

  /** Quita de una lista de permisos los que no están contratados. */
  async filtrarPermisos(permisos: string[]): Promise<string[]> {
    const { modulos } = await this.estado();
    return permisos.filter((p) => p === '*' || (moduloDe(p) ?? 'nucleo') === 'nucleo' || modulos.includes(moduloDe(p)!));
  }

  /** Reportes visibles: contratados por la licencia y no ocultos por la empresa. */
  async reporteHabilitado(clave: string, permisoReporte: string): Promise<boolean> {
    const est = await this.estado();
    if (!(await this.permisoHabilitado(permisoReporte))) return false;
    if (est.reportes !== '*' && !est.reportes.includes(clave)) return false;
    return !(await this.reportesOcultos()).includes(clave);
  }

  async reportesOcultos(): Promise<string[]> {
    const p = await this.prisma.parametroSistema.findUnique({ where: { clave: 'reportes.ocultos' } });
    try { return p ? (JSON.parse(p.valor) as string[]) : []; } catch { return []; }
  }

  async guardarLicencia(token: string): Promise<EstadoLicencia> {
    if (!CLAVE_PUBLICA_LICENCIAS) throw reglaNegocio('MODO_ABIERTO', 'Este servidor está en modo abierto (desarrollo): no requiere licencia');
    const lic = decodificarLicencia(token);
    // Una licencia de otro equipo no se instala (no se pierde la que ya funciona)
    if (lic.equipo && lic.equipo.trim().toUpperCase() !== huellaEquipo()) throw reglaNegocio('LICENCIA_OTRO_EQUIPO', `Esta licencia es para el equipo ${lic.equipo} y este equipo es ${huellaEquipo()}. Pida a ALEXUS una licencia para este equipo.`);
    await this.prisma.parametroSistema.upsert({
      where: { clave: 'licencia.token' },
      create: { clave: 'licencia.token', valor: token.trim(), tipo: 'string', modulo: 'Licencia', descripcion: `Licencia ${lic.plan} de ${lic.empresa}` },
      update: { valor: token.trim(), descripcion: `Licencia ${lic.plan} de ${lic.empresa}` },
    });
    this.invalidar();
    return this.estado();
  }

  async guardarReportesOcultos(claves: string[]): Promise<void> {
    if (!(await this.estado()).reportesConfigurables) {
      throw reglaNegocio('NO_CONFIGURABLE', 'Su plan no permite configurar los reportes. Disponible en el plan Profesional.');
    }
    await this.prisma.parametroSistema.upsert({
      where: { clave: 'reportes.ocultos' },
      create: { clave: 'reportes.ocultos', valor: JSON.stringify(claves), tipo: 'json', modulo: 'Licencia', descripcion: 'Reportes ocultos por la empresa' },
      update: { valor: JSON.stringify(claves) },
    });
  }

  /** Límites del plan al crear usuarios */
  async validarLimiteUsuarios(activos: number): Promise<void> {
    const { maxUsuarios, plan } = await this.estado();
    if (activos >= maxUsuarios) throw reglaNegocio('LIMITE_USUARIOS', `Su plan ${plan} permite hasta ${maxUsuarios} usuarios activos`);
  }

  /** ¿La licencia incluye este módulo? (p. ej. 'fel', 'ia') */
  async tieneModulo(modulo: string): Promise<boolean> {
    return (await this.estado()).modulos.includes(modulo);
  }

  /** Respeta un límite de la licencia (sedes, cabezales, pilotos o usuarios). Sin límite = no hace nada. */
  async validarLimite(tipo: TipoLimite, actuales: number): Promise<void> {
    const max = (await this.estado()).limites[tipo];
    if (max === null || max === undefined || actuales < max) return;
    const [uno, varios] = NOMBRE_LIMITE[tipo];
    throw reglaNegocio(`LIMITE_${tipo.toUpperCase()}`, `Su licencia permite ${max} ${max === 1 ? uno : varios} y ya tiene ${actuales}. Para agregar más, amplíe su licencia con ALEXUS.`);
  }
}
