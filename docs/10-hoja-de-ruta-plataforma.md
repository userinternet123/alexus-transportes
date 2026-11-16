# Hoja de ruta: plataforma del proveedor y adaptación por giro

## 1. ¿Módulo o aplicación aparte? Las dos cosas

Publicidad, monitoreo de errores, soporte, actualizaciones y licencias **se administran desde sus servidores**, no desde los del cliente. Eso exige dos piezas:

| Pieza | Dónde vive | Para qué |
|---|---|---|
| **SPVI Central** (aplicación nueva) | Su servidor en la nube | Panel del proveedor: clientes, licencias, versiones, errores, tickets y anuncios |
| **Agente** (módulo dentro de SPVI) | Cada instalación | Consulta a Central, envía errores, muestra anuncios y avisos, descarga actualizaciones |

```
 Tiendas (SPVI + agente) ──HTTPS saliente cada 6 h──►  SPVI Central (su nube)
   · errores sin datos personales                        · panel del proveedor
   · ¿hay versión nueva? ¿anuncios? ¿avisos?             · GlitchTip (errores)
   · tickets de soporte con captura                      · versiones firmadas
```

Reglas de diseño:
- **Solo conexiones salientes** desde la tienda. No se abren puertos y funciona detrás de cualquier router.
- **Sin internet, la tienda sigue vendiendo.** El agente reintenta después y nada del día a día depende de Central.
- **Privacidad:** nunca se envían ventas, clientes ni precios. Solo errores técnicos (sin datos personales), versión y plan.
- **Actualizaciones firmadas:** instalador firmado (Authenticode) y manifiesto firmado con la clave Ed25519 del proveedor, la misma idea que las licencias. Una tienda nunca instala algo que usted no firmó.

### Componentes de Central, por fases

| Fase | Componente | Detalle | Esfuerzo |
|---|---|---|---|
| 1 | **Monitoreo de errores** | GlitchTip (código abierto, compatible con Sentry) en su servidor. El API y el portal envían cada error con versión, plan y empresa (sin datos personales) | 1 semana |
| 2 | **Soporte** | Botón "Ayuda" en el portal: ticket con descripción, captura de pantalla y registro técnico. El ticket llega a Central y la respuesta se ve en el portal | 2 semanas |
| 2 | **Avisos y anuncios** | Espacios en Inicio y en el ingreso (nunca durante el cobro). Se segmentan por plan, giro o región. Modelo sugerido: plan Básico con anuncios, planes pagados sin anuncios. Se miden impresiones y clics | 2 semanas |
| 3 | **Actualizaciones y parches** | Canales "estable" y "pruebas". El agente avisa al administrador y descarga la versión firmada. El parche se instala con el mismo instalador (respaldo, migraciones, verificación). Los parches de seguridad pueden marcarse como prioritarios | 2 a 3 semanas |
| 4 | **Portal de clientes** | Renovación de licencias en línea (Central emite y el agente la descarga sola), historial de pagos y descargas | 3 semanas |

## 2. Adaptar SPVI a cada giro (librería, ferretería, llantas, servicios)

Un generador de pantallas totalmente libre es potente, pero difícil de mantener y fácil de romper. La ruta recomendada va de lo concreto a lo general:

| Fase | Qué se construye | Ejemplo |
|---|---|---|
| 1 | **Campos personalizados del producto**: el administrador define campos (texto, número, lista, sí/no) que aparecen en la ficha, el buscador y el POS | Llantas: medida, rin, índice de carga, índice de velocidad. Librería: autor, editorial, ISBN, grado. Ferretería: medida, material, calibre |
| 2 | **Plantillas de giro**: paquete de campos, categorías iniciales, reportes visibles y textos, aplicable al instalar | "Ferretería", "Llantera", "Librería", "Servicios" |
| 3 | **Diseñador de catálogos**: pantalla para crear catálogos propios (tabla, campos, validaciones, columnas de la lista). Genera el JSON del motor de formularios que ya usa el portal, y los datos se guardan en un esquema genérico (JSONB) | Catálogo "Vehículos del cliente" en una llantera; "Citas" en un negocio de servicios |

Medidas de seguridad del diseñador: nada de SQL libre, definiciones versionadas (se puede volver atrás), validación del JSON antes de publicar y permisos por catálogo creado.

**Venta de servicios** necesita, además, productos sin existencia (ya existe: "Controla existencia" desactivado) y, si se pide, agenda de citas (fase 3).

## 3. Clasificación con niveles ilimitados

Hoy son tres niveles fijos: Categoría › Grupo › Sub-agrupación. La propuesta es **un árbol** en el que cada nivel puede tener los subniveles que el negocio necesite:

```
Ferretería › Electricidad › Cables › Cable THHN › Calibre 12
```

- Modelo: `Clasificacion(id, nombre, padreId, ruta)`, con la ruta guardada para consultas rápidas ("todo lo que está bajo Electricidad").
- Los productos se asignan a cualquier nivel.
- Las políticas de descuento se heredan a todos los niveles inferiores.
- Los reportes se pueden agrupar por el nivel que se elija.
- **Migración:** las categorías, grupos y sub-agrupaciones actuales pasan al árbol sin perder nada.

Afecta al esquema, al ETL, a los descuentos, a los reportes y al POS, por eso va en **un lote dedicado** con pruebas.

## 4. Direcciones (pendiente de la migración)

Sí, quedó pendiente. El SPVI anterior tiene países, departamentos, municipios y colonias. Plan:
1. Tablas `Pais`, `Departamento` y `Municipio`, con zona o colonia opcional.
2. **Se migran desde las tablas del SPVI anterior** con el ETL, en lugar de escribirlas a mano.
3. Dirección estructurada en clientes, proveedores, sucursales y empleados. Sirve para la factura FEL del receptor, para entregas y para reportes por zona.

## 5. Lectura de facturas en foto o PDF

La importación por **XML FEL** (ya disponible) es exacta y gratuita. Para los proveedores que solo entregan foto o PDF se puede agregar lectura con IA (visión). Necesita internet, tiene un costo por factura y siempre requiere revisión humana, por eso se recomienda como complemento, no como vía principal.

## Orden sugerido de los próximos lotes

1. **Direcciones + clasificación ilimitada** (estructura de datos, conviene antes de crecer)
2. **Campos personalizados y plantillas de giro**
3. **SPVI Central fase 1 y 2:** errores, soporte y anuncios
4. **Actualizaciones automáticas y renovación de licencias en línea**
5. **Diseñador de catálogos**
6. **Pendientes de la migración original:** conteo físico, traslados, asistencia y planillas, ticket térmico
