/**
 * Lector de facturas electrónicas FEL de SAT Guatemala (XML del DTE certificado).
 * No depende del certificador: el formato del DTE es el mismo para todos.
 * Los montos del DTE incluyen IVA (igual que los precios y costos de SPVI).
 */
import { XMLParser } from 'fast-xml-parser';

export interface LineaDte {
  linea: number;
  tipo: 'BIEN' | 'SERVICIO';
  descripcion: string;
  descripcionNormalizada: string;
  cantidad: number;
  unidad: string;
  precioUnitario: number;
  descuento: number;
  total: number;
  codigoBarra: string | null; // si la descripción trae un código de 8 a 14 dígitos
}

export interface FacturaDte {
  tipoDocumento: string;
  uuid: string;
  serie: string;
  numero: string;
  fecha: string; // YYYY-MM-DD
  moneda: string;
  emisor: { nit: string; nombre: string; nombreComercial: string };
  receptorNit: string;
  lineas: LineaDte[];
  total: number;
}

/** Documentos que representan una compra (no notas de crédito/débito ni recibos). */
const TIPOS_COMPRA = ['FACT', 'FCAM', 'FPEQ', 'FCAP', 'FESP'];

export const normalizar = (t: string) =>
  t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
export const normalizarNit = (t: string) => t.toUpperCase().replace(/[^0-9K]/g, '');

const num = (v: unknown) => {
  const n = Number(String(v ?? '0').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const texto = (v: unknown) => (v == null ? '' : typeof v === 'object' ? String((v as Record<string, unknown>)['#text'] ?? '') : String(v)).trim();

export class ErrorDte extends Error {}

export function leerFacturaDte(xml: string): FacturaDte {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true, // dte:, cfc:, etc.
    parseTagValue: false, // conserva ceros a la izquierda en NIT, series y códigos
    parseAttributeValue: false,
    isArray: (nombre) => ['Item', 'Impuesto', 'Frase', 'Complemento'].includes(nombre),
  });
  let doc: Record<string, any>;
  try {
    doc = parser.parse(xml);
  } catch {
    throw new ErrorDte('El archivo no es un XML válido');
  }
  const sat = doc?.GTDocumento?.SAT;
  const de = sat?.DTE?.DatosEmision;
  if (!de?.DatosGenerales || !de?.Emisor) throw new ErrorDte('El archivo no es una factura electrónica FEL de SAT');

  const tipo = texto(de.DatosGenerales['@_Tipo']).toUpperCase();
  if (!TIPOS_COMPRA.includes(tipo)) {
    throw new ErrorDte(`El documento es de tipo ${tipo || 'desconocido'}: solo se importan facturas (FACT, FCAM, FPEQ, FCAP, FESP)`);
  }
  const autorizacion = sat?.Certificacion?.NumeroAutorizacion;
  if (!autorizacion) throw new ErrorDte('El XML no trae la certificación de SAT. Use el XML certificado que envió el proveedor.');

  const items: Record<string, any>[] = de.Items?.Item ?? [];
  if (!items.length) throw new ErrorDte('La factura no tiene productos');

  const lineas: LineaDte[] = items.map((it, i) => {
    const descripcion = texto(it.Descripcion);
    const codigo = descripcion.match(/\b\d{8,14}\b/)?.[0] ?? null;
    return {
      linea: Number(texto(it['@_NumeroLinea'])) || i + 1,
      tipo: texto(it['@_BienOServicio']).toUpperCase() === 'S' ? 'SERVICIO' : 'BIEN',
      descripcion,
      descripcionNormalizada: normalizar(descripcion),
      cantidad: num(it.Cantidad),
      unidad: texto(it.UnidadMedida) || 'UNI',
      precioUnitario: num(it.PrecioUnitario),
      descuento: num(it.Descuento),
      total: num(it.Total),
      codigoBarra: codigo,
    };
  });

  return {
    tipoDocumento: tipo,
    uuid: texto(autorizacion).toUpperCase(),
    serie: texto(autorizacion['@_Serie']).toUpperCase(),
    numero: texto(autorizacion['@_Numero']),
    fecha: texto(de.DatosGenerales['@_FechaHoraEmision']).slice(0, 10),
    moneda: texto(de.DatosGenerales['@_CodigoMoneda']) || 'GTQ',
    emisor: {
      nit: normalizarNit(texto(de.Emisor['@_NITEmisor'])),
      nombre: texto(de.Emisor['@_NombreEmisor']),
      nombreComercial: texto(de.Emisor['@_NombreComercial']),
    },
    receptorNit: normalizarNit(texto(de.Receptor?.['@_IDReceptor'])),
    lineas,
    total: num(de.Totales?.GranTotal),
  };
}
