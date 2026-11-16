// Verifica que todas las importaciones relativas del portal existan.
// Uso (en la raíz del portal, donde está la carpeta src):  node verificar-imports.mjs
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

const raiz = resolve(process.argv[2] ?? 'src')
if (!existsSync(raiz)) { console.error(`No existe ${raiz}. Ejecútelo en la carpeta que contiene src/`); process.exit(2) }
const EXT = ['', '.js', '.jsx', '.ts', '.tsx', '.json', '/index.js', '/index.jsx', '/index.ts', '/index.tsx']
const archivos = []
const recorrer = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) { if (n !== 'node_modules') recorrer(p) } else if (/\.(jsx?|tsx?)$/.test(n)) archivos.push(p) } }
recorrer(raiz)

const faltan = []
const patron = /(?:import|export)\s[^'"]*?from\s*['"](\.{1,2}\/[^'"]+)['"]|import\s*\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)|import\s*['"](\.{1,2}\/[^'"]+\.css)['"]/g
for (const a of archivos) {
  // Sin comentarios (conservando los saltos de línea para reportar el número correcto)
  const texto = readFileSync(a, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
    .replace(/^\s*\/\/.*$/gm, '')
  for (const m of texto.matchAll(patron)) {
    const ruta = m[1] ?? m[2] ?? m[3]
    const base = resolve(dirname(a), ruta)
    if (!EXT.some((e) => existsSync(base + e) && statSync(base + e).isFile())) {
      const linea = texto.slice(0, m.index).split('\n').length
      faltan.push(`${relative(process.cwd(), a)}:${linea}  →  ${ruta}`)
    }
  }
}
// JSX dentro de archivos .js: Vite solo lo acepta en .jsx (className= solo existe en JSX)
for (const a of archivos) {
  if (!a.endsWith('.js')) continue
  const texto = readFileSync(a, 'utf8')
  const i = texto.search(/className=/)
  if (i >= 0) faltan.push(`${relative(process.cwd(), a)}:${texto.slice(0, i).split('\n').length}  →  contiene JSX: renombre el archivo a .jsx`)
}

if (faltan.length) {
  console.log(`✗ ${faltan.length} problema(s) encontrados:\n`)
  faltan.forEach((f) => console.log('  ' + f))
  process.exit(1)
}
console.log(`✔ ${archivos.length} archivos revisados: importaciones correctas y sin JSX en archivos .js`)
