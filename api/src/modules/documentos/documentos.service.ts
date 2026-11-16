import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import { Ctx } from '../../common/auth/tipos';
import { noEncontrado, reglaNegocio } from '../../common/errors';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LicenciaService } from '../licencia/licencia.service';
import { generarDocx } from './documento.docx';
import {
  aplicarMensaje, armarDatos, correoValido, DatosDocumento, datosEjemplo, FuenteDocumento, leerPlantilla, nombreArchivo, Plantilla, plantillaPorDefecto, telefonoWhatsApp, TipoDocumento, variablesMensaje, fechaGt,
} from './documento.logica';
import { generarPdf } from './documento.pdf';

const clave = (t: TipoDocumento) => `documento.plantilla.${t}`;
export type Formato = 'pdf' | 'docx';
const MIME = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' } as const;

@Injectable()
export class DocumentosService {
  constructor(private readonly prisma: PrismaService, private readonly licencia: LicenciaService, private readonly audit: AuditService) {}

  // ───────── Diseño ─────────
  async plantilla(tipo: TipoDocumento): Promise<Plantilla> {
    const p = await this.prisma.parametroSistema.findUnique({ where: { clave: clave(tipo) } });
    if (!p) return plantillaPorDefecto(tipo);
    try { return leerPlantilla(tipo, JSON.parse(p.valor)); } catch { return plantillaPorDefecto(tipo); }
  }

  async guardarPlantilla(ctx: Ctx, tipo: TipoDocumento, p: Plantilla) {
    const valor = JSON.stringify(p);
    await this.prisma.parametroSistema.upsert({
      where: { clave: clave(tipo) }, create: { clave: clave(tipo), valor, tipo: 'json', modulo: 'documentos', descripcion: `Diseño de ${tipo === 'COTIZACION' ? 'cotizaciones' : 'ventas'}` }, update: { valor },
    });
    await this.audit.registrar(ctx, { accion: 'DOCUMENTO_DISENO', entidad: 'ParametroSistema', entidadId: clave(tipo), despues: { titulo: p.titulo, papel: p.papel } });
    return { message: 'Diseño guardado' };
  }

  async restablecer(ctx: Ctx, tipo: TipoDocumento) {
    await this.prisma.parametroSistema.deleteMany({ where: { clave: clave(tipo) } });
    await this.audit.registrar(ctx, { accion: 'DOCUMENTO_DISENO_RESTABLECER', entidad: 'ParametroSistema', entidadId: clave(tipo) });
    return { data: plantillaPorDefecto(tipo), message: 'Se restableció el diseño de fábrica' };
  }

  // ───────── Datos ─────────
  private async parametros() {
    const filas = await this.prisma.parametroSistema.findMany({ where: { clave: { in: ['negocio.nombre', 'negocio.eslogan', 'ticket.frases', 'negocio.logo'] } } });
    return Object.fromEntries(filas.map((f) => [f.clave, f.valor]));
  }
  private async conMarca() { return !(await this.licencia.estado()).modulos.includes('sinmarca'); }

  /** Los datos del negocio (para la vista previa del diseñador). */
  async negocio(): Promise<DatosDocumento['negocio']> {
    const [e, p] = await Promise.all([this.prisma.empresa.findFirst({ select: { nombre: true, nombreComercial: true, nit: true, direccion: true, telefono: true, email: true } }), this.parametros()]);
    return { nombreComercial: p['negocio.nombre'] ?? e?.nombreComercial ?? e?.nombre ?? '', razonSocial: e?.nombre ?? '', nit: e?.nit ?? '', direccion: e?.direccion ?? '', telefono: e?.telefono ?? '', correo: e?.email ?? '', eslogan: p['negocio.eslogan'] ?? '' };
  }

  /** El logo del negocio, solo si es PNG o JPEG (lo que admiten PDF y Word). */
  private async logo(): Promise<Buffer | null> {
    const id = (await this.parametros())['negocio.logo'];
    if (!id) return null;
    const a = await this.prisma.archivo.findUnique({ where: { id }, select: { mime: true, datos: true } });
    return a && /^image\/(png|jpe?g)$/i.test(a.mime) ? Buffer.from(a.datos) : null;
  }

  /** Solo se leen los campos que se imprimen: ni el costo ni la utilidad llegan siquiera a la memoria del generador. */
  private async fuente(ctx: Ctx, id: number): Promise<FuenteDocumento> {
    const venta = await this.prisma.venta.findFirst({
      where: { id, sucursalId: ctx.sucursalId! },
      select: {
        tipo: true, estado: true, serie: true, numero: true, fecha: true, validaHasta: true, subtotal: true, descuentoTotal: true, ivaIncluido: true, total: true, cambio: true, observaciones: true,
        felEstado: true, felUuid: true, felSerie: true, felNumero: true, clienteId: true,
        cliente: { select: { nit: true, nombres: true, apellidos: true, razonSocial: true } }, vendedor: { select: { nombre: true } },
        detalles: { orderBy: { id: 'asc' }, select: { descripcion: true, cantidad: true, precioUnitario: true, porcentajeDescuento: true, descuento: true, subtotal: true } },
        pagos: { select: { medioPago: true, monto: true } },
      } satisfies Prisma.VentaSelect,
    });
    if (!venta) throw noEncontrado('Documento', id);
    const [empresa, contacto, p, conMarca] = await Promise.all([
      this.prisma.empresa.findFirst({ select: { nombre: true, nombreComercial: true, nit: true, direccion: true, telefono: true, email: true } }),
      this.prisma.tercero.findUnique({ where: { id: venta.clienteId }, select: { telefono: true, email: true, direccion: true } }),
      this.parametros(), this.conMarca(),
    ]);
    return { venta, empresa, nombreComercial: p['negocio.nombre'] ?? null, eslogan: p['negocio.eslogan'] ?? null, clienteContacto: contacto, frases: p['ticket.frases'] ?? 'Sujeto a pagos trimestrales ISR', conMarca };
  }

  private tipoDe(t: string): TipoDocumento { return t === 'COTIZACION' ? 'COTIZACION' : 'VENTA'; }

  // ───────── Salidas ─────────
  async renderizar(ctx: Ctx, ventaId: number, formato: Formato) {
    const fuente = await this.fuente(ctx, ventaId);
    if (fuente.venta.estado === 'BORRADOR') throw reglaNegocio('DOCUMENTO_BORRADOR', 'El documento aún es un borrador: termínelo antes de compartirlo.');
    const datos = armarDatos(fuente);
    const [plantilla, logo] = await Promise.all([this.plantilla(this.tipoDe(fuente.venta.tipo)), this.logo()]);
    const buffer = formato === 'pdf' ? await generarPdf(datos, plantilla, logo) : await generarDocx(datos, plantilla, logo);
    return { buffer, nombre: nombreArchivo(datos, formato), mime: MIME[formato] };
  }

  /** Lo que el portal necesita para armar el mensaje de WhatsApp o el correo (sin adjuntos: los abre el teléfono o el programa de correo). */
  async envio(ctx: Ctx, ventaId: number) {
    const fuente = await this.fuente(ctx, ventaId);
    const datos = armarDatos(fuente);
    const p = await this.plantilla(this.tipoDe(fuente.venta.tipo));
    const v = variablesMensaje(datos);
    return {
      data: {
        telefono: telefonoWhatsApp(fuente.clienteContacto?.telefono), correo: correoValido(fuente.clienteContacto?.email), cliente: datos.cliente.nombre,
        mensajeWhatsApp: aplicarMensaje(p.textos.mensajeWhatsApp, v), asuntoCorreo: aplicarMensaje(p.textos.asuntoCorreo, v), cuerpoCorreo: aplicarMensaje(p.textos.cuerpoCorreo, v),
        nombrePdf: nombreArchivo(datos, 'pdf'), nombreWord: nombreArchivo(datos, 'docx'), tipo: datos.tipo, numero: datos.numero,
      },
    };
  }

  /** PDF de prueba con datos de ejemplo y el diseño que se está editando (aunque aún no esté guardado). */
  async pruebaPdf(tipo: TipoDocumento, plantilla: Plantilla) {
    const [negocio, conMarca, logo] = await Promise.all([this.negocio(), this.conMarca(), this.logo()]);
    return { buffer: await generarPdf(datosEjemplo(tipo, negocio, conMarca), plantilla, logo), nombre: `Prueba-${tipo === 'COTIZACION' ? 'Cotizacion' : 'Venta'}.pdf`, mime: MIME.pdf };
  }

  /** Para el diseñador: el diseño guardado, datos de ejemplo con el nombre real del negocio y si lleva la firma. */
  async vistaPrevia(tipo: TipoDocumento) {
    const [plantilla, negocio, conMarca] = await Promise.all([this.plantilla(tipo), this.negocio(), this.conMarca()]);
    return { data: { plantilla, fabrica: plantillaPorDefecto(tipo), datos: datosEjemplo(tipo, negocio, conMarca) } };
  }

  /**
   * PDF de un PEDIDO A PROVEEDOR: con el logo, colores y encabezado del diseño de cotizaciones; sin precios.
   * Devuelve también los textos para WhatsApp y correo.
   */
  async pdfPedido(p: {
    numero: string; fecha: Date; anulado: boolean; solicita: string; nota: string | null;
    proveedor: { nombre: string; nit: string; telefono: string; correo: string; direccion: string };
    lineas: { descripcion: string; cantidad: number }[];
  }) {
    const [cot, negocio, conMarca, logo] = await Promise.all([this.plantilla('COTIZACION'), this.negocio(), this.conMarca(), this.logo()]);
    const base = plantillaPorDefecto('PEDIDO');
    const plantilla: Plantilla = { ...base, papel: cot.papel, colorAcento: cot.colorAcento, tamanoLetra: cot.tamanoLetra, logo: cot.logo, encabezado: cot.encabezado };
    const datos: DatosDocumento = {
      tipo: 'PEDIDO', etiquetaTipo: 'pedido', etiquetaCliente: 'Proveedor', numero: p.numero, fecha: fechaGt(p.fecha), validaHasta: null, anulado: p.anulado,
      negocio, cliente: p.proveedor, vendedor: p.solicita,
      lineas: p.lineas.map((l, i) => ({ n: i + 1, descripcion: l.descripcion, cantidad: l.cantidad.toLocaleString('en-US', { maximumFractionDigits: 3 }), precio: '', descuento: '', subtotal: '' })),
      totales: { subtotal: '', descuento: 'Q 0.00', ivaIncluido: 'Q 0.00', total: '', totalNumero: 0 },
      montoLetras: '', pagos: [], cambio: null, fel: null, aviso: null, observaciones: p.nota ?? '', conMarca,
    };
    const v = variablesMensaje(datos);
    return {
      buffer: await generarPdf(datos, plantilla, logo), nombre: nombreArchivo(datos, 'pdf'), mime: 'application/pdf',
      mensajes: { whatsapp: aplicarMensaje(plantilla.textos.mensajeWhatsApp, v), asunto: aplicarMensaje(plantilla.textos.asuntoCorreo, v), cuerpo: aplicarMensaje(plantilla.textos.cuerpoCorreo, v) },
    };
  }
}
