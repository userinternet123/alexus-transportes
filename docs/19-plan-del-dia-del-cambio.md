# Plan del día del cambio (paso a producción, por sucursal)

La migración se puede repetir sin duplicar datos. Hasta el día D, el sistema anterior sigue siendo la **fuente de verdad**: se ensaya cuantas veces haga falta, y el día D un **corte** deja SPVI 2.0 idéntico al sistema anterior en inventario y precios.

## Comandos
```bash
cd ~/migration/portalAdmin/api
# Solo leer el sistema anterior y contar (no escribe nada)
npm run etl:sucursal -- --codigo ALC --nombre "Alcalá" --csv ~/export-ALC --seco
# Ensayo: migra o completa lo nuevo (ventas, compras, clientes) y deja un acta
npm run etl:sucursal -- --codigo ALC --nombre "Alcalá" --csv ~/export-ALC
# DÍA D: además iguala inventario y precios al sistema anterior
npm run etl:sucursal -- --codigo ALC --nombre "Alcalá" --csv ~/export-ALC --corte
```
Cada ejecución deja `acta-migracion-ALC-AAAA-MM-DD.md`. Compara productos, unidades, valor del inventario, ventas y compras, cuadra producto por producto y mes por mes, y da un veredicto: **APROBADA** o **NO APROBADA**.

## Una semana antes
1. **Ensayo general con datos reales:** exporte el sistema anterior (`exportar-legado.ps1`), migre y lea el acta. Corrija lo que salga en «Avisos»: productos sin código, descuentos inválidos, usuarios sin contraseña.
2. **Pruebas en la caja real:** venta, cotización, ticket en la SAT 22T, cuadre de caja, devolución y traslado.
3. **Capacitación de 1 hora por rol**, en el sistema de ensayo: cajero, bodega y gerente.
4. **Fecha y hora del corte:** de preferencia después del cierre, por ejemplo sábado en la noche.

## Día D (después de cerrar)
1. **En el sistema anterior:** cuadre y cierre la caja. Desde ese momento, **no se vende más ahí**.
2. Exporte con `exportar-legado.ps1`.
3. Ejecute la migración con `--corte`.
   - **Si se detiene** porque ya hubo ventas en SPVI 2.0 en esa sucursal: si fueron pruebas, repita con `--forzar`. Si no, **no siga** y llame a soporte.
4. Abra el acta.
   - **APROBADA:** imprímala y fírmenla el dueño y ALEXUS.
   - **NO APROBADA:** revise «Productos con inventario distinto» y «Ventas por mes». Si no se resuelve, se sigue en el sistema anterior; no se perdió nada.
5. **Conteo de control:** cuente 20 productos al azar (los de más valor y más venta) y compárelos con SPVI 2.0.
6. **Prueba final:** una venta de Q0.01 y su anulación, para confirmar el ticket, la caja y el inventario.

## Primer día de operación
- **Acompañamiento:** presencial o remoto durante la apertura.
- **Sistema anterior en solo lectura:** se conserva al menos 30 días, para consultas y como plan de regreso. Los respaldos de SPVI 2.0 corren desde el primer día.
- **Al cierre:** el primer cuadre de caja se revisa junto con el gerente.

## Plan de regreso
Hasta la primera venta en SPVI 2.0, regresar es inmediato: se sigue vendiendo en el sistema anterior. Después de vender en SPVI 2.0, **no** se repite el corte. Los problemas se corrigen con ajustes o conteo físico.
