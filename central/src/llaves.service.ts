/** Llave de datos de Central (RSA-4096): se crea una sola vez y se guarda en la base (viaja con sus respaldos). */
import { Injectable, Logger } from '@nestjs/common';
import { generateKeyPairSync } from 'node:crypto';
import { PrismaService } from './prisma.service';
import { abrirSobre, huellaDe, Sobre } from './sobre';

@Injectable()
export class LlavesService {
  private readonly log = new Logger('LlaveDatos');
  private cache: { privada: string; publica: string; huella: string } | null = null;
  constructor(private readonly prisma: PrismaService) {}

  async llave() {
    if (this.cache) return this.cache;
    let l = await this.prisma.llaveDatos.findUnique({ where: { id: 1 } });
    if (!l) {
      const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 4096 });
      const publica = publicKey.export({ type: 'spki', format: 'pem' }).toString();
      const privada = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
      l = await this.prisma.llaveDatos.upsert({ where: { id: 1 }, create: { id: 1, privada, publica, huella: huellaDe(publica) }, update: {} });
      this.log.log(`Llave de datos creada (huella ${l.huella}). Las tiendas la fijarán en su próximo latido.`);
    }
    this.cache = { privada: l.privada, publica: l.publica, huella: l.huella };
    return this.cache;
  }

  async publica() { const l = await this.llave(); return { pem: l.publica, huella: l.huella }; }

  async abrir<T>(sobre: Sobre): Promise<T> {
    if (!sobre || typeof sobre !== 'object' || typeof sobre.huella !== 'string') throw new Error('Sobre inválido o ausente');
    const l = await this.llave();
    if (sobre.huella !== l.huella) throw new Error('El sobre se cerró con otra llave');
    return abrirSobre<T>(sobre, l.privada);
  }
}
