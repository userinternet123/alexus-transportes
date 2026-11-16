import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DocumentoFel, FelProveedor, ResultadoFel } from './fel.proveedor';

/** Adaptador de desarrollo/QA: simula certificación sin llamar a SAT. */
@Injectable()
export class FelMockProveedor extends FelProveedor {
  private readonly log = new Logger('FEL-MOCK');

  async certificar(doc: DocumentoFel): Promise<ResultadoFel> {
    this.log.log(`Certificando ${doc.tipo} ${doc.referenciaInterna} por Q${doc.granTotal}`);
    const uuid = randomUUID().toUpperCase();
    return { ok: true, uuid, serie: uuid.slice(0, 8), numero: String(parseInt(uuid.slice(9, 13), 16)), mensaje: 'Certificado (simulado)' };
  }

  async anular(uuid: string): Promise<ResultadoFel> {
    this.log.log(`Anulando ${uuid}`);
    return { ok: true, uuid, mensaje: 'Anulado (simulado)' };
  }
}
