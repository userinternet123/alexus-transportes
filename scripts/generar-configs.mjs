// ─────────────────────────────────────────────────────────────────────────────
// Generador de configuraciones JSON para el motor de formularios del portal.
// UNA definición por módulo => <modulo>-list.json + <modulo>-form.json
// con el MISMO formato que ya consumen ListBase / FormBase / CrudModal.
//
//   node scripts/generar-configs.mjs      (salida: src/data/spvi/)
// ─────────────────────────────────────────────────────────────────────────────
import { mkdirSync, writeFileSync } from 'node:fs'

const SALIDA = new URL('../src/data/spvi/', import.meta.url)

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
const txt = (name, label, extra = {}) => ({ name, label, type: 'text', size: 'medium', placeholder: `Ingrese ${label.toLowerCase()}`, ...extra })
const num = (name, label, extra = {}) => ({ name, label, type: 'number', size: 'small', mask: 'number', ...extra })
const money = (name, label, extra = {}) => ({ name, label, type: 'money', size: 'small', mask: 'money', ...extra })
const chk = (name, label) => ({ name, label, type: 'checkbox', size: 'small' })
const fecha = (name, label, extra = {}) => ({ name, label, type: 'date', size: 'small', ...extra })

const MODULOS = [
  {
    clave: 'marcas', titulo: 'Marcas', endpoint: '/catalogos/marcas', icono: 'building', busqueda: 'Nombre de la marca',
    columnas: [['id', 'Código'], ['nombre', 'Marca']],
    campos: [txt('nombre', 'Nombre', { required: true, size: 'full' })],
  },
  {
    clave: 'presentaciones', singular: 'presentación', titulo: 'Presentaciones de venta', endpoint: '/catalogos/presentaciones', icono: 'building', busqueda: 'Unidad, caja, galón…',
    columnas: [['id', 'Código'], ['nombre', 'Presentación'], ['abreviatura', 'Abrev.']],
    campos: [txt('nombre', 'Nombre', { required: true }), txt('abreviatura', 'Abreviatura', { size: 'small' }), chk('permiteDecimales', 'Se vende fraccionado (libras, metros…)')],
  },
  {
    clave: 'categorias', singular: 'categoría', titulo: 'Categorías de producto', endpoint: '/catalogos/categorias', icono: 'building', busqueda: 'Categoría',
    columnas: [['id', 'Código'], ['nombre', 'Categoría']],
    campos: [txt('nombre', 'Nombre', { required: true, size: 'full' })],
  },
  {
    clave: 'grupos', singular: 'grupo', titulo: 'Grupos de producto', endpoint: '/catalogos/grupos', icono: 'building', busqueda: 'Grupo',
    columnas: [['id', 'Código'], ['nombre', 'Grupo'], ['categoria.nombre', 'Categoría']],
    campos: [sel('categoriaId', 'Categoría', '/catalogos/categorias', { required: true }), txt('nombre', 'Nombre', { required: true })],
  },
  {
    clave: 'subgrupos', singular: 'sub-agrupación', titulo: 'Sub-agrupaciones', endpoint: '/catalogos/subgrupos', icono: 'building', busqueda: 'Sub-agrupación',
    columnas: [['id', 'Código'], ['nombre', 'Sub-agrupación'], ['grupo.nombre', 'Grupo'], ['grupo.categoria.nombre', 'Categoría']],
    campos: [sel('grupoId', 'Grupo', '/catalogos/grupos', { required: true }), txt('nombre', 'Nombre', { required: true })],
  },
  {
    clave: 'productos', titulo: 'Productos', endpoint: '/productos', icono: 'clipboardList', busqueda: 'Nombre, SKU o código de barras',
    permisoPrecio: 'productos.precios',
    columnas: [['sku', 'SKU'], ['nombre', 'Producto'], ['marca.nombre', 'Marca'], ['presentacion.nombre', 'Presentación'], ['precioVenta', 'Precio', 'money'], ['existencia', 'Existencia']],
    campos: [
      txt('sku', 'SKU', { required: true, size: 'small' }), txt('codigoBarra', 'Código de barras', { keyDown: null }),
      txt('nombre', 'Nombre', { required: true, size: 'full' }), txt('descripcion', 'Descripción', { size: 'full' }),
      sel('subgrupoId', 'Sub-agrupación', '/catalogos/subgrupos', { required: true }), sel('marcaId', 'Marca', '/catalogos/marcas'),
      sel('presentacionId', 'Presentación', '/catalogos/presentaciones', { required: true }),
      money('precioVenta', 'Precio de venta (IVA incl.)', { required: true }), num('stockMinimo', 'Stock mínimo'),
      chk('manejaInventario', 'Controla existencias'), chk('exentoIva', 'Exento de IVA'),
    ],
  },
  {
    clave: 'clientes', singular: 'cliente', titulo: 'Clientes', endpoint: '/terceros/clientes', icono: 'user', busqueda: 'NIT, CUI, nombre o razón social',
    columnas: [['id', 'Código'], ['nit', 'NIT'], ['nombres', 'Nombres'], ['apellidos', 'Apellidos'], ['razonSocial', 'Razón social'], ['telefono', 'Teléfono']],
    campos: [
      { name: 'tipo', label: 'Tipo', type: 'radio', size: 'supersmall', options: [{ value: 'PERSONA', label: 'Persona', default: true }, { value: 'EMPRESA', label: 'Empresa' }] },
      txt('nit', 'NIT', { size: 'small' }), txt('cui', 'CUI / DPI', { mask: 'dpi', size: 'small' }),
      txt('nombres', 'Nombres', { visibleWhen: { name: 'tipo', value: 'PERSONA', showDefault: true } }),
      txt('apellidos', 'Apellidos', { visibleWhen: { name: 'tipo', value: 'PERSONA', showDefault: true } }),
      txt('razonSocial', 'Razón social', { size: 'full', visibleWhen: { name: 'tipo', value: 'EMPRESA' } }),
      txt('telefono', 'Teléfono', { mask: 'phone', size: 'small' }), txt('email', 'Correo'), txt('direccion', 'Dirección', { size: 'full' }),
      money('limiteCredito', 'Límite de crédito'), num('diasCredito', 'Días de crédito'),
    ],
  },
  {
    clave: 'proveedores', singular: 'proveedor', titulo: 'Proveedores', endpoint: '/terceros/proveedores', icono: 'building', busqueda: 'NIT o razón social',
    columnas: [['id', 'Código'], ['nit', 'NIT'], ['razonSocial', 'Razón social'], ['nombreComercial', 'Nombre comercial'], ['telefono', 'Teléfono']],
    campos: [
      txt('nit', 'NIT', { required: true, size: 'small' }), txt('razonSocial', 'Razón social', { required: true, size: 'full' }),
      txt('nombreComercial', 'Nombre comercial'), txt('telefono', 'Teléfono', { mask: 'phone', size: 'small' }),
      txt('email', 'Correo'), txt('direccion', 'Dirección', { size: 'full' }), num('diasCredito', 'Días de crédito'),
    ],
  },
  {
    clave: 'bodegas', titulo: 'Bodegas', endpoint: '/catalogos/bodegas', icono: 'building', busqueda: 'Bodega',
    columnas: [['id', 'Código'], ['nombre', 'Bodega']],
    campos: [txt('nombre', 'Nombre', { required: true }), chk('esPrincipal', 'Bodega principal de la sucursal')],
  },
  {
    clave: 'cajas', titulo: 'Cajas', endpoint: '/catalogos/cajas', icono: 'money', busqueda: 'Caja',
    columnas: [['id', 'Código'], ['nombre', 'Caja']],
    campos: [txt('nombre', 'Nombre', { required: true })],
  },
  {
    clave: 'politicas-descuento', singular: 'política de descuento', titulo: 'Políticas de descuento', endpoint: '/catalogos/politicas-descuento', icono: 'money', busqueda: '',
    columnas: [['rol.nombre', 'Rol'], ['producto.nombre', 'Producto'], ['subgrupo.nombre', 'Sub-agrupación'], ['porcentajeMax', '% máximo'], ['cantidadMaxima', 'Cant. máx.']],
    campos: [
      sel('rolId', 'Rol', '/seguridad/roles', { required: true }), sel('productoId', 'Producto (opcional)', '/productos'),
      sel('subgrupoId', 'Sub-agrupación (opcional)', '/catalogos/subgrupos'), num('porcentajeMax', '% máximo', { required: true }),
      num('cantidadMaxima', 'Cantidad máxima con descuento'), fecha('vigenteHasta', 'Vigente hasta'),
      { name: 'ayuda', type: 'label', label: 'Sin producto ni sub-agrupación = aplica a todo el catálogo para ese rol.' },
    ],
  },
  {
    clave: 'puestos', singular: 'puesto', titulo: 'Puestos', endpoint: '/rrhh/puestos', icono: 'usercog', busqueda: 'Puesto',
    columnas: [['id', 'Código'], ['nombre', 'Puesto'], ['departamento.nombre', 'Departamento'], ['salarioMinimo', 'Salario mín.', 'money'], ['salarioMaximo', 'Salario máx.', 'money']],
    campos: [sel('departamentoId', 'Departamento', '/rrhh/departamentos', { required: true }), txt('nombre', 'Nombre', { required: true }), money('salarioMinimo', 'Salario mínimo'), money('salarioMaximo', 'Salario máximo')],
  },
  {
    clave: 'empleados', singular: 'empleado', titulo: 'Empleados', endpoint: '/rrhh/empleados', icono: 'user', busqueda: 'Código, nombre o CUI',
    estadoCampo: 'estado',
    columnas: [['codigo', 'Código'], ['nombres', 'Nombres'], ['apellidos', 'Apellidos'], ['puesto.nombre', 'Puesto'], ['sucursal.nombre', 'Sucursal'], ['fechaIngreso', 'Ingreso']],
    campos: [
      txt('codigo', 'Código', { required: true, size: 'small' }), txt('cui', 'CUI / DPI', { required: true, mask: 'dpi' }),
      txt('nombres', 'Nombres', { required: true }), txt('apellidos', 'Apellidos', { required: true }),
      txt('nit', 'NIT', { size: 'small' }), txt('afiliacionIgss', 'Afiliación IGSS', { size: 'small' }), fecha('fechaNacimiento', 'Fecha de nacimiento'),
      txt('telefono', 'Teléfono', { mask: 'phone', size: 'small' }), txt('email', 'Correo'), txt('direccion', 'Dirección', { size: 'full' }),
      sel('sucursalId', 'Sucursal', '/catalogos/sucursales', { required: true }), sel('puestoId', 'Puesto', '/rrhh/puestos', { required: true }),
      fecha('fechaIngreso', 'Fecha de ingreso', { required: true }), money('salarioBase', 'Salario base mensual', { required: true }),
      money('bonificacionIncentivo', 'Bonificación incentivo'), num('porcentajeComision', '% comisión sobre ventas'),
      txt('banco', 'Banco', { size: 'small' }), txt('cuentaBancaria', 'Cuenta bancaria', { size: 'small' }),
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
console.log(`✔ ${MODULOS.length} módulos generados en src/data/spvi/`)
