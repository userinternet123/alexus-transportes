/**
 * PDF CONSOLIDADO DE PEDIDOS: todos los pedidos de un periodo (o los elegidos) en un solo documento, agrupados por
 * proveedor, con lo pedido y lo recibido. Sin precios (igual que cada pedido).
 */
import PDFDocument from 'pdfkit';

export interface PedidoParaPdf {
  numero: string; proveedor: string; estado: string; fecha: string; solicita: string; nota: string | null;
  lineas: { sku: string; nombre: string; presentacion: string | null; cantidad: number; recibida: number }[];
}
const ESTADO: Record<string, string> = { BORRADOR: 'Por enviar', ENVIADO: 'Enviado', RECIBIDO_PARCIAL: 'Recibido parcial', RECIBIDO: 'Recibido', ANULADO: 'Anulado' };
const n = (x: number) => x.toLocaleString('en-US', { maximumFractionDigits: 3 });

export function pdfConsolidado(d: { negocio: string; periodo: string; pedidos: PedidoParaPdf[] }): Promise<Buffer> {
  return new Promise((resolver, fallar) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 40, info: { Title: `Pedidos a proveedores ${d.periodo}`, Author: d.negocio } });
    const partes: Buffer[] = [];
    doc.on('data', (b: Buffer) => partes.push(b)); doc.on('end', () => resolver(Buffer.concat(partes))); doc.on('error', fallar);
    const ancho = doc.page.width - 80;
    const col = { n: 40, prod: 62, cant: 40 + ancho - 130, rec: 40 + ancho - 60 };
    const saltoSiHaceFalta = (alto: number) => { if (doc.y + alto > doc.page.height - 50) doc.addPage(); };

    doc.font('Helvetica-Bold').fontSize(15).text(d.negocio, 40, 40);
    doc.font('Helvetica').fontSize(11).fillColor('#444').text(`Pedidos a proveedores · ${d.periodo}`);
    const lineas = d.pedidos.reduce((a, p) => a + p.lineas.length, 0);
    doc.fontSize(9).text(`${d.pedidos.length} ${d.pedidos.length === 1 ? 'pedido' : 'pedidos'} · ${new Set(d.pedidos.map((p) => p.proveedor)).size} proveedores · ${lineas} renglones`).fillColor('#000');
    doc.moveDown(0.8);

    for (const p of d.pedidos) {
      saltoSiHaceFalta(70);
      const y0 = doc.y;
      doc.rect(40, y0, ancho, 20).fill('#f1f5f2').fillColor('#000');
      doc.font('Helvetica-Bold').fontSize(10).text(`${p.proveedor}`, 46, y0 + 5, { width: ancho - 220, lineBreak: false });
      doc.font('Helvetica').fontSize(8.5).text(`${p.numero} · ${p.fecha} · ${ESTADO[p.estado] ?? p.estado} · ${p.solicita}`, 40 + ancho - 220, y0 + 6, { width: 214, align: 'right' });
      doc.y = y0 + 25;
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#555');
      const yh = doc.y;
      doc.text('#', col.n, yh); doc.text('Producto', col.prod, yh); doc.text('Pedido', col.cant, yh, { width: 60, align: 'right' }); doc.text('Recibido', col.rec, yh, { width: 60, align: 'right' });
      doc.fillColor('#000').font('Helvetica').fontSize(9); doc.y = yh + 12;
      p.lineas.forEach((l, i) => {
        saltoSiHaceFalta(16);
        const y = doc.y;
        const desc = `${l.nombre}${l.presentacion ? ` (${l.presentacion})` : ''} · ${l.sku}`;
        doc.text(String(i + 1), col.n, y, { width: 20 });
        doc.text(desc, col.prod, y, { width: col.cant - col.prod - 10 });
        const yFin = doc.y;
        doc.text(n(l.cantidad), col.cant, y, { width: 60, align: 'right' });
        const falta = l.recibida < l.cantidad && ['RECIBIDO_PARCIAL', 'RECIBIDO'].includes(p.estado);
        doc.fillColor(falta ? '#b45309' : '#000').text(['RECIBIDO_PARCIAL', 'RECIBIDO'].includes(p.estado) ? n(l.recibida) : '—', col.rec, y, { width: 60, align: 'right' }).fillColor('#000');
        doc.y = Math.max(yFin, y + 12) + 2;
      });
      if (p.nota) { doc.fontSize(8.5).fillColor('#444').text(`Nota: ${p.nota}`, col.prod, doc.y + 2, { width: ancho - 30 }).fillColor('#000').fontSize(9); }
      doc.moveDown(0.9);
    }
    if (!d.pedidos.length) doc.fontSize(10).text('No hay pedidos en este periodo.');
    doc.end();
  });
}
