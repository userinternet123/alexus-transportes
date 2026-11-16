import { reglaNegocio } from '../../common/errors';
import { z } from 'zod';
import { OpcionesCrud } from '../../common/crud/crud.factory';
import { zBool, zIdOpt, zIdReq, zMonto, zMontoOpt, zNum } from '../../common/pipes/zod';

/**
 * REGISTRO DE CATÁLOGOS — agregar un catálogo = agregar un objeto aquí
 * + un JSON de lista/formulario en el portal. Cero código adicional.
 */
/** '' del input date => sin valor */
const fechaOpt = z.preprocess((v) => (v === '' ? undefined : v), z.coerce.date().nullable().optional());
const nombre = z.string().trim().min(2).max(120);
const activo = zBool.optional();
const idRef = zIdReq;

export const CATALOGOS: OpcionesCrud[] = [
  // ── Geografía ─────────────────────────────────────────────
  {
    ruta: 'catalogos/paises', modelo: 'pais', permiso: 'catalogos', entidad: 'País',
    schema: z.object({ nombre, codigoIso: z.string().length(2).toUpperCase().optional().nullable(), activo }),
    busqueda: ['nombre'], orderBy: { nombre: 'asc' },
  },
  {
    ruta: 'catalogos/departamentos', modelo: 'departamento', permiso: 'catalogos', entidad: 'Departamento',
    schema: z.object({ nombre, paisId: idRef, activo }),
    busqueda: ['nombre'], filtros: ['paisId'], orderBy: { nombre: 'asc' }, include: { pais: { select: { nombre: true } } },
  },
  {
    ruta: 'catalogos/municipios', modelo: 'municipio', permiso: 'catalogos', entidad: 'Municipio',
    schema: z.object({ nombre, departamentoId: idRef, activo }),
    busqueda: ['nombre'], filtros: ['departamentoId'], orderBy: { nombre: 'asc' },
    include: { departamento: { select: { nombre: true } } },
  },

  // ── Productos (jerarquía Categoría > Grupo > Subgrupo) ────
  {
    ruta: 'catalogos/categorias', modelo: 'categoria', permiso: 'catalogos', entidad: 'Categoría',
    schema: z.object({ nombre, activo }), busqueda: ['nombre'], orderBy: { nombre: 'asc' },
  },
  {
    ruta: 'catalogos/grupos', modelo: 'grupo', permiso: 'catalogos', entidad: 'Grupo',
    schema: z.object({ nombre, categoriaId: idRef, activo }),
    busqueda: ['nombre'], filtros: ['categoriaId'], orderBy: { nombre: 'asc' }, include: { categoria: { select: { nombre: true } } },
  },
  {
    ruta: 'catalogos/subgrupos', modelo: 'subgrupo', permiso: 'catalogos', entidad: 'Subgrupo',
    schema: z.object({ nombre, grupoId: idRef, activo }),
    busqueda: ['nombre'], filtros: ['grupoId'], orderBy: { nombre: 'asc' },
    include: { grupo: { select: { nombre: true, categoria: { select: { nombre: true } } } } },
  },
  {
    ruta: 'catalogos/marcas', modelo: 'marca', permiso: 'catalogos', entidad: 'Marca',
    schema: z.object({ nombre, activo }), busqueda: ['nombre'], orderBy: { nombre: 'asc' },
  },
  {
    ruta: 'catalogos/presentaciones', modelo: 'presentacion', permiso: 'catalogos', entidad: 'Presentación',
    schema: z.object({ nombre, abreviatura: z.string().max(10).optional().nullable(), permiteDecimales: zBool.optional(), activo }),
    busqueda: ['nombre'], orderBy: { nombre: 'asc' },
  },

  // ── Políticas de descuento (antes TDescuento) ────────────
  {
    ruta: 'catalogos/politicas-descuento', modelo: 'politicaDescuento', permiso: 'descuentos', entidad: 'Política de descuento',
    schema: z.object({
      rolId: idRef,
      productoId: zIdOpt,
      subgrupoId: zIdOpt,
      porcentajeMax: zNum(z.number().min(0).max(100)),
      cantidadMaxima: zNum(z.number().positive().nullable().optional()),
      vigenteDesde: z.coerce.date().optional(),
      vigenteHasta: fechaOpt,
      activo,
    }),
    reglas: (d) => (d.productoId && d.subgrupoId ? 'Indique producto O subgrupo, no ambos (vacío = global)' : null),
    filtros: ['rolId', 'productoId', 'subgrupoId'],
    include: { rol: { select: { nombre: true } }, producto: { select: { sku: true, nombre: true } }, subgrupo: { select: { nombre: true } } },
  },

  // ── Estructura organizacional ─────────────────────────────
  {
    ruta: 'catalogos/sucursales', modelo: 'sucursal', permiso: 'catalogos', entidad: 'Sucursal',
    // Respeta el número de sucursales de la licencia. Al crearla se le agregan su bodega principal, su primera caja
    // y el acceso de quien la creó (para que pueda trabajar en ella de inmediato).
    antesDeCrear: async (dto, { tx, licencia }) => {
      const { maxSucursales } = await licencia.estado();
      const activas = await tx.sucursal.count({ where: { activo: true } });
      if (activas >= maxSucursales) throw reglaNegocio('LIMITE_SUCURSALES', `Su licencia permite ${maxSucursales} ${maxSucursales === 1 ? 'sucursal' : 'sucursales'} y ya tiene ${activas}. Para agregar otra, amplíe su licencia con ALEXUS.`);
      // La sucursal nueva trae su bodega y su caja: también deben caber en la licencia
      await licencia.validarLimite('bodegas', await tx.bodega.count({ where: { activo: true } }));
      await licencia.validarLimite('cajas', await tx.caja.count({ where: { activo: true } }));
      if (!dto.empresaId) dto.empresaId = (await tx.empresa.findFirst({ select: { id: true }, orderBy: { id: 'asc' } }))?.id;
      if (!dto.empresaId) throw reglaNegocio('EMPRESA_REQUERIDA', 'Primero configure los datos de la empresa.');
    },
    despuesDeCrear: async (s, { tx, ctx }) => {
      await tx.bodega.create({ data: { sucursalId: s.id, nombre: 'Bodega principal', esPrincipal: true } });
      await tx.caja.create({ data: { sucursalId: s.id, nombre: 'Caja 1' } });
      await tx.usuarioSucursal.upsert({ where: { usuarioId_sucursalId: { usuarioId: ctx.usuario.sub, sucursalId: s.id } }, create: { usuarioId: ctx.usuario.sub, sucursalId: s.id }, update: {} });
    },
    schema: z.object({
      empresaId: idRef.optional(), codigo: z.string().trim().toUpperCase().min(2).max(10), nombre,
      direccion: z.string().max(250).optional().nullable(), telefono: z.string().max(20).optional().nullable(),
      municipioId: zIdOpt, establecimientoFel: zIdOpt, activo,
    }),
    busqueda: ['nombre', 'codigo'], orderBy: { nombre: 'asc' },
  },
  {
    ruta: 'catalogos/bodegas', modelo: 'bodega', permiso: 'catalogos', entidad: 'Bodega',
    schema: z.object({ nombre, esPrincipal: zBool.optional(), activo }),
    busqueda: ['nombre'], porSucursal: true, orderBy: { nombre: 'asc' },
    // Respeta el número de bodegas de la licencia
    antesDeCrear: async (_dto, { tx, licencia }) => licencia.validarLimite('bodegas', await tx.bodega.count({ where: { activo: true } })),
  },
  {
    ruta: 'catalogos/cajas', modelo: 'caja', permiso: 'catalogos', entidad: 'Caja',
    schema: z.object({ nombre, activo }), busqueda: ['nombre'], porSucursal: true, orderBy: { nombre: 'asc' },
    // Respeta el número de cajas de la licencia
    antesDeCrear: async (_dto, { tx, licencia }) => licencia.validarLimite('cajas', await tx.caja.count({ where: { activo: true } })),
  },

  // ── Terceros ──────────────────────────────────────────────
  ...(['clientes', 'proveedores'] as const).map<OpcionesCrud>((tipo) => ({
    ruta: `terceros/${tipo}`, modelo: 'tercero', permiso: 'terceros',
    entidad: tipo === 'clientes' ? 'Cliente' : 'Proveedor',
    schema: z.object({
      tipo: z.enum(['PERSONA', 'EMPRESA']).default('PERSONA'),
      // Obligatorio al crear (en la edición el schema es parcial): CF si no tiene NIT
      nit: z.string({ required_error: 'El NIT es obligatorio (CF si no tiene)', invalid_type_error: 'El NIT es obligatorio (CF si no tiene)' }).trim().toUpperCase().min(1, 'El NIT es obligatorio (CF si no tiene)').regex(/^(CF|[0-9]+K?)$/, 'NIT inválido (números y K, o CF)'),
      cui: z.string().regex(/^\d{13}$/, 'CUI de 13 dígitos').optional().nullable(),
      nombres: z.string().max(120).optional().nullable(),
      apellidos: z.string().max(120).optional().nullable(),
      razonSocial: z.string().max(200).optional().nullable(),
      nombreComercial: z.string().max(200).optional().nullable(),
      email: z.string().email().optional().nullable(),
      telefono: z.string().max(20).optional().nullable(),
      direccion: z.string().max(250).optional().nullable(),
      municipioId: zIdOpt,
      esCliente: zBool.optional(),
      esProveedor: zBool.optional(),
      limiteCredito: zMontoOpt,
      diasCredito: zNum(z.number().int().min(0).optional()),
      activo,
    }),
    reglas: (t) => (t.razonSocial || t.nombres ? null : 'Indique nombres o razón social'),
    busqueda: ['nit', 'cui', 'nombres', 'apellidos', 'razonSocial', 'nombreComercial'],
    whereBase: tipo === 'clientes' ? { esCliente: true } : { esProveedor: true },
    datosBase: tipo === 'clientes' ? { esCliente: true } : { esProveedor: true },
    orderBy: { id: 'desc' },
    // Municipio con su departamento: para mostrar "Mixco, Guatemala" y preseleccionar el formulario
    include: { municipio: { select: { id: true, nombre: true, departamentoId: true, departamento: { select: { nombre: true } } } } },
  })),

  // ── RRHH (catálogos) ──────────────────────────────────────
  {
    ruta: 'rrhh/departamentos', modelo: 'departamentoOrg', permiso: 'catalogos', entidad: 'Departamento (RRHH)',
    schema: z.object({ nombre, activo }), busqueda: ['nombre'], orderBy: { nombre: 'asc' },
  },
  {
    ruta: 'rrhh/puestos', modelo: 'puesto', permiso: 'catalogos', entidad: 'Puesto',
    schema: z.object({
      nombre, departamentoId: idRef,
      salarioMinimo: zMontoOpt,
      salarioMaximo: zMontoOpt, activo,
    }),
    busqueda: ['nombre'], filtros: ['departamentoId'], orderBy: { nombre: 'asc' },
    include: { departamento: { select: { nombre: true } } },
  },
  {
    ruta: 'rrhh/empleados', modelo: 'empleado', permiso: 'rrhh.empleados', entidad: 'Empleado',
    schema: z.object({
      codigo: z.string().trim().toUpperCase().min(1).max(20),
      nombres: nombre, apellidos: nombre,
      cui: z.string().regex(/^\d{13}$/, 'CUI de 13 dígitos'),
      nit: z.string({ required_error: 'El NIT es obligatorio', invalid_type_error: 'El NIT es obligatorio' }).trim().toUpperCase().min(1, 'El NIT es obligatorio').regex(/^[0-9]+K?$/, 'NIT inválido (números y K)'),
      afiliacionIgss: z.string().max(20).optional().nullable(),
      fechaNacimiento: fechaOpt,
      telefono: z.string().max(20).optional().nullable(),
      email: z.string().email().optional().nullable(),
      direccion: z.string().max(250).optional().nullable(),
      municipioId: zIdOpt,
      sucursalId: idRef, puestoId: idRef,
      fechaIngreso: z.coerce.date(),
      salarioBase: zMonto,
      bonificacionIncentivo: zMontoOpt,
      porcentajeComision: zNum(z.number().min(0).max(100).optional()),
      banco: z.string().max(60).optional().nullable(),
      cuentaBancaria: z.string().max(30).optional().nullable(),
    }),
    busqueda: ['codigo', 'nombres', 'apellidos', 'cui'], filtros: ['sucursalId', 'puestoId'],
    bajaLogica: { campo: 'estado', activo: 'ACTIVO', inactivo: 'BAJA' },
    reglas: (e) => (e.salarioBase !== undefined && Number(e.salarioBase) <= 0 ? 'Salario base inválido' : null),
    include: { puesto: { select: { nombre: true } }, sucursal: { select: { nombre: true } } },
    orderBy: { apellidos: 'asc' },
  },
];
