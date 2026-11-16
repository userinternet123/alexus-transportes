#!/usr/bin/env node
/**
 * KIT DE DESARROLLO SIN INTERNET — un solo archivo, sin dependencias. Solo necesita Node.js 22.
 * Funciona en cualquier terminal (PowerShell, cmd, bash): no usa scripts .ps1.
 *
 * EN LA PC CON INTERNET (Windows x64, Node 22). Para preparar basta el package.json de cada proyecto (mejor con su
 * package-lock.json al lado); NO hace falta copiar el código:
 *     node kit.mjs preparar --api C:\ruta\api\package.json --portal C:\ruta\portal\package.json
 *   Se crea la carpeta kit-desarrollo (lleva dentro este mismo script). Cópiela a la otra PC.
 *   Agregue --postgres para llevar también un PostgreSQL portátil (se puede ejecutar aparte: node kit.mjs preparar --postgres).
 *
 * EN LA PC SIN INTERNET (Node 22 instalado), con el código fuente que ya tenga allí:
 *     node kit-desarrollo\kit.mjs instalar --api C:\src\api --portal C:\src\portal
 *     node kit-desarrollo\kit.mjs compilar --api C:\src\api --portal C:\src\portal
 *     node kit-desarrollo\kit.mjs probar   --api C:\src\api --portal C:\src\portal
 *     node kit-desarrollo\kit.mjs prisma   --api C:\src\api -- migrate dev      (todo lo que va después de -- es de Prisma)
 *     node kit-desarrollo\kit.mjs entorno  --api C:\src\api                     (muestra las variables de Prisma para su terminal)
 *     node kit-desarrollo\kit.mjs bd                                          (PostgreSQL portátil: sin instalar ni administrador; --detener lo apaga)
 *   Si ejecuta estos comandos DENTRO de la carpeta del código, puede omitir --api / --portal.
 *   (--api y --portal deben apuntar al CÓDIGO, no a kit-desarrollo\proyectos, que solo guarda copias de package.json)
 *
 * Opciones: --kit <carpeta> (por defecto, la carpeta de este script o ./kit-desarrollo)
 *           --motores <carpeta> (preparar: usar motores de Prisma ya descargados a mano)
 *           --pg-url <url> (preparar --postgres: otro origen del zip de PostgreSQL, p. ej. un repositorio interno)
 *           --puerto <n> (bd: por defecto 5432)   --destino <carpeta> (bd: dónde guardar la base de desarrollo)
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const ESTE = fileURLToPath(import.meta.url);
const AQUI = path.dirname(ESTE);
const [accion, ...resto] = process.argv.slice(2);
const corte = resto.indexOf('--');
const propios = corte >= 0 ? resto.slice(0, corte) : resto;
const pasados = corte >= 0 ? resto.slice(corte + 1) : [];
const opcion = (n) => { const i = propios.indexOf(`--${n}`); return i >= 0 ? propios[i + 1] : undefined; };
const tiene = (n) => propios.includes(`--${n}`);
const KIT = path.resolve(opcion('kit') ?? (fs.existsSync(path.join(AQUI, 'kit.json')) ? AQUI : 'kit-desarrollo'));
const CACHE = path.join(KIT, 'npm-cache');
const MOTORES = path.join(KIT, 'prisma-motores');
const PG_KIT = path.join(KIT, 'postgresql');
const ES_MOTOR = /^(libquery_engine|query_engine|schema-engine)-.+(?<!\.sha256|\.gz)$/;

const q = (p) => (/\s/.test(p) ? `"${p}"` : p);
const hash = (f) => (fs.existsSync(f) ? createHash('sha256').update(fs.readFileSync(f)).digest('hex').toUpperCase() : '');
const leerJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const resumen = [];
const ok = (t) => resumen.push(`✔ ${t}`);
const aviso = (t) => console.warn(`\n⚠ ${t}`);
const titulo = (t) => console.log(`\n== ${t} ==`);
function uso(ejemplo) { throw new Error(`Falta indicar los proyectos. Ejemplo:\n  node kit.mjs ${ejemplo}`); }

function correr(cmd, cwd, env = {}) {
  const r = spawnSync(cmd, { cwd, shell: true, stdio: 'inherit', env: { ...process.env, CHECKPOINT_DISABLE: '1', ...env } });
  if (r.status !== 0) throw new Error(`Falló: ${cmd}  (en ${cwd})`);
}
function carpetaDe(ruta) {
  let p = path.resolve(ruta);
  if (fs.existsSync(p) && fs.statSync(p).isFile()) p = path.dirname(p);
  if (!fs.existsSync(path.join(p, 'package.json'))) throw new Error(`No hay package.json en ${p}`);
  return p;
}
function proyectos() {
  let lista = ['api', 'portal'].filter((n) => opcion(n)).map((n) => ({ nombre: n, dir: carpetaDe(opcion(n)) }));
  // Sin --api/--portal: se usa la carpeta actual (el API si tiene nest-cli.json o prisma\schema.prisma; si no, el portal)
  if (!lista.length && accion !== 'preparar' && fs.existsSync(path.join(process.cwd(), 'package.json'))) {
    const dir = process.cwd();
    const esApi = fs.existsSync(path.join(dir, 'nest-cli.json')) || fs.existsSync(path.join(dir, 'prisma', 'schema.prisma'));
    console.log(`Sin --api ni --portal: se usa la carpeta actual como ${esApi ? 'API' : 'portal'} (${dir}).`);
    lista = [{ nombre: esApi ? 'api' : 'portal', dir }];
  }
  // Error típico: apuntar a la copia de package.json que guarda el kit en lugar de al código fuente
  if (accion !== 'preparar') {
    for (const p of lista) {
      const rel = path.relative(path.join(KIT, 'proyectos'), p.dir);
      if (!rel.startsWith('..') && !path.isAbsolute(rel)) throw new Error(`${p.dir} es la copia de package.json que guarda el kit, no su código fuente.\n  Use la carpeta donde está su código (la que tiene src y tsconfig.json). Si ya está en ella: --${p.nombre} .`);
    }
  }
  return lista;
}
const scriptsDe = (dir) => Object.keys(leerJson(path.join(dir, 'package.json')).scripts ?? {});
const depsDe = (dir) => { const p = leerJson(path.join(dir, 'package.json')); return { ...p.devDependencies, ...p.dependencies }; };
const meta = () => {
  const f = path.join(KIT, 'kit.json');
  if (!fs.existsSync(f)) throw new Error(`No encuentro el kit en ${KIT}. Prepárelo con "preparar" en una PC con internet.`);
  return leerJson(f);
};
const motoresEn = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => ES_MOTOR.test(f) && fs.statSync(path.join(dir, f)).isFile()) : []);

function entornoPrisma(apiDir) {
  const eng = path.join(apiDir, 'node_modules', '@prisma', 'engines');
  const archivos = motoresEn(eng);
  const lib = archivos.find((f) => /query_engine/.test(f) && f.endsWith('.node'));
  const esquema = archivos.find((f) => f.startsWith('schema-engine'));
  if (!lib || !esquema) throw new Error(`Faltan los motores de Prisma en ${eng}. Ejecute primero "instalar".`);
  return { PRISMA_QUERY_ENGINE_LIBRARY: path.join(eng, lib), PRISMA_SCHEMA_ENGINE_BINARY: path.join(eng, esquema), PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING: '1' };
}

// ───────────────────────────── preparar ─────────────────────────────
async function preparar() {
  const ps = proyectos();
  if (!ps.length && !tiene('postgres')) uso('preparar --api <package.json o carpeta> [--portal <package.json o carpeta>] [--postgres]');
  fs.mkdirSync(CACHE, { recursive: true });
  // Se conserva lo ya preparado: se puede agregar un proyecto o PostgreSQL sin repetir todo
  const previo = fs.existsSync(path.join(KIT, 'kit.json')) ? leerJson(path.join(KIT, 'kit.json')) : {};
  const info = { motores: [], ...previo, preparado: new Date().toISOString(), equipo: os.hostname(), node: process.version, plataforma: `${process.platform}-${process.arch}`, proyectos: { ...previo.proyectos } };
  const trabajo = fs.mkdtempSync(path.join(os.tmpdir(), 'spvi-kit-'));   // el proyecto original no se toca
  try {
    for (const p of ps) {
      titulo(`${p.nombre}: paquetes de npm a la caché del kit`);
      const w = path.join(trabajo, p.nombre);
      fs.mkdirSync(w, { recursive: true });
      fs.copyFileSync(path.join(p.dir, 'package.json'), path.join(w, 'package.json'));
      const lockOrigen = path.join(p.dir, 'package-lock.json');
      const conLock = fs.existsSync(lockOrigen);
      if (conLock) fs.copyFileSync(lockOrigen, path.join(w, 'package-lock.json'));
      else aviso(`${p.nombre}: no hay package-lock.json. Se resolverán las versiones de hoy y se guardará el lock en el kit; cópielo también a su proyecto para que coincidan.`);
      correr(`${conLock ? 'npm ci' : 'npm install'} --ignore-scripts --no-audit --no-fund --cache ${q(CACHE)}`, w);
      const dk = path.join(KIT, 'proyectos', p.nombre);
      fs.mkdirSync(dk, { recursive: true });
      fs.copyFileSync(path.join(w, 'package.json'), path.join(dk, 'package.json'));
      fs.copyFileSync(path.join(w, 'package-lock.json'), path.join(dk, 'package-lock.json'));
      info.proyectos[p.nombre] = { lock: hash(path.join(dk, 'package-lock.json')), lockGenerado: !conLock };
      ok(`${p.nombre}: paquetes en la caché del kit`);
      // Motores de Prisma (solo si el proyecto usa Prisma). No hace falta el schema: se bajan con el script del paquete
      const eng = path.join(w, 'node_modules', '@prisma', 'engines');
      if (fs.existsSync(eng)) {
        titulo('Motores de Prisma');
        const manual = opcion('motores');
        let archivos = manual ? motoresEn(path.resolve(manual)) : [];
        if (manual) { if (!archivos.length) throw new Error(`No encuentro motores de Prisma en ${manual}`); }
        else {
          correr('npm rebuild @prisma/engines --ignore-scripts=false', w);
          archivos = motoresEn(eng);
        }
        if (!archivos.some((f) => f.endsWith('.node')) || !archivos.some((f) => f.startsWith('schema-engine'))) {
          throw new Error('No se obtuvieron los motores de Prisma (revise la conexión de esta PC) o indíquelos con --motores <carpeta>.');
        }
        fs.mkdirSync(MOTORES, { recursive: true });
        for (const f of archivos) fs.copyFileSync(path.join(manual ? path.resolve(manual) : eng, f), path.join(MOTORES, f));
        info.motores = archivos;
        info.prisma = leerJson(path.join(w, 'node_modules', 'prisma', 'package.json')).version;
        ok(`Prisma ${info.prisma}: motores en el kit (${archivos.join(', ')})`);
      }
    }
  } finally { fs.rmSync(trabajo, { recursive: true, force: true }); }
  if (tiene('postgres')) {
    titulo('PostgreSQL portátil para desarrollo');
    const ver = opcion('pgversion') ?? '16.6-1';
    const url = opcion('pg-url') ?? `https://get.enterprisedb.com/postgresql/postgresql-${ver}-windows-x64-binaries.zip`;   // --pg-url: otro origen (p. ej. un repositorio interno)
    fs.mkdirSync(PG_KIT, { recursive: true });
    await descargar(url, path.join(PG_KIT, `postgresql-${ver}-windows-x64-binaries.zip`));
    if (process.platform === 'win32') await descargar('https://aka.ms/vs/17/release/vc_redist.x64.exe', path.join(PG_KIT, 'vc_redist.x64.exe'));
    info.postgres = ver;
    ok(`PostgreSQL ${ver} en el kit`);
  }
  fs.copyFileSync(ESTE, path.join(KIT, 'kit.mjs'));
  fs.writeFileSync(path.join(KIT, 'kit.json'), JSON.stringify(info, null, 2));
  // Manifiesto con huella SHA-256 de lo que no es la caché de npm (miles de archivos): el área de seguridad puede verificarlo
  const lineas = [`Kit de desarrollo SPVI — ${info.preparado} — Node ${info.node} — ${info.plataforma}`];
  const recorrer = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const f = path.join(d, e.name);
    if (e.isDirectory()) { if (f !== CACHE) recorrer(f); } else if (e.name !== 'MANIFIESTO.txt') lineas.push(`${hash(f)}  ${path.relative(KIT, f)}`);
  });
  recorrer(KIT);
  fs.writeFileSync(path.join(KIT, 'MANIFIESTO.txt'), lineas.join('\n'));
  console.log(`\nKit listo en ${KIT}. Cópielo completo a la PC sin internet (lleva dentro kit.mjs).`);
}

// ───────────────────────────── instalar ─────────────────────────────
function instalar() {
  const ps = proyectos();
  if (!ps.length) uso('instalar --api <carpeta del api> [--portal <carpeta del portal>]');
  const info = meta();
  if (!fs.existsSync(CACHE)) throw new Error(`El kit está incompleto: falta ${CACHE}`);
  if (process.version.split('.')[0] !== info.node.split('.')[0]) aviso(`Esta PC tiene Node ${process.version} y el kit se preparó con ${info.node}. Use la misma versión mayor.`);
  if (`${process.platform}-${process.arch}` !== info.plataforma) aviso(`El kit se preparó en ${info.plataforma} y esta PC es ${process.platform}-${process.arch}: faltarán paquetes y motores propios de cada sistema.`);
  for (const p of ps) {
    const k = info.proyectos[p.nombre];
    if (!k) throw new Error(`El kit no se preparó con --${p.nombre}. Prepárelo de nuevo incluyéndolo.`);
    titulo(`${p.nombre}: instalar módulos desde el kit (sin internet)`);
    const dk = path.join(KIT, 'proyectos', p.nombre);
    // Diferencias entre las dependencias del kit y las del proyecto de esta PC
    const a = depsDe(dk), b = depsDe(p.dir);
    const dif = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((n) => a[n] !== b[n]).map((n) => `${n} (kit: ${a[n] ?? '—'} · proyecto: ${b[n] ?? '—'})`);
    if (dif.length) aviso(`${p.nombre}: el package.json es distinto al del kit en ${dif.length} paquete(s): ${dif.slice(0, 6).join('; ')}${dif.length > 6 ? '…' : ''}. Si la instalación falla con ENOTCACHED, prepare el kit de nuevo.`);
    const lock = path.join(p.dir, 'package-lock.json');
    if (!fs.existsSync(lock)) { fs.copyFileSync(path.join(dk, 'package-lock.json'), lock); aviso(`${p.nombre}: no tenía package-lock.json; se copió el del kit a ${lock} para instalar las mismas versiones.`); }
    else if (hash(lock) !== k.lock) aviso(`${p.nombre}: su package-lock.json es distinto al del kit. Si falla con ENOTCACHED, prepare el kit de nuevo.`);
    correr(`npm ci --offline --ignore-scripts --no-audit --no-fund --cache ${q(CACHE)}`, p.dir);
    ok(`${p.nombre}: módulos instalados`);
    // Prisma con los motores del kit (nada se descarga)
    const eng = path.join(p.dir, 'node_modules', '@prisma', 'engines');
    if (fs.existsSync(eng) && motoresEn(MOTORES).length) {
      for (const f of motoresEn(MOTORES)) fs.copyFileSync(path.join(MOTORES, f), path.join(eng, f));
      if (fs.existsSync(path.join(p.dir, 'prisma', 'schema.prisma'))) {
        const env = entornoPrisma(p.dir);
        correr('npx --no-install prisma generate', p.dir, env);
        const cliente = path.join(p.dir, 'node_modules', '.prisma', 'client');
        if (fs.existsSync(cliente)) fs.copyFileSync(env.PRISMA_QUERY_ENGINE_LIBRARY, path.join(cliente, path.basename(env.PRISMA_QUERY_ENGINE_LIBRARY)));
        ok(`${p.nombre}: cliente de Prisma generado con los motores del kit`);
      } else ok(`${p.nombre}: motores de Prisma copiados (no hay prisma\\schema.prisma para generar el cliente)`);
    }
  }
}

// ──────────────────────── compilar / probar ────────────────────────
function paso(p, nombre, env = {}) {
  if (!fs.existsSync(path.join(p.dir, 'node_modules'))) throw new Error(`${p.nombre}: no hay node_modules. Ejecute primero "instalar".`);
  if (!scriptsDe(p.dir).includes(nombre)) { resumen.push(`— ${p.nombre}: no tiene el script ${nombre}`); return true; }
  titulo(`${p.nombre}: npm run ${nombre}`);
  try { correr(`npm run ${nombre}`, p.dir, env); ok(`${p.nombre}: ${nombre}`); return true; }
  catch (e) { resumen.push(`✗ ${p.nombre}: ${nombre} — ${e.message}`); return false; }
}
function compilar() { const ps = proyectos(); if (!ps.length) uso('compilar --api <carpeta> [--portal <carpeta>]'); for (const p of ps) paso(p, 'build'); }
function probar() {
  const ps = proyectos(); if (!ps.length) uso('probar --api <carpeta> [--portal <carpeta>]');
  for (const p of ps) for (const n of ['typecheck', 'test']) paso(p, n, { CI: 'true' });   // CI: las pruebas corren una vez y terminan
}

// ───────────────────────────── prisma / entorno ─────────────────────────────
const apiPorDefecto = () => opcion('api') ?? (fs.existsSync(path.join(process.cwd(), 'prisma', 'schema.prisma')) ? process.cwd() : undefined);   // sin --api: la carpeta actual si es el API
function prisma() {
  const api = apiPorDefecto(); if (!api) uso('prisma --api <carpeta del api> -- migrate dev');
  const dir = carpetaDe(api);
  if (path.relative(path.join(KIT, 'proyectos'), dir).startsWith('..') === false) throw new Error(`${dir} es la copia de package.json que guarda el kit, no su código fuente. Ejecute el comando dentro de la carpeta del API.`);
  correr(`npx --no-install prisma ${pasados.map(q).join(' ')}`, dir, entornoPrisma(dir));
}
function entorno() {
  const api = apiPorDefecto(); if (!api) uso('entorno --api <carpeta del api>');
  const e = entornoPrisma(carpetaDe(api));
  console.log('Para que "npx prisma ..." no intente descargar nada en ESTA terminal:\n');
  console.log('PowerShell:\n' + Object.entries(e).map(([k, v]) => `  $env:${k}="${v}"`).join('\n'));
  console.log('\ncmd:\n' + Object.entries(e).map(([k, v]) => `  set ${k}=${v}`).join('\n'));
  console.log('\nbash:\n' + Object.entries(e).map(([k, v]) => `  export ${k}="${v}"`).join('\n'));
  console.log('\n(O use: node kit.mjs prisma --api <carpeta> -- <comando de prisma>)');
}

// ───────────────────────────── PostgreSQL de desarrollo ─────────────────────────────
async function descargar(url, destino) {
  if (fs.existsSync(destino)) return;
  console.log(`Descargando ${url}`);
  const r = await fetch(url, { redirect: 'follow' });
  if (!r.ok) throw new Error(`No se pudo descargar ${url} (HTTP ${r.status})`);
  const parcial = `${destino}.parte`;
  await pipeline(Readable.fromWeb(r.body), fs.createWriteStream(parcial));
  fs.renameSync(parcial, destino);
}
function extraer(zip, destino) {
  fs.mkdirSync(destino, { recursive: true });
  // Windows 10 o superior trae "tar" (bsdtar), que abre .zip; en otros sistemas se usa "unzip"
  let r = spawnSync('tar', ['-xf', zip, '-C', destino], { stdio: 'ignore' });
  if (r.status !== 0) r = spawnSync('unzip', ['-q', '-o', zip, '-d', destino], { stdio: 'ignore' });
  if (r.status !== 0) throw new Error('No se pudo descomprimir el zip de PostgreSQL (se necesita "tar" de Windows 10 o superior, o "unzip").');
}
function bd() {
  const win = process.platform === 'win32';
  const destino = path.resolve(opcion('destino') ?? path.join(win ? process.env.LOCALAPPDATA ?? os.homedir() : os.homedir(), win ? 'SPVI-dev' : '.spvi-dev'));
  const puerto = opcion('puerto') ?? '5432';
  const exe = (n) => path.join(destino, 'pgsql', 'bin', win ? `${n}.exe` : n);
  const datos = path.join(destino, 'data');
  const registro = path.join(destino, 'postgres.log');
  const claveEnv = { PGPASSWORD: 'spvi' };
  if (tiene('detener')) { correr(`${q(exe('pg_ctl'))} -D ${q(datos)} stop -m fast`, destino); ok('PostgreSQL de desarrollo detenido'); return; }
  if (!fs.existsSync(exe('pg_ctl'))) {
    const zip = fs.existsSync(PG_KIT) ? fs.readdirSync(PG_KIT).find((f) => /^postgresql-.+-binaries\.zip$/.test(f)) : undefined;
    if (!zip) throw new Error('El kit no trae PostgreSQL. Prepárelo con: node kit.mjs preparar --postgres   (o instale PostgreSQL en esta PC).');
    titulo('Extraer PostgreSQL portátil (no necesita instalación ni administrador)');
    const tmp = path.join(destino, 'tmp');
    fs.rmSync(tmp, { recursive: true, force: true });
    extraer(path.join(PG_KIT, zip), tmp);
    fs.rmSync(path.join(destino, 'pgsql'), { recursive: true, force: true });
    fs.renameSync(path.join(tmp, 'pgsql'), path.join(destino, 'pgsql'));
    fs.rmSync(tmp, { recursive: true, force: true });
    if (win && fs.existsSync(path.join(PG_KIT, 'vc_redist.x64.exe'))) console.log(`Si PostgreSQL no arranca por falta de librerías, instale: ${path.join(PG_KIT, 'vc_redist.x64.exe')}`);
  }
  if (!fs.existsSync(path.join(datos, 'PG_VERSION'))) {
    titulo('Crear la base de datos de desarrollo');
    const pw = path.join(destino, 'pw.tmp');
    fs.writeFileSync(pw, 'spvi\n');
    try { correr(`${q(exe('initdb'))} -D ${q(datos)} -U spvi -A scram-sha-256 --pwfile=${q(pw)} -E UTF8 --locale=C`, destino); } finally { fs.rmSync(pw, { force: true }); }
  }
  const estado = spawnSync(`${q(exe('pg_ctl'))} -D ${q(datos)} status`, { shell: true, stdio: 'ignore' });
  if (estado.status !== 0) {
    titulo(`Iniciar PostgreSQL en 127.0.0.1:${puerto}`);
    try { correr(`${q(exe('pg_ctl'))} -D ${q(datos)} -l ${q(registro)} -o "-p ${puerto} -c listen_addresses=127.0.0.1" -w start`, destino); }
    catch { throw new Error(`PostgreSQL no arrancó. ¿El puerto ${puerto} está ocupado? Pruebe con --puerto 5433. Detalle en: ${registro}\n  (No ejecute la terminal como administrador: PostgreSQL no arranca así.)`); }
  }
  const existe = spawnSync(`${q(exe('psql'))} -h 127.0.0.1 -p ${puerto} -U spvi -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='spvi'"`, { shell: true, encoding: 'utf8', env: { ...process.env, ...claveEnv } });
  if (existe.status !== 0) throw new Error(`No se pudo conectar a PostgreSQL en el puerto ${puerto}: ${existe.stderr}`);
  if (!existe.stdout.trim()) correr(`${q(exe('createdb'))} -h 127.0.0.1 -p ${puerto} -U spvi spvi`, destino, claveEnv);
  ok(`PostgreSQL de desarrollo listo (solo en este equipo, usuario y clave "spvi")`);
  ok(`DATABASE_URL=postgresql://spvi:spvi@127.0.0.1:${puerto}/spvi`);
  ok(`Para apagarlo: node kit.mjs bd --detener${opcion('puerto') ? ` --puerto ${puerto}` : ''}`);
}

const acciones = { preparar, instalar, compilar, probar, prisma, entorno, bd };
try {
  if (!acciones[accion]) { console.log(fs.readFileSync(ESTE, 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\*?/, '').replace(/^ \* ?/gm, '')); process.exit(accion ? 1 : 0); }
  await acciones[accion]();
  if (resumen.length) { console.log('\n── Resumen ──'); resumen.forEach((l) => console.log(l)); }
  if (resumen.some((l) => l.startsWith('✗'))) process.exit(1);
} catch (e) { console.error(`\n✗ ${e.message}`); process.exit(1); }
