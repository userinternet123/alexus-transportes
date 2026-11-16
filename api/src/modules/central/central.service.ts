/**
 * AGENTE DE ALEXUS CENTRAL (dentro de cada instalación)
 * - Latido cada 6 h (y al arrancar): informa versión y plan; recibe anuncios,
 *   versión nueva y novedades de soporte. Lo recibido se guarda: sin internet
 *   el portal sigue mostrando lo último y la tienda opera con normalidad.
 * - Errores 500 del API y del portal: se acumulan y se envían agrupados.
 * - Soporte: crea y consulta tickets en nombre del usuario en sesión.
 * Solo conexiones salientes. Nunca se envían viajes, clientes ni tarifas.
 */
import { huellaEquipo } from '../licencia/equipo';
import { cerrarSobre, huellaDe } from './sobre';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { release, type } from 'node:os';
import { join } from 'node:path';
import { env } from '../../config/env';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LicenciaService } from '../licencia/licencia.service';

export interface EstadoCentral {
  anuncios: { id: number; tipo: string; titulo: string; texto: string; enlace: string | null; imagenUrl: string | null; ubicaciones: string[] }[];
  actualizacion: { version: string; notas: string; url: string; sha256: string; critica: boolean } | null;
  ticketsConRespuesta: number;
  recibido: string | null;
}
type ErrorPendiente = { origen: 'api' | 'web'; mensaje: string; stack?: string; ruta?: string; version: string; cantidad: number };

const VACIO: EstadoCentral = { anuncios: [], actualizacion: null, ticketsConRespuesta: 0, recibido: null };

function leerVersion(): string {
  if (env.APP_VERSION) return env.APP_VERSION;
  for (const ruta of [join(__dirname, '../../../package.json'), join(process.cwd(), 'package.json')]) {
    try { return JSON.parse(readFileSync(ruta, 'utf8')).version; } catch { /* siguiente */ }
  }
  return '0.0.0';
}

@Injectable()
export class CentralService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Central');
  readonly version = leerVersion();
  readonly habilitado = Boolean(env.CENTRAL_URL && env.CENTRAL_TOKEN);
  private errores = new Map<string, ErrorPendiente>();
  private metricas = new Map<number, { impresiones: number; clics: number }>();
  private temporizadores: NodeJS.Timeout[] = [];
  private cache: EstadoCentral | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly licencia: LicenciaService,
  ) {}

  onModuleInit() {
    if (!this.habilitado) { this.log.log('SPVI Central no configurado (CENTRAL_URL / CENTRAL_TOKEN): el agente está inactivo'); return; }
    this.temporizadores.push(setTimeout(() => this.latido(), 15_000)); // al arrancar
    this.temporizadores.push(setInterval(() => this.latido(), 6 * 3_600_000)); // cada 6 h
    this.temporizadores.push(setInterval(() => this.enviarPendientes(), 60_000)); // errores y métricas
  }

  onModuleDestroy() { this.temporizadores.forEach((t) => clearInterval(t)); }

  private async llamar<T>(metodo: 'GET' | 'POST', ruta: string, cuerpo?: unknown): Promise<T> {
    const r = await fetch(`${env.CENTRAL_URL!.replace(/\/+$/, '')}/api${ruta}`, {
      method: metodo,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${env.CENTRAL_TOKEN}` },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) throw new Error(`Central respondió ${r.status}`);
    return (await r.json()) as T;
  }

  /** Latido: estado de la tienda → anuncios, versión nueva y respuestas de soporte. */
  async latido(): Promise<void> {
    try {
      const plan = (await this.licencia.estado()).plan;
      const r = await this.llamar<Omit<EstadoCentral, 'recibido'> & { licencia?: string | null; llaveDatos?: { pem: string; huella: string } | null }>('POST', '/agente/latido', { version: this.version, plan, sistema: `${type()} ${release()}`, equipo: huellaEquipo() });
      await this.aplicarLicencia(r.licencia);
      try { await this.fijarLlaveDatos(r.llaveDatos); } catch (e) { this.log.warn(`Llave de datos no fijada: ${(e as Error).message}`); }
      const estado: EstadoCentral = { ...r, recibido: new Date().toISOString() };
      this.cache = estado;
      await this.prisma.parametroSistema.upsert({
        where: { clave: 'central.estado' },
        create: { clave: 'central.estado', valor: JSON.stringify(estado), tipo: 'json', modulo: 'Central', descripcion: 'Último latido con SPVI Central' },
        update: { valor: JSON.stringify(estado) },
      });
    } catch (e) {
      this.log.warn(`Sin conexión con SPVI Central (${(e as Error).message}). Se reintentará más tarde.`);
    }
  }

  /**
   * Llave pública de datos de Central: se FIJA la primera vez. Si después llega otra distinta, no se envía nada
   * (podría ser alguien haciéndose pasar por Central). Si ALEXUS la cambió a propósito, se borra el parámetro
   * central.llave_datos en este equipo para aceptar la nueva.
   */
  private async fijarLlaveDatos(llave?: { pem: string; huella: string } | null): Promise<string | null> {
    const guardada = await this.prisma.parametroSistema.findUnique({ where: { clave: 'central.llave_datos' } });
    const actual = guardada ? (JSON.parse(guardada.valor) as { pem: string; huella: string }) : null;
    if (!llave?.pem) return actual?.pem ?? null;
    let huella: string;
    try { huella = huellaDe(llave.pem); } catch { this.log.warn('SPVI Central envió una llave de datos inválida: no se envía información'); return null; }
    if (huella !== llave.huella) { this.log.warn('La huella de la llave de datos de SPVI Central no coincide: no se envía información'); return null; }
    if (!actual) {
      await this.prisma.parametroSistema.create({ data: { clave: 'central.llave_datos', valor: JSON.stringify({ pem: llave.pem, huella }), tipo: 'json', modulo: 'Central', descripcion: 'Llave pública fijada de SPVI Central para cifrar la información que se le envía' } });
      return llave.pem;
    }
    if (actual.huella !== huella) {
      this.log.error(`La llave de datos de SPVI Central CAMBIÓ (antes ${actual.huella}, ahora ${huella}). Por seguridad no se envía información.`);
      return null;
    }
    return actual.pem;
  }

  /**
   * Licencia enviada desde la consola de ALEXUS: se instala solo si cambió.
   * guardarLicencia verifica la firma con la llave pública: una licencia alterada se rechaza.
   */
  private async aplicarLicencia(token?: string | null) {
    if (!token) return;
    const actual = await this.prisma.parametroSistema.findUnique({ where: { clave: 'licencia.token' } });
    if (actual?.valor === token.trim()) return;
    try {
      const estado = await this.licencia.guardarLicencia(token);
      this.log.log(`Licencia actualizada desde SPVI Central: plan ${estado.plan}, módulos ${estado.modulos.join(', ')}`);
    } catch (e) {
      this.log.warn(`Licencia recibida de SPVI Central rechazada: ${(e as Error).message}`);
    }
  }

  /** Lo último recibido de Central (memoria o base de datos). */
  async estado(): Promise<EstadoCentral> {
    if (this.cache) return this.cache;
    const p = await this.prisma.parametroSistema.findUnique({ where: { clave: 'central.estado' } });
    try { this.cache = p ? (JSON.parse(p.valor) as EstadoCentral) : VACIO; } catch { this.cache = VACIO; }
    return this.cache;
  }

  /** Acumula un error (agrupado) para enviarlo en el próximo minuto. Nunca lanza excepción. */
  reportarError(e: { origen: 'api' | 'web'; mensaje: string; stack?: string; ruta?: string }): void {
    if (!this.habilitado) return;
    const clave = `${e.origen}|${e.mensaje.slice(0, 200)}|${e.ruta ?? ''}`;
    const previo = this.errores.get(clave);
    if (previo) { previo.cantidad++; return; }
    if (this.errores.size >= 100) return; // tope de memoria si no hay internet por mucho tiempo
    this.errores.set(clave, { ...e, mensaje: e.mensaje.slice(0, 1000), stack: e.stack?.slice(0, 8000), version: this.version, cantidad: 1 });
  }

  registrarMetrica(anuncioId: number, tipo: 'impresion' | 'clic'): void {
    if (!this.habilitado) return;
    const m = this.metricas.get(anuncioId) ?? { impresiones: 0, clics: 0 };
    if (tipo === 'impresion') m.impresiones++; else m.clics++;
    this.metricas.set(anuncioId, m);
  }

  private async enviarPendientes(): Promise<void> {
    if (this.errores.size) {
      const lote = [...this.errores.values()];
      try { await this.llamar('POST', '/agente/errores', { errores: lote }); this.errores.clear(); } catch { /* se reintenta */ }
    }
    if (this.metricas.size) {
      const lote = [...this.metricas.entries()].map(([anuncioId, m]) => ({ anuncioId, ...m }));
      try { await this.llamar('POST', '/agente/anuncios/metricas', { metricas: lote }); this.metricas.clear(); } catch { /* se reintenta */ }
    }
  }

  // ── Soporte (en nombre del usuario en sesión) ─────────────────────────────
  crearTicket(datos: { usuario: string; usuarioNombre: string; asunto: string; descripcion: string; captura?: string; contexto?: Record<string, unknown> }) {
    return this.llamar<{ data: { id: number }; message: string }>('POST', '/agente/tickets', {
      ...datos, contexto: { ...datos.contexto, version: this.version },
    });
  }

  tickets(usuario: string) {
    return this.llamar<{ data: unknown[] }>('GET', `/agente/tickets?usuario=${encodeURIComponent(usuario)}`);
  }

  responder(id: number, nombre: string, texto: string) {
    return this.llamar<{ message: string }>('POST', `/agente/tickets/${id}/mensajes`, { nombre, texto });
  }
}
