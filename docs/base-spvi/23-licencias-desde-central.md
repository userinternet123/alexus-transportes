# Licencias desde SPVI Central

Central **firma** las licencias. La llave privada vive solo en Central, en su base de datos, que se respalda. Cada licencia agrupa:
- **Módulos:** punto de venta, inventario, reportes, analítica y temporadas, RRHH, varias sucursales, lectura con IA, **factura electrónica (nuevo)**, **finanzas (nuevo)**, campos por giro y sin marca.
- **Límites:** sucursales, **bodegas (nuevo)**, **cajas (nuevo)** y usuarios. Vacío = sin límite.
- **Reportes.**
- **Vencimiento y días de gracia.**
- **Equipo:** la licencia queda **atada al equipo** de la tienda.

## Una sola vez: la llave de Central dentro del instalador
1. Panel de Central › **Licencias › Llave pública**.
2. Copie el segundo recuadro (el contenido completo del archivo) en `apps/api/src/modules/licencia/clave-publica.ts`.
3. Desde entonces el instalador exige licencias firmadas por Central.

Esto **reemplaza** el paso `npm run licencia:claves` de la guía 16.

## Emitir
Panel › **Licencias › Emitir licencia**: elija el plan y ajuste módulos, límites, vencimiento y gracia.

| Entrega | Cuándo | Cómo llega |
|---|---|---|
| **Por Central** | Tienda con internet | Elija la instalación. Se ata sola al equipo que la tienda reporta. La recibe en su próximo contacto (máximo unas horas). |
| **Por archivo** | Tienda sin internet | Elija el cliente y escriba el **código del equipo** que la tienda le dicta (lo ve en Configuración › Licencia o en la pantalla de bloqueo). Descargue el `.lic` y la tienda lo carga en Configuración › Licencia. De entrada **vence en 30 días con 3 de gracia**. |

- **Reemplazo:** una licencia nueva para la misma instalación o el mismo equipo deja la anterior como «reemplazada».
- **Equipo distinto:** una licencia copiada a otra PC, o hecha para otro equipo, **no se instala**. El mensaje dice los dos códigos.
- **Transferir a otra PC:** emita una licencia para el equipo nuevo y revoque la anterior.

## Revocar
**Revocar** pide un motivo.
- **Por Central:** la tienda recibe una revocación **firmada**, que nadie puede fingir, y se bloquea en su próximo contacto.
- **Por archivo:** se entera al conectarse o al vencer. Por eso esas licencias duran menos.

## Planes
Panel › **Licencias › Planes**. Básico, Profesional y Empresarial vienen de inicio y son editables. Un plan es una plantilla: cambiarlo **no** altera las licencias ya emitidas.

## En la tienda
- **Configuración › Licencia y módulos** muestra el **código del equipo** (con botón copiar) y los cuatro límites.
- **Factura electrónica:** sin el módulo FEL, las ventas salen sin factura sin interrumpir la caja. Pedirla a propósito, o emitirla después, avisa que la licencia no la incluye.
- **Licencias anteriores:** las v1 siguen funcionando. Pero las emitidas **antes** de este cambio no incluyen los módulos nuevos (FEL, finanzas): emítalas de nuevo desde Central.

## Aplicar
- **Tienda:** `api-acumulado-lotes-16-al-34.zip` y `frontend-acumulado-lotes-16-al-39.zip`. **No hay migración de base de datos.**
- **Central:** `spvi-central.zip` y `docker compose -f docker-compose.local.yml up -d --build`. Central crea sus tablas nuevas al arrancar.
