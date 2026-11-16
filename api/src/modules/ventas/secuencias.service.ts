import { Injectable } from '@nestjs/common';
import { reglaNegocio } from '../../common/errors';
import { Tx } from '../../common/prisma/prisma.service';

/**
 * Correlativos sin huecos ni duplicados bajo concurrencia: UPDATE ... RETURNING
 * es atómico y bloquea la fila hasta el commit de la venta.
 * (Corrige el bug de VentaDAL: al crear una venta con factura "NA" se
 *  sobrescribía el NumeroFactura de la venta ANTERIOR.)
 */
@Injectable()
export class SecuenciasService {
  async siguiente(tx: Tx, sucursalId: number, tipo: string): Promise<{ serie: string; numero: number }> {
    const filas = await tx.$queryRaw<{ serie: string; numero: number }[]>`
      UPDATE secuencias_documento
      SET siguiente = siguiente + 1
      WHERE id = (
        SELECT id FROM secuencias_documento
        WHERE sucursal_id = ${sucursalId} AND tipo = ${tipo}
        ORDER BY id LIMIT 1
      )
      RETURNING serie, siguiente - 1 AS numero`;
    if (!filas.length) {
      throw reglaNegocio('SIN_SECUENCIA', `No hay correlativo configurado para ${tipo} en esta sucursal`);
    }
    return { serie: filas[0].serie, numero: Number(filas[0].numero) };
  }
}
