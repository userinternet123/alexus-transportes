// Aplica la marca ALEXUS a index.html: título, íconos, color del navegador y manifiesto.
// Uso (en la carpeta del portal, donde está index.html):  node aplicar-marca-web.mjs
// Se puede ejecutar varias veces: reemplaza su propio bloque, no lo duplica.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const ARCHIVO = 'index.html'
if (!existsSync(ARCHIVO)) { console.error('No encuentro index.html: ejecútelo en la carpeta del portal'); process.exit(1) }
const faltan = ['favicon.svg', 'favicon-32.png', 'apple-touch-icon.png', 'icono-192.png', 'icono-512.png', 'manifest.webmanifest'].filter((f) => !existsSync(`public/${f}`))
if (faltan.length) console.warn(`⚠ Faltan en public/: ${faltan.join(', ')}`)

const BLOQUE = `<!-- marca:inicio (generado por aplicar-marca-web.mjs) -->
    <title>SPVI · Punto de venta</title>
    <meta name="description" content="Punto de venta, inventario y administración. SPVI by ALEXUS." />
    <meta name="theme-color" content="#0B2D6B" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <!-- marca:fin -->`

let html = readFileSync(ARCHIVO, 'utf8')
const original = html
if (html.includes('<!-- marca:inicio')) {
  html = html.replace(/<!-- marca:inicio[\s\S]*?<!-- marca:fin -->/, BLOQUE)
} else {
  // Quita lo que la marca reemplaza: título, íconos, theme-color y manifiesto previos (por ejemplo, el vite.svg)
  html = html
    .replace(/[ \t]*<title>[\s\S]*?<\/title>[ \t]*\n?/i, '')
    .replace(/[ \t]*<link[^>]+rel=["'](?:icon|shortcut icon|apple-touch-icon|manifest)["'][^>]*>[ \t]*\n?/gi, '')
    .replace(/[ \t]*<meta[^>]+name=["'](?:theme-color|description)["'][^>]*>[ \t]*\n?/gi, '')
    .replace(/[ \t]*<\/head>/i, `    ${BLOQUE}\n  </head>`)
}
// El idioma del documento: español de Guatemala
html = html.replace(/<html(?![^>]*\blang=)([^>]*)>/i, '<html lang="es-GT"$1>').replace(/<html([^>]*)\blang=["'][^"']*["']/i, '<html$1lang="es-GT"')

if (html === original) console.log('✔ index.html ya tenía la marca aplicada')
else { writeFileSync(ARCHIVO, html); console.log('✔ Marca aplicada en index.html: título, íconos, color y manifiesto') }
