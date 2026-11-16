/**
 * GENERADOR DE PDF (pdfkit, sin navegador ni programas externos). Recibe SOLO los datos del documento y el
 * diseño: no consulta nada ni conoce costos. La tabla sigue en la hoja siguiente repitiendo sus encabezados.
 */
import PDFDocument from 'pdfkit';
import { DatosDocumento, PAPELES, Plantilla } from './documento.logica';

const LETRA = { PEQUENA: 8, NORMAL: 9.5, GRANDE: 11 } as const;
const MARGEN = 36;
const PIE = 52; // espacio reservado abajo para el pie de página

/** Las fuentes estándar de PDF cubren Latin-1 (tildes, ñ, ¿, ¡). Lo demás se sustituye para no dejar huecos. */
export const limpiarTexto = (s: unknown): string =>
  String(s ?? '').normalize('NFC').replace(/[\u2013\u2014]/g, '-').replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/\u2026/g, '...').replace(/[\u2022\u00B7]/g, '-')
    .replace(/[^\n\x20-\x7e\u00a1-\u00ff]/g, '?');

/** Ancho y alto de un PNG o JPEG leyendo su encabezado (para ajustar el logo sin deformarlo). */
export function dimensionesImagen(b: Buffer): { ancho: number; alto: number } | null {
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) return { ancho: b.readUInt32BE(16), alto: b.readUInt32BE(20) };
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i += 1; continue; }
      const marca = b[i + 1];
      if (marca >= 0xc0 && marca <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marca)) return { ancho: b.readUInt16BE(i + 7), alto: b.readUInt16BE(i + 5) };
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  return null;
}

const colorValido = (c: string) => (/^#[0-9a-fA-F]{6}$/.test(c) ? c : '#1a7f4b');

export function generarPdf(d: DatosDocumento, p: Plantilla, logo: Buffer | null): Promise<Buffer> {
  const papel = PAPELES[p.papel];
  const acento = colorValido(p.colorAcento);
  const base: number = LETRA[p.tamanoLetra];
  const ancho = papel.ancho - MARGEN * 2;
  const limite = papel.alto - PIE;
  const doc = new PDFDocument({ size: [papel.ancho, papel.alto], margins: { top: MARGEN, bottom: MARGEN, left: MARGEN, right: MARGEN }, bufferPages: true, info: { Title: limpiarTexto(`${p.titulo} ${d.numero}`), Author: limpiarTexto(d.negocio.nombreComercial || d.negocio.razonSocial), Creator: 'SPVI' } });
  const trozos: Buffer[] = [];
  doc.on('data', (c: Buffer) => trozos.push(c));
  const listo = new Promise<Buffer>((ok, mal) => { doc.on('end', () => ok(Buffer.concat(trozos))); doc.on('error', mal); });

  const texto = (s: unknown, x: number, y: number, o: PDFKit.Mixins.TextOptions & { fuente?: string; tam?: number; color?: string } = {}) => {
    const { fuente = 'Helvetica', tam = base, color = '#1d1d1f', ...resto } = o;
    doc.font(fuente).fontSize(tam).fillColor(color).text(limpiarTexto(s), x, y, resto);
    return doc.y;
  };
  const altoDe = (s: string, w: number, tam = base, fuente = 'Helvetica') => doc.font(fuente).fontSize(tam).heightOfString(limpiarTexto(s), { width: w });
  const linea = (y: number, color = '#d4d4d8', grosor = 0.6) => doc.moveTo(MARGEN, y).lineTo(MARGEN + ancho, y).lineWidth(grosor).strokeColor(color).stroke();

  // ───────── Encabezado ─────────
  let y = MARGEN;
  const logoAlto = p.logo.alto;
  const dimensiones = logo && p.logo.mostrar ? dimensionesImagen(logo) : null;
  const colIzq = ancho * 0.58; const colDer = ancho - colIzq - 10;
  let xTexto = MARGEN;
  const dibujarLogo = (x: number, yy: number, maxAncho: number) => {
    if (!logo || !dimensiones) return { w: 0, h: 0 };
    const esc = Math.min(maxAncho / dimensiones.ancho, logoAlto / dimensiones.alto);
    const w = dimensiones.ancho * esc; const h = dimensiones.alto * esc;
    try { doc.image(logo, x, yy, { width: w, height: h }); return { w, h }; } catch { return { w: 0, h: 0 }; } // un logo dañado no impide el documento
  };
  if (dimensiones && p.logo.posicion === 'CENTRO') {
    const tam = Math.min(ancho / 2, logoAlto * 3);
    const e = Math.min(tam / dimensiones.ancho, logoAlto / dimensiones.alto);
    const { h } = dibujarLogo(MARGEN + (ancho - dimensiones.ancho * e) / 2, y, tam);
    y += h + 8;
  }
  let yIzq = y;
  if (dimensiones && p.logo.posicion === 'IZQUIERDA') {
    const { w } = dibujarLogo(MARGEN, y, logoAlto * 2.2);
    xTexto = MARGEN + w + 10;
  }
  const anchoTexto = colIzq - (xTexto - MARGEN);
  const n = d.negocio;
  yIzq = texto(n.nombreComercial || n.razonSocial, xTexto, yIzq, { fuente: 'Helvetica-Bold', tam: base + 5, width: anchoTexto });
  const datos: string[] = [];
  if (p.encabezado.razonSocial && n.razonSocial && n.razonSocial !== n.nombreComercial) datos.push(n.razonSocial);
  if (p.encabezado.nit && n.nit) datos.push(`NIT: ${n.nit}`);
  if (p.encabezado.direccion && n.direccion) datos.push(n.direccion);
  const contacto = [p.encabezado.telefono && n.telefono ? `Tel: ${n.telefono}` : '', p.encabezado.correo && n.correo ? n.correo : ''].filter(Boolean).join('  -  ');
  if (contacto) datos.push(contacto);
  if (p.encabezado.eslogan && n.eslogan) datos.push(n.eslogan);
  for (const l of datos) yIzq = texto(l, xTexto, yIzq + 1, { tam: base - 0.5, color: '#52525b', width: anchoTexto });

  // Bloque del documento a la derecha
  const xDer = MARGEN + colIzq + 10;
  let yDer = y;
  if (dimensiones && p.logo.posicion === 'DERECHA') {
    const e = Math.min((colDer) / dimensiones.ancho, logoAlto / dimensiones.alto);
    const { h } = dibujarLogo(xDer + colDer - dimensiones.ancho * e, yDer, colDer);
    yDer += h + 4;
  }
  yDer = texto(p.titulo, xDer, yDer, { fuente: 'Helvetica-Bold', tam: base + 7, color: acento, width: colDer, align: 'right' });
  yDer = texto(`No. ${d.numero}`, xDer, yDer + 2, { fuente: 'Helvetica-Bold', tam: base + 1, width: colDer, align: 'right' });
  yDer = texto(`Fecha: ${d.fecha}`, xDer, yDer + 1, { width: colDer, align: 'right' });
  if (p.mostrar.validez && d.validaHasta) yDer = texto(`Válida hasta: ${d.validaHasta}`, xDer, yDer + 1, { width: colDer, align: 'right' });
  if (d.anulado) yDer = texto('ANULADO', xDer, yDer + 3, { fuente: 'Helvetica-Bold', tam: base + 4, color: '#b91c1c', width: colDer, align: 'right' });
  y = Math.max(yIzq, yDer) + 8;
  linea(y, acento, 1.4);
  y += 8;

  // ───────── Cliente ─────────
  const lineasCliente: [string, string][] = [[d.etiquetaCliente ?? 'Cliente', d.cliente.nombre]];
  if (p.cliente.nit) lineasCliente.push(['NIT', d.cliente.nit]);
  if (p.cliente.direccion && d.cliente.direccion) lineasCliente.push(['Dirección', d.cliente.direccion]);
  if (p.cliente.telefono && d.cliente.telefono) lineasCliente.push(['Teléfono', d.cliente.telefono]);
  if (p.cliente.correo && d.cliente.correo) lineasCliente.push(['Correo', d.cliente.correo]);
  const xVend = MARGEN + ancho * 0.72;
  let yc = y;
  for (const [k, v] of lineasCliente) {
    texto(`${k}:`, MARGEN, yc, { fuente: 'Helvetica-Bold', width: 60 });
    yc = texto(v, MARGEN + 62, yc, { width: ancho * 0.7 - 62 }) + 2;
  }
  if (p.vendedor && d.vendedor) { texto(d.tipo === 'PEDIDO' ? 'Solicita:' : 'Vendedor:', xVend, y, { fuente: 'Helvetica-Bold', width: 60 }); texto(d.vendedor, xVend, y + base + 3, { width: ancho * 0.28 }); }
  y = yc + 6;

  // ───────── Tabla de artículos ─────────
  type Col = { clave: 'n' | 'descripcion' | 'cantidad' | 'precio' | 'descuento' | 'subtotal'; titulo: string; w: number; alinea: 'left' | 'right' | 'center' };
  const cols: Col[] = [];
  if (p.columnas.numero) cols.push({ clave: 'n', titulo: '#', w: 22, alinea: 'center' });
  cols.push({ clave: 'descripcion', titulo: 'Descripción', w: 0, alinea: 'left' });
  if (p.columnas.cantidad) cols.push({ clave: 'cantidad', titulo: 'Cant.', w: 46, alinea: 'right' });
  if (p.columnas.precio) cols.push({ clave: 'precio', titulo: 'Precio', w: 70, alinea: 'right' });
  if (p.columnas.descuento && d.lineas.some((l) => l.descuento)) cols.push({ clave: 'descuento', titulo: 'Desc.', w: 62, alinea: 'right' });
  if (p.columnas.subtotal) cols.push({ clave: 'subtotal', titulo: 'Subtotal', w: 78, alinea: 'right' });
  const fijo = cols.reduce((s, c) => s + c.w, 0);
  cols.find((c) => c.clave === 'descripcion')!.w = Math.max(80, ancho - fijo);
  const encabezadoTabla = () => {
    const h = base + 8;
    doc.rect(MARGEN, y, ancho, h).fill(acento);
    let x = MARGEN;
    for (const c of cols) { texto(c.titulo, x + 4, y + 4, { fuente: 'Helvetica-Bold', tam: base - 0.5, color: '#ffffff', width: c.w - 8, align: c.alinea }); x += c.w; }
    y += h;
  };
  encabezadoTabla();
  d.lineas.forEach((l, i) => {
    const alto = Math.max(altoDe(l.descripcion, cols.find((c) => c.clave === 'descripcion')!.w - 8), base) + 7;
    if (y + alto > limite) { doc.addPage(); y = MARGEN; encabezadoTabla(); }
    if (i % 2 === 1) doc.rect(MARGEN, y, ancho, alto).fill('#f4f4f5');
    let x = MARGEN;
    for (const c of cols) { texto(String(l[c.clave]), x + 4, y + 3.5, { width: c.w - 8, align: c.alinea }); x += c.w; }
    y += alto;
  });
  linea(y, '#a1a1aa', 0.8);
  y += 8;

  // ───────── Totales ─────────
  const filasTotales: [string, string, boolean][] = [];
  if (p.mostrar.desglose) filasTotales.push(['Subtotal', d.totales.subtotal, false]);
  if (p.mostrar.desglose && d.totales.descuento !== 'Q 0.00') filasTotales.push(['Descuento', `- ${d.totales.descuento}`, false]);
  if (p.mostrar.desglose && d.totales.ivaIncluido !== 'Q 0.00') filasTotales.push(['IVA incluido', d.totales.ivaIncluido, false]);
  if (p.mostrar.totales) filasTotales.push(['TOTAL', d.totales.total, true]);
  const anchoTot = 210; const xTot = MARGEN + ancho - anchoTot;
  const alturaTotales = filasTotales.reduce((s, f) => s + (f[2] ? base + 12 : base + 4), 0) + (p.mostrar.montoEnLetras ? altoDe(`SON: ${d.montoLetras}`, ancho) + 8 : 0);
  if (y + alturaTotales > limite) { doc.addPage(); y = MARGEN; }
  for (const [k, v, fuerte] of filasTotales) {
    if (fuerte) { linea(y, acento, 1.2); y += 4; }
    texto(k, xTot, y, { fuente: fuerte ? 'Helvetica-Bold' : 'Helvetica', tam: fuerte ? base + 3 : base, width: anchoTot * 0.5 });
    texto(v, xTot + anchoTot * 0.4, y, { fuente: fuerte ? 'Helvetica-Bold' : 'Helvetica', tam: fuerte ? base + 3 : base, color: fuerte ? acento : '#1d1d1f', width: anchoTot * 0.6, align: 'right' });
    y += fuerte ? base + 8 : base + 4;
  }
  if (p.mostrar.montoEnLetras) { y = texto(`SON: ${d.montoLetras}`, MARGEN, y + 4, { fuente: 'Helvetica-Bold', tam: base - 0.5, width: ancho }) + 4; }

  // ───────── Pagos, FEL, avisos, observaciones y notas ─────────
  const bloque = (titulo: string, cuerpo: string, color = '#52525b') => {
    const alto = altoDe(cuerpo, ancho, base - 0.5) + (titulo ? base + 3 : 0) + 6;
    if (y + alto > limite) { doc.addPage(); y = MARGEN; }
    if (titulo) y = texto(titulo, MARGEN, y, { fuente: 'Helvetica-Bold', tam: base - 0.5, width: ancho }) + 1;
    y = texto(cuerpo, MARGEN, y, { tam: base - 0.5, color, width: ancho }) + 6;
  };
  if (p.mostrar.pagos && d.pagos.length) bloque('Forma de pago', `${d.pagos.map((x) => `${x.medio}: ${x.monto}`).join('   ')}${d.cambio ? `   -   Cambio: ${d.cambio}` : ''}`, '#1d1d1f');
  if (d.fel) bloque('Documento tributario electrónico', `Autorización: ${d.fel.autorizacion}\nSerie: ${d.fel.serie}   Número: ${d.fel.numero}${d.fel.frases ? `\n${d.fel.frases}` : ''}`);
  else if (d.aviso) bloque('', d.aviso);
  if (p.mostrar.observaciones && d.observaciones) bloque('Observaciones', d.observaciones, '#1d1d1f');
  if (p.textos.notas.trim()) bloque('Notas', p.textos.notas.trim());
  if (p.firmas.mostrar) {
    if (y + 56 > limite) { doc.addPage(); y = MARGEN; }
    y += 30;
    const w = ancho * 0.38;
    for (const [x, etiqueta] of [[MARGEN + 10, p.firmas.izquierda], [MARGEN + ancho - w - 10, p.firmas.derecha]] as [number, string][]) {
      doc.moveTo(x, y).lineTo(x + w, y).lineWidth(0.6).strokeColor('#71717a').stroke();
      texto(etiqueta, x, y + 3, { tam: base - 1, color: '#52525b', width: w, align: 'center' });
    }
  }

  // ───────── Pie en cada página: texto, "Página x de y" y firma de ALEXUS si corresponde ─────────
  const rango = doc.bufferedPageRange();
  for (let i = 0; i < rango.count; i += 1) {
    doc.switchToPage(rango.start + i);
    const m = doc.page.margins.bottom; doc.page.margins.bottom = 0; // si no, escribir abajo agregaría una página en blanco
    const yPie = papel.alto - 40;
    linea(yPie - 4, '#e4e4e7', 0.6);
    if (p.textos.pie.trim()) texto(p.textos.pie.trim(), MARGEN, yPie, { tam: base - 0.5, color: '#52525b', width: ancho, align: 'center', lineBreak: false });
    texto(`Página ${i + 1} de ${rango.count}`, MARGEN, yPie + base + 4, { tam: base - 2, color: '#71717a', width: ancho * 0.5, align: 'left', lineBreak: false });
    if (d.conMarca) texto('SPVI by ALEXUS', MARGEN + ancho * 0.5, yPie + base + 4, { fuente: 'Helvetica-Bold', tam: base - 2, color: '#71717a', width: ancho * 0.5, align: 'right', lineBreak: false });
    doc.page.margins.bottom = m;
  }
  doc.end();
  return listo;
}
