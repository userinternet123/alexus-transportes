/**
 * DOCUMENTOS (cotizaciones y facturas): lógica pura, sin base de datos ni librerías de PDF.
 * Define el diseño configurable, arma los datos del documento y ofrece utilidades (monto en letras,
 * teléfono para WhatsApp, mensajes con datos). Los generadores de PDF y Word reciben SOLO lo de aquí:
 * como nunca se copian costos ni utilidades al documento, es imposible que salgan impresos.
 */
import { z } from 'zod';

// ───────────────────────── Monto en letras ─────────────────────────
const UNIDADES = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE', 'VEINTE', 'VEINTIÚN', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE'];
const DECENAS = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const CENTENAS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

const menorMil = (n: number): string => {
  if (n === 100) return 'CIEN';
  const partes: string[] = [];
  const c = Math.floor(n / 100); const r = n % 100;
  if (c) partes.push(CENTENAS[c]);
  if (r > 0 && r < 30) partes.push(UNIDADES[r]);
  else if (r >= 30) partes.push(DECENAS[Math.floor(r / 10)] + (r % 10 ? ` Y ${UNIDADES[r % 10]}` : ''));
  return partes.join(' ');
};
const menorMillon = (n: number): string => {
  const miles = Math.floor(n / 1000); const r = n % 1000;
  const m = miles === 0 ? '' : miles === 1 ? 'MIL' : `${menorMil(miles)} MIL`;
  return [m, r ? menorMil(r) : ''].filter(Boolean).join(' ');
};

/** 1234.56 → "MIL DOSCIENTOS TREINTA Y CUATRO QUETZALES CON 56/100" (como se escribe en una factura). */
export function montoEnLetras(monto: number): string {
  if (!Number.isFinite(monto) || monto < 0 || monto >= 1e12) throw new RangeError('Monto fuera de rango');
  const centavosTotales = Math.round(monto * 100);
  const entero = Math.floor(centavosTotales / 100); const cc = String(centavosTotales % 100).padStart(2, '0');
  if (entero === 0) return `CERO QUETZALES CON ${cc}/100`;
  const millones = Math.floor(entero / 1e6); const resto = entero % 1e6;
  const partes: string[] = [];
  if (millones) partes.push(millones === 1 ? 'UN MILLÓN' : `${menorMillon(millones)} MILLONES`);
  if (resto) partes.push(menorMillon(resto));
  const de = resto === 0 ? ' DE' : ''; // "UN MILLÓN DE QUETZALES"
  return `${partes.join(' ')}${de} QUETZAL${entero === 1 ? '' : 'ES'} CON ${cc}/100`;
}

// ───────────────────────── Teléfono y mensajes ─────────────────────────
/** "5555-1234" → "50255551234" (formato de wa.me). Devuelve null si no parece un teléfono. */
export function telefonoWhatsApp(tel: string | null | undefined): string | null {
  let d = String(tel ?? '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 8) return `502${d}`;
  if (d.length === 11 && d.startsWith('502')) return d;
  if (d.length >= 10 && d.length <= 15) return d; // número internacional con código de país
  return null;
}
export const correoValido = (c: string | null | undefined): string | null => {
  const t = String(c ?? '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t) && t.length <= 120 ? t : null;
};
/** Reemplaza {cliente}, {numero}, {total}… Lo desconocido queda tal cual. */
export const aplicarMensaje = (texto: string, v: Record<string, string>) => texto.replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));

// ───────────────────────── Diseño configurable ─────────────────────────
export type TipoDocumento = 'COTIZACION' | 'VENTA' | 'PEDIDO';
export const PAPELES = { CARTA: { nombre: 'Carta (8.5 × 11 pulg.)', ancho: 612, alto: 792 }, MEDIA_CARTA: { nombre: 'Media carta (8.5 × 5.5 pulg.)', ancho: 612, alto: 396 }, A4: { nombre: 'A4', ancho: 595, alto: 842 } } as const;
const bool = (d: boolean) => z.boolean().default(d);
export const plantillaZ = z.object({
  papel: z.enum(['CARTA', 'MEDIA_CARTA', 'A4']).default('CARTA'),
  colorAcento: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color inválido').default('#1a7f4b'),
  tamanoLetra: z.enum(['PEQUENA', 'NORMAL', 'GRANDE']).default('NORMAL'),
  logo: z.object({ mostrar: bool(true), posicion: z.enum(['IZQUIERDA', 'CENTRO', 'DERECHA']).default('IZQUIERDA'), alto: z.number().int().min(20).max(120).default(56) }).default({}),
  encabezado: z.object({ razonSocial: bool(true), nit: bool(true), direccion: bool(true), telefono: bool(true), correo: bool(true), eslogan: bool(false) }).default({}),
  titulo: z.string().trim().min(1).max(40).default('DOCUMENTO'),
  cliente: z.object({ nit: bool(true), direccion: bool(true), telefono: bool(false), correo: bool(false) }).default({}),
  vendedor: bool(true),
  columnas: z.object({ numero: bool(false), cantidad: bool(true), precio: bool(true), descuento: bool(true), subtotal: bool(true) }).default({}),
  mostrar: z.object({ desglose: bool(true), montoEnLetras: bool(true), pagos: bool(true), validez: bool(true), observaciones: bool(true), totales: bool(true) }).default({}),
  textos: z.object({
    notas: z.string().max(600).default(''), pie: z.string().max(300).default('Gracias por su preferencia'),
    mensajeWhatsApp: z.string().max(400).default('Hola {cliente}, le compartimos su {tipo} {numero} por {total}. Gracias por preferir a {negocio}.'),
    asuntoCorreo: z.string().max(120).default('{tipo} {numero} de {negocio}'),
    cuerpoCorreo: z.string().max(800).default('Estimado/a {cliente}:\n\nAdjuntamos su {tipo} {numero} por {total}.\n\nSaludos cordiales,\n{negocio}'),
  }).default({}),
  firmas: z.object({ mostrar: bool(false), izquierda: z.string().max(40).default('Entregado por'), derecha: z.string().max(40).default('Recibido por') }).default({}),
});
export type Plantilla = z.infer<typeof plantillaZ>;

/** Diseño inicial de cada tipo de documento. */
export function plantillaPorDefecto(tipo: TipoDocumento): Plantilla {
  const base = plantillaZ.parse({});
  // Pedido a proveedor: cantidades sin precios (el proveedor confirma precio y disponibilidad)
  if (tipo === 'PEDIDO') {
    return {
      ...base, titulo: 'PEDIDO', vendedor: true,
      cliente: { nit: true, direccion: false, telefono: true, correo: true },
      columnas: { numero: true, cantidad: true, precio: false, descuento: false, subtotal: false },
      mostrar: { desglose: false, montoEnLetras: false, pagos: false, validez: false, observaciones: true, totales: false },
      textos: {
        ...base.textos, notas: 'Favor confirmar disponibilidad, precio y fecha de entrega.', pie: 'Gracias',
        mensajeWhatsApp: 'Hola {cliente}, le compartimos nuestro pedido {numero} de {negocio}. ¿Nos confirma disponibilidad, precio y fecha de entrega? Gracias.',
        asuntoCorreo: 'Pedido {numero} de {negocio}',
        cuerpoCorreo: 'Estimado/a {cliente}:\n\nAdjuntamos nuestro pedido {numero}. Le agradeceremos confirmar disponibilidad, precio y fecha de entrega.\n\nSaludos cordiales,\n{negocio}',
      },
      firmas: { ...base.firmas, mostrar: false },
    };
  }
  return tipo === 'COTIZACION'
    ? { ...base, titulo: 'COTIZACIÓN', textos: { ...base.textos, notas: 'Precios en quetzales, IVA incluido. Sujeta a disponibilidad de existencias.' }, firmas: { ...base.firmas, izquierda: 'Elaborado por', derecha: 'Aceptada por' } }
    : { ...base, titulo: 'COMPROBANTE DE VENTA' };
}
/** Lee un diseño guardado: completa lo que falte con valores por defecto; si está dañado, usa el de fábrica. */
export function leerPlantilla(tipo: TipoDocumento, crudo: unknown): Plantilla {
  const fabrica = plantillaPorDefecto(tipo);
  if (crudo === null || crudo === undefined) return fabrica;
  const r = plantillaZ.safeParse(crudo);
  return r.success ? r.data : fabrica;
}

// ───────────────────────── Datos del documento ─────────────────────────
export interface Linea { n: number; descripcion: string; cantidad: string; precio: string; descuento: string; subtotal: string }
export interface DatosDocumento {
  tipo: TipoDocumento; etiquetaTipo: string; etiquetaCliente?: string; numero: string; fecha: string; validaHasta: string | null; anulado: boolean;
  negocio: { nombreComercial: string; razonSocial: string; nit: string; direccion: string; telefono: string; correo: string; eslogan: string };
  cliente: { nombre: string; nit: string; direccion: string; telefono: string; correo: string };
  vendedor: string;
  lineas: Linea[];
  totales: { subtotal: string; descuento: string; ivaIncluido: string; total: string; totalNumero: number };
  montoLetras: string; // "MIL DOSCIENTOS … QUETZALES CON 56/100"
  pagos: { medio: string; monto: string }[]; cambio: string | null;
  fel: { autorizacion: string; serie: string; numero: string; frases: string } | null;
  aviso: string | null; // "Este documento no es una factura" / "Documento sin validez fiscal"
  observaciones: string; conMarca: boolean;
}

const num = (v: unknown) => Number(String(v ?? 0));
export const dinero = (v: unknown) => `Q ${num(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const cantidadTxt = (v: unknown) => num(v).toLocaleString('en-US', { maximumFractionDigits: 3 });
export const fechaGt = (d: Date | string | null | undefined) => (d ? new Intl.DateTimeFormat('es-GT', { timeZone: 'America/Guatemala', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(d)) : '');
const MEDIOS: Record<string, string> = { EFECTIVO: 'Efectivo', TARJETA: 'Tarjeta', TRANSFERENCIA: 'Transferencia', CHEQUE: 'Cheque', CREDITO: 'Crédito', VALE: 'Vale' };

/** Entrada: lo que ya consulta el servidor. Se leen SOLO los campos que se imprimen (jamás costos). */
export interface FuenteDocumento {
  venta: {
    tipo: string; estado: string; serie: string; numero: number; fecha: Date | string; validaHasta?: Date | string | null;
    subtotal: unknown; descuentoTotal: unknown; ivaIncluido: unknown; total: unknown; cambio?: unknown; observaciones?: string | null;
    felEstado?: string | null; felUuid?: string | null; felSerie?: string | null; felNumero?: string | null;
    cliente: { nit?: string | null; nombres?: string | null; apellidos?: string | null; razonSocial?: string | null };
    vendedor?: { nombre: string } | null;
    detalles: { descripcion: string; cantidad: unknown; precioUnitario: unknown; porcentajeDescuento?: unknown; descuento?: unknown; subtotal: unknown }[];
    pagos?: { medioPago: string; monto: unknown }[];
  };
  empresa: { nombre?: string | null; nombreComercial?: string | null; nit?: string | null; direccion?: string | null; telefono?: string | null; email?: string | null } | null;
  nombreComercial?: string | null; eslogan?: string | null;
  clienteContacto?: { telefono?: string | null; email?: string | null; direccion?: string | null } | null;
  frases?: string | null; conMarca: boolean;
}

export function armarDatos(f: FuenteDocumento): DatosDocumento {
  const v = f.venta; const e = f.empresa;
  const esCot = v.tipo === 'COTIZACION';
  const nombreCliente = v.cliente.razonSocial || [v.cliente.nombres, v.cliente.apellidos].filter(Boolean).join(' ') || 'Consumidor final';
  const certificado = !esCot && v.felEstado === 'CERTIFICADO' && Boolean(v.felUuid);
  return {
    tipo: esCot ? 'COTIZACION' : 'VENTA', etiquetaTipo: esCot ? 'cotización' : 'comprobante de venta',
    numero: `${v.serie}-${v.numero}`, fecha: fechaGt(v.fecha), validaHasta: esCot && v.validaHasta ? fechaGt(v.validaHasta) : null, anulado: v.estado === 'ANULADA',
    negocio: {
      nombreComercial: f.nombreComercial ?? e?.nombreComercial ?? e?.nombre ?? '', razonSocial: e?.nombre ?? '', nit: e?.nit ?? '',
      direccion: e?.direccion ?? '', telefono: e?.telefono ?? '', correo: e?.email ?? '', eslogan: f.eslogan ?? '',
    },
    cliente: { nombre: nombreCliente, nit: v.cliente.nit ?? 'CF', direccion: f.clienteContacto?.direccion ?? '', telefono: f.clienteContacto?.telefono ?? '', correo: f.clienteContacto?.email ?? '' },
    vendedor: v.vendedor?.nombre ?? '',
    lineas: v.detalles.map((d, i) => ({
      n: i + 1, descripcion: d.descripcion, cantidad: cantidadTxt(d.cantidad), precio: dinero(d.precioUnitario),
      descuento: num(d.descuento) > 0 ? dinero(d.descuento) : '', subtotal: dinero(d.subtotal),
    })),
    totales: { subtotal: dinero(v.subtotal), descuento: dinero(v.descuentoTotal), ivaIncluido: dinero(v.ivaIncluido), total: dinero(v.total), totalNumero: num(v.total) },
    montoLetras: montoEnLetras(num(v.total)),
    pagos: esCot ? [] : (v.pagos ?? []).map((p) => ({ medio: MEDIOS[p.medioPago] ?? p.medioPago, monto: dinero(p.monto) })),
    cambio: !esCot && num(v.cambio) > 0 ? dinero(v.cambio) : null,
    fel: certificado ? { autorizacion: v.felUuid!, serie: v.felSerie ?? '', numero: v.felNumero ?? '', frases: f.frases ?? '' } : null,
    aviso: esCot ? 'Este documento no es una factura' : (!certificado && v.felEstado !== 'PENDIENTE' ? 'Documento sin validez fiscal' : null),
    observaciones: v.observaciones ?? '', conMarca: f.conMarca,
  };
}

/** Variables para los mensajes de WhatsApp y correo. */
export const variablesMensaje = (d: DatosDocumento): Record<string, string> => ({
  cliente: d.cliente.nombre === 'Consumidor final' ? 'cliente' : d.cliente.nombre, tipo: d.etiquetaTipo, numero: d.numero,
  total: d.totales.total, negocio: d.negocio.nombreComercial || d.negocio.razonSocial, fecha: d.fecha,
});

/** Nombre de archivo seguro: "Cotizacion-A-123.pdf". */
export const nombreArchivo = (d: DatosDocumento, ext: 'pdf' | 'docx') =>
  `${d.tipo === 'COTIZACION' ? 'Cotizacion' : d.tipo === 'PEDIDO' ? 'Pedido' : 'Venta'}-${d.numero}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 60) + `.${ext}`;

/** Datos de ejemplo para el diseñador (con el nombre y datos reales del negocio). */
export function datosEjemplo(tipo: TipoDocumento, negocio: DatosDocumento['negocio'], conMarca: boolean): DatosDocumento {
  const esCot = tipo === 'COTIZACION';
  const l = (n: number, d: string, c: number, p: number, desc = 0): Linea => ({ n, descripcion: d, cantidad: String(c), precio: dinero(p), descuento: desc ? dinero(desc) : '', subtotal: dinero(c * p - desc) });
  return {
    tipo, etiquetaTipo: esCot ? 'cotización' : 'comprobante de venta', numero: 'A-1024', fecha: '30/10/2026', validaHasta: esCot ? '14/11/2026' : null, anulado: false,
    negocio, cliente: { nombre: 'María Fernanda López', nit: '1234567-8', direccion: '5a. avenida 10-20, zona 1, Ciudad de Guatemala', telefono: '5555-1234', correo: 'cliente@ejemplo.com' },
    vendedor: 'Juan Pérez',
    lineas: [l(1, 'Cuaderno cosido 100 hojas rayado', 6, 14), l(2, 'Lápiz grafito caja x12', 2, 18), l(3, 'Pegamento blanco líquido 120 g', 3, 6.5, 1.5), l(4, 'Calculadora científica', 1, 145)],
    totales: { subtotal: dinero(264), descuento: dinero(1.5), ivaIncluido: dinero(28.12), total: dinero(262.5), totalNumero: 262.5 }, montoLetras: montoEnLetras(262.5),
    pagos: esCot ? [] : [{ medio: 'Efectivo', monto: dinero(300) }], cambio: esCot ? null : dinero(37.5),
    fel: null, aviso: esCot ? 'Este documento no es una factura' : 'Documento sin validez fiscal', observaciones: '', conMarca,
  };
}
