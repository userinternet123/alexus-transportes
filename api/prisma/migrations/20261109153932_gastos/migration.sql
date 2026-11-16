-- CreateEnum
CREATE TYPE "EstadoPedido" AS ENUM ('BORRADOR', 'ENVIADO', 'RECIBIDO', 'ANULADO');

-- CreateEnum
CREATE TYPE "MedioGasto" AS ENUM ('TRANSFERENCIA', 'TARJETA', 'CHEQUE', 'DEBITO', 'EFECTIVO_FUERA_CAJA');

-- CreateEnum
CREATE TYPE "EstadoGasto" AS ENUM ('REGISTRADO', 'ANULADO');

-- AlterTable
ALTER TABLE "productos" ADD COLUMN     "por_conseguir" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ventas" ADD COLUMN     "compradores_esperados" INTEGER,
ADD COLUMN     "nombre_lista" TEXT,
ADD COLUMN     "reutilizable" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "proveedores_producto" (
    "id" SERIAL NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "proveedor_id" INTEGER NOT NULL,
    "principal" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proveedores_producto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedidos_compra" (
    "id" SERIAL NOT NULL,
    "sucursal_id" INTEGER NOT NULL,
    "proveedor_id" INTEGER NOT NULL,
    "estado" "EstadoPedido" NOT NULL DEFAULT 'BORRADOR',
    "nota" TEXT,
    "usuario_id" INTEGER NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enviado_en" TIMESTAMP(3),

    CONSTRAINT "pedidos_compra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedidos_compra_detalle" (
    "id" SERIAL NOT NULL,
    "pedido_id" INTEGER NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "cantidad" DECIMAL(14,3) NOT NULL,
    "existencia" DECIMAL(14,3),

    CONSTRAINT "pedidos_compra_detalle_pkey" PRIMARY KEY ("id")
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

-- CreateIndex
CREATE INDEX "proveedores_producto_proveedor_id_idx" ON "proveedores_producto"("proveedor_id");

-- CreateIndex
CREATE UNIQUE INDEX "proveedores_producto_producto_id_proveedor_id_key" ON "proveedores_producto"("producto_id", "proveedor_id");

-- CreateIndex
CREATE INDEX "pedidos_compra_sucursal_id_estado_creado_en_idx" ON "pedidos_compra"("sucursal_id", "estado", "creado_en");

-- CreateIndex
CREATE UNIQUE INDEX "categorias_gasto_nombre_key" ON "categorias_gasto"("nombre");

-- CreateIndex
CREATE INDEX "gastos_fecha_idx" ON "gastos"("fecha");

-- CreateIndex
CREATE INDEX "gastos_sucursal_id_fecha_idx" ON "gastos"("sucursal_id", "fecha");

-- AddForeignKey
ALTER TABLE "proveedores_producto" ADD CONSTRAINT "proveedores_producto_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proveedores_producto" ADD CONSTRAINT "proveedores_producto_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "terceros"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_compra" ADD CONSTRAINT "pedidos_compra_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_compra" ADD CONSTRAINT "pedidos_compra_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "terceros"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_compra" ADD CONSTRAINT "pedidos_compra_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_compra_detalle" ADD CONSTRAINT "pedidos_compra_detalle_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos_compra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_compra_detalle" ADD CONSTRAINT "pedidos_compra_detalle_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias_gasto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "terceros"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
