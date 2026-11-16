# Gastos fuera de caja

**Dónde:** Caja › Gastos (fuera de caja).

**Permisos:** `gastos.ver`, `gastos.registrar` y `gastos.anular`. El rol Gerente los recibe solo con `db:seed`.

- **Qué va aquí:** alquiler, luz, agua, internet, servicios, publicidad… todo lo pagado por **transferencia, tarjeta, cheque, débito o efectivo que no sale de la caja**. Lo pagado con el efectivo de la caja se registra como egreso en la caja, para que el cuadre cuadre.
- **Categorías:** las 12 básicas (Alquiler, Energía eléctrica, Agua, Internet y teléfono…) se crean solas la primera vez. Se agregan más desde el mismo formulario.
- **Reglas:**
  - **Fecha:** no puede ser futura.
  - **Día cerrado:** no admite gastos nuevos ni anulaciones.
  - **Anulación:** pide un motivo de al menos 10 caracteres.
- **Salud financiera:**
  - **Estado de resultados y efectivo:** columna nueva «Otros gastos».
  - **Margen después de gastos y punto de equilibrio:** ya los incluyen.
  - **«Gastos»:** junta los de caja y los de fuera de caja.

## Aplicar
```bash
cd ~/migration/portalAdmin/api && unzip -o /sdcard/Download/api-acumulado-lotes-16-al-33.zip
npx --no-install prisma migrate dev --create-only --name gastos
cat prisma/migrations/*_gastos/migration.sql | grep -E "CREATE|DROP"
```
**Revise el SQL.** Debe crear `categorias_gasto`, `gastos` y los tipos `MedioGasto` y `EstadoGasto`. **Ningún DROP.** Si todo está bien:
```bash
npx --no-install prisma migrate dev && npm run typecheck
SEED_ADMIN_PASSWORD='MiClaveNueva2026' npm run db:seed
cd ~/migration/src && unzip -o /sdcard/Download/frontend-acumulado-lotes-16-al-38.zip && node verificar-imports.mjs
```
**Motor analítico:** actualícelo con `spvi-analitica.zip`; sin eso, los gastos no entran a Salud financiera.
