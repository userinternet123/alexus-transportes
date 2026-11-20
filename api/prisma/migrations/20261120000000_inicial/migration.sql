
-- CreateEnum
CREATE TYPE "TipoTercero" AS ENUM ('PERSONA', 'EMPRESA');

-- CreateEnum
CREATE TYPE "EstadoEmpleado" AS ENUM ('ACTIVO', 'SUSPENDIDO', 'BAJA');

-- CreateEnum
CREATE TYPE "TipoAusencia" AS ENUM ('VACACIONES', 'PERMISO_CON_GOCE', 'PERMISO_SIN_GOCE', 'SUSPENSION_IGSS', 'FALTA_INJUSTIFICADA');

-- CreateEnum
CREATE TYPE "EstadoPlanilla" AS ENUM ('BORRADOR', 'APROBADA', 'PAGADA', 'ANULADA');

-- CreateEnum
CREATE TYPE "EstadoVehiculo" AS ENUM ('ACTIVO', 'EN_TALLER', 'INACTIVO', 'VENDIDO');

-- CreateEnum
CREATE TYPE "TipoTarifa" AS ENUM ('POR_VIAJE', 'POR_KM', 'POR_TONELADA');

-- CreateEnum
CREATE TYPE "EstadoViaje" AS ENUM ('PROGRAMADO', 'EN_RUTA', 'FINALIZADO', 'LIQUIDADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "TipoCostoViaje" AS ENUM ('COMBUSTIBLE', 'PEAJE', 'VIATICO', 'HORAS_EXTRA', 'PARQUEO', 'CARGA_DESCARGA', 'MULTA', 'REPARACION_EN_RUTA', 'OTRO');

-- CreateEnum
CREATE TYPE "EstadoLlanta" AS ENUM ('EN_BODEGA', 'MONTADA', 'EN_REENCAUCHE', 'DESECHADA');

-- CreateEnum
CREATE TYPE "TipoOrdenTrabajo" AS ENUM ('PREVENTIVO', 'SERVICIO_MAYOR', 'CORRECTIVO', 'LLANTAS', 'CARROCERIA');

-- CreateEnum
CREATE TYPE "EstadoOrdenTrabajo" AS ENUM ('ABIERTA', 'EN_PROCESO', 'CERRADA', 'ANULADA');

-- CreateEnum
CREATE TYPE "MedioGasto" AS ENUM ('TRANSFERENCIA', 'TARJETA', 'CHEQUE', 'DEBITO', 'EFECTIVO');

-- CreateEnum
CREATE TYPE "EstadoGasto" AS ENUM ('REGISTRADO', 'ANULADO');

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
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sucursales_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "marcas" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "marcas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terceros" (
    "id" SERIAL NOT NULL,
    "tipo" "TipoTercero" NOT NULL DEFAULT 'EMPRESA',
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
    "contacto" TEXT,
    "es_cliente" BOOLEAN NOT NULL DEFAULT true,
    "es_proveedor" BOOLEAN NOT NULL DEFAULT false,
    "es_taller" BOOLEAN NOT NULL DEFAULT false,
    "limite_credito" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "dias_credito" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "legacy_id" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "terceros_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "pilotos" (
    "id" SERIAL NOT NULL,
    "empleado_id" INTEGER NOT NULL,
    "licencia_tipo" TEXT NOT NULL,
    "licencia_numero" TEXT NOT NULL,
    "licencia_vence" DATE NOT NULL,
    "tipo_sangre" TEXT,
    "telefono_emergencia" TEXT,
    "pago_por_viaje" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "viatico_diario" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pilotos_pkey" PRIMARY KEY ("id")
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

-- CreateTable
CREATE TABLE "archivos" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "tamano" INTEGER NOT NULL,
    "datos" BYTEA NOT NULL,
    "publico" BOOLEAN NOT NULL DEFAULT false,
    "creado_por_id" INTEGER,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "archivos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cabezales" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "placa" TEXT NOT NULL,
    "marca" TEXT NOT NULL,
    "modelo" TEXT,
    "anio" INTEGER,
    "vin" TEXT,
    "motor" TEXT,
    "color" TEXT,
    "ejes" INTEGER NOT NULL DEFAULT 3,
    "odometro" DECIMAL(12,1) NOT NULL DEFAULT 0,
    "capacidad_tanque" DECIMAL(8,2),
    "rendimiento_esperado" DECIMAL(6,2),
    "fecha_compra" DATE,
    "costo_compra" DECIMAL(14,2),
    "vida_util_anios" INTEGER,
    "sucursal_id" INTEGER NOT NULL,
    "piloto_asignado_id" INTEGER,
    "estado" "EstadoVehiculo" NOT NULL DEFAULT 'ACTIVO',
    "notas" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cabezales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "remolques" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "placa" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "marca" TEXT,
    "anio" INTEGER,
    "ejes" INTEGER NOT NULL DEFAULT 2,
    "capacidad_toneladas" DECIMAL(8,2),
    "largo_metros" DECIMAL(6,2),
    "fecha_compra" DATE,
    "costo_compra" DECIMAL(14,2),
    "estado" "EstadoVehiculo" NOT NULL DEFAULT 'ACTIVO',
    "notas" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "remolques_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documentos_vehiculo" (
    "id" SERIAL NOT NULL,
    "cabezal_id" INTEGER,
    "remolque_id" INTEGER,
    "tipo" TEXT NOT NULL,
    "numero" TEXT,
    "emisor" TEXT,
    "emitido" DATE,
    "vence" DATE NOT NULL,
    "costo" DECIMAL(14,2),
    "archivo_id" TEXT,
    "notas" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documentos_vehiculo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rutas" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "origen" TEXT NOT NULL,
    "destino" TEXT NOT NULL,
    "km_estimados" DECIMAL(12,1) NOT NULL,
    "horas_estimadas" DECIMAL(6,2),
    "peajes_estimados" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "viatico_estimado" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rutas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tarifas" (
    "id" SERIAL NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "ruta_id" INTEGER,
    "descripcion" TEXT,
    "tipo" "TipoTarifa" NOT NULL DEFAULT 'POR_VIAJE',
    "monto" DECIMAL(14,2) NOT NULL,
    "vigente_desde" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vigente_hasta" DATE,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tarifas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "viajes" (
    "id" SERIAL NOT NULL,
    "numero" TEXT NOT NULL,
    "sucursal_id" INTEGER NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "ruta_id" INTEGER,
    "tarifa_id" INTEGER,
    "cabezal_id" INTEGER NOT NULL,
    "remolque_id" INTEGER,
    "piloto_id" INTEGER NOT NULL,
    "origen" TEXT NOT NULL,
    "destino" TEXT NOT NULL,
    "carga" TEXT,
    "toneladas" DECIMAL(8,2),
    "referencia" TEXT,
    "fecha_salida" TIMESTAMP(3) NOT NULL,
    "fecha_llegada" TIMESTAMP(3),
    "fecha_compromiso" TIMESTAMP(3),
    "km_salida" DECIMAL(12,1),
    "km_llegada" DECIMAL(12,1),
    "km_vacios" DECIMAL(12,1) NOT NULL DEFAULT 0,
    "monto_cobrado" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "anticipo_piloto" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "pago_piloto" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_costos" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "estado" "EstadoViaje" NOT NULL DEFAULT 'PROGRAMADO',
    "observaciones" TEXT,
    "creado_por_id" INTEGER NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "viajes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "costos_viaje" (
    "id" SERIAL NOT NULL,
    "viaje_id" INTEGER NOT NULL,
    "tipo" "TipoCostoViaje" NOT NULL,
    "descripcion" TEXT,
    "monto" DECIMAL(14,2) NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivo_id" TEXT,
    "registrado_por_id" INTEGER NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "costos_viaje_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cargas_combustible" (
    "id" SERIAL NOT NULL,
    "sucursal_id" INTEGER NOT NULL,
    "cabezal_id" INTEGER NOT NULL,
    "piloto_id" INTEGER,
    "viaje_id" INTEGER,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "odometro" DECIMAL(12,1) NOT NULL,
    "galones" DECIMAL(10,3) NOT NULL,
    "precio_galon" DECIMAL(10,4) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "tanque_lleno" BOOLEAN NOT NULL DEFAULT true,
    "estacion" TEXT,
    "documento" TEXT,
    "archivo_id" TEXT,
    "registrado_por_id" INTEGER NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cargas_combustible_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "llantas" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "marca_id" INTEGER,
    "modelo" TEXT,
    "medida" TEXT NOT NULL,
    "precio" DECIMAL(14,2) NOT NULL,
    "fecha_compra" DATE,
    "proveedor_id" INTEGER,
    "reencauches" INTEGER NOT NULL DEFAULT 0,
    "km_acumulados" DECIMAL(12,1) NOT NULL DEFAULT 0,
    "estado" "EstadoLlanta" NOT NULL DEFAULT 'EN_BODEGA',
    "motivo_baja" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "llantas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "montajes_llanta" (
    "id" SERIAL NOT NULL,
    "llanta_id" INTEGER NOT NULL,
    "cabezal_id" INTEGER,
    "remolque_id" INTEGER,
    "posicion" TEXT NOT NULL,
    "fecha_montaje" DATE NOT NULL,
    "km_montaje" DECIMAL(12,1) NOT NULL,
    "fecha_retiro" DATE,
    "km_retiro" DECIMAL(12,1),
    "profundidad_mm" DECIMAL(5,2),
    "motivo_retiro" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "montajes_llanta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planes_mantenimiento" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "aplica_a" TEXT NOT NULL DEFAULT 'CABEZAL',
    "cada_km" INTEGER,
    "cada_dias" INTEGER,
    "aviso_km" INTEGER NOT NULL DEFAULT 1000,
    "aviso_dias" INTEGER NOT NULL DEFAULT 15,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "planes_mantenimiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repuestos" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "categoria" TEXT,
    "marca_id" INTEGER,
    "unidad" TEXT NOT NULL DEFAULT 'UNIDAD',
    "precio_referencia" DECIMAL(14,2),
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "repuestos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ordenes_trabajo" (
    "id" SERIAL NOT NULL,
    "numero" TEXT NOT NULL,
    "sucursal_id" INTEGER NOT NULL,
    "cabezal_id" INTEGER,
    "remolque_id" INTEGER,
    "plan_id" INTEGER,
    "taller_id" INTEGER,
    "tipo" "TipoOrdenTrabajo" NOT NULL,
    "descripcion" TEXT NOT NULL,
    "odometro" DECIMAL(12,1),
    "fecha_apertura" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_cierre" TIMESTAMP(3),
    "mano_obra" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_repuestos" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "documento" TEXT,
    "archivo_id" TEXT,
    "estado" "EstadoOrdenTrabajo" NOT NULL DEFAULT 'ABIERTA',
    "observaciones" TEXT,
    "creado_por_id" INTEGER NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ordenes_trabajo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ordenes_trabajo_repuestos" (
    "id" SERIAL NOT NULL,
    "orden_id" INTEGER NOT NULL,
    "repuesto_id" INTEGER NOT NULL,
    "marca_id" INTEGER,
    "cantidad" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "costo_unitario" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "ordenes_trabajo_repuestos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categorias_gasto" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "categorias_gasto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gastos" (
    "id" SERIAL NOT NULL,
    "sucursal_id" INTEGER NOT NULL,
    "categoria_id" INTEGER NOT NULL,
    "viaje_id" INTEGER,
    "fecha" DATE NOT NULL,
    "concepto" TEXT NOT NULL,
    "monto" DECIMAL(14,2) NOT NULL,
    "medio_pago" "MedioGasto" NOT NULL,
    "proveedor_id" INTEGER,
    "documento" TEXT,
    "estado" "EstadoGasto" NOT NULL DEFAULT 'REGISTRADO',
    "motivo_anulacion" TEXT,
    "usuario_id" INTEGER NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gastos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eventos_notificacion" (
    "id" SERIAL NOT NULL,
    "sucursal_id" INTEGER,
    "permiso" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "nivel" TEXT NOT NULL DEFAULT 'info',
    "titulo" TEXT NOT NULL,
    "detalle" TEXT NOT NULL,
    "ruta" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eventos_notificacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificaciones_vistas" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "clave" TEXT NOT NULL,
    "visto_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificaciones_vistas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uso_diario" (
    "id" SERIAL NOT NULL,
    "fecha" DATE NOT NULL,
    "evento" TEXT NOT NULL,
    "rol" TEXT NOT NULL,
    "dispositivo" TEXT NOT NULL,
    "veces" INTEGER NOT NULL DEFAULT 0,
    "enviado" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "uso_diario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opiniones" (
    "id" SERIAL NOT NULL,
    "tipo" TEXT NOT NULL,
    "puntaje" INTEGER,
    "texto" TEXT,
    "pantalla" TEXT,
    "contacto" TEXT,
    "rol" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enviado" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "opiniones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "empresas_nit_key" ON "empresas"("nit");

-- CreateIndex
CREATE UNIQUE INDEX "sucursales_codigo_key" ON "sucursales"("codigo");

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
CREATE UNIQUE INDEX "marcas_nombre_key" ON "marcas"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "terceros_legacy_id_key" ON "terceros"("legacy_id");

-- CreateIndex
CREATE INDEX "terceros_nit_idx" ON "terceros"("nit");

-- CreateIndex
CREATE INDEX "terceros_cui_idx" ON "terceros"("cui");

-- CreateIndex
CREATE UNIQUE INDEX "rrhh_departamentos_nombre_key" ON "rrhh_departamentos"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "rrhh_puestos_departamento_id_nombre_key" ON "rrhh_puestos"("departamento_id", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "rrhh_empleados_codigo_key" ON "rrhh_empleados"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "rrhh_empleados_cui_key" ON "rrhh_empleados"("cui");

-- CreateIndex
CREATE UNIQUE INDEX "pilotos_empleado_id_key" ON "pilotos"("empleado_id");

-- CreateIndex
CREATE UNIQUE INDEX "rrhh_asistencias_empleado_id_fecha_key" ON "rrhh_asistencias"("empleado_id", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "rrhh_planillas_periodo_tipo_key" ON "rrhh_planillas"("periodo", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "rrhh_planillas_detalle_planilla_id_empleado_id_key" ON "rrhh_planillas_detalle"("planilla_id", "empleado_id");

-- CreateIndex
CREATE UNIQUE INDEX "cabezales_codigo_key" ON "cabezales"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "cabezales_placa_key" ON "cabezales"("placa");

-- CreateIndex
CREATE UNIQUE INDEX "cabezales_vin_key" ON "cabezales"("vin");

-- CreateIndex
CREATE UNIQUE INDEX "remolques_codigo_key" ON "remolques"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "remolques_placa_key" ON "remolques"("placa");

-- CreateIndex
CREATE INDEX "documentos_vehiculo_vence_idx" ON "documentos_vehiculo"("vence");

-- CreateIndex
CREATE UNIQUE INDEX "rutas_nombre_key" ON "rutas"("nombre");

-- CreateIndex
CREATE INDEX "tarifas_cliente_id_ruta_id_idx" ON "tarifas"("cliente_id", "ruta_id");

-- CreateIndex
CREATE UNIQUE INDEX "viajes_numero_key" ON "viajes"("numero");

-- CreateIndex
CREATE INDEX "viajes_fecha_salida_idx" ON "viajes"("fecha_salida");

-- CreateIndex
CREATE INDEX "viajes_cabezal_id_fecha_salida_idx" ON "viajes"("cabezal_id", "fecha_salida");

-- CreateIndex
CREATE INDEX "viajes_piloto_id_fecha_salida_idx" ON "viajes"("piloto_id", "fecha_salida");

-- CreateIndex
CREATE INDEX "viajes_cliente_id_fecha_salida_idx" ON "viajes"("cliente_id", "fecha_salida");

-- CreateIndex
CREATE INDEX "costos_viaje_viaje_id_idx" ON "costos_viaje"("viaje_id");

-- CreateIndex
CREATE INDEX "cargas_combustible_cabezal_id_fecha_idx" ON "cargas_combustible"("cabezal_id", "fecha");

-- CreateIndex
CREATE INDEX "cargas_combustible_fecha_idx" ON "cargas_combustible"("fecha");

-- CreateIndex
CREATE UNIQUE INDEX "llantas_codigo_key" ON "llantas"("codigo");

-- CreateIndex
CREATE INDEX "montajes_llanta_llanta_id_idx" ON "montajes_llanta"("llanta_id");

-- CreateIndex
CREATE INDEX "montajes_llanta_cabezal_id_fecha_retiro_idx" ON "montajes_llanta"("cabezal_id", "fecha_retiro");

-- CreateIndex
CREATE UNIQUE INDEX "planes_mantenimiento_nombre_key" ON "planes_mantenimiento"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "repuestos_codigo_key" ON "repuestos"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "ordenes_trabajo_numero_key" ON "ordenes_trabajo"("numero");

-- CreateIndex
CREATE INDEX "ordenes_trabajo_cabezal_id_fecha_apertura_idx" ON "ordenes_trabajo"("cabezal_id", "fecha_apertura");

-- CreateIndex
CREATE INDEX "ordenes_trabajo_fecha_apertura_idx" ON "ordenes_trabajo"("fecha_apertura");

-- CreateIndex
CREATE INDEX "ordenes_trabajo_repuestos_orden_id_idx" ON "ordenes_trabajo_repuestos"("orden_id");

-- CreateIndex
CREATE UNIQUE INDEX "categorias_gasto_nombre_key" ON "categorias_gasto"("nombre");

-- CreateIndex
CREATE INDEX "gastos_fecha_idx" ON "gastos"("fecha");

-- CreateIndex
CREATE INDEX "gastos_sucursal_id_fecha_idx" ON "gastos"("sucursal_id", "fecha");

-- CreateIndex
CREATE INDEX "eventos_notificacion_creado_en_idx" ON "eventos_notificacion"("creado_en");

-- CreateIndex
CREATE INDEX "notificaciones_vistas_visto_en_idx" ON "notificaciones_vistas"("visto_en");

-- CreateIndex
CREATE UNIQUE INDEX "notificaciones_vistas_usuario_id_clave_key" ON "notificaciones_vistas"("usuario_id", "clave");

-- CreateIndex
CREATE INDEX "uso_diario_enviado_fecha_idx" ON "uso_diario"("enviado", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "uso_diario_fecha_evento_rol_dispositivo_key" ON "uso_diario"("fecha", "evento", "rol", "dispositivo");

-- CreateIndex
CREATE INDEX "opiniones_enviado_idx" ON "opiniones"("enviado");

-- CreateIndex
CREATE INDEX "opiniones_tipo_creado_en_idx" ON "opiniones"("tipo", "creado_en");

-- AddForeignKey
ALTER TABLE "sucursales" ADD CONSTRAINT "sucursales_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sucursales" ADD CONSTRAINT "sucursales_municipio_id_fkey" FOREIGN KEY ("municipio_id") REFERENCES "municipios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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
ALTER TABLE "rrhh_puestos" ADD CONSTRAINT "rrhh_puestos_departamento_id_fkey" FOREIGN KEY ("departamento_id") REFERENCES "rrhh_departamentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rrhh_empleados" ADD CONSTRAINT "rrhh_empleados_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rrhh_empleados" ADD CONSTRAINT "rrhh_empleados_puesto_id_fkey" FOREIGN KEY ("puesto_id") REFERENCES "rrhh_puestos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rrhh_empleados" ADD CONSTRAINT "rrhh_empleados_municipio_id_fkey" FOREIGN KEY ("municipio_id") REFERENCES "municipios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pilotos" ADD CONSTRAINT "pilotos_empleado_id_fkey" FOREIGN KEY ("empleado_id") REFERENCES "rrhh_empleados"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rrhh_asistencias" ADD CONSTRAINT "rrhh_asistencias_empleado_id_fkey" FOREIGN KEY ("empleado_id") REFERENCES "rrhh_empleados"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rrhh_ausencias" ADD CONSTRAINT "rrhh_ausencias_empleado_id_fkey" FOREIGN KEY ("empleado_id") REFERENCES "rrhh_empleados"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rrhh_planillas_detalle" ADD CONSTRAINT "rrhh_planillas_detalle_planilla_id_fkey" FOREIGN KEY ("planilla_id") REFERENCES "rrhh_planillas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rrhh_planillas_detalle" ADD CONSTRAINT "rrhh_planillas_detalle_empleado_id_fkey" FOREIGN KEY ("empleado_id") REFERENCES "rrhh_empleados"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cabezales" ADD CONSTRAINT "cabezales_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cabezales" ADD CONSTRAINT "cabezales_piloto_asignado_id_fkey" FOREIGN KEY ("piloto_asignado_id") REFERENCES "pilotos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos_vehiculo" ADD CONSTRAINT "documentos_vehiculo_cabezal_id_fkey" FOREIGN KEY ("cabezal_id") REFERENCES "cabezales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos_vehiculo" ADD CONSTRAINT "documentos_vehiculo_remolque_id_fkey" FOREIGN KEY ("remolque_id") REFERENCES "remolques"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos_vehiculo" ADD CONSTRAINT "documentos_vehiculo_archivo_id_fkey" FOREIGN KEY ("archivo_id") REFERENCES "archivos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarifas" ADD CONSTRAINT "tarifas_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "terceros"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarifas" ADD CONSTRAINT "tarifas_ruta_id_fkey" FOREIGN KEY ("ruta_id") REFERENCES "rutas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "viajes" ADD CONSTRAINT "viajes_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "viajes" ADD CONSTRAINT "viajes_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "terceros"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "viajes" ADD CONSTRAINT "viajes_ruta_id_fkey" FOREIGN KEY ("ruta_id") REFERENCES "rutas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "viajes" ADD CONSTRAINT "viajes_tarifa_id_fkey" FOREIGN KEY ("tarifa_id") REFERENCES "tarifas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "viajes" ADD CONSTRAINT "viajes_cabezal_id_fkey" FOREIGN KEY ("cabezal_id") REFERENCES "cabezales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "viajes" ADD CONSTRAINT "viajes_remolque_id_fkey" FOREIGN KEY ("remolque_id") REFERENCES "remolques"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "viajes" ADD CONSTRAINT "viajes_piloto_id_fkey" FOREIGN KEY ("piloto_id") REFERENCES "pilotos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "viajes" ADD CONSTRAINT "viajes_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costos_viaje" ADD CONSTRAINT "costos_viaje_viaje_id_fkey" FOREIGN KEY ("viaje_id") REFERENCES "viajes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costos_viaje" ADD CONSTRAINT "costos_viaje_archivo_id_fkey" FOREIGN KEY ("archivo_id") REFERENCES "archivos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costos_viaje" ADD CONSTRAINT "costos_viaje_registrado_por_id_fkey" FOREIGN KEY ("registrado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cargas_combustible" ADD CONSTRAINT "cargas_combustible_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cargas_combustible" ADD CONSTRAINT "cargas_combustible_cabezal_id_fkey" FOREIGN KEY ("cabezal_id") REFERENCES "cabezales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cargas_combustible" ADD CONSTRAINT "cargas_combustible_piloto_id_fkey" FOREIGN KEY ("piloto_id") REFERENCES "pilotos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cargas_combustible" ADD CONSTRAINT "cargas_combustible_viaje_id_fkey" FOREIGN KEY ("viaje_id") REFERENCES "viajes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cargas_combustible" ADD CONSTRAINT "cargas_combustible_archivo_id_fkey" FOREIGN KEY ("archivo_id") REFERENCES "archivos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cargas_combustible" ADD CONSTRAINT "cargas_combustible_registrado_por_id_fkey" FOREIGN KEY ("registrado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "llantas" ADD CONSTRAINT "llantas_marca_id_fkey" FOREIGN KEY ("marca_id") REFERENCES "marcas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "llantas" ADD CONSTRAINT "llantas_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "terceros"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "montajes_llanta" ADD CONSTRAINT "montajes_llanta_llanta_id_fkey" FOREIGN KEY ("llanta_id") REFERENCES "llantas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "montajes_llanta" ADD CONSTRAINT "montajes_llanta_cabezal_id_fkey" FOREIGN KEY ("cabezal_id") REFERENCES "cabezales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "montajes_llanta" ADD CONSTRAINT "montajes_llanta_remolque_id_fkey" FOREIGN KEY ("remolque_id") REFERENCES "remolques"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repuestos" ADD CONSTRAINT "repuestos_marca_id_fkey" FOREIGN KEY ("marca_id") REFERENCES "marcas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_trabajo" ADD CONSTRAINT "ordenes_trabajo_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_trabajo" ADD CONSTRAINT "ordenes_trabajo_cabezal_id_fkey" FOREIGN KEY ("cabezal_id") REFERENCES "cabezales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_trabajo" ADD CONSTRAINT "ordenes_trabajo_remolque_id_fkey" FOREIGN KEY ("remolque_id") REFERENCES "remolques"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_trabajo" ADD CONSTRAINT "ordenes_trabajo_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "planes_mantenimiento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_trabajo" ADD CONSTRAINT "ordenes_trabajo_taller_id_fkey" FOREIGN KEY ("taller_id") REFERENCES "terceros"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_trabajo" ADD CONSTRAINT "ordenes_trabajo_archivo_id_fkey" FOREIGN KEY ("archivo_id") REFERENCES "archivos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_trabajo" ADD CONSTRAINT "ordenes_trabajo_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_trabajo_repuestos" ADD CONSTRAINT "ordenes_trabajo_repuestos_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "ordenes_trabajo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_trabajo_repuestos" ADD CONSTRAINT "ordenes_trabajo_repuestos_repuesto_id_fkey" FOREIGN KEY ("repuesto_id") REFERENCES "repuestos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_trabajo_repuestos" ADD CONSTRAINT "ordenes_trabajo_repuestos_marca_id_fkey" FOREIGN KEY ("marca_id") REFERENCES "marcas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias_gasto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_viaje_id_fkey" FOREIGN KEY ("viaje_id") REFERENCES "viajes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "terceros"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

