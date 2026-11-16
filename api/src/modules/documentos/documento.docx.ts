/**
 * GENERADOR DE WORD (.docx, librería "docx"): el mismo contenido y diseño que el PDF, pero editable.
 * Recibe SOLO los datos del documento y el diseño (jamás costos).
 */
import { AlignmentType, BorderStyle, Document, Footer, ImageRun, Packer, PageNumber, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType } from 'docx';
import { DatosDocumento, PAPELES, Plantilla } from './documento.logica';
import { dimensionesImagen } from './documento.pdf';

const LETRA = { PEQUENA: 8, NORMAL: 9.5, GRANDE: 11 } as const;
const SIN_BORDE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } as const;
const SIN_BORDES = { top: SIN_BORDE, bottom: SIN_BORDE, left: SIN_BORDE, right: SIN_BORDE } as const;
const hex = (c: string) => (/^#[0-9a-fA-F]{6}$/.test(c) ? c.slice(1).toUpperCase() : '1A7F4B');

export async function generarDocx(d: DatosDocumento, p: Plantilla, logo: Buffer | null): Promise<Buffer> {
  const papel = PAPELES[p.papel];
  const base: number = LETRA[p.tamanoLetra];
  const acento = hex(p.colorAcento);
  const anchoTw = Math.round((papel.ancho - 72) * 20); // ancho útil en twips (1 pt = 20 twips)
  const tam = (n: number) => Math.round(n * 2); // tamaños de Word en medios puntos

  const run = (t: string, o: { negrita?: boolean; tam?: number; color?: string; cursiva?: boolean } = {}) =>
    new TextRun({ text: t, bold: o.negrita, italics: o.cursiva, size: tam(o.tam ?? base), color: o.color, font: 'Arial' });
  const par = (t: string | TextRun[], o: { alinea?: (typeof AlignmentType)[keyof typeof AlignmentType]; antes?: number; despues?: number; negrita?: boolean; tam?: number; color?: string; cursiva?: boolean } = {}) =>
    new Paragraph({ alignment: o.alinea, spacing: { before: o.antes ?? 0, after: o.despues ?? 40 }, children: typeof t === 'string' ? [run(t, o)] : t });
  const celda = (hijos: Paragraph[], w: number, o: { fondo?: string; bordes?: typeof SIN_BORDES | Record<string, unknown> } = {}) =>
    new TableCell({ width: { size: w, type: WidthType.DXA }, children: hijos, borders: (o.bordes ?? SIN_BORDES) as never, shading: o.fondo ? { type: ShadingType.CLEAR, fill: o.fondo, color: 'auto' } : undefined, margins: { top: 40, bottom: 40, left: 80, right: 80 } });
  const tabla = (filas: TableRow[], anchos: number[]) => new Table({ width: { size: anchoTw, type: WidthType.DXA }, columnWidths: anchos, rows: filas, borders: { top: SIN_BORDE, bottom: SIN_BORDE, left: SIN_BORDE, right: SIN_BORDE, insideHorizontal: SIN_BORDE, insideVertical: SIN_BORDE } as never });

  const hijos: (Paragraph | Table)[] = [];

  // ───────── Encabezado: negocio a la izquierda, documento a la derecha ─────────
  const dim = logo && p.logo.mostrar ? dimensionesImagen(logo) : null;
  const imagen = (): ImageRun | null => {
    if (!logo || !dim) return null;
    const esc = Math.min((p.logo.alto * 2.2) / dim.ancho, p.logo.alto / dim.alto);
    const tipo = logo[0] === 0x89 ? 'png' : 'jpg';
    try { return new ImageRun({ type: tipo, data: logo, transformation: { width: Math.round(dim.ancho * esc * (96 / 72)), height: Math.round(dim.alto * esc * (96 / 72)) } }); } catch { return null; }
  };
  const n = d.negocio;
  const izq: Paragraph[] = [];
  const img = imagen();
  if (img) izq.push(new Paragraph({ alignment: p.logo.posicion === 'CENTRO' ? AlignmentType.CENTER : AlignmentType.LEFT, spacing: { after: 60 }, children: [img] }));
  izq.push(par(n.nombreComercial || n.razonSocial, { negrita: true, tam: base + 5 }));
  if (p.encabezado.razonSocial && n.razonSocial && n.razonSocial !== n.nombreComercial) izq.push(par(n.razonSocial, { color: '52525B', tam: base - 0.5 }));
  if (p.encabezado.nit && n.nit) izq.push(par(`NIT: ${n.nit}`, { color: '52525B', tam: base - 0.5 }));
  if (p.encabezado.direccion && n.direccion) izq.push(par(n.direccion, { color: '52525B', tam: base - 0.5 }));
  const contacto = [p.encabezado.telefono && n.telefono ? `Tel: ${n.telefono}` : '', p.encabezado.correo && n.correo ? n.correo : ''].filter(Boolean).join('  -  ');
  if (contacto) izq.push(par(contacto, { color: '52525B', tam: base - 0.5 }));
  if (p.encabezado.eslogan && n.eslogan) izq.push(par(n.eslogan, { color: '52525B', tam: base - 0.5, cursiva: true }));
  const der: Paragraph[] = [par(p.titulo, { alinea: AlignmentType.RIGHT, negrita: true, tam: base + 7, color: acento }), par(`No. ${d.numero}`, { alinea: AlignmentType.RIGHT, negrita: true, tam: base + 1 }), par(`Fecha: ${d.fecha}`, { alinea: AlignmentType.RIGHT })];
  if (p.mostrar.validez && d.validaHasta) der.push(par(`Válida hasta: ${d.validaHasta}`, { alinea: AlignmentType.RIGHT }));
  if (d.anulado) der.push(par('ANULADO', { alinea: AlignmentType.RIGHT, negrita: true, tam: base + 4, color: 'B91C1C' }));
  const wIzq = Math.round(anchoTw * 0.58);
  hijos.push(tabla([new TableRow({ children: [celda(izq, wIzq), celda(der, anchoTw - wIzq)] })], [wIzq, anchoTw - wIzq]));
  hijos.push(new Paragraph({ spacing: { before: 60, after: 100 }, border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: acento, space: 4 } }, children: [] }));

  // ───────── Cliente ─────────
  const cli: [string, string][] = [['Cliente', d.cliente.nombre]];
  if (p.cliente.nit) cli.push(['NIT', d.cliente.nit]);
  if (p.cliente.direccion && d.cliente.direccion) cli.push(['Dirección', d.cliente.direccion]);
  if (p.cliente.telefono && d.cliente.telefono) cli.push(['Teléfono', d.cliente.telefono]);
  if (p.cliente.correo && d.cliente.correo) cli.push(['Correo', d.cliente.correo]);
  const wc = Math.round(anchoTw * 0.72);
  hijos.push(tabla([new TableRow({ children: [
    celda(cli.map(([k, v]) => par([run(`${k}: `, { negrita: true }), run(v)], { despues: 20 })), wc),
    celda(p.vendedor && d.vendedor ? [par([run('Vendedor: ', { negrita: true }), run(d.vendedor)])] : [par('')], anchoTw - wc),
  ] })], [wc, anchoTw - wc]));
  hijos.push(par('', { despues: 60 }));

  // ───────── Tabla de artículos ─────────
  type Col = { clave: 'n' | 'descripcion' | 'cantidad' | 'precio' | 'descuento' | 'subtotal'; titulo: string; w: number; alinea: (typeof AlignmentType)[keyof typeof AlignmentType] };
  const cols: Col[] = [];
  if (p.columnas.numero) cols.push({ clave: 'n', titulo: '#', w: 22, alinea: AlignmentType.CENTER });
  cols.push({ clave: 'descripcion', titulo: 'Descripción', w: 0, alinea: AlignmentType.LEFT });
  if (p.columnas.cantidad) cols.push({ clave: 'cantidad', titulo: 'Cant.', w: 46, alinea: AlignmentType.RIGHT });
  if (p.columnas.precio) cols.push({ clave: 'precio', titulo: 'Precio', w: 70, alinea: AlignmentType.RIGHT });
  if (p.columnas.descuento && d.lineas.some((l) => l.descuento)) cols.push({ clave: 'descuento', titulo: 'Desc.', w: 62, alinea: AlignmentType.RIGHT });
  if (p.columnas.subtotal) cols.push({ clave: 'subtotal', titulo: 'Subtotal', w: 78, alinea: AlignmentType.RIGHT });
  cols.find((c) => c.clave === 'descripcion')!.w = Math.max(80, papel.ancho - 72 - cols.reduce((s, c) => s + c.w, 0));
  const anchos = cols.map((c) => Math.round(c.w * 20));
  const ajuste = anchoTw - anchos.reduce((s, w) => s + w, 0); anchos[cols.findIndex((c) => c.clave === 'descripcion')] += ajuste;
  const borde = { style: BorderStyle.SINGLE, size: 2, color: 'D4D4D8' };
  const bordesFila = { top: borde, bottom: borde, left: SIN_BORDE, right: SIN_BORDE };
  const filas: TableRow[] = [new TableRow({ tableHeader: true, children: cols.map((c, i) => celda([par(c.titulo, { alinea: c.alinea, negrita: true, color: 'FFFFFF', tam: base - 0.5, despues: 0 })], anchos[i], { fondo: acento })) })];
  d.lineas.forEach((l, k) => filas.push(new TableRow({ cantSplit: true, children: cols.map((c, i) => celda([par(String(l[c.clave]), { alinea: c.alinea, despues: 0 })], anchos[i], { fondo: k % 2 ? 'F4F4F5' : undefined, bordes: bordesFila })) })));
  hijos.push(tabla(filas, anchos));

  // ───────── Totales ─────────
  const totales: [string, string, boolean][] = [];
  if (p.mostrar.desglose) totales.push(['Subtotal', d.totales.subtotal, false]);
  if (p.mostrar.desglose && d.totales.descuento !== 'Q 0.00') totales.push(['Descuento', `- ${d.totales.descuento}`, false]);
  if (p.mostrar.desglose && d.totales.ivaIncluido !== 'Q 0.00') totales.push(['IVA incluido', d.totales.ivaIncluido, false]);
  totales.push(['TOTAL', d.totales.total, true]);
  const wl = Math.round(anchoTw * 0.2); const wv = Math.round(anchoTw * 0.2); const wvacio = anchoTw - wl - wv;
  hijos.push(par('', { despues: 40 }));
  hijos.push(tabla(totales.map(([k, v, fuerte]) => new TableRow({ children: [
    celda([par('')], wvacio), celda([par(k, { negrita: fuerte, tam: fuerte ? base + 3 : base, despues: 0 })], wl, fuerte ? { bordes: { ...SIN_BORDES, top: { style: BorderStyle.SINGLE, size: 8, color: acento } } } : {}),
    celda([par(v, { alinea: AlignmentType.RIGHT, negrita: fuerte, tam: fuerte ? base + 3 : base, color: fuerte ? acento : undefined, despues: 0 })], wv, fuerte ? { bordes: { ...SIN_BORDES, top: { style: BorderStyle.SINGLE, size: 8, color: acento } } } : {}),
  ] })), [wvacio, wl, wv]));
  if (p.mostrar.montoEnLetras) hijos.push(par(`SON: ${d.montoLetras}`, { negrita: true, tam: base - 0.5, antes: 100, despues: 100 }));

  // ───────── Pagos, FEL, avisos, observaciones, notas, firmas ─────────
  const bloque = (titulo: string, cuerpo: string[], color = '52525B') => {
    if (titulo) hijos.push(par(titulo, { negrita: true, tam: base - 0.5, despues: 10 }));
    for (const l of cuerpo) hijos.push(par(l, { tam: base - 0.5, color, despues: 10 }));
    hijos.push(par('', { despues: 40 }));
  };
  if (p.mostrar.pagos && d.pagos.length) bloque('Forma de pago', [`${d.pagos.map((x) => `${x.medio}: ${x.monto}`).join('   ')}${d.cambio ? `   -   Cambio: ${d.cambio}` : ''}`], '1D1D1F');
  if (d.fel) bloque('Documento tributario electrónico', [`Autorización: ${d.fel.autorizacion}`, `Serie: ${d.fel.serie}   Número: ${d.fel.numero}`, ...(d.fel.frases ? [d.fel.frases] : [])]);
  else if (d.aviso) bloque('', [d.aviso]);
  if (p.mostrar.observaciones && d.observaciones) bloque('Observaciones', d.observaciones.split('\n'), '1D1D1F');
  if (p.textos.notas.trim()) bloque('Notas', p.textos.notas.trim().split('\n'));
  if (p.firmas.mostrar) {
    const w = Math.round(anchoTw * 0.4); const centro = anchoTw - 2 * w;
    const linea = { ...SIN_BORDES, top: { style: BorderStyle.SINGLE, size: 6, color: '71717A' } };
    hijos.push(par('', { antes: 400, despues: 0 }));
    hijos.push(tabla([new TableRow({ children: [celda([par(p.firmas.izquierda, { alinea: AlignmentType.CENTER, color: '52525B', tam: base - 1 })], w, { bordes: linea }), celda([par('')], centro), celda([par(p.firmas.derecha, { alinea: AlignmentType.CENTER, color: '52525B', tam: base - 1 })], w, { bordes: linea })] })], [w, centro, w]));
  }

  const pie: Paragraph[] = [];
  if (p.textos.pie.trim()) pie.push(par(p.textos.pie.trim(), { alinea: AlignmentType.CENTER, color: '52525B', tam: base - 0.5, despues: 20 }));
  pie.push(new Paragraph({ spacing: { after: 0 }, tabStops: [{ type: 'right' as never, position: anchoTw }], children: [
    new TextRun({ children: ['Página ', PageNumber.CURRENT, ' de ', PageNumber.TOTAL_PAGES], size: tam(base - 2), color: '71717A', font: 'Arial' }),
    ...(d.conMarca ? [new TextRun({ text: '\tSPVI by ALEXUS', bold: true, size: tam(base - 2), color: '71717A', font: 'Arial' })] : []),
  ] }));

  const doc = new Document({
    creator: 'SPVI', title: `${p.titulo} ${d.numero}`,
    sections: [{ properties: { page: { size: { width: papel.ancho * 20, height: papel.alto * 20 }, margin: { top: 720, bottom: 900, left: 720, right: 720 } } }, footers: { default: new Footer({ children: pie }) }, children: hijos }],
  });
  return Packer.toBuffer(doc);
}
