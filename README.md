# Integración SPVI 2.0 en portalAdmin

Copie `src/` sobre la plantilla respetando las rutas. Guía completa: [docs/06-integracion-frontend.md](../../docs/06-integracion-frontend.md).

| Archivo | Acción |
|---|---|
| `src/services/api.js`, `authService.js` | **Reemplazar** (refresh rotativo, `X-Sucursal-Id`, errores normalizados) |
| `src/hooks/usePermisos.js`, `useOpcionesRemotas.js` | Nuevos |
| `src/config/moduleRegistry.js`, `spviMenu.js` | Nuevos: registro de módulos y menú por permisos |
| `src/data/spvi/*.json` | Generados con `node scripts/generar-configs.mjs` |
| `src/components/pos/*` | Nuevos: POS, apertura y cuadre de caja, cierre diario, centro de reportes |

Dependencias: ninguna nueva (usa axios, react-router, lucide-react, react-hot-toast y Tailwind que ya tiene la plantilla).
