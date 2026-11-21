-- CreateEnum
CREATE TYPE "EstadoCuentaCobrar" AS ENUM ('PENDIENTE', 'PARCIAL', 'PAGADA', 'ANULADA');

-- CreateEnum
CREATE TYPE "MedioCobro" AS ENUM ('TRANSFERENCIA', 'DEPOSITO', 'CHEQUE', 'EFECTIVO', 'RETENCION_IVA', 'RETENCION_ISR', 'DESCUENTO', 'OTRO');

-- CreateEnum
CREATE TYPE "TipoGestionCobro" AS ENUM ('LLAMADA', 'CORREO', 'WHATSAPP', 'VISITA', 'PROMESA', 'NOTA');

-- AlterTable
ALTER TABLE "viajes" ADD COLUMN     "cuenta_cobrar_id" INTEGER;

-- CreateTable
CREATE TABLE "cuentas_cobrar" (
    "id" SERIAL NOT NULL,
    "numero" TEXT NOT NULL,
    "sucursal_id" INTEGER NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "tipo_documento" TEXT NOT NULL DEFAULT 'FACTURA',
    "serie" TEXT,
    "numero_documento" TEXT,
    "autorizacion_fel" TEXT,
    "fecha_emision" DATE NOT NULL,
    "dias_credito" INTEGER NOT NULL,
    "fecha_vencimiento" DATE NOT NULL,
    "monto" DECIMAL(14,2) NOT NULL,
    "saldo" DECIMAL(14,2) NOT NULL,
    "estado" "EstadoCuentaCobrar" NOT NULL DEFAULT 'PENDIENTE',
    "descripcion" TEXT,
    "archivo_id" TEXT,
    "motivo_anulacion" TEXT,
    "anulada_en" TIMESTAMP(3),
    "creado_por_id" INTEGER NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cuentas_cobrar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "abonos_cobro" (
    "id" SERIAL NOT NULL,
    "cuenta_id" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    "monto" DECIMAL(14,2) NOT NULL,
    "medio" "MedioCobro" NOT NULL,
    "referencia" TEXT,
    "banco" TEXT,
    "archivo_id" TEXT,
    "anulado" BOOLEAN NOT NULL DEFAULT false,
    "motivo_anulacion" TEXT,
    "registrado_por_id" INTEGER NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "abonos_cobro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gestiones_cobro" (
    "id" SERIAL NOT NULL,
    "cuenta_id" INTEGER NOT NULL,
    "tipo" "TipoGestionCobro" NOT NULL,
    "nota" TEXT NOT NULL,
    "promesa_fecha" DATE,
    "promesa_monto" DECIMAL(14,2),
    "usuario_id" INTEGER NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gestiones_cobro_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cuentas_cobrar_numero_key" ON "cuentas_cobrar"("numero");

-- CreateIndex
CREATE INDEX "cuentas_cobrar_cliente_id_estado_idx" ON "cuentas_cobrar"("cliente_id", "estado");

-- CreateIndex
CREATE INDEX "cuentas_cobrar_sucursal_id_estado_idx" ON "cuentas_cobrar"("sucursal_id", "estado");

-- CreateIndex
CREATE INDEX "cuentas_cobrar_fecha_vencimiento_idx" ON "cuentas_cobrar"("fecha_vencimiento");

-- CreateIndex
CREATE INDEX "abonos_cobro_cuenta_id_idx" ON "abonos_cobro"("cuenta_id");

-- CreateIndex
CREATE INDEX "abonos_cobro_fecha_idx" ON "abonos_cobro"("fecha");

-- CreateIndex
CREATE INDEX "gestiones_cobro_cuenta_id_idx" ON "gestiones_cobro"("cuenta_id");

-- CreateIndex
CREATE INDEX "viajes_cuenta_cobrar_id_idx" ON "viajes"("cuenta_cobrar_id");

-- AddForeignKey
ALTER TABLE "viajes" ADD CONSTRAINT "viajes_cuenta_cobrar_id_fkey" FOREIGN KEY ("cuenta_cobrar_id") REFERENCES "cuentas_cobrar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cuentas_cobrar" ADD CONSTRAINT "cuentas_cobrar_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cuentas_cobrar" ADD CONSTRAINT "cuentas_cobrar_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "terceros"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cuentas_cobrar" ADD CONSTRAINT "cuentas_cobrar_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abonos_cobro" ADD CONSTRAINT "abonos_cobro_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "cuentas_cobrar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abonos_cobro" ADD CONSTRAINT "abonos_cobro_registrado_por_id_fkey" FOREIGN KEY ("registrado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gestiones_cobro" ADD CONSTRAINT "gestiones_cobro_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "cuentas_cobrar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gestiones_cobro" ADD CONSTRAINT "gestiones_cobro_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

