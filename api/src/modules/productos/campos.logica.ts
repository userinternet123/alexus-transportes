/**
 * CAMPOS PROPIOS DEL GIRO — lógica pura (sin base de datos): validación y
 * normalización de los valores de un producto, y plantillas por giro.
 */
export type TipoCampo = 'TEXTO' | 'NUMERO' | 'LISTA' | 'SI_NO';
export const TIPOS: TipoCampo[] = ['TEXTO', 'NUMERO', 'LISTA', 'SI_NO'];

export interface DefCampo {
  clave: string; etiqueta: string; tipo: TipoCampo; opciones?: string[]; unidad?: string | null; ayuda?: string | null;
  obligatorio?: boolean; buscable?: boolean; mostrarEnPos?: boolean; categoriaIds?: number[]; activo?: boolean;
}

export class ErrorAtributo extends Error {}

/** "Índice de carga" → "indice_de_carga" */
export const claveDesde = (etiqueta: string) =>
  etiqueta.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);

/** ¿El campo aplica a productos de esta categoría? (sin categorías = a todas) */
export const aplicaA = (c: DefCampo, categoriaId: number | null) =>
  c.activo !== false && (!c.categoriaIds?.length || (categoriaId != null && c.categoriaIds.includes(categoriaId)));

const vacio = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

/**
 * Valida y normaliza los valores enviados para un producto.
 * - Ignora claves desconocidas o de campos que no aplican a la categoría.
 * - Convierte números y sí/no; una opción de lista debe existir.
 * - Con exigirObligatorios, los obligatorios que aplican deben venir.
 * Devuelve los atributos limpios y el texto para el buscador.
 */
export function normalizarAtributos(campos: DefCampo[], categoriaId: number | null, entrada: Record<string, unknown> | undefined, exigirObligatorios: boolean) {
  const atributos: Record<string, string | number | boolean> = {};
  const aplican = campos.filter((c) => aplicaA(c, categoriaId));
  for (const c of aplican) {
    const v = entrada?.[c.clave];
    if (vacio(v)) {
      if (exigirObligatorios && c.obligatorio) throw new ErrorAtributo(`Falta «${c.etiqueta}»`);
      continue;
    }
    switch (c.tipo) {
      case 'TEXTO': {
        const t = String(v).trim().replace(/\s+/g, ' ');
        if (t.length > 200) throw new ErrorAtributo(`«${c.etiqueta}» admite hasta 200 caracteres`);
        atributos[c.clave] = t;
        break;
      }
      case 'NUMERO': {
        const n = typeof v === 'number' ? v : Number(String(v).trim().replace(',', '.'));
        if (!Number.isFinite(n)) throw new ErrorAtributo(`«${c.etiqueta}» debe ser un número`);
        atributos[c.clave] = n;
        break;
      }
      case 'LISTA': {
        const t = String(v).trim();
        const op = (c.opciones ?? []).find((o) => o.toLowerCase() === t.toLowerCase());
        if (!op) throw new ErrorAtributo(`«${t}» no es una opción válida de «${c.etiqueta}»`);
        atributos[c.clave] = op;
        break;
      }
      case 'SI_NO': {
        const t = String(v).trim().toLowerCase();
        if (v === true || ['true', 'si', 'sí', '1'].includes(t)) atributos[c.clave] = true;
        else if (v === false || ['false', 'no', '0'].includes(t)) atributos[c.clave] = false;
        else throw new ErrorAtributo(`«${c.etiqueta}» debe ser sí o no`);
        break;
      }
    }
  }
  return { atributos, textoBusqueda: textoBusqueda(campos, atributos) };
}

/** Texto de búsqueda: valores de los campos buscables ("205/55R16 16 Camioneta / SUV"). */
export function textoBusqueda(campos: DefCampo[], atributos: Record<string, unknown>): string | null {
  const partes = campos
    .filter((c) => c.buscable && c.activo !== false && atributos[c.clave] !== undefined && typeof atributos[c.clave] !== 'boolean')
    .map((c) => String(atributos[c.clave]));
  return partes.length ? partes.join(' ').slice(0, 1000) : null;
}

/** Plantillas por giro. Las claves compartidas entre giros tienen el mismo significado y tipo. */
export const PLANTILLAS: Record<string, { nombre: string; descripcion: string; campos: DefCampo[] }> = {
  llantas: {
    nombre: 'Llantera', descripcion: 'Medida, ancho, perfil, rin, índices y tipo de vehículo',
    campos: [
      { clave: 'medida', etiqueta: 'Medida', tipo: 'TEXTO', ayuda: '205/55R16', buscable: true, mostrarEnPos: true },
      { clave: 'ancho', etiqueta: 'Ancho', tipo: 'NUMERO', unidad: 'mm', ayuda: '205' },
      { clave: 'perfil', etiqueta: 'Perfil', tipo: 'NUMERO', unidad: '%', ayuda: '55' },
      { clave: 'rin', etiqueta: 'Rin', tipo: 'NUMERO', unidad: 'pulg.', ayuda: '16', buscable: true, mostrarEnPos: true },
      { clave: 'indice_carga', etiqueta: 'Índice de carga', tipo: 'TEXTO', ayuda: '91' },
      { clave: 'indice_velocidad', etiqueta: 'Índice de velocidad', tipo: 'LISTA', opciones: ['L', 'M', 'N', 'P', 'Q', 'R', 'S', 'T', 'H', 'V', 'W', 'Y', 'Z'] },
      { clave: 'tipo_vehiculo', etiqueta: 'Tipo de vehículo', tipo: 'LISTA', opciones: ['Automóvil', 'Camioneta / SUV', 'Pick-up', 'Camión', 'Motocicleta'], buscable: true },
    ],
  },
  libreria: {
    nombre: 'Librería y papelería', descripcion: 'Autor, editorial, ISBN, grado escolar y año',
    campos: [
      { clave: 'autor', etiqueta: 'Autor', tipo: 'TEXTO', buscable: true, mostrarEnPos: true },
      { clave: 'editorial', etiqueta: 'Editorial', tipo: 'TEXTO', buscable: true },
      { clave: 'isbn', etiqueta: 'ISBN', tipo: 'TEXTO', ayuda: '978-9929-…', buscable: true },
      { clave: 'grado', etiqueta: 'Grado escolar', tipo: 'LISTA', buscable: true, mostrarEnPos: true, opciones: ['Preprimaria', 'Primero primaria', 'Segundo primaria', 'Tercero primaria', 'Cuarto primaria', 'Quinto primaria', 'Sexto primaria', 'Primero básico', 'Segundo básico', 'Tercero básico', 'Diversificado', 'Universitario'] },
      { clave: 'anio_edicion', etiqueta: 'Año de edición', tipo: 'NUMERO' },
      { clave: 'idioma', etiqueta: 'Idioma', tipo: 'LISTA', opciones: ['Español', 'Inglés', 'Otro'] },
    ],
  },
  ferreteria: {
    nombre: 'Ferretería', descripcion: 'Medida, material, calibre, color y uso',
    campos: [
      { clave: 'medida', etiqueta: 'Medida', tipo: 'TEXTO', ayuda: '1/2 pulg.', buscable: true, mostrarEnPos: true },
      { clave: 'material', etiqueta: 'Material', tipo: 'LISTA', buscable: true, opciones: ['Acero', 'Acero inoxidable', 'Hierro galvanizado', 'Aluminio', 'Cobre', 'Bronce', 'PVC', 'CPVC', 'Madera', 'Plástico'] },
      { clave: 'calibre', etiqueta: 'Calibre', tipo: 'TEXTO', ayuda: '12 AWG', buscable: true, mostrarEnPos: true },
      { clave: 'color', etiqueta: 'Color', tipo: 'TEXTO' },
      { clave: 'uso', etiqueta: 'Uso', tipo: 'LISTA', opciones: ['Interior', 'Exterior', 'Interior y exterior'] },
    ],
  },
  ropa: {
    nombre: 'Ropa y calzado', descripcion: 'Talla, color, género y material',
    campos: [
      { clave: 'talla', etiqueta: 'Talla', tipo: 'TEXTO', ayuda: 'M, 38, 10', buscable: true, mostrarEnPos: true },
      { clave: 'color', etiqueta: 'Color', tipo: 'TEXTO', buscable: true, mostrarEnPos: true },
      { clave: 'genero', etiqueta: 'Género', tipo: 'LISTA', opciones: ['Hombre', 'Mujer', 'Niño', 'Niña', 'Unisex'] },
      { clave: 'material_tela', etiqueta: 'Material o tela', tipo: 'TEXTO' },
    ],
  },
  servicios: {
    nombre: 'Venta de servicios', descripcion: 'Duración, cita y garantía',
    campos: [
      { clave: 'duracion', etiqueta: 'Duración', tipo: 'NUMERO', unidad: 'min', mostrarEnPos: true },
      { clave: 'requiere_cita', etiqueta: 'Requiere cita', tipo: 'SI_NO' },
      { clave: 'garantia_dias', etiqueta: 'Garantía', tipo: 'NUMERO', unidad: 'días' },
    ],
  },
};
