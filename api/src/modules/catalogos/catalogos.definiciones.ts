import { reglaNegocio } from '../../common/errors';
import { z } from 'zod';
import { OpcionesCrud } from '../../common/crud/crud.factory';
import { zBool, zIdOpt, zIdReq, zMonto, zMontoOpt, zNum } from '../../common/pipes/zod';
import { errorRegla, METODOS } from '../../common/costos/depreciacion.logica';

/**
 * REGISTRO DE CATÁLOGOS — agregar un catálogo = agregar un objeto aquí
 * + un JSON de lista/formulario en el portal. Cero código adicional.
 *
 * Aquí viven los catálogos de la empresa de transporte: sedes, marcas, rutas,
 * tarifas, cabezales, remolques, documentos de vehículo, pilotos, llantas,
 * planes de mantenimiento, repuestos, clientes, proveedores y talleres.
 * Las operaciones con lógica propia (viajes, combustible, órdenes de trabajo,
 * montajes de llanta) tienen su módulo.
 */
/** '' del input date => sin valor */
const fechaOpt = z.preprocess((v) => (v === '' ? undefined : v), z.coerce.date().nullable().optional());
const fechaReq = z.coerce.date({ required_error: 'Indique la fecha', invalid_type_error: 'Fecha no válida' });
const nombre = z.string().trim().min(2).max(120);
const activo = zBool.optional();
const idRef = zIdReq;
const texto = (max = 120) => z.string().trim().max(max).optional().nullable();
const codigo = z.string().trim().toUpperCase().min(1).max(20);
const placa = z.string().trim().toUpperCase().min(3, 'Placa inválida').max(15);
const km = zNum(z.number().min(0).max(99_999_999));
const kmOpt = zNum(z.number().min(0).max(99_999_999).optional().nullable());
const anio = zNum(z.number().int().min(1960).max(2100).optional().nullable());
const estadoVehiculo = z.enum(['ACTIVO', 'EN_TALLER', 'INACTIVO', 'VENDIDO']).optional();
/** '' del select => usar lo de la regla */
const metodoOpt = z.preprocess((v) => (v === '' ? null : v), z.enum(METODOS).nullable().optional());
const vidaAnios = zNum(z.number().int().min(1).max(40).optional().nullable());
const vidaKm = zNum(z.number().min(1000).max(20_000_000).optional().nullable());
/** Depreciación propia de la unidad: lo que se deje vacío sale de su regla. */
const depreciacionUnidad = { metodoDepreciacion: metodoOpt, vidaUtilAnios: vidaAnios, vidaUtilKm: vidaKm, valorResidual: zMontoOpt, excluirDepreciacion: zBool.optional(), fechaBaja: fechaOpt };
const reglaUnidad = (d: Record<string, unknown>) => {
  const m = d.metodoDepreciacion as string | null;
  if (m === 'POR_KM' && !d.vidaUtilKm) return null; // la regla puede traer los km
  if (m === 'TABLA') return null;
  if (d.valorResidual != null && d.costoCompra != null && Number(d.valorResidual) > Number(d.costoCompra)) return 'El valor residual no puede ser mayor que el costo de compra';
  if (d.fechaBaja && d.fechaCompra && new Date(d.fechaBaja as string) < new Date(d.fechaCompra as string)) return 'La fecha de baja es anterior a la de compra';
  return null;
};

const TIPOS_REMOLQUE = ['FURGON', 'PLATAFORMA', 'CISTERNA', 'PORTACONTENEDOR', 'LOWBOY', 'VOLTEO', 'OTRO'] as const;
const TIPOS_DOCUMENTO = ['SEGURO', 'TARJETA_CIRCULACION', 'CALCOMANIA', 'PERMISO_PESO', 'REVISION', 'OTRO'] as const;
const CATEGORIAS_REPUESTO = ['FILTROS', 'LUBRICANTES', 'FRENOS', 'SUSPENSION', 'ELECTRICO', 'MOTOR', 'TRANSMISION', 'LLANTAS', 'CARROCERIA', 'OTRO'] as const;

const terceroSchema = z.object({
  tipo: z.enum(['PERSONA', 'EMPRESA']).default('EMPRESA'),
  // Obligatorio al crear (en la edición el schema es parcial): CF si no tiene NIT
  nit: z.string({ required_error: 'El NIT es obligatorio (CF si no tiene)', invalid_type_error: 'El NIT es obligatorio (CF si no tiene)' }).trim().toUpperCase().min(1, 'El NIT es obligatorio (CF si no tiene)').regex(/^(CF|[0-9]+K?)$/, 'NIT inválido (números y K, o CF)'),
  cui: z.string().regex(/^\d{13}$/, 'CUI de 13 dígitos').optional().nullable(),
  nombres: texto(120),
  apellidos: texto(120),
  razonSocial: texto(200),
  nombreComercial: texto(200),
  contacto: texto(120),
  email: z.string().email().optional().nullable(),
  telefono: texto(20),
  direccion: texto(250),
  municipioId: zIdOpt,
  esCliente: zBool.optional(),
  esProveedor: zBool.optional(),
  esTaller: zBool.optional(),
  limiteCredito: zMontoOpt,
  diasCredito: zNum(z.number().int().min(0).optional()),
  activo,
});

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

  // ── Marcas (llantas, repuestos) ───────────────────────────
  {
    ruta: 'catalogos/marcas', modelo: 'marca', permiso: 'catalogos', entidad: 'Marca',
    schema: z.object({ nombre, activo }), busqueda: ['nombre'], orderBy: { nombre: 'asc' },
  },

  // ── Sedes (bases de operación) ────────────────────────────
  {
    ruta: 'catalogos/sucursales', modelo: 'sucursal', permiso: 'catalogos', entidad: 'Sede',
    // Respeta el número de sedes de la licencia. Al crearla se le da acceso a quien la creó.
    antesDeCrear: async (dto, { tx, licencia }) => {
      const { maxSucursales } = await licencia.estado();
      const activas = await tx.sucursal.count({ where: { activo: true } });
      if (activas >= maxSucursales) throw reglaNegocio('LIMITE_SUCURSALES', `Su licencia permite ${maxSucursales} ${maxSucursales === 1 ? 'sede' : 'sedes'} y ya tiene ${activas}. Para agregar otra, amplíe su licencia con ALEXUS.`);
      if (!dto.empresaId) dto.empresaId = (await tx.empresa.findFirst({ select: { id: true }, orderBy: { id: 'asc' } }))?.id;
      if (!dto.empresaId) throw reglaNegocio('EMPRESA_REQUERIDA', 'Primero configure los datos de la empresa.');
    },
    despuesDeCrear: async (s, { tx, ctx }) => {
      await tx.usuarioSucursal.upsert({ where: { usuarioId_sucursalId: { usuarioId: ctx.usuario.sub, sucursalId: s.id } }, create: { usuarioId: ctx.usuario.sub, sucursalId: s.id }, update: {} });
    },
    schema: z.object({
      empresaId: idRef.optional(), codigo: z.string().trim().toUpperCase().min(2).max(10), nombre,
      direccion: texto(250), telefono: texto(20), municipioId: zIdOpt, activo,
    }),
    busqueda: ['nombre', 'codigo'], orderBy: { nombre: 'asc' },
  },

  // ── Terceros: clientes, proveedores y talleres ────────────
  ...(['clientes', 'proveedores', 'talleres'] as const).map<OpcionesCrud>((tipo) => {
    const campo = tipo === 'clientes' ? 'esCliente' : tipo === 'proveedores' ? 'esProveedor' : 'esTaller';
    return {
      ruta: `terceros/${tipo}`, modelo: 'tercero', permiso: 'terceros',
      entidad: tipo === 'clientes' ? 'Cliente' : tipo === 'proveedores' ? 'Proveedor' : 'Taller',
      schema: terceroSchema,
      reglas: (t) => (t.razonSocial || t.nombres ? null : 'Indique nombres o razón social'),
      busqueda: ['nit', 'cui', 'nombres', 'apellidos', 'razonSocial', 'nombreComercial'],
      whereBase: { [campo]: true },
      datosBase: { [campo]: true, ...(tipo !== 'clientes' ? { esCliente: false } : {}) },
      orderBy: { id: 'desc' },
      // Municipio con su departamento: para mostrar "Mixco, Guatemala" y preseleccionar el formulario
      include: { municipio: { select: { id: true, nombre: true, departamentoId: true, departamento: { select: { nombre: true } } } } },
    };
  }),

  // ── Rutas y tarifas ───────────────────────────────────────
  {
    ruta: 'catalogos/rutas', modelo: 'ruta', permiso: 'catalogos', entidad: 'Ruta',
    schema: z.object({
      nombre, origen: nombre, destino: nombre,
      kmEstimados: km, horasEstimadas: zNum(z.number().min(0).max(999).optional().nullable()),
      peajesEstimados: zMontoOpt, viaticoEstimado: zMontoOpt,
      terreno: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['PLANO', 'ONDULADO', 'MONTANA']).optional()),
      subidaMetros: zNum(z.number().int().min(0).max(10_000).optional().nullable()),
      trafico: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['FLUIDO', 'NORMAL', 'LENTO', 'MUY_LENTO']).optional()),
      horasEspera: zNum(z.number().min(0).max(240).optional()),
      notas: z.string().trim().max(300).optional().nullable(),
      activo,
    }),
    busqueda: ['nombre', 'origen', 'destino'], orderBy: { nombre: 'asc' },
  },
  {
    ruta: 'tarifas', modelo: 'tarifa', permiso: 'tarifas', entidad: 'Tarifa',
    schema: z.object({
      clienteId: idRef, rutaId: zIdOpt, descripcion: texto(200),
      tipo: z.enum(['POR_VIAJE', 'POR_KM', 'POR_TONELADA']).default('POR_VIAJE'),
      monto: zMonto, vigenteDesde: z.coerce.date().optional(), vigenteHasta: fechaOpt, activo,
    }),
    busqueda: ['descripcion'], filtros: ['clienteId', 'rutaId'], orderBy: [{ clienteId: 'asc' }, { rutaId: 'asc' }],
    include: { cliente: { select: { razonSocial: true, nombreComercial: true, nombres: true } }, ruta: { select: { nombre: true, kmEstimados: true } } },
  },

  // ── Flota ─────────────────────────────────────────────────
  {
    ruta: 'flota/cabezales', modelo: 'cabezal', permiso: 'flota', entidad: 'Cabezal',
    // Respeta el número de cabezales de la licencia
    antesDeCrear: async (_dto, { tx, licencia }) => licencia.validarLimite('cabezales', await tx.cabezal.count({ where: { activo: true } })),
    schema: z.object({
      codigo, placa, marca: nombre, modelo: texto(60), anio, vin: texto(30), motor: texto(60), color: texto(30),
      ejes: zNum(z.number().int().min(2).max(6).optional()),
      odometro: kmOpt, capacidadTanque: zNum(z.number().min(0).max(9999).optional().nullable()),
      rendimientoEsperado: zNum(z.number().min(0).max(99).optional().nullable()),
      fechaCompra: fechaOpt, costoCompra: zMontoOpt, ...depreciacionUnidad, kmCompra: kmOpt,
      pilotoAsignadoId: zIdOpt, estado: estadoVehiculo, notas: texto(500), activo,
    }),
    reglas: reglaUnidad,
    busqueda: ['codigo', 'placa', 'marca', 'modelo'], filtros: ['pilotoAsignadoId'], porSucursal: true, orderBy: { codigo: 'asc' },
    include: { pilotoAsignado: { select: { id: true, empleado: { select: { nombres: true, apellidos: true } } } }, sucursal: { select: { nombre: true } } },
  },
  {
    ruta: 'flota/remolques', modelo: 'remolque', permiso: 'flota', entidad: 'Remolque',
    schema: z.object({
      codigo, placa, tipo: z.enum(TIPOS_REMOLQUE), marca: texto(60), anio,
      ejes: zNum(z.number().int().min(1).max(6).optional()),
      capacidadToneladas: zNum(z.number().min(0).max(999).optional().nullable()),
      largoMetros: zNum(z.number().min(0).max(99).optional().nullable()),
      fechaCompra: fechaOpt, costoCompra: zMontoOpt, ...depreciacionUnidad, estado: estadoVehiculo, notas: texto(500), activo,
    }),
    reglas: reglaUnidad,
    busqueda: ['codigo', 'placa', 'tipo', 'marca'], orderBy: { codigo: 'asc' },
  },
  {
    // Cómo se deprecia cada tipo de unidad, por marca, tipo de remolque y año del modelo (Finanzas › Depreciación)
    ruta: 'finanzas/reglas-depreciacion', modelo: 'reglaDepreciacion', permiso: 'finanzas.depreciacion', entidad: 'Regla de depreciación',
    schema: z.object({
      nombre, aplicaA: z.enum(['CABEZAL', 'REMOLQUE']),
      marca: z.preprocess((v) => (v === '' ? null : v), texto(60)),
      tipoRemolque: z.preprocess((v) => (v === '' ? null : v), z.enum(TIPOS_REMOLQUE).nullable().optional()),
      anioDesde: anio, anioHasta: anio,
      metodo: z.enum(METODOS).default('LINEA_RECTA'),
      vidaUtilAnios: vidaAnios, vidaUtilKm: vidaKm,
      valorResidualPct: zNum(z.number().min(0).max(90).optional()),
      tablaAnual: texto(200), notas: texto(300), activo,
    }),
    reglas: (d) => errorRegla(d as never),
    busqueda: ['nombre', 'marca'], orderBy: [{ aplicaA: 'asc' }, { nombre: 'asc' }],
  },
  {
    ruta: 'flota/documentos', modelo: 'documentoVehiculo', permiso: 'flota', entidad: 'Documento de vehículo',
    schema: z.object({
      cabezalId: zIdOpt, remolqueId: zIdOpt, tipo: z.enum(TIPOS_DOCUMENTO), numero: texto(60), emisor: texto(120),
      emitido: fechaOpt, vence: fechaReq, costo: zMontoOpt, archivoId: z.string().uuid().optional().nullable(), notas: texto(300), activo,
    }),
    reglas: (d) => (d.cabezalId || d.remolqueId ? (d.cabezalId && d.remolqueId ? 'Indique cabezal O remolque, no ambos' : null) : 'Indique el cabezal o el remolque'),
    busqueda: ['numero', 'emisor'], filtros: ['cabezalId', 'remolqueId'], orderBy: { vence: 'asc' },
    include: { cabezal: { select: { codigo: true, placa: true } }, remolque: { select: { codigo: true, placa: true } } },
  },

  // ── Pilotos ───────────────────────────────────────────────
  {
    ruta: 'pilotos', modelo: 'piloto', permiso: 'pilotos', entidad: 'Piloto',
    // Respeta el número de pilotos de la licencia
    antesDeCrear: async (dto, { tx, licencia }) => {
      await licencia.validarLimite('pilotos', await tx.piloto.count({ where: { activo: true } }));
      const e = await tx.empleado.findFirst({ where: { id: dto.empleadoId as number, estado: { not: 'BAJA' } } });
      if (!e) throw reglaNegocio('EMPLEADO_INVALIDO', 'Elija un empleado activo. Si no existe, créelo primero en Recursos humanos.');
      if (await tx.piloto.findUnique({ where: { empleadoId: e.id } })) throw reglaNegocio('PILOTO_DUPLICADO', 'Ese empleado ya está registrado como piloto');
    },
    schema: z.object({
      empleadoId: idRef,
      licenciaTipo: z.string().trim().toUpperCase().min(1).max(5),
      licenciaNumero: z.string().trim().min(3).max(30),
      licenciaVence: fechaReq,
      tipoSangre: texto(5), telefonoEmergencia: texto(20),
      pagoPorViaje: zMontoOpt, viaticoDiario: zMontoOpt, activo,
    }),
    busqueda: ['licenciaNumero'], filtros: ['empleadoId'], orderBy: { id: 'asc' },
    include: { empleado: { select: { codigo: true, nombres: true, apellidos: true, telefono: true, sucursalId: true, estado: true } }, cabezales: { select: { codigo: true, placa: true } } },
  },

  // ── Llantas ───────────────────────────────────────────────
  {
    ruta: 'llantas', modelo: 'llanta', permiso: 'llantas', entidad: 'Llanta',
    schema: z.object({
      codigo, marcaId: zIdOpt, modelo: texto(60), medida: z.string().trim().min(3).max(30),
      precio: zMonto, fechaCompra: fechaOpt, proveedorId: zIdOpt,
      reencauches: zNum(z.number().int().min(0).max(9).optional()),
      estado: z.enum(['EN_BODEGA', 'MONTADA', 'EN_REENCAUCHE', 'DESECHADA']).optional(), motivoBaja: texto(200), activo,
    }),
    busqueda: ['codigo', 'medida', 'modelo'], filtros: ['marcaId', 'proveedorId'], orderBy: { codigo: 'asc' },
    include: { marca: { select: { nombre: true } }, proveedor: { select: { razonSocial: true, nombreComercial: true } } },
  },

  // ── Mantenimiento (catálogos) ─────────────────────────────
  {
    ruta: 'mantenimiento/planes', modelo: 'planMantenimiento', permiso: 'catalogos', entidad: 'Plan de mantenimiento',
    schema: z.object({
      nombre, descripcion: texto(300), aplicaA: z.enum(['CABEZAL', 'REMOLQUE', 'AMBOS']).optional(),
      cadaKm: zNum(z.number().int().positive().optional().nullable()), cadaDias: zNum(z.number().int().positive().optional().nullable()),
      avisoKm: zNum(z.number().int().min(0).optional()), avisoDias: zNum(z.number().int().min(0).optional()), activo,
    }),
    reglas: (p) => (p.cadaKm || p.cadaDias ? null : 'Indique cada cuántos km o cada cuántos días'),
    busqueda: ['nombre'], orderBy: { nombre: 'asc' },
  },
  {
    ruta: 'mantenimiento/repuestos', modelo: 'repuesto', permiso: 'catalogos', entidad: 'Repuesto',
    schema: z.object({
      codigo, nombre, categoria: z.enum(CATEGORIAS_REPUESTO).optional().nullable(), marcaId: zIdOpt,
      unidad: z.string().trim().max(20).optional(), precioReferencia: zMontoOpt, activo,
    }),
    busqueda: ['codigo', 'nombre'], filtros: ['marcaId'], orderBy: { nombre: 'asc' },
    include: { marca: { select: { nombre: true } } },
  },

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
    include: { puesto: { select: { nombre: true } }, sucursal: { select: { nombre: true } }, piloto: { select: { id: true, licenciaVence: true } } },
    orderBy: { apellidos: 'asc' },
  },
];
