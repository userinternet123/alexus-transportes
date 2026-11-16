/**
 * LECTURA DE FACTURAS CON IA (foto o PDF) mediante la API de Claude.
 * Devuelve la misma estructura que el lector de XML FEL, para reutilizar la
 * revisión, las sugerencias de productos y el aprendizaje.
 * La IA puede equivocarse: el resultado SIEMPRE pasa por revisión humana.
 */
import { FacturaDte, LineaDte, normalizar, normalizarNit } from './dte.parser';

export class ErrorLectorIa extends Error {}

const HERRAMIENTA = {
  name: 'registrar_factura',
  description: 'Registra los datos leídos de la factura de compra',
  input_schema: {
    type: 'object',
    properties: {
      legible: { type: 'boolean', description: 'false si la imagen no es una factura o no se puede leer' },
      emisorNit: { type: 'string', description: 'NIT del proveedor (emisor), solo dígitos y K' },
      emisorNombre: { type: 'string' },
      receptorNit: { type: 'string', description: 'NIT del comprador (receptor) o CF' },
      serie: { type: 'string', description: 'Serie de la factura (en FEL, la serie del número de autorización)' },
      numero: { type: 'string', description: 'Número de la factura o DTE' },
      autorizacion: { type: 'string', description: 'Número de autorización FEL (UUID) si aparece; vacío si no' },
      fecha: { type: 'string', description: 'Fecha de emisión en formato AAAA-MM-DD' },
      total: { type: 'number', description: 'Gran total de la factura, con IVA' },
      lineas: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            descripcion: { type: 'string' },
            cantidad: { type: 'number' },
            unidad: { type: 'string', description: 'UNI, CJA, PAQ, etc. si aparece' },
            precioUnitario: { type: 'number', description: 'Precio unitario con IVA' },
            descuento: { type: 'number', description: 'Descuento del renglón en quetzales (0 si no hay)' },
            total: { type: 'number', description: 'Total del renglón con IVA' },
            esServicio: { type: 'boolean', description: 'true para fletes, servicios, cargos' },
          },
          required: ['descripcion', 'cantidad', 'precioUnitario', 'total'],
        },
      },
      observaciones: { type: 'string', description: 'Partes dudosas o ilegibles, en español' },
    },
    required: ['legible', 'lineas'],
  },
} as const;

const INSTRUCCIONES = `Eres un asistente que lee facturas de compra de proveedores en Guatemala (moneda quetzales, Q).
Extrae los datos exactamente como aparecen. No inventes valores: si algo no se lee, déjalo vacío y explícalo en "observaciones".
Los precios y totales incluyen IVA. Responde únicamente llamando a la herramienta registrar_factura.`;

interface Leido {
  legible: boolean; emisorNit?: string; emisorNombre?: string; receptorNit?: string; serie?: string; numero?: string;
  autorizacion?: string; fecha?: string; total?: number; observaciones?: string;
  lineas: { descripcion: string; cantidad: number; unidad?: string; precioUnitario: number; descuento?: number; total: number; esServicio?: boolean }[];
}

export async function leerFacturaConIa(
  archivoBase64: string,
  mime: string,
  cfg: { apiKey: string; modelo: string },
): Promise<FacturaDte & { observaciones: string }> {
  const datos = archivoBase64.replace(/^data:[^;]+;base64,/, '');
  const adjunto = mime === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: datos } }
    : { type: 'image', source: { type: 'base64', media_type: mime, data: datos } };

  let res: Response;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: cfg.modelo,
        max_tokens: 8000,
        system: INSTRUCCIONES,
        tools: [HERRAMIENTA],
        messages: [{ role: 'user', content: [adjunto, { type: 'text', text: 'Lee esta factura de compra y registra sus datos.' }] }],
      }),
      signal: AbortSignal.timeout(90_000),
    });
  } catch {
    throw new ErrorLectorIa('No hay conexión con el servicio de lectura. Revise el internet del servidor o importe el XML.');
  }
  if (res.status === 401 || res.status === 403) throw new ErrorLectorIa('La clave del servicio de IA no es válida. Avise al administrador del sistema.');
  if (res.status === 429 || res.status >= 500) throw new ErrorLectorIa('El servicio de lectura está ocupado. Intente de nuevo en un minuto.');
  if (!res.ok) throw new ErrorLectorIa(`El servicio de lectura rechazó el archivo (código ${res.status}).`);

  const cuerpo = (await res.json()) as { content: { type: string; name?: string; input?: unknown; text?: string }[] };
  // Preferimos la llamada a la herramienta; si el modelo respondió en texto, se intenta leer el JSON
  let leido = cuerpo.content.find((c) => c.type === 'tool_use' && c.name === HERRAMIENTA.name)?.input as Leido | undefined;
  if (!leido) {
    const txt = cuerpo.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
    const json = txt.match(/\{[\s\S]*\}/)?.[0];
    try { leido = json ? (JSON.parse(json) as Leido) : undefined; } catch { leido = undefined; }
  }
  if (!leido) throw new ErrorLectorIa('No se pudo interpretar la factura. Pruebe con una foto más nítida o importe el XML.');
  if (!leido.legible || !leido.lineas?.length) {
    const nota = (leido.observaciones ?? '').trim().replace(/([^.])$/, '$1.')
    throw new ErrorLectorIa(`La imagen no parece una factura legible.${nota ? ` ${nota}` : ''} Tome la foto de frente, con buena luz y sin cortar bordes.`);
  }

  const lineas: LineaDte[] = leido.lineas.map((l, i) => {
    const descripcion = String(l.descripcion ?? '').trim();
    return {
      linea: i + 1,
      tipo: l.esServicio ? 'SERVICIO' : 'BIEN',
      descripcion,
      descripcionNormalizada: normalizar(descripcion),
      cantidad: Number(l.cantidad) || 0,
      unidad: (l.unidad ?? 'UNI').toUpperCase(),
      precioUnitario: Number(l.precioUnitario) || 0,
      descuento: Number(l.descuento) || 0,
      total: Number(l.total) || 0,
      codigoBarra: descripcion.match(/\b\d{8,14}\b/)?.[0] ?? null,
    };
  });
  const uuid = (leido.autorizacion ?? '').toUpperCase().trim();
  return {
    tipoDocumento: 'FACT',
    uuid: /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/.test(uuid) ? uuid : '',
    serie: (leido.serie ?? '').toUpperCase().trim(),
    numero: (leido.numero ?? '').trim(),
    fecha: /^\d{4}-\d{2}-\d{2}$/.test(leido.fecha ?? '') ? leido.fecha! : '',
    moneda: 'GTQ',
    emisor: { nit: normalizarNit(leido.emisorNit ?? ''), nombre: (leido.emisorNombre ?? '').trim(), nombreComercial: '' },
    receptorNit: normalizarNit(leido.receptorNit ?? ''),
    lineas,
    total: Number(leido.total) || 0,
    observaciones: (leido.observaciones ?? '').trim(),
  };
}
