/**
 * Fuentes de datos del sistema legado para el ETL.
 *  - FuenteCsv:   carpeta con <Tabla>.csv exportados por exportar-legado.ps1 (sin conexión)
 *  - FuenteMssql: conexión directa a SQL Server (LEGACY_MSSQL)
 * Ambas entregan filas TIPADAS con la misma forma, para que el ETL no sepa de dónde vienen.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type Fila = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface Fuente {
  descripcion: string;
  tabla(nombre: string): Promise<Fila[]>;
  cerrar(): Promise<void>;
}

/** Parser CSV RFC 4180 (comillas, comillas escapadas "", saltos de línea dentro de campos). */
export function parsearCsv(texto: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = '';
  let entreComillas = false;
  const t = texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto; // quita BOM si existe

  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (entreComillas) {
      if (c === '"') {
        if (t[i + 1] === '"') { campo += '"'; i++; }
        else entreComillas = false;
      } else campo += c;
      continue;
    }
    if (c === '"') entreComillas = true;
    else if (c === ',') { fila.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      fila.push(campo); campo = '';
      if (fila.length > 1 || fila[0] !== '') filas.push(fila);
      fila = [];
    } else campo += c;
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
  return filas;
}

/**
 * Convierte texto a tipo según el nombre de la columna (igual que lo entrega SQL Server):
 *  Id*      -> number      Fecha*  -> Date (hora local guardada "tal cual", como hace mssql)
 *  True/False -> boolean   ''      -> null      resto -> string (NIT, códigos de barra
 *  conservan ceros a la izquierda; los decimales se convierten con Prisma.Decimal en el ETL)
 */
export function tipar(columna: string, valor: string): unknown {
  if (valor === '') return null;
  if (valor === 'True') return true;
  if (valor === 'False') return false;
  if (/^Id[A-Z]/.test(columna) && /^-?\d+$/.test(valor)) return Number(valor);
  if (/^Fecha/.test(columna)) {
    const iso = /[zZ]|[+-]\d{2}:\d{2}$/.test(valor) ? valor : `${valor}Z`;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return valor;
}

export class FuenteCsv implements Fuente {
  constructor(private readonly carpeta: string) {
    if (!existsSync(carpeta)) throw new Error(`No existe la carpeta ${carpeta}`);
  }
  get descripcion() { return `CSV en ${this.carpeta}`; }

  async tabla(nombre: string): Promise<Fila[]> {
    const ruta = join(this.carpeta, `${nombre}.csv`);
    if (!existsSync(ruta)) {
      console.warn(`  ⚠ Falta ${nombre}.csv — se asume tabla vacía`);
      return [];
    }
    const [encabezado, ...datos] = parsearCsv(readFileSync(ruta, 'utf8'));
    if (!encabezado) return [];
    return datos.map((valores) => {
      const f: Fila = {};
      encabezado.forEach((col, i) => (f[col] = tipar(col, valores[i] ?? '')));
      return f;
    });
  }
  async cerrar() { /* nada */ }
}

export class FuenteMssql implements Fuente {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private pool: any;
  constructor(private readonly conexion: string) {}
  get descripcion() { return 'SQL Server (conexión directa)'; }

  async tabla(nombre: string): Promise<Fila[]> {
    if (!this.pool) {
      const sql = (await import('mssql')).default;
      this.pool = await sql.connect(this.conexion);
    }
    if (!/^T\w+$/.test(nombre)) throw new Error(`Nombre de tabla inválido: ${nombre}`);
    return (await this.pool.request().query(`SELECT * FROM [${nombre}]`)).recordset;
  }
  async cerrar() { await this.pool?.close(); }
}

