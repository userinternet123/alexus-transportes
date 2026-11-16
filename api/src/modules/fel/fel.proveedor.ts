/**
 * PUERTO FEL (arquitectura hexagonal). El dominio de ventas depende de esta
 * interfaz, no de un certificador concreto. Cada certificador autorizado por
 * SAT (Infile, Digifact, etc.) es un ADAPTADOR intercambiable por configuración.
 *
 * Reemplaza el intento actual de automatizar el portal de SAT con Selenium
 * (EnvioDocSat/portat.ipynb), que es frágil y no es un canal soportado.
 */
export interface ItemFel {
  numeroLinea: number;
  bienOServicio: 'B' | 'S';
  cantidad: string;
  unidadMedida: string;
  descripcion: string;
  precioUnitario: string;
  precio: string;
  descuento: string;
  total: string;
  montoGravable: string;
  montoIva: string;
}

export interface DocumentoFel {
  tipo: 'FACT' | 'NCRE'; // factura | nota de crédito
  referenciaInterna: string; // idempotencia ante el certificador: <sucursal>-<serie>-<numero>
  fechaEmision: string; // ISO
  establecimiento: number;
  receptor: { nit: string; nombre: string; correo?: string | null };
  items: ItemFel[];
  totalIva: string;
  granTotal: string;
  documentoOrigenUuid?: string; // para NCRE
}

export interface ResultadoFel {
  ok: boolean;
  uuid?: string;
  serie?: string;
  numero?: string;
  mensaje?: string;
  xml?: string;
}

export abstract class FelProveedor {
  abstract certificar(doc: DocumentoFel): Promise<ResultadoFel>;
  abstract anular(uuid: string, motivo: string, nitReceptor: string, fechaEmision: string): Promise<ResultadoFel>;
}
