import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import { Ctx, tienePermiso } from '../../common/auth/tipos';
import { noEncontrado, prohibido } from '../../common/errors';
import { validar } from '../../common/pipes/zod';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LicenciaService } from '../licencia/licencia.service';
import { sinCostos, veCostos } from '../../common/auth/ocultar-costos';
import { DefinicionReporte, filtroSucursal, REPORTES } from './reportes.registro';

/** Normaliza tipos de Postgres (Decimal, BigInt, Date) a JSON amigable. */
function normalizar(fila: Record<string, unknown>): Record<string, unknown> {
  const r: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fila)) {
    if (typeof v === 'bigint') r[k] = Number(v);
    else if (v instanceof Prisma.Decimal) r[k] = v.toNumber();
    else if (v instanceof Date) r[k] = v.toISOString().slice(0, 10);
    else r[k] = v;
  }
  return r;
}

@Injectable()
export class ReportesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly licencia: LicenciaService,
  ) {}

  async catalogo(ctx: Ctx) {
    const visibles = []
    for (const r of REPORTES) {
      if (tienePermiso(ctx.usuario, r.permiso) && (await this.licencia.reporteHabilitado(r.clave, r.permiso))) visibles.push(r);
    }
    return {
      data: visibles.map((r) => ({
        clave: r.clave,
        titulo: r.titulo,
        categoria: r.categoria,
        descripcion: r.descripcion,
        parametros: Object.keys(r.parametros.shape),
        parametrosUI: r.parametrosUI ?? {},
        columnas: r.columnas,
      })),
    };
  }

  private async definicion(ctx: Ctx, clave: string): Promise<DefinicionReporte> {
    const def = REPORTES.find((r) => r.clave === clave);
    if (!def) throw noEncontrado('Reporte', clave);
    if (!tienePermiso(ctx.usuario, def.permiso)) throw prohibido(`Permiso requerido: ${def.permiso}`);
    if (!(await this.licencia.reporteHabilitado(def.clave, def.permiso))) throw prohibido('Este reporte no está disponible en su plan');
    return def;
  }

  async ejecutar(ctx: Ctx, clave: string, query: Record<string, string>) {
    const def = await this.definicion(ctx, clave);
    const params = validar(def.parametros, query);
    const consolidado = params.consolidado === 'true';
    const sucursalId = consolidado && tienePermiso(ctx.usuario, 'sucursales.todas') ? null : (ctx.sucursalId ?? -1);
    const filas = await def.ejecutar(this.prisma, params, filtroSucursal(def, ctx, consolidado), sucursalId);
    const data = filas.map(normalizar);
    const totales: Record<string, number> = {};
    for (const c of def.columnas.filter((c) => c.total)) {
      totales[c.accessorKey] = Math.round(data.reduce((acc, f) => acc + Number(f[c.accessorKey] ?? 0), 0) * 100) / 100;
    }
    const resultado = { titulo: def.titulo, parametros: params, columnas: def.columnas, data, totales, generado: new Date().toISOString() };
    // Sin permiso de costos: sin columnas de costo/utilidad (también en Excel, que no pasa por el interceptor)
    return veCostos(ctx) ? resultado : sinCostos(resultado);
  }

  /** Exporta a Excel con formato (moneda, totales, encabezados congelados). */
  async excel(ctx: Ctx, clave: string, query: Record<string, string>): Promise<{ nombre: string; buffer: Buffer }> {
    const r = await this.ejecutar(ctx, clave, query);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'SPVI 2.0';
    const ws = wb.addWorksheet(r.titulo.slice(0, 31));

    ws.addRow([r.titulo]).font = { bold: true, size: 14 };
    ws.addRow([`Parámetros: ${Object.entries(r.parametros).map(([k, v]) => `${k}=${String(v)}`).join('  ')}`]).font = { italic: true, size: 9 };
    ws.addRow([]);
    const header = ws.addRow(r.columnas.map((c) => c.header));
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.eachCell((cell) => (cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } }));
    ws.views = [{ state: 'frozen', ySplit: 4 }];

    for (const fila of r.data) ws.addRow(r.columnas.map((c) => fila[c.accessorKey] ?? null));
    if (Object.keys(r.totales).length) {
      const tot = ws.addRow(r.columnas.map((c, i) => (i === 0 ? 'TOTAL' : (r.totales[c.accessorKey] ?? null))));
      tot.font = { bold: true };
    }
    r.columnas.forEach((c, i) => {
      const col = ws.getColumn(i + 1);
      col.width = Math.max(12, Math.min(45, c.header.length + 6));
      if (c.tipo === 'moneda') col.numFmt = '"Q"#,##0.00';
      if (c.tipo === 'porcentaje') col.numFmt = '0.00"%"';
      if (c.tipo === 'numero') col.numFmt = '#,##0.###';
    });

    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    return { nombre: `${clave}_${new Date().toISOString().slice(0, 10)}.xlsx`, buffer };
  }
}
