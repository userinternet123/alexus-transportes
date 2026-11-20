// ─────────────────────────────────────────────────────────────────────────────
// Generador de configuraciones JSON para el motor de formularios del portal.
// UNA definición por catálogo => <clave>-list.json + <clave>-form.json
// con el MISMO formato que consumen ListBase / FormBase / CrudModal.
//
//   node scripts/generar-configs.mjs      (salida: src/data/transporte/)
//
// Cada entrada corresponde a un catálogo del CRUD genérico del API
// (api/src/modules/catalogos/catalogos.definiciones.ts).
// ─────────────────────────────────────────────────────────────────────────────
import { mkdirSync, writeFileSync } from 'node:fs'

const SALIDA = new URL('../src/data/transporte/', import.meta.url)

const ESTADO_ACTIVO = {
  filtro: { name: 'activo', type: 'select', options: [
    { label: 'Activos', value: 'true' }, { label: 'Inactivos', value: 'false' }, { label: 'Todos', value: 'todos' },
  ] },
  columna: { accessorKey: 'activo', header: 'Estado', type: 'badge' },
}

/** Campo select alimentado por el API (ver RemoteOptions en el README). */
const sel = (name, label, optionsUrl, extra = {}) => ({
  name, label, type: 'select', size: 'medium', optionsUrl, columnaDb: { codigo: 'id', nombre: 'nombre' }, ...extra,
})
/** Select con opciones fijas. */
const opciones = (name, label, lista, extra = {}) => ({
  name, label, type: 'select', size: 'medium', options: lista.map(([value, etiqueta]) => ({ value, label: etiqueta })), ...extra,
})
const txt = (name, label, extra = {}) => ({ name, label, type: 'text', size: 'medium', placeholder: `Ingrese ${label.toLowerCase()}`, ...extra })
const num = (name, label, extra = {}) => ({ name, label, type: 'number', size: 'small', mask: 'number', ...extra })
const money = (name, label, extra = {}) => ({ name, label, type: 'money', size: 'small', mask: 'money', ...extra })
const chk = (name, label) => ({ name, label, type: 'checkbox', size: 'small' })
const fecha = (name, label, extra = {}) => ({ name, label, type: 'date', size: 'small', ...extra })

const ESTADO_VEHICULO = [['ACTIVO', 'Activo'], ['EN_TALLER', 'En taller'], ['INACTIVO', 'Inactivo'], ['VENDIDO', 'Vendido']]
const NOMBRE_TERCERO = { codigo: 'id', nombre: 'razonSocial' }
const NOMBRE_EMPLEADO = { codigo: 'id', nombre: 'nombres' }

const terceroCampos = (esquema) => [
  opciones('tipo', 'Tipo', [['EMPRESA', 'Empresa'], ['PERSONA', 'Persona']], { required: true, size: 'small' }),
  txt('nit', 'NIT', { required: true, size: 'small', placeholder: 'CF si no tiene' }),
  txt('razonSocial', 'Razón social', { size: 'large' }),
  txt('nombreComercial', 'Nombre comercial'),
  txt('nombres', 'Nombres'), txt('apellidos', 'Apellidos'),
  txt('contacto', 'Persona de contacto'),
  txt('telefono', 'Teléfono', { size: 'small', mask: 'phone' }), txt('email', 'Correo', { type: 'email' }),
  txt('direccion', 'Dirección', { size: 'full' }),
  ...esquema,
]

const MODULOS = [
  // ── Clientes, proveedores y talleres ───────────────────────
  {
    clave: 'clientes', singular: 'cliente', titulo: 'Clientes', endpoint: '/terceros/clientes', icono: 'building', busqueda: 'NIT, nombre o razón social',
    columnas: [['nit', 'NIT'], ['razonSocial', 'Razón social'], ['nombreComercial', 'Nombre comercial'], ['contacto', 'Contacto'], ['telefono', 'Teléfono'], ['diasCredito', 'Días crédito']],
    campos: terceroCampos([money('limiteCredito', 'Límite de crédito'), num('diasCredito', 'Días de crédito')]),
  },
  {
    clave: 'proveedores', singular: 'proveedor', titulo: 'Proveedores', endpoint: '/terceros/proveedores', icono: 'building', busqueda: 'NIT o razón social',
    columnas: [['nit', 'NIT'], ['razonSocial', 'Razón social'], ['nombreComercial', 'Nombre comercial'], ['telefono', 'Teléfono']],
    campos: terceroCampos([]),
  },
  {
    clave: 'talleres', singular: 'taller', titulo: 'Talleres', endpoint: '/terceros/talleres', icono: 'wrench', busqueda: 'NIT o nombre del taller',
    columnas: [['nit', 'NIT'], ['razonSocial', 'Razón social'], ['nombreComercial', 'Nombre comercial'], ['telefono', 'Teléfono'], ['direccion', 'Dirección']],
    campos: terceroCampos([]),
  },

  // ── Rutas y tarifas ────────────────────────────────────────
  {
    clave: 'rutas', singular: 'ruta', titulo: 'Rutas', endpoint: '/catalogos/rutas', icono: 'map', busqueda: 'Nombre, origen o destino',
    columnas: [['nombre', 'Ruta'], ['origen', 'Origen'], ['destino', 'Destino'], ['kmEstimados', 'Km'], ['horasEstimadas', 'Horas'], ['terreno', 'Terreno'], ['trafico', 'Tráfico'], ['peajesEstimados', 'Peajes', 'money'], ['viaticoEstimado', 'Viático', 'money']],
    campos: [
      txt('nombre', 'Nombre de la ruta', { required: true, size: 'large', placeholder: 'Guatemala - Puerto Quetzal' }),
      txt('origen', 'Origen', { required: true }), txt('destino', 'Destino', { required: true }),
      num('kmEstimados', 'Km de ida', { required: true }), num('horasEstimadas', 'Horas de ida'),
      money('peajesEstimados', 'Peajes por sentido'), money('viaticoEstimado', 'Viático por sentido'),
      // Condiciones que usa el cotizador (combustible, desgaste y tiempo)
      opciones('terreno', 'Terreno', [['PLANO', 'Plano'], ['ONDULADO', 'Ondulado'], ['MONTANA', 'Montaña']], { size: 'small' }),
      num('subidaMetros', 'Subida acumulada de ida (m)'),
      opciones('trafico', 'Tráfico', [['FLUIDO', 'Fluido'], ['NORMAL', 'Normal'], ['LENTO', 'Lento'], ['MUY_LENTO', 'Muy lento']], { size: 'small' }),
      num('horasEspera', 'Horas de espera (colas, aduana, puerto)'),
      txt('notas', 'Notas de la ruta', { size: 'full', placeholder: 'Ej. cumbre de Alaska; cola en la portuaria' }),
    ],
  },
  {
    clave: 'tarifas', singular: 'tarifa', titulo: 'Tarifas por cliente', endpoint: '/tarifas', icono: 'money', busqueda: 'Descripción',
    columnas: [['cliente.razonSocial', 'Cliente'], ['ruta.nombre', 'Ruta'], ['tipo', 'Tipo'], ['monto', 'Monto', 'money'], ['vigenteDesde', 'Desde', 'date'], ['vigenteHasta', 'Hasta', 'date']],
    campos: [
      sel('clienteId', 'Cliente', '/terceros/clientes', { required: true, columnaDb: NOMBRE_TERCERO }),
      sel('rutaId', 'Ruta (vacío = tarifa general del cliente)', '/catalogos/rutas'),
      opciones('tipo', 'Tipo de tarifa', [['POR_VIAJE', 'Por viaje'], ['POR_KM', 'Por kilómetro'], ['POR_TONELADA', 'Por tonelada']], { required: true, size: 'small' }),
      money('monto', 'Monto (Q)', { required: true }),
      fecha('vigenteDesde', 'Vigente desde'), fecha('vigenteHasta', 'Vigente hasta'),
      txt('descripcion', 'Descripción', { size: 'full' }),
    ],
  },

  // ── Flota ──────────────────────────────────────────────────
  {
    clave: 'cabezales', singular: 'cabezal', titulo: 'Cabezales', endpoint: '/flota/cabezales', icono: 'truck', busqueda: 'Código, placa, marca o modelo',
    columnas: [['codigo', 'Código'], ['placa', 'Placa'], ['marca', 'Marca'], ['modelo', 'Modelo'], ['anio', 'Año'], ['odometro', 'Odómetro (km)'], ['pilotoAsignado.empleado.nombres', 'Piloto'], ['estado', 'Situación']],
    campos: [
      txt('codigo', 'Código interno', { required: true, size: 'small', placeholder: 'C-01' }),
      txt('placa', 'Placa', { required: true, size: 'small', placeholder: 'C123BCD' }),
      txt('marca', 'Marca', { required: true, placeholder: 'Freightliner, Kenworth, International…' }),
      txt('modelo', 'Modelo'), num('anio', 'Año'), txt('vin', 'VIN / chasis'), txt('motor', 'Motor'), txt('color', 'Color', { size: 'small' }),
      num('ejes', 'Ejes'), num('odometro', 'Odómetro actual (km)'),
      num('capacidadTanque', 'Tanque (galones)'), num('rendimientoEsperado', 'Rendimiento esperado (km/gal)'),
      fecha('fechaCompra', 'Fecha de compra'), money('costoCompra', 'Costo de compra'), num('vidaUtilAnios', 'Vida útil (años)'),
      sel('pilotoAsignadoId', 'Piloto asignado', '/pilotos', { columnaDb: { codigo: 'id', nombre: 'empleado.nombres' } }),
      opciones('estado', 'Situación', ESTADO_VEHICULO, { size: 'small' }),
      txt('notas', 'Notas', { size: 'full' }),
    ],
  },
  {
    clave: 'remolques', singular: 'remolque', titulo: 'Remolques', endpoint: '/flota/remolques', icono: 'truck', busqueda: 'Código, placa o tipo',
    columnas: [['codigo', 'Código'], ['placa', 'Placa'], ['tipo', 'Tipo'], ['marca', 'Marca'], ['anio', 'Año'], ['ejes', 'Ejes'], ['capacidadToneladas', 'Capacidad (t)'], ['estado', 'Situación']],
    campos: [
      txt('codigo', 'Código interno', { required: true, size: 'small', placeholder: 'R-01' }),
      txt('placa', 'Placa', { required: true, size: 'small' }),
      opciones('tipo', 'Tipo', [['FURGON', 'Furgón'], ['PLATAFORMA', 'Plataforma'], ['CISTERNA', 'Cisterna'], ['PORTACONTENEDOR', 'Portacontenedor'], ['LOWBOY', 'Lowboy'], ['VOLTEO', 'Volteo'], ['OTRO', 'Otro']], { required: true }),
      txt('marca', 'Marca'), num('anio', 'Año'), num('ejes', 'Ejes'),
      num('capacidadToneladas', 'Capacidad (toneladas)'), num('largoMetros', 'Largo (m)'),
      fecha('fechaCompra', 'Fecha de compra'), money('costoCompra', 'Costo de compra'),
      opciones('estado', 'Situación', ESTADO_VEHICULO, { size: 'small' }),
      txt('notas', 'Notas', { size: 'full' }),
    ],
  },
  {
    clave: 'documentos-vehiculo', singular: 'documento', titulo: 'Documentos de vehículos', endpoint: '/flota/documentos', icono: 'clipboardList', busqueda: 'Número o emisor',
    columnas: [['tipo', 'Documento'], ['cabezal.codigo', 'Cabezal'], ['remolque.codigo', 'Remolque'], ['numero', 'Número'], ['emisor', 'Emisor'], ['vence', 'Vence', 'date'], ['costo', 'Costo', 'money']],
    campos: [
      opciones('tipo', 'Tipo de documento', [['SEGURO', 'Seguro'], ['TARJETA_CIRCULACION', 'Tarjeta de circulación'], ['CALCOMANIA', 'Calcomanía'], ['PERMISO_PESO', 'Permiso de peso y dimensiones'], ['REVISION', 'Revisión técnica'], ['OTRO', 'Otro']], { required: true }),
      sel('cabezalId', 'Cabezal', '/flota/cabezales', { columnaDb: { codigo: 'id', nombre: 'codigo' } }),
      sel('remolqueId', 'Remolque', '/flota/remolques', { columnaDb: { codigo: 'id', nombre: 'codigo' } }),
      txt('numero', 'Número de póliza o documento'), txt('emisor', 'Emisor (aseguradora, SAT…)'),
      fecha('emitido', 'Emitido'), fecha('vence', 'Vence', { required: true }), money('costo', 'Costo'),
      txt('notas', 'Notas', { size: 'full' }),
    ],
  },

  // ── Pilotos ────────────────────────────────────────────────
  {
    clave: 'pilotos', singular: 'piloto', titulo: 'Pilotos', endpoint: '/pilotos', icono: 'user', busqueda: 'Número de licencia',
    columnas: [['empleado.codigo', 'Código'], ['empleado.nombres', 'Nombres'], ['empleado.apellidos', 'Apellidos'], ['licenciaTipo', 'Licencia'], ['licenciaNumero', 'Número'], ['licenciaVence', 'Vence', 'date'], ['pagoPorViaje', 'Pago por viaje', 'money'], ['empleado.telefono', 'Teléfono']],
    campos: [
      sel('empleadoId', 'Empleado (créelo antes en Recursos humanos)', '/rrhh/empleados', { required: true, columnaDb: NOMBRE_EMPLEADO, size: 'large' }),
      txt('licenciaTipo', 'Tipo de licencia', { required: true, size: 'small', placeholder: 'A, B, C…' }),
      txt('licenciaNumero', 'Número de licencia', { required: true }),
      fecha('licenciaVence', 'Licencia vence', { required: true }),
      txt('tipoSangre', 'Tipo de sangre', { size: 'small' }), txt('telefonoEmergencia', 'Teléfono de emergencia', { size: 'small', mask: 'phone' }),
      money('pagoPorViaje', 'Pago (bono) por viaje'), money('viaticoDiario', 'Viático diario'),
    ],
  },

  // ── Llantas ────────────────────────────────────────────────
  {
    clave: 'llantas', singular: 'llanta', titulo: 'Llantas', endpoint: '/llantas', icono: 'circle', busqueda: 'Serie, medida o modelo',
    columnas: [['codigo', 'Serie / DOT'], ['marca.nombre', 'Marca'], ['medida', 'Medida'], ['precio', 'Precio', 'money'], ['reencauches', 'Reencauches'], ['kmAcumulados', 'Km'], ['estado', 'Situación']],
    campos: [
      txt('codigo', 'Serie / DOT / número interno', { required: true }),
      sel('marcaId', 'Marca', '/catalogos/marcas'), txt('modelo', 'Modelo'),
      txt('medida', 'Medida', { required: true, size: 'small', placeholder: '11R22.5' }),
      money('precio', 'Precio', { required: true }), fecha('fechaCompra', 'Fecha de compra'),
      sel('proveedorId', 'Proveedor', '/terceros/proveedores', { columnaDb: NOMBRE_TERCERO }),
      num('reencauches', 'Reencauches'),
      opciones('estado', 'Situación', [['EN_BODEGA', 'En bodega'], ['MONTADA', 'Montada'], ['EN_REENCAUCHE', 'En reencauche'], ['DESECHADA', 'Desechada']], { size: 'small' }),
    ],
  },

  // ── Mantenimiento ──────────────────────────────────────────
  {
    clave: 'planes-mantenimiento', singular: 'plan', titulo: 'Planes de mantenimiento', endpoint: '/mantenimiento/planes', icono: 'wrench', busqueda: 'Nombre del plan',
    columnas: [['nombre', 'Plan'], ['aplicaA', 'Aplica a'], ['cadaKm', 'Cada km'], ['cadaDias', 'Cada días'], ['avisoKm', 'Aviso (km)'], ['avisoDias', 'Aviso (días)']],
    campos: [
      txt('nombre', 'Nombre', { required: true, size: 'large' }),
      opciones('aplicaA', 'Aplica a', [['CABEZAL', 'Cabezales'], ['REMOLQUE', 'Remolques'], ['AMBOS', 'Ambos']], { size: 'small' }),
      num('cadaKm', 'Cada cuántos km'), num('cadaDias', 'Cada cuántos días'),
      num('avisoKm', 'Avisar con km de anticipación'), num('avisoDias', 'Avisar con días de anticipación'),
      txt('descripcion', 'Descripción', { size: 'full' }),
    ],
  },
  {
    clave: 'repuestos', singular: 'repuesto', titulo: 'Repuestos', endpoint: '/mantenimiento/repuestos', icono: 'wrench', busqueda: 'Código o nombre',
    columnas: [['codigo', 'Código'], ['nombre', 'Repuesto'], ['categoria', 'Categoría'], ['marca.nombre', 'Marca'], ['unidad', 'Unidad'], ['precioReferencia', 'Precio ref.', 'money']],
    campos: [
      txt('codigo', 'Código', { required: true, size: 'small' }), txt('nombre', 'Nombre', { required: true, size: 'large' }),
      opciones('categoria', 'Categoría', [['FILTROS', 'Filtros'], ['LUBRICANTES', 'Lubricantes'], ['FRENOS', 'Frenos'], ['SUSPENSION', 'Suspensión'], ['ELECTRICO', 'Eléctrico'], ['MOTOR', 'Motor'], ['TRANSMISION', 'Transmisión'], ['LLANTAS', 'Llantas'], ['CARROCERIA', 'Carrocería'], ['OTRO', 'Otro']]),
      sel('marcaId', 'Marca', '/catalogos/marcas'), txt('unidad', 'Unidad', { size: 'small', placeholder: 'UNIDAD, GALÓN, JUEGO' }),
      money('precioReferencia', 'Precio de referencia'),
    ],
  },
  {
    clave: 'marcas', titulo: 'Marcas', endpoint: '/catalogos/marcas', icono: 'building', busqueda: 'Nombre de la marca',
    columnas: [['id', 'Código'], ['nombre', 'Marca']],
    campos: [txt('nombre', 'Nombre', { required: true, size: 'full' })],
  },

  // ── Organización ───────────────────────────────────────────
  {
    clave: 'sucursales', singular: 'sede', titulo: 'Sedes', endpoint: '/catalogos/sucursales', icono: 'building', busqueda: 'Nombre o código de la sede',
    columnas: [['codigo', 'Código'], ['nombre', 'Sede'], ['direccion', 'Dirección'], ['telefono', 'Teléfono']],
    campos: [
      txt('codigo', 'Código', { required: true, size: 'small', placeholder: 'S01' }), txt('nombre', 'Nombre', { required: true }),
      txt('direccion', 'Dirección', { size: 'full' }), txt('telefono', 'Teléfono', { size: 'small', mask: 'phone' }),
    ],
  },
  {
    clave: 'departamentos', singular: 'área', titulo: 'Áreas de la empresa', endpoint: '/rrhh/departamentos', icono: 'usercog', busqueda: 'Área',
    columnas: [['id', 'Código'], ['nombre', 'Área']],
    campos: [txt('nombre', 'Nombre', { required: true, size: 'full' })],
  },
  {
    clave: 'puestos', singular: 'puesto', titulo: 'Puestos', endpoint: '/rrhh/puestos', icono: 'usercog', busqueda: 'Puesto',
    columnas: [['id', 'Código'], ['nombre', 'Puesto'], ['departamento.nombre', 'Área'], ['salarioMinimo', 'Salario mín.', 'money'], ['salarioMaximo', 'Salario máx.', 'money']],
    campos: [sel('departamentoId', 'Área', '/rrhh/departamentos', { required: true }), txt('nombre', 'Nombre', { required: true }), money('salarioMinimo', 'Salario mínimo'), money('salarioMaximo', 'Salario máximo')],
  },
  {
    clave: 'empleados', singular: 'empleado', titulo: 'Empleados', endpoint: '/rrhh/empleados', icono: 'user', busqueda: 'Código, nombre o CUI', estadoCampo: 'estado',
    columnas: [['codigo', 'Código'], ['nombres', 'Nombres'], ['apellidos', 'Apellidos'], ['puesto.nombre', 'Puesto'], ['sucursal.nombre', 'Sede'], ['telefono', 'Teléfono'], ['salarioBase', 'Salario', 'money']],
    campos: [
      txt('codigo', 'Código', { required: true, size: 'small' }),
      txt('nombres', 'Nombres', { required: true }), txt('apellidos', 'Apellidos', { required: true }),
      txt('cui', 'CUI (DPI)', { required: true, size: 'small', mask: 'number' }), txt('nit', 'NIT', { required: true, size: 'small' }),
      txt('afiliacionIgss', 'Afiliación IGSS', { size: 'small' }), fecha('fechaNacimiento', 'Fecha de nacimiento'),
      txt('telefono', 'Teléfono', { size: 'small', mask: 'phone' }), txt('email', 'Correo', { type: 'email' }),
      txt('direccion', 'Dirección', { size: 'full' }),
      sel('sucursalId', 'Sede', '/catalogos/sucursales', { required: true }), sel('puestoId', 'Puesto', '/rrhh/puestos', { required: true }),
      fecha('fechaIngreso', 'Fecha de ingreso', { required: true }),
      money('salarioBase', 'Salario base mensual', { required: true }), money('bonificacionIncentivo', 'Bonificación incentivo'),
      txt('banco', 'Banco'), txt('cuentaBancaria', 'Cuenta bancaria'),
    ],
  },
]

function lista(m) {
  const campoEstado = m.estadoCampo ?? 'activo'
  return {
    title: '',
    module: m.titulo,
    endpoint: m.endpoint,
    showSearch: true,
    showPagination: true,
    searchPlaceHolder: m.busqueda,
    headerBtn: { label: `Agregar ${m.singular ?? m.titulo.toLowerCase().replace(/s$/, '')}`, action: 'create', icon: 'plus', size: 35, variant: 'primary' },
    filters: campoEstado === 'activo' ? [ESTADO_ACTIVO.filtro] : [],
    columns: [
      ...m.columnas.map(([accessorKey, header, type]) => ({ accessorKey, header, ...(type ? { type } : {}) })),
      campoEstado === 'activo' ? ESTADO_ACTIVO.columna : { accessorKey: 'estado', header: 'Estado', type: 'badge' },
    ],
    actions: [
      {
        estado: ['ACTIVO'], columnaDb: campoEstado,
        options: [
          { action: 'view', icon: 'eye', variant: 'text-green-600', tamano: 'icon' },
          { action: 'edit', icon: 'edit', variant: 'na', tamano: 'icon' },
          { action: 'delete', icon: 'trash', variant: 'text-red-600', tamano: 'icon' },
        ],
      },
      { estado: ['INACTIVO', 'BAJA', 'SUSPENDIDO'], columnaDb: campoEstado, options: [{ action: 'edit', icon: 'edit', variant: 'na', tamano: 'icon' }] },
    ],
  }
}

function formulario(m) {
  return [
    {
      subgrupo: `Información de ${m.titulo.toLowerCase()}`,
      icon: m.icono,
      description: 'Los campos marcados con * son obligatorios',
      dataField: m.clave,
      type: 'table',
      defaultOpen: true,
      className: 'mb-4',
      fields: [{ name: 'id', label: 'Código', size: 'small', readOnly: true, placeholder: 'Se genera automáticamente' }, ...m.campos],
    },
  ]
}

/** Botones CRUD en el formato de sidebarMenu (create/edit/delete). */
export function botones(m) {
  const n = m.clave.replace(/(^|-)(\w)/g, (_, __, c) => c.toUpperCase())
  return [
    { name: `btnGuardar${n}`, action: 'create', url: m.endpoint, method: 'POST', refreshPage: true, icon: 'save', msgOk: 'Registro creado', msgFaild: 'No se pudo guardar', variant: 'success', type: 'button', tamano: 'large', requiredFields: m.campos.filter((c) => c.required).map((c) => c.name) },
    { name: `btnEditar${n}`, action: 'edit', url: `${m.endpoint}/:id`, method: 'PUT', refreshPage: true, icon: 'save', msgOk: 'Cambios guardados', msgFaild: 'No se pudieron guardar los cambios', variant: 'success', type: 'button', tamano: 'large', requiredFields: [] },
    { name: `btnEliminar${n}`, action: 'delete', url: `${m.endpoint}/:id`, method: 'DELETE', refreshPage: true, icon: 'delete', msgOk: 'Registro desactivado', msgFaild: 'No se pudo desactivar', variant: 'success', type: 'button', tamano: 'large', confirm: true, confirmMessage: 'El registro quedará inactivo (no se borra el historial).' },
  ]
}

mkdirSync(SALIDA, { recursive: true })
const indice = {}
for (const m of MODULOS) {
  writeFileSync(new URL(`${m.clave}-list.json`, SALIDA), JSON.stringify(lista(m), null, 2) + '\n')
  writeFileSync(new URL(`${m.clave}-form.json`, SALIDA), JSON.stringify(formulario(m), null, 2) + '\n')
  indice[m.clave] = { titulo: m.titulo, endpoint: m.endpoint, botones: botones(m) }
}
writeFileSync(new URL('_indice.json', SALIDA), JSON.stringify(indice, null, 2) + '\n')
console.log(`✔ ${MODULOS.length} catálogos generados en src/data/transporte/`)
