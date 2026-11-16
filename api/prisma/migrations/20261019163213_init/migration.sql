-- CreateEnum
CREATE TYPE "TipoTercero" AS ENUM ('PERSONA', 'EMPRESA');

-- CreateEnum
CREATE TYPE "TipoMovimiento" AS ENUM ('INVENTARIO_INICIAL', 'ENTRADA_COMPRA', 'SALIDA_VENTA', 'ANULACION_VENTA', 'DEVOLUCION_CLIENTE', 'ANULACION_COMPRA', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO', 'TRASLADO_SALIDA', 'TRASLADO_ENTRADA');

-- CreateEnum
CREATE TYPE "EstadoDocumento" AS ENUM ('BORRADOR', 'CONFIRMADO', 'ANULADO');

-- CreateEnum
CREATE TYPE "TipoVenta" AS ENUM ('VENTA', 'COTIZACION');

-- CreateEnum
CREATE TYPE "EstadoVenta" AS ENUM ('BORRADOR', 'CONFIRMADA', 'ANULADA', 'CONVERTIDA', 'VENCIDA');

-- CreateEnum
CREATE TYPE "EstadoFel" AS ENUM ('NO_APLICA', 'PENDIENTE', 'CERTIFICADO', 'ERROR', 'ANULADO');

-- CreateEnum
CREATE TYPE "MedioPago" AS ENUM ('EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'CHEQUE', 'CREDITO', 'VALE');

-- CreateEnum
CREATE TYPE "EstadoCajaSesion" AS ENUM ('ABIERTA', 'CERRADA');

-- CreateEnum
CREATE TYPE "TipoMovimientoCaja" AS ENUM ('INGRESO', 'EGRESO', 'RETIRO_PARCIAL');

-- CreateEnum
CREATE TYPE "EstadoEmpleado" AS ENUM ('ACTIVO', 'SUSPENDIDO', 'BAJA');

-- CreateEnum
CREATE TYPE "TipoAusencia" AS ENUM ('VACACIONES', 'PERMISO_CON_GOCE', 'PERMISO_SIN_GOCE', 'SUSPENSION_IGSS', 'FALTA_INJUSTIFICADA');

-- CreateEnum
CREATE TYPE "EstadoPlanilla" AS ENUM ('BORRADOR', 'APROBADA', 'PAGADA', 'ANULADA');

-- CreateTable
CREATE TABLE "empresas" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "nombre_comercial" TEXT,
    "nit" TEXT NOT NULL,
    "direccion" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "logo_url" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "empresas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sucursales" (
    "id" SERIAL NOT NULL,
    "empresa_id" INTEGER NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "direccion" TEXT,
    "telefono" TEXT,
    "municipio_id" INTEGER,
    "establecimiento_fel" INTEGER,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sucursales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bodegas" (
    "id" SERIAL NOT NULL,
    "sucursal_id" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "es_principal" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "bodegas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "secciones" (
    "id" SERIAL NOT NULL,
    "bodega_id" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "secciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parametros_sistema" (
    "clave" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'string',
    "modulo" TEXT NOT NULL,
    "descripcion" TEXT,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parametros_sistema_pkey" PRIMARY KEY ("clave")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "nombre" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "debe_cambiar_password" BOOLEAN NOT NULL DEFAULT false,
    "intentos_fallidos" INTEGER NOT NULL DEFAULT 0,
    "bloqueado_hasta" TIMESTAMP(3),
    "ultimo_login" TIMESTAMP(3),
    "empleado_id" INTEGER,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "es_sistema" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permisos" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "modulo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,

    CONSTRAINT "permisos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles_permisos" (
    "rol_id" INTEGER NOT NULL,
    "permiso_id" INTEGER NOT NULL,

    CONSTRAINT "roles_permisos_pkey" PRIMARY KEY ("rol_id","permiso_id")
);

-- CreateTable
CREATE TABLE "usuarios_roles" (
    "usuario_id" INTEGER NOT NULL,
    "rol_id" INTEGER NOT NULL,

    CONSTRAINT "usuarios_roles_pkey" PRIMARY KEY ("usuario_id","rol_id")
);

-- CreateTable
CREATE TABLE "usuarios_sucursales" (
    "usuario_id" INTEGER NOT NULL,
    "sucursal_id" INTEGER NOT NULL,
    "predeterminada" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "usuarios_sucursales_pkey" PRIMARY KEY ("usuario_id","sucursal_id")
);

-- CreateTable
CREATE TABLE "sesiones_refresh" (
    "id" TEXT NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expira_en" TIMESTAMP(3) NOT NULL,
    "revocado" BOOLEAN NOT NULL DEFAULT false,
    "ip" TEXT,
    "user_agent" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sesiones_refresh_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" BIGSERIAL NOT NULL,
    "usuario_id" INTEGER,
    "sucursal_id" INTEGER,
    "accion" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidad_id" TEXT,
    "antes" JSONB,
    "despues" JSONB,
    "ip" TEXT,
    "request_id" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paises" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "codigo_iso" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "paises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departamentos" (
    "id" SERIAL NOT NULL,
    "pais_id" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "departamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "municipios" (
    "id" SERIAL NOT NULL,
    "departamento_id" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "municipios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terceros" (
    "id" SERIAL NOT NULL,
    "tipo" "TipoTercero" NOT NULL DEFAULT 'PERSONA',
    "nit" TEXT,
    "cui" TEXT,
    "nombres" TEXT,
    "apellidos" TEXT,
    "razon_social" TEXT,
    "nombre_comercial" TEXT,
    "email" TEXT,
    "telefono" TEXT,
    "direccion" TEXT,
    "municipio_id" INTEGER,
    "es_cliente" BOOLEAN NOT NULL DEFAULT true,
    "es_proveedor" BOOLEAN NOT NULL DEFAULT false,
    "limite_credito" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "dias_credito" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "legacy_id" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "terceros_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categorias" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "categorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grupos" (
    "id" SERIAL NOT NULL,
    "categoria_id" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "grupos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subgrupos" (
    "id" SERIAL NOT NULL,
    "grupo_id" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "subgrupos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marcas" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "marcas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "presentaciones" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "abreviatura" TEXT,
    "permite_decimales" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "presentaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "productos" (
    "id" SERIAL NOT NULL,
    "sku" TEXT NOT NULL,
    "codigo_barra" TEXT,
    "codigo_proveedor" TEXT,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "subgrupo_id" INTEGER NOT NULL,
    "marca_id" INTEGER,
    "presentacion_id" INTEGER NOT NULL,
    "precio_venta" DECIMAL(14,2) NOT NULL,
    "stock_minimo" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "maneja_inventario" BOOLEAN NOT NULL DEFAULT true,
    "exento_iva" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "legacy_id" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "productos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historial_precios" (
    "id" SERIAL NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "precio_anterior" DECIMAL(14,2) NOT NULL,
    "precio_nuevo" DECIMAL(14,2) NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historial_precios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "politicas_descuento" (
    "id" SERIAL NOT NULL,
    "rol_id" INTEGER NOT NULL,
    "producto_id" INTEGER,
    "subgrupo_id" INTEGER,
    "porcentaje_max" DECIMAL(5,2) NOT NULL,
    "cantidad_maxima" DECIMAL(14,3),
    "vigente_desde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vigente_hasta" TIMESTAMP(3),
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "politicas_descuento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "existencias" (
    "id" SERIAL NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "bodega_id" INTEGER NOT NULL,
    "cantidad" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "costo_promedio" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "existencias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimientos_inventario" (
    "id" BIGSERIAL NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bodega_id" INTEGER NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "tipo" "TipoMovimiento" NOT NULL,
    "cantidad" DECIMAL(14,3) NOT NULL,
    "costo_unitario" DECIMAL(14,4) NOT NULL,
    "saldo_cantidad" DECIMAL(14,3) NOT NULL,
    "saldo_costo_promedio" DECIMAL(14,4) NOT NULL,
    "documento_tipo" TEXT NOT NULL,
    "documento_id" INTEGER NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "observacion" TEXT,

    CONSTRAINT "movimientos_inventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ajustes" (
    "id" SERIAL NOT NULL,
    "bodega_id" INTEGER NOT NULL,
    "motivo" TEXT NOT NULL,
    "observacion" TEXT,
    "estado" "EstadoDocumento" NOT NULL DEFAULT 'BORRADOR',
    "usuario_id" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ajustes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ajustes_detalle" (
    "id" SERIAL NOT NULL,
    "ajuste_id" INTEGER NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "cantidad_sistema" DECIMAL(14,3) NOT NULL,
    "cantidad_fisica" DECIMAL(14,3) NOT NULL,
    "diferencia" DECIMAL(14,3) NOT NULL,

    CONSTRAINT "ajustes_detalle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traslados" (
    "id" SERIAL NOT NULL,
    "sucursal_origen_id" INTEGER NOT NULL,
    "bodega_origen_id" INTEGER NOT NULL,
    "sucursal_destino_id" INTEGER NOT NULL,
    "bodega_destino_id" INTEGER NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'EN_TRANSITO',
    "usuario_envia_id" INTEGER NOT NULL,
    "usuario_recibe_id" INTEGER,
    "fecha_envio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_recepcion" TIMESTAMP(3),
    "observacion" TEXT,

    CONSTRAINT "traslados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traslados_detalle" (
    "id" SERIAL NOT NULL,
    "traslado_id" INTEGER NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "cantidad" DECIMAL(14,3) NOT NULL,
    "costo_unitario" DECIMAL(14,4) NOT NULL,

    CONSTRAINT "traslados_detalle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compras" (
    "id" SERIAL NOT NULL,
    "sucursal_id" INTEGER NOT NULL,
    "bodega_id" INTEGER NOT NULL,
    "proveedor_id" INTEGER NOT NULL,
    "serie_factura" TEXT NOT NULL,
    "numero_factura" TEXT NOT NULL,
    "fecha_factura" DATE NOT NULL,
    "fecha_contable" DATE NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "descuento" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL,
    "estado" "EstadoDocumento" NOT NULL DEFAULT 'CONFIRMADO',
    "usuario_id" INTEGER NOT NULL,
    "observacion" TEXT,
    "legacy_id" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compras_detalle" (
    "id" SERIAL NOT NULL,
    "compra_id" INTEGER NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "cantidad" DECIMAL(14,3) NOT NULL,
    "costo_unitario" DECIMAL(14,4) NOT NULL,
    "descuento" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "compras_detalle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "secuencias_documento" (
    "id" SERIAL NOT NULL,
    "sucursal_id" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "serie" TEXT NOT NULL,
    "siguiente" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "secuencias_documento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ventas" (
    "id" SERIAL NOT NULL,
    "sucursal_id" INTEGER NOT NULL,
    "bodega_id" INTEGER NOT NULL,
    "caja_sesion_id" INTEGER,
    "tipo" "TipoVenta" NOT NULL,
    "estado" "EstadoVenta" NOT NULL DEFAULT 'BORRADOR',
    "serie" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_contable" DATE NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "vendedor_id" INTEGER NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "descuento_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "iva_incluido" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL,
    "costo_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cambio" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "valida_hasta" TIMESTAMP(3),
    "cotizacion_origen_id" INTEGER,
    "fel_estado" "EstadoFel" NOT NULL DEFAULT 'NO_APLICA',
    "fel_uuid" TEXT,
    "fel_serie" TEXT,
    "fel_numero" TEXT,
    "fel_mensaje" TEXT,
    "observaciones" TEXT,
    "motivo_anulacion" TEXT,
    "anulada_por_id" INTEGER,
    "anulada_en" TIMESTAMP(3),
    "legacy_id" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ventas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ventas_detalle" (
    "id" SERIAL NOT NULL,
    "venta_id" INTEGER NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "descripcion" TEXT NOT NULL,
    "cantidad" DECIMAL(14,3) NOT NULL,
    "precio_lista" DECIMAL(14,2) NOT NULL,
    "porcentaje_descuento" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "descuento" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "precio_unitario" DECIMAL(14,2) NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "costo_unitario" DECIMAL(14,4) NOT NULL DEFAULT 0,

    CONSTRAINT "ventas_detalle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ventas_pagos" (
    "id" SERIAL NOT NULL,
    "venta_id" INTEGER NOT NULL,
    "medio_pago" "MedioPago" NOT NULL,
    "monto" DECIMAL(14,2) NOT NULL,
    "referencia" TEXT,

    CONSTRAINT "ventas_pagos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devoluciones" (
    "id" SERIAL NOT NULL,
    "venta_id" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_contable" DATE NOT NULL,
    "motivo" TEXT NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "reingresa_inventario" BOOLEAN NOT NULL DEFAULT true,
    "usuario_id" INTEGER NOT NULL,
    "fel_uuid" TEXT,

    CONSTRAINT "devoluciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devoluciones_detalle" (
    "id" SERIAL NOT NULL,
    "devolucion_id" INTEGER NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "cantidad" DECIMAL(14,3) NOT NULL,
    "monto" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "devoluciones_detalle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cajas" (
    "id" SERIAL NOT NULL,
    "sucursal_id" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "cajas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "caja_sesiones" (
    "id" SERIAL NOT NULL,
    "caja_id" INTEGER NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "fecha_contable" DATE NOT NULL,
    "abierta_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "monto_apertura" DECIMAL(14,2) NOT NULL,
    "cerrada_en" TIMESTAMP(3),
    "cerrada_por_id" INTEGER,
    "estado" "EstadoCajaSesion" NOT NULL DEFAULT 'ABIERTA',
    "total_esperado" DECIMAL(14,2),
    "total_contado" DECIMAL(14,2),
    "diferencia" DECIMAL(14,2),
    "observacion" TEXT,

    CONSTRAINT "caja_sesiones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "caja_movimientos" (
    "id" SERIAL NOT NULL,
    "sesion_id" INTEGER NOT NULL,
    "tipo" "TipoMovimientoCaja" NOT NULL,
    "medio_pago" "MedioPago" NOT NULL DEFAULT 'EFECTIVO',
    "monto" DECIMAL(14,2) NOT NULL,
    "concepto" TEXT NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "caja_movimientos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "caja_arqueos" (
    "id" SERIAL NOT NULL,
    "sesion_id" INTEGER NOT NULL,
    "medio_pago" "MedioPago" NOT NULL,
    "monto_esperado" DECIMAL(14,2) NOT NULL,
    "monto_contado" DECIMAL(14,2) NOT NULL,
    "diferencia" DECIMAL(14,2) NOT NULL,
    "denominaciones" JSONB,

    CONSTRAINT "caja_arqueos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cierres_diarios" (
    "id" SERIAL NOT NULL,
    "sucursal_id" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'CERRADO',
    "ventas_cantidad" INTEGER NOT NULL,
    "ventas_total" DECIMAL(14,2) NOT NULL,
    "anulaciones_total" DECIMAL(14,2) NOT NULL,
    "devoluciones_total" DECIMAL(14,2) NOT NULL,
    "costo_total" DECIMAL(14,2) NOT NULL,
    "utilidad_bruta" DECIMAL(14,2) NOT NULL,
    "compras_total" DECIMAL(14,2) NOT NULL,
    "diferencia_cajas" DECIMAL(14,2) NOT NULL,
    "por_medio_pago" JSONB NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "cerrado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observacion" TEXT,

    CONSTRAINT "cierres_diarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rrhh_departamentos" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "rrhh_departamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rrhh_puestos" (
    "id" SERIAL NOT NULL,
    "departamento_id" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "salario_minimo" DECIMAL(14,2),
    "salario_maximo" DECIMAL(14,2),
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "rrhh_puestos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rrhh_empleados" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombres" TEXT NOT NULL,
    "apellidos" TEXT NOT NULL,
    "cui" TEXT NOT NULL,
    "nit" TEXT,
    "afiliacion_igss" TEXT,
    "fecha_nacimiento" DATE,
    "telefono" TEXT,
    "email" TEXT,
    "direccion" TEXT,
    "municipio_id" INTEGER,
    "sucursal_id" INTEGER NOT NULL,
    "puesto_id" INTEGER NOT NULL,
    "fecha_ingreso" DATE NOT NULL,
    "fecha_baja" DATE,
    "motivo_baja" TEXT,
    "salario_base" DECIMAL(14,2) NOT NULL,
    "bonificacion_incentivo" DECIMAL(14,2) NOT NULL DEFAULT 250,
    "porcentaje_comision" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "banco" TEXT,
    "cuenta_bancaria" TEXT,
    "estado" "EstadoEmpleado" NOT NULL DEFAULT 'ACTIVO',
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rrhh_empleados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rrhh_asistencias" (
    "id" SERIAL NOT NULL,
    "empleado_id" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    "entrada" TIMESTAMP(3),
    "salida" TIMESTAMP(3),
    "horas_normales" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "horas_extra" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "origen" TEXT NOT NULL DEFAULT 'MANUAL',

    CONSTRAINT "rrhh_asistencias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rrhh_ausencias" (
    "id" SERIAL NOT NULL,
    "empleado_id" INTEGER NOT NULL,
    "tipo" "TipoAusencia" NOT NULL,
    "desde" DATE NOT NULL,
    "hasta" DATE NOT NULL,
    "dias" DECIMAL(5,2) NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'SOLICITADA',
    "aprobada_por" INTEGER,
    "observacion" TEXT,

    CONSTRAINT "rrhh_ausencias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rrhh_planillas" (
    "id" SERIAL NOT NULL,
    "periodo" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "fecha_inicio" DATE NOT NULL,
    "fecha_fin" DATE NOT NULL,
    "estado" "EstadoPlanilla" NOT NULL DEFAULT 'BORRADOR',
    "total_devengado" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_descuentos" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_liquido" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_patronal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "generada_por" INTEGER NOT NULL,
    "aprobada_por" INTEGER,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rrhh_planillas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rrhh_planillas_detalle" (
    "id" SERIAL NOT NULL,
    "planilla_id" INTEGER NOT NULL,
    "empleado_id" INTEGER NOT NULL,
    "dias_laborados" DECIMAL(5,2) NOT NULL,
    "salario_devengado" DECIMAL(14,2) NOT NULL,
    "horas_extra_monto" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "comisiones" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "bonificacion_incentivo" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "otros_ingresos" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_devengado" DECIMAL(14,2) NOT NULL,
    "igss_laboral" DECIMAL(14,2) NOT NULL,
    "isr" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "otros_descuentos" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_descuentos" DECIMAL(14,2) NOT NULL,
    "liquido" DECIMAL(14,2) NOT NULL,
    "igss_patronal" DECIMAL(14,2) NOT NULL,
    "irtra" DECIMAL(14,2) NOT NULL,
    "intecap" DECIMAL(14,2) NOT NULL,
    "provision_aguinaldo" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "provision_bono14" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "provision_indemnizacion" DECIMAL(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT "rrhh_planillas_detalle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "empresas_nit_key" ON "empresas"("nit");

-- CreateIndex
CREATE UNIQUE INDEX "sucursales_codigo_key" ON "sucursales"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "bodegas_sucursal_id_nombre_key" ON "bodegas"("sucursal_id", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "secciones_bodega_id_nombre_key" ON "secciones"("bodega_id", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_username_key" ON "usuarios"("username");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_empleado_id_key" ON "usuarios"("empleado_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_nombre_key" ON "roles"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "permisos_codigo_key" ON "permisos"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "sesiones_refresh_token_hash_key" ON "sesiones_refresh"("token_hash");

-- CreateIndex
CREATE INDEX "sesiones_refresh_usuario_id_idx" ON "sesiones_refresh"("usuario_id");

-- CreateIndex
CREATE INDEX "audit_log_entidad_entidad_id_idx" ON "audit_log"("entidad", "entidad_id");

-- CreateIndex
CREATE INDEX "audit_log_fecha_idx" ON "audit_log"("fecha");

-- CreateIndex
CREATE UNIQUE INDEX "paises_nombre_key" ON "paises"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "paises_codigo_iso_key" ON "paises"("codigo_iso");

-- CreateIndex
CREATE UNIQUE INDEX "departamentos_pais_id_nombre_key" ON "departamentos"("pais_id", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "municipios_departamento_id_nombre_key" ON "municipios"("departamento_id", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "terceros_legacy_id_key" ON "terceros"("legacy_id");

-- CreateIndex
CREATE INDEX "terceros_nit_idx" ON "terceros"("nit");

-- CreateIndex
CREATE INDEX "terceros_cui_idx" ON "terceros"("cui");

-- CreateIndex
CREATE UNIQUE INDEX "categorias_nombre_key" ON "categorias"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "grupos_categoria_id_nombre_key" ON "grupos"("categoria_id", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "subgrupos_grupo_id_nombre_key" ON "subgrupos"("grupo_id", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "marcas_nombre_key" ON "marcas"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "presentaciones_nombre_key" ON "presentaciones"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "productos_sku_key" ON "productos"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "productos_codigo_barra_key" ON "productos"("codigo_barra");

-- CreateIndex
CREATE UNIQUE INDEX "productos_legacy_id_key" ON "productos"("legacy_id");

-- CreateIndex
CREATE INDEX "productos_nombre_idx" ON "productos"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "existencias_producto_id_bodega_id_key" ON "existencias"("producto_id", "bodega_id");

-- CreateIndex
CREATE INDEX "movimientos_inventario_producto_id_bodega_id_fecha_idx" ON "movimientos_inventario"("producto_id", "bodega_id", "fecha");

-- CreateIndex
CREATE INDEX "movimientos_inventario_documento_tipo_documento_id_idx" ON "movimientos_inventario"("documento_tipo", "documento_id");

-- CreateIndex
CREATE UNIQUE INDEX "compras_legacy_id_key" ON "compras"("legacy_id");

-- CreateIndex
CREATE INDEX "compras_sucursal_id_fecha_contable_idx" ON "compras"("sucursal_id", "fecha_contable");

-- CreateIndex
CREATE UNIQUE INDEX "compras_proveedor_id_serie_factura_numero_factura_key" ON "compras"("proveedor_id", "serie_factura", "numero_factura");

-- CreateIndex
CREATE UNIQUE INDEX "secuencias_documento_sucursal_id_tipo_serie_key" ON "secuencias_documento"("sucursal_id", "tipo", "serie");

-- CreateIndex
CREATE UNIQUE INDEX "ventas_fel_uuid_key" ON "ventas"("fel_uuid");

-- CreateIndex
CREATE UNIQUE INDEX "ventas_legacy_id_key" ON "ventas"("legacy_id");

-- CreateIndex
CREATE INDEX "ventas_sucursal_id_fecha_contable_idx" ON "ventas"("sucursal_id", "fecha_contable");

-- CreateIndex
CREATE INDEX "ventas_vendedor_id_fecha_contable_idx" ON "ventas"("vendedor_id", "fecha_contable");

-- CreateIndex
CREATE UNIQUE INDEX "ventas_sucursal_id_tipo_serie_numero_key" ON "ventas"("sucursal_id", "tipo", "serie", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "cajas_sucursal_id_nombre_key" ON "cajas"("sucursal_id", "nombre");

-- CreateIndex
CREATE INDEX "caja_sesiones_caja_id_estado_idx" ON "caja_sesiones"("caja_id", "estado");

-- CreateIndex
CREATE INDEX "caja_sesiones_fecha_contable_idx" ON "caja_sesiones"("fecha_contable");

-- CreateIndex
CREATE UNIQUE INDEX "caja_arqueos_sesion_id_medio_pago_key" ON "caja_arqueos"("sesion_id", "medio_pago");

-- CreateIndex
CREATE UNIQUE INDEX "cierres_diarios_sucursal_id_fecha_key" ON "cierres_diarios"("sucursal_id", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "rrhh_departamentos_nombre_key" ON "rrhh_departamentos"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "rrhh_puestos_departamento_id_nombre_key" ON "rrhh_puestos"("departamento_id", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "rrhh_empleados_codigo_key" ON "rrhh_empleados"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "rrhh_empleados_cui_key" ON "rrhh_empleados"("cui");

-- CreateIndex
CREATE UNIQUE INDEX "rrhh_asistencias_empleado_id_fecha_key" ON "rrhh_asistencias"("empleado_id", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "rrhh_planillas_periodo_tipo_key" ON "rrhh_planillas"("periodo", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "rrhh_planillas_detalle_planilla_id_empleado_id_key" ON "rrhh_planillas_detalle"("planilla_id", "empleado_id");

-- AddForeignKey
ALTER TABLE "sucursales" ADD CONSTRAINT "sucursales_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sucursales" ADD CONSTRAINT "sucursales_municipio_id_fkey" FOREIGN KEY ("municipio_id") REFERENCES "municipios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bodegas" ADD CONSTRAINT "bodegas_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "secciones" ADD CONSTRAINT "secciones_bodega_id_fkey" FOREIGN KEY ("bodega_id") REFERENCES "bodegas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_empleado_id_fkey" FOREIGN KEY ("empleado_id") REFERENCES "rrhh_empleados"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles_permisos" ADD CONSTRAINT "roles_permisos_rol_id_fkey" FOREIGN KEY ("rol_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles_permisos" ADD CONSTRAINT "roles_permisos_permiso_id_fkey" FOREIGN KEY ("permiso_id") REFERENCES "permisos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuarios_roles" ADD CONSTRAINT "usuarios_roles_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuarios_roles" ADD CONSTRAINT "usuarios_roles_rol_id_fkey" FOREIGN KEY ("rol_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuarios_sucursales" ADD CONSTRAINT "usuarios_sucursales_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuarios_sucursales" ADD CONSTRAINT "usuarios_sucursales_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sesiones_refresh" ADD CONSTRAINT "sesiones_refresh_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departamentos" ADD CONSTRAINT "departamentos_pais_id_fkey" FOREIGN KEY ("pais_id") REFERENCES "paises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "municipios" ADD CONSTRAINT "municipios_departamento_id_fkey" FOREIGN KEY ("departamento_id") REFERENCES "departamentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terceros" ADD CONSTRAINT "terceros_municipio_id_fkey" FOREIGN KEY ("municipio_id") REFERENCES "municipios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grupos" ADD CONSTRAINT "grupos_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subgrupos" ADD CONSTRAINT "subgrupos_grupo_id_fkey" FOREIGN KEY ("grupo_id") REFERENCES "grupos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productos" ADD CONSTRAINT "productos_subgrupo_id_fkey" FOREIGN KEY ("subgrupo_id") REFERENCES "subgrupos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productos" ADD CONSTRAINT "productos_marca_id_fkey" FOREIGN KEY ("marca_id") REFERENCES "marcas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productos" ADD CONSTRAINT "productos_presentacion_id_fkey" FOREIGN KEY ("presentacion_id") REFERENCES "presentaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historial_precios" ADD CONSTRAINT "historial_precios_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "politicas_descuento" ADD CONSTRAINT "politicas_descuento_rol_id_fkey" FOREIGN KEY ("rol_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "politicas_descuento" ADD CONSTRAINT "politicas_descuento_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "politicas_descuento" ADD CONSTRAINT "politicas_descuento_subgrupo_id_fkey" FOREIGN KEY ("subgrupo_id") REFERENCES "subgrupos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "existencias" ADD CONSTRAINT "existencias_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "existencias" ADD CONSTRAINT "existencias_bodega_id_fkey" FOREIGN KEY ("bodega_id") REFERENCES "bodegas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_bodega_id_fkey" FOREIGN KEY ("bodega_id") REFERENCES "bodegas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ajustes_detalle" ADD CONSTRAINT "ajustes_detalle_ajuste_id_fkey" FOREIGN KEY ("ajuste_id") REFERENCES "ajustes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ajustes_detalle" ADD CONSTRAINT "ajustes_detalle_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traslados" ADD CONSTRAINT "traslados_sucursal_origen_id_fkey" FOREIGN KEY ("sucursal_origen_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traslados" ADD CONSTRAINT "traslados_sucursal_destino_id_fkey" FOREIGN KEY ("sucursal_destino_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traslados_detalle" ADD CONSTRAINT "traslados_detalle_traslado_id_fkey" FOREIGN KEY ("traslado_id") REFERENCES "traslados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traslados_detalle" ADD CONSTRAINT "traslados_detalle_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compras" ADD CONSTRAINT "compras_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compras" ADD CONSTRAINT "compras_bodega_id_fkey" FOREIGN KEY ("bodega_id") REFERENCES "bodegas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compras" ADD CONSTRAINT "compras_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "terceros"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compras_detalle" ADD CONSTRAINT "compras_detalle_compra_id_fkey" FOREIGN KEY ("compra_id") REFERENCES "compras"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compras_detalle" ADD CONSTRAINT "compras_detalle_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "secuencias_documento" ADD CONSTRAINT "secuencias_documento_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_bodega_id_fkey" FOREIGN KEY ("bodega_id") REFERENCES "bodegas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_caja_sesion_id_fkey" FOREIGN KEY ("caja_sesion_id") REFERENCES "caja_sesiones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "terceros"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_cotizacion_origen_id_fkey" FOREIGN KEY ("cotizacion_origen_id") REFERENCES "ventas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas_detalle" ADD CONSTRAINT "ventas_detalle_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas_detalle" ADD CONSTRAINT "ventas_detalle_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas_pagos" ADD CONSTRAINT "ventas_pagos_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devoluciones" ADD CONSTRAINT "devoluciones_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devoluciones_detalle" ADD CONSTRAINT "devoluciones_detalle_devolucion_id_fkey" FOREIGN KEY ("devolucion_id") REFERENCES "devoluciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cajas" ADD CONSTRAINT "cajas_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caja_sesiones" ADD CONSTRAINT "caja_sesiones_caja_id_fkey" FOREIGN KEY ("caja_id") REFERENCES "cajas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caja_sesiones" ADD CONSTRAINT "caja_sesiones_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caja_movimientos" ADD CONSTRAINT "caja_movimientos_sesion_id_fkey" FOREIGN KEY ("sesion_id") REFERENCES "caja_sesiones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caja_arqueos" ADD CONSTRAINT "caja_arqueos_sesion_id_fkey" FOREIGN KEY ("sesion_id") REFERENCES "caja_sesiones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cierres_diarios" ADD CONSTRAINT "cierres_diarios_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rrhh_puestos" ADD CONSTRAINT "rrhh_puestos_departamento_id_fkey" FOREIGN KEY ("departamento_id") REFERENCES "rrhh_departamentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rrhh_empleados" ADD CONSTRAINT "rrhh_empleados_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rrhh_empleados" ADD CONSTRAINT "rrhh_empleados_puesto_id_fkey" FOREIGN KEY ("puesto_id") REFERENCES "rrhh_puestos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rrhh_empleados" ADD CONSTRAINT "rrhh_empleados_municipio_id_fkey" FOREIGN KEY ("municipio_id") REFERENCES "municipios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rrhh_asistencias" ADD CONSTRAINT "rrhh_asistencias_empleado_id_fkey" FOREIGN KEY ("empleado_id") REFERENCES "rrhh_empleados"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rrhh_ausencias" ADD CONSTRAINT "rrhh_ausencias_empleado_id_fkey" FOREIGN KEY ("empleado_id") REFERENCES "rrhh_empleados"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rrhh_planillas_detalle" ADD CONSTRAINT "rrhh_planillas_detalle_planilla_id_fkey" FOREIGN KEY ("planilla_id") REFERENCES "rrhh_planillas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rrhh_planillas_detalle" ADD CONSTRAINT "rrhh_planillas_detalle_empleado_id_fkey" FOREIGN KEY ("empleado_id") REFERENCES "rrhh_empleados"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- =============================================================================
-- Reglas de integridad que Prisma no expresa en el schema.
-- Incluir en la PRIMERA migración:
--   npx prisma migrate dev --create-only --name init
--   (pegar este contenido al final de migrations/<ts>_init/migration.sql)
--   npx prisma migrate dev
-- =============================================================================

-- 1) Una caja solo puede tener UNA sesión abierta, y un usuario solo UNA caja abierta.
CREATE UNIQUE INDEX IF NOT EXISTS ux_caja_sesion_abierta
  ON caja_sesiones (caja_id) WHERE estado = 'ABIERTA';
CREATE UNIQUE INDEX IF NOT EXISTS ux_usuario_sesion_abierta
  ON caja_sesiones (usuario_id) WHERE estado = 'ABIERTA';

-- 2) Kardex inmutable: prohíbe UPDATE/DELETE a nivel de base de datos.
CREATE OR REPLACE FUNCTION fn_kardex_inmutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'movimientos_inventario es inmutable (append-only). Registre un movimiento compensatorio.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tg_kardex_inmutable ON movimientos_inventario;
CREATE TRIGGER tg_kardex_inmutable
  BEFORE UPDATE OR DELETE ON movimientos_inventario
  FOR EACH ROW EXECUTE FUNCTION fn_kardex_inmutable();

-- 3) Auditoría inmutable.
DROP TRIGGER IF EXISTS tg_audit_inmutable ON audit_log;
CREATE TRIGGER tg_audit_inmutable
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION fn_kardex_inmutable();

-- 4) Checks de dominio.
ALTER TABLE existencias           ADD CONSTRAINT ck_existencia_costo  CHECK (costo_promedio >= 0);
ALTER TABLE ventas_detalle        ADD CONSTRAINT ck_vd_cantidad       CHECK (cantidad > 0);
ALTER TABLE ventas_pagos          ADD CONSTRAINT ck_vp_monto          CHECK (monto > 0);
ALTER TABLE compras_detalle       ADD CONSTRAINT ck_cd_cantidad       CHECK (cantidad > 0);
ALTER TABLE politicas_descuento   ADD CONSTRAINT ck_pd_porcentaje     CHECK (porcentaje_max BETWEEN 0 AND 100);

-- 5) Búsqueda rápida de productos por nombre (POS) — requiere pg_trgm.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS ix_productos_nombre_trgm ON productos USING gin (nombre gin_trgm_ops);
