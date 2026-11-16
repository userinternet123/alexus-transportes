'use strict'
// ── Utilidades ───────────────────────────────────────────────────────────────
const $ = (s) => document.querySelector(s)
// Todo texto que viene de las tiendas se escapa antes de mostrarse
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const fecha = (f) => (f ? new Date(f).toLocaleString('es-GT', { dateStyle: 'short', timeStyle: 'short' }) : '—')
const hace = (f) => {
  if (!f) return 'nunca'
  const m = Math.round((Date.now() - new Date(f)) / 60000)
  return m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} d`
}
let token = sessionStorage.getItem('central_token')
let urlPublica = null // dirección para las tiendas (puede diferir del panel privado)
async function api(ruta, opciones = {}) {
  const r = await fetch(`/api${ruta}`, { ...opciones, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opciones.headers || {}) }, body: opciones.body ? JSON.stringify(opciones.body) : undefined })
  if (r.status === 401) { salir(); throw new Error('Sesión vencida') }
  const datos = await r.json().catch(() => ({}))
  if (!r.ok) { alert(datos.message || 'Error'); throw new Error(datos.message) }
  return datos
}
function salir() { sessionStorage.removeItem('central_token'); token = null; pintarLogin() }
function cerrarHoja() { $('#hoja')?.remove() }
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrarHoja() })
function hoja(html) {
  cerrarHoja()
  const d = document.createElement('div')
  d.id = 'hoja'; d.className = 'hoja'
  d.innerHTML = `<div><p style="text-align:right;margin:0"><button type="button" class="btn" id="cerrar-hoja">Cerrar</button></p>${html}</div>`
  d.querySelector('#cerrar-hoja').onclick = cerrarHoja
  d.addEventListener('mousedown', (e) => { if (e.target === d) cerrarHoja() })
  document.body.appendChild(d)
}

// ── Acceso ───────────────────────────────────────────────────────────────────
function pintarLogin() {
  $('#raiz').innerHTML = `<form class="login" id="f"><h2>SPVI Central</h2><p class="sec">Panel del proveedor</p>
    <label>Correo<input name="email" type="email" required autocomplete="username"></label>
    <label>Contraseña<input name="password" type="password" required autocomplete="current-password"></label>
    <p><button class="btn p" style="width:100%">Ingresar</button></p></form>`
  $('#f').onsubmit = async (e) => {
    e.preventDefault()
    const f = new FormData(e.target)
    const r = await fetch('/api/panel/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(f)) })
    const d = await r.json()
    if (!r.ok) return alert(d.message || 'No se pudo ingresar')
    token = d.token; sessionStorage.setItem('central_token', token); pintarApp('resumen')
  }
}

// ── Aplicación ───────────────────────────────────────────────────────────────
const SECCIONES = { resumen: 'Resumen', clientes: 'Clientes e instalaciones', licencias: 'Licencias', experiencia: 'Experiencia de clientes', soporte: 'Soporte', errores: 'Errores', anuncios: 'Anuncios y avisos', versiones: 'Versiones' }
function pintarApp(seccion) {
  $('#raiz').innerHTML = `<div class="app"><nav><h1>SPVI Central</h1>
    ${Object.entries(SECCIONES).map(([k, v]) => `<button data-s="${k}" class="${k === seccion ? 'activo' : ''}">${v}</button>`).join('')}
    <button class="salir" id="salir">Cerrar sesión</button></nav><main id="m"></main></div>`
  document.querySelectorAll('nav [data-s]').forEach((b) => (b.onclick = () => pintarApp(b.dataset.s)))
  $('#salir').onclick = salir
  VISTAS[seccion]()
}

const VISTAS = {
  async resumen() {
    const r = await api('/panel/resumen')
    urlPublica = r.urlPublica
    $('#m').innerHTML = `<h2>Resumen</h2><div class="tarjetas">
      <div class="tarjeta"><div class="t">Instalaciones activas</div><div class="n">${r.instalaciones}</div></div>
      <div class="tarjeta"><div class="t">En línea (24 h)</div><div class="n">${r.enLinea}</div></div>
      <div class="tarjeta"><div class="t">Tickets abiertos</div><div class="n">${r.ticketsAbiertos}</div></div>
      <div class="tarjeta"><div class="t">Errores nuevos (24 h)</div><div class="n">${r.errores24}</div></div></div>
      <table><thead><tr><th>Versión</th><th>Instalaciones</th></tr></thead><tbody>
      ${r.versiones.map((v) => `<tr><td>${esc(v.version)}</td><td>${v.instalaciones}</td></tr>`).join('') || '<tr><td colspan="2" class="sec">Sin datos</td></tr>'}</tbody></table>`
  },

  async licencias() {
    const r = await api('/panel/licencias')
    const clientes = await api('/panel/clientes')
    const LIM = [['sucursales', 'Sucursales'], ['bodegas', 'Bodegas'], ['cajas', 'Cajas'], ['usuarios', 'Usuarios activos']]
    const chip = { VIGENTE: 'chip ok', REEMPLAZADA: 'chip', REVOCADA: 'chip mal' }
    const masDias = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10)
    const limTxt = (l) => LIM.map(([k, t]) => `${t}: ${l?.[k] ?? '∞'}`).join(' · ')
    $('#m').innerHTML = `<h2>Licencias</h2>
      <div class="barra"><button class="btn primario" id="emitir">Emitir licencia</button> <button class="btn" id="planes">Planes</button> <button class="btn" id="llave">Llave pública</button></div>
      <table><thead><tr><th>Licencia</th><th>Cliente</th><th>Entrega</th><th>Plan</th><th>Vence</th><th>Equipo</th><th>Estado</th><th></th></tr></thead><tbody>
      ${r.licencias.map((l) => `<tr><td>${esc(l.numero || l.id)}<div class="sec">${esc(String(l.emitidaEn).slice(0, 10))} · ${esc(l.emitidaPor)}</div></td><td>${esc(l.cliente)}<div class="sec">NIT ${esc(l.nit)}</div></td>
        <td>${l.entrega === 'CENTRAL' ? `Central<div class="sec">${esc(l.instalacion || '')}</div>` : 'Archivo'}</td><td>${esc(l.plan)}<div class="sec">${esc(limTxt(l.contenido?.limites))}</div></td><td>${esc(l.vence)}</td><td><code>${esc(l.equipo || '—')}</code></td>
        <td><span class="${chip[l.estado] || 'chip'}">${esc(l.estado)}</span>${l.nota ? `<div class="sec">${esc(l.nota)}</div>` : ''}</td>
        <td>${l.estado !== 'REVOCADA' ? `<button class="btn" data-arch="${l.id}">Archivo</button> <button class="btn" data-rev="${l.id}">Revocar</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="8" class="sec">Todavía no hay licencias emitidas</td></tr>'}</tbody></table>`
    const descargar = async (id) => {
      const res = await fetch(`/api/panel/licencias/${id}/archivo`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) return alert('No se pudo descargar')
      const nombre = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')?.[1] || 'licencia.lic'
      const a = document.createElement('a'); a.href = URL.createObjectURL(await res.blob()); a.download = nombre; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000)
    }
    document.querySelectorAll('[data-arch]').forEach((b) => (b.onclick = () => descargar(b.dataset.arch)))
    document.querySelectorAll('[data-rev]').forEach((b) => (b.onclick = async () => {
      const motivo = prompt('Motivo de la revocación (la tienda se bloqueará):'); if (!motivo) return
      const x = await api(`/panel/licencias/${b.dataset.rev}/revocar`, { method: 'POST', body: { motivo } }); alert(x.message); VISTAS.licencias()
    }))
    $('#llave').onclick = async () => {
      const { publica } = await api('/panel/licencias/llave-publica')
      hoja(`<h2>Llave pública de licencias</h2><p class="sec">Va dentro del instalador de SPVI, en <code>apps/api/src/modules/licencia/clave-publica.ts</code>. La privada nunca sale de Central (se respalda con su base de datos).</p>
        <textarea rows="5" readonly id="pub" style="width:100%;font-family:monospace">${esc(publica)}</textarea>
        <p class="sec">Contenido del archivo:</p><textarea rows="6" readonly style="width:100%;font-family:monospace">export const CLAVE_PUBLICA_LICENCIAS = \`${esc(publica.trim())}\`;</textarea>`)
    }
    $('#planes').onclick = () => {
      const fila = (pl) => `<tr><td><b>${esc(pl.nombre)}</b><div class="sec">${esc(pl.clave)}</div></td><td>${pl.modulos.map((m) => esc(r.modulos[m] || m)).join(', ')}</td><td>${esc(limTxt(pl.limites))}</td><td>${pl.vigenciaDias} días</td><td><button class="btn" data-plan="${pl.id}">Editar</button></td></tr>`
      hoja(`<h2>Planes</h2><p class="sec">Son plantillas: al emitir una licencia se parte de un plan y se ajusta. Cambiar un plan no altera las licencias ya emitidas.</p>
        <table><tbody>${r.planes.map(fila).join('')}</tbody></table><button class="btn" data-plan="nuevo">Nuevo plan</button><div id="editor-plan"></div>`)
      document.querySelectorAll('[data-plan]').forEach((b) => (b.onclick = () => {
        const pl = r.planes.find((x) => String(x.id) === b.dataset.plan) || { clave: '', nombre: '', modulos: ['pos', 'inventario'], limites: { sucursales: 1, bodegas: 1, cajas: 1, usuarios: 3 }, vigenciaDias: 365, reportesConfigurables: true, activo: true }
        $('#editor-plan').innerHTML = `<form id="fp"><h3>${pl.id ? 'Editar' : 'Nuevo'} plan</h3><label>Clave<input name="clave" value="${esc(pl.clave)}" required ${pl.id ? 'readonly' : ''}></label><label>Nombre<input name="nombre" value="${esc(pl.nombre)}" required></label>
          <fieldset><legend>Módulos</legend>${Object.entries(r.modulos).map(([k, t]) => `<label class="sec"><input type="checkbox" name="mod" value="${k}" ${pl.modulos.includes(k) ? 'checked' : ''}> ${esc(t)}</label>`).join('<br>')}</fieldset>
          <fieldset><legend>Límites (vacío = sin límite)</legend>${LIM.map(([k, t]) => `<label>${t}<input type="number" min="1" name="lim_${k}" value="${pl.limites?.[k] ?? ''}"></label>`).join('')}</fieldset>
          <label>Vigencia (días)<input type="number" name="vigenciaDias" min="1" value="${pl.vigenciaDias}"></label><button class="btn primario">Guardar plan</button></form>`
        $('#fp').onsubmit = async (e) => {
          e.preventDefault(); const f = new FormData(e.target)
          await api('/panel/licencias/planes', { method: 'PUT', body: { ...(pl.id ? { id: pl.id } : {}), clave: f.get('clave'), nombre: f.get('nombre'), modulos: f.getAll('mod'), reportesConfigurables: true, vigenciaDias: Number(f.get('vigenciaDias')) || 365, activo: true,
            limites: Object.fromEntries(LIM.map(([k]) => [k, f.get(`lim_${k}`) ? Number(f.get(`lim_${k}`)) : null])) } })
          cerrarHoja(); VISTAS.licencias()
        }
      }))
    }
    $('#emitir').onclick = () => {
      const planesActivos = r.planes.filter((p) => p.activo)
      hoja(`<h2>Emitir licencia</h2>
        <form id="fe">
          <label>Entrega<select name="entrega" id="entrega"><option value="CENTRAL">Por Central (la tienda la recibe sola)</option><option value="ARCHIVO">Por archivo (tienda sin internet)</option></select></label>
          <label id="l-inst">Instalación<select name="instalacionId" id="inst"><option value="">Elija…</option>${r.instalaciones.map((i) => `<option value="${esc(i.id)}" data-cliente="${i.clienteId}" data-equipo="${esc(i.equipo || '')}">${esc(i.cliente.empresa)} · ${esc(i.nombre)}</option>`).join('')}</select></label>
          <p class="sec" id="equipo-inst"></p>
          <label id="l-cli" style="display:none">Cliente<select name="clienteId" id="cli"><option value="">Elija…</option>${clientes.map((c) => `<option value="${c.id}">${esc(c.empresa)} (NIT ${esc(c.nit)})</option>`).join('')}</select></label>
          <label id="l-eq" style="display:none">Código del equipo (se lo dicta la tienda)<input name="equipo" id="eq" placeholder="K7QM-2XPA-8RTN-4WZB" style="text-transform:uppercase"></label>
          <label>Plan<select name="plan" id="plan">${planesActivos.map((p) => `<option value="${esc(p.clave)}">${esc(p.nombre)}</option>`).join('')}</select></label>
          <fieldset><legend>Módulos</legend><div id="mods"></div></fieldset>
          <fieldset><legend>Límites (vacío = sin límite)</legend>${LIM.map(([k, t]) => `<label>${t}<input type="number" min="1" name="lim_${k}" id="lim_${k}"></label>`).join('')}</fieldset>
          <label>Vence<input type="date" name="vence" id="vence" required></label>
          <label>Días de gracia después de vencer<input type="number" name="diasGracia" id="gracia" min="0" max="60" value="7"></label>
          <label>Nota (opcional)<input name="nota" maxlength="300"></label>
          <button class="btn primario">Emitir y firmar</button>
        </form><div id="resultado"></div>`)
      const aplicarPlan = () => {
        const pl = planesActivos.find((p) => p.clave === $('#plan').value); if (!pl) return
        $('#mods').innerHTML = Object.entries(r.modulos).map(([k, t]) => `<label class="sec"><input type="checkbox" name="mod" value="${k}" ${pl.modulos.includes(k) ? 'checked' : ''}> ${esc(t)}</label>`).join('<br>')
        LIM.forEach(([k]) => { $(`#lim_${k}`).value = pl.limites?.[k] ?? '' })
        // Por archivo vence antes (30 días): una tienda sin internet no se entera de una revocación hasta que vence
        $('#vence').value = masDias($('#entrega').value === 'ARCHIVO' ? 30 : pl.vigenciaDias)
      }
      const aplicarEntrega = () => {
        const archivo = $('#entrega').value === 'ARCHIVO'
        $('#l-inst').style.display = archivo ? 'none' : ''; $('#equipo-inst').style.display = archivo ? 'none' : ''
        $('#l-cli').style.display = archivo ? '' : 'none'; $('#l-eq').style.display = archivo ? '' : 'none'
        $('#gracia').value = archivo ? 3 : 7; aplicarPlan()
      }
      $('#inst').onchange = () => { const o = $('#inst').selectedOptions[0]; $('#equipo-inst').textContent = o?.dataset.equipo ? `Se atará al equipo ${o.dataset.equipo} (reportado por la tienda).` : o?.value ? 'Esta instalación todavía no reporta su equipo: la licencia no quedará atada a un equipo.' : '' }
      $('#plan').onchange = aplicarPlan; $('#entrega').onchange = aplicarEntrega; aplicarEntrega()
      $('#fe').onsubmit = async (e) => {
        e.preventDefault(); const f = new FormData(e.target); const archivo = f.get('entrega') === 'ARCHIVO'
        const opt = $('#inst').selectedOptions[0]
        const cuerpo = {
          entrega: f.get('entrega'), plan: f.get('plan'), modulos: f.getAll('mod'), reportes: '*', reportesConfigurables: true, vence: f.get('vence'), diasGracia: Number(f.get('diasGracia')),
          limites: Object.fromEntries(LIM.map(([k]) => [k, f.get(`lim_${k}`) ? Number(f.get(`lim_${k}`)) : null])), nota: f.get('nota') || null,
          ...(archivo ? { clienteId: Number(f.get('clienteId')), equipo: String(f.get('equipo') || '').toUpperCase() } : { instalacionId: f.get('instalacionId'), clienteId: Number(opt?.dataset.cliente) }),
        }
        const x = await api('/panel/licencias', { method: 'POST', body: cuerpo })
        $('#resultado').innerHTML = `<p class="chip ok">Licencia ${esc(x.numero)} emitida${x.equipo ? ` para el equipo ${esc(x.equipo)}` : ''}.</p>${archivo ? `<button class="btn primario" id="bajar">Descargar ${esc(x.archivo)}</button>` : '<p class="sec">La tienda la recibirá en su próximo contacto (máximo unas horas).</p>'}`
        if (archivo) $('#bajar').onclick = () => descargar(x.id)
      }
    }
  },

  async experiencia() {
    const dias = window.__diasExp || 30
    const r = await api('/panel/experiencia?dias=' + dias)
    const NOMBRES = { 'pos.venta': 'Venta en el punto de venta', 'pos.cotizacion': 'Cotización en el punto de venta' }
    const evento = (e) => NOMBRES[e] || (e.startsWith('pantalla:') ? 'Pantalla ' + e.slice(9) : e.startsWith('documento.') ? 'Documento por ' + e.split('.').slice(1).join(' ') : e)
    const OBJ = { 'vender-mas': 'Vender más', 'controlar-inventario': 'Controlar inventario', 'reducir-perdidas': 'Reducir pérdidas', 'facturar-fel': 'Facturar FEL', 'conocer-numeros': 'Conocer sus números', 'crecer-sucursales': 'Más sucursales', 'ahorrar-tiempo': 'Ahorrar tiempo' }
    const comparten = r.instalaciones.filter((i) => i.consentimiento === true)
    const enRiesgo = comparten.filter((i) => !i.eventos)
    const maxF = Math.max(1, ...r.funciones.map((f) => f.veces))
    const barra = (v, m) => `<div style="height:6px;background:#e5e7eb;border-radius:3px"><div style="height:6px;width:${Math.round((v / m) * 100)}%;background:#16a34a;border-radius:3px"></div></div>`
    const tipo = { NPS: 'Recomendación', UTIL: '¿Le sirvió?', SUGERENCIA: 'Sugerencia' }
    $('#m').innerHTML = `<h2>Experiencia de los clientes</h2>
      <div class="barra"><label>Período <select id="dexp">${[7, 30, 90, 365].map((d) => `<option value="${d}" ${d == dias ? 'selected' : ''}>Últimos ${d} días</option>`).join('')}</select></label></div>
      <div class="tarjetas">
        <div class="tarjeta"><div class="t">Recomendación (NPS, −100 a 100)</div><div class="n">${r.nps.puntuacion ?? '—'}</div><div class="sec">${r.nps.promotores} recomiendan · ${r.nps.pasivos} neutros · ${r.nps.detractores} no recomiendan</div></div>
        <div class="tarjeta"><div class="t">Comparten su uso</div><div class="n">${comparten.length} de ${r.instalaciones.length}</div></div>
        <div class="tarjeta"><div class="t">Sin uso en ${dias} días</div><div class="n">${enRiesgo.length}</div><div class="sec">Riesgo de que cancelen</div></div>
        <div class="tarjeta"><div class="t">Opiniones con comentario</div><div class="n">${r.opiniones.length}</div></div>
      </div>
      <h3>Tiendas</h3>
      <table><thead><tr><th>Tienda</th><th>Comparte uso</th><th>Uso (${dias} días)</th><th>Último uso</th><th>Recomendación</th><th>Giro</th></tr></thead><tbody>
      ${r.instalaciones.map((i) => `<tr><td>${esc(i.empresa)}<div class="sec">${esc(i.nombre)}</div></td>
        <td>${i.consentimiento === true ? '<span class="chip ok">Sí</span>' : i.consentimiento === false ? '<span class="chip">No</span>' : '<span class="sec">Sin decidir</span>'}</td>
        <td>${i.consentimiento === true && !i.eventos ? '<span class="chip mal">Sin uso</span>' : (i.eventos || 0).toLocaleString('es-GT')}</td>
        <td>${i.ultimoUso ? esc(String(i.ultimoUso).slice(0, 10)) : '—'}</td><td>${i.nps ?? '—'}</td><td>${esc((i.perfil && i.perfil.giro) || '—')}</td></tr>`).join('') || '<tr><td colspan="6" class="sec">Sin tiendas</td></tr>'}</tbody></table>
      <h3>Funciones más usadas</h3>
      <table><thead><tr><th>Función o pantalla</th><th>Veces</th><th style="width:40%"></th></tr></thead><tbody>
      ${r.funciones.map((f) => `<tr><td>${esc(evento(f.evento))}</td><td>${f.veces.toLocaleString('es-GT')}</td><td>${barra(f.veces, maxF)}</td></tr>`).join('') || '<tr><td colspan="3" class="sec">Todavía no hay datos de uso</td></tr>'}</tbody></table>
      <p class="sec">Dispositivos: ${r.dispositivos.map((d) => `${esc(d.dispositivo)} ${d.veces.toLocaleString('es-GT')}`).join(' · ') || '—'}</p>
      <h3>Lo que quieren lograr</h3>
      <p>${r.objetivos.map((o) => `<span class="chip">${esc(OBJ[o.objetivo] || o.objetivo)}: ${o.n}</span>`).join(' ') || '<span class="sec">Sin perfiles todavía</span>'}</p>
      <p class="sec">Giros: ${r.giros.map((g) => `${esc(g.giro)} (${g.n})`).join(' · ') || '—'}</p>
      <h3>Opiniones recientes</h3>
      <table><thead><tr><th>Fecha</th><th>Tienda</th><th>Tipo</th><th>Opinión</th></tr></thead><tbody>
      ${r.opiniones.map((o) => `<tr><td>${esc(String(o.fecha).slice(0, 10))}</td><td>${esc(o.tienda)}${o.contacto ? `<div class="sec">${esc(o.contacto)}</div>` : ''}</td>
        <td>${tipo[o.tipo] || esc(o.tipo)}${o.puntaje !== null && o.puntaje !== undefined ? ` <b>${o.tipo === 'UTIL' ? (o.puntaje ? '👍' : '👎') : o.puntaje}</b>` : ''}${o.pantalla ? `<div class="sec">${esc(o.pantalla)}</div>` : ''}</td><td>${esc(o.texto || '')}</td></tr>`).join('') || '<tr><td colspan="4" class="sec">Sin opiniones todavía</td></tr>'}</tbody></table>`
    $('#dexp').onchange = (e) => { window.__diasExp = Number(e.target.value); VISTAS.experiencia() }
  },

  async clientes() {
    const [clientes, inst] = await Promise.all([api('/panel/clientes'), api('/panel/instalaciones')])
    $('#m').innerHTML = `<h2>Clientes e instalaciones</h2>
      <div class="barra"><button class="btn p" id="nc">Nuevo cliente</button><button class="btn" id="ni">Nueva instalación</button></div>
      <table><thead><tr><th>Instalación</th><th>Cliente</th><th>Versión</th><th>Licencia</th><th>Último contacto</th><th>Estado</th><th></th></tr></thead><tbody>
      ${inst.map((i) => `<tr><td>${esc(i.nombre)}<div class="sec">${esc(i.sistema || '')}</div></td><td>${esc(i.cliente.empresa)}</td><td>${esc(i.version || '—')}<div class="sec">${esc(i.canal)}</div></td><td>${resumenLicencia(i.licencia)}<div class="sec">instalada: ${esc(i.plan || '—')}</div></td>
        <td>${hace(i.ultimoContacto)}</td><td>${!i.activa ? '<span class="chip mal">Revocada</span>' : i.ultimoContacto && Date.now() - new Date(i.ultimoContacto) < 86400000 ? '<span class="chip ok">En línea</span>' : '<span class="chip warn">Sin contacto</span>'}</td>
        <td><button class="btn" data-lic="${i.id}">Licencia</button> <button class="btn" data-tok="${i.id}">Nuevo token</button> <button class="btn" data-act="${i.id}" data-v="${!i.activa}">${i.activa ? 'Revocar' : 'Reactivar'}</button></td></tr>`).join('') || '<tr><td colspan="7" class="sec">Aún no hay instalaciones</td></tr>'}</tbody></table>`
    $('#nc').onclick = () => {
      hoja(`<h2>Nuevo cliente</h2><form id="fc"><label>Empresa<input name="empresa" required></label><label>NIT<input name="nit" required></label>
        <label>Contacto<input name="contacto"></label><label>Teléfono<input name="telefono"></label><label>Correo<input name="email" type="email"></label>
        <label>Giro<input name="giro" placeholder="Abarrotería, ferretería…"></label><p><button class="btn p">Guardar</button></p></form>`)
      $('#fc').onsubmit = async (e) => { e.preventDefault(); const d = Object.fromEntries(new FormData(e.target)); Object.keys(d).forEach((k) => !d[k] && delete d[k]); await api('/panel/clientes', { method: 'POST', body: d }); cerrarHoja(); VISTAS.clientes() }
    }
    $('#ni').onclick = () => {
      hoja(`<h2>Nueva instalación</h2><form id="fi"><label>Cliente<select name="clienteId" required>${clientes.map((c) => `<option value="${c.id}">${esc(c.empresa)}</option>`).join('')}</select></label>
        <label>Nombre<input name="nombre" required placeholder="Sucursal centro, servidor"></label>
        <label>Canal<select name="canal"><option value="estable">Estable</option><option value="pruebas">Pruebas (recibe versiones antes)</option></select></label>
        <p><button class="btn p">Crear y generar token</button></p></form><div id="tok"></div>`)
      $('#fi').onsubmit = async (e) => {
        e.preventDefault(); const d = Object.fromEntries(new FormData(e.target))
        const r = await api('/panel/instalaciones', { method: 'POST', body: { ...d, clienteId: Number(d.clienteId) } })
        mostrarToken(r.token)
      }
    }
    document.querySelectorAll('[data-tok]').forEach((b) => (b.onclick = async () => {
      if (!confirm('El token actual dejará de funcionar. ¿Generar uno nuevo?')) return
      const r = await api(`/panel/instalaciones/${b.dataset.tok}/token`, { method: 'POST' }); hoja('<h2>Nuevo token</h2><div id="tok"></div>'); mostrarToken(r.token)
    }))
    document.querySelectorAll('[data-act]').forEach((b) => (b.onclick = async () => { await api(`/panel/instalaciones/${b.dataset.act}`, { method: 'PUT', body: { activa: b.dataset.v === 'true' } }); VISTAS.clientes() }))
    document.querySelectorAll('[data-lic]').forEach((b) => (b.onclick = () => {
      const i = inst.find((x) => x.id === b.dataset.lic)
      hoja(`<h2>Licencia de ${esc(i.nombre)}</h2>
        <p class="sec">Emita la licencia en su PC (<code>npm run licencia:emitir -- … --agregar giros</code>) y péguela aquí. La tienda verifica la firma y la instala en su próximo contacto (máximo 6 horas, o al reiniciar SPVI).</p>
        <form id="fl"><label>Licencia firmada<textarea name="licencia" rows="6" placeholder="eyJ…">${esc(i.licencia || '')}</textarea></label>
        <div id="prev" class="sec"></div><p><button class="btn p">Guardar</button></p></form>`)
      const area = document.querySelector('#fl textarea')
      const vista = () => { document.querySelector('#prev').innerHTML = area.value.trim() ? resumenLicencia(area.value.trim(), true) : '' }
      area.oninput = vista; vista()
      document.querySelector('#fl').onsubmit = async (e) => { e.preventDefault(); const r = await api(`/panel/instalaciones/${i.id}/licencia`, { method: 'PUT', body: { licencia: area.value.trim() || null } }); alert(r.message); cerrarHoja(); VISTAS.clientes() }
    }))
  },

  async soporte(estado = '') {
    const lista = await api(`/panel/tickets${estado ? `?estado=${estado}` : ''}`)
    $('#m').innerHTML = `<h2>Soporte</h2><div class="barra">
      <select id="fe" style="width:auto"><option value="">Pendientes</option><option value="ABIERTO">Abiertos</option><option value="EN_PROCESO">En proceso</option><option value="RESUELTO">Resueltos</option></select></div>
      <table><thead><tr><th>#</th><th>Asunto</th><th>Cliente</th><th>Usuario</th><th>Estado</th><th>Actualizado</th></tr></thead><tbody>
      ${lista.map((t) => `<tr class="clic" data-t="${t.id}"><td>${t.id}</td><td>${t.prioridad === 'ALTA' ? '<span class="chip mal">Alta</span> ' : ''}${esc(t.asunto)}<div class="sec">${t._count.mensajes} mensajes</div></td>
        <td>${esc(t.instalacion.cliente.empresa)}<div class="sec">${esc(t.instalacion.nombre)}</div></td><td>${esc(t.usuarioNombre)}</td>
        <td><span class="chip ${t.estado === 'RESUELTO' ? 'ok' : t.estado === 'ABIERTO' ? 'warn' : ''}">${t.estado.replace('_', ' ')}</span></td><td>${hace(t.actualizadoEn)}</td></tr>`).join('') || '<tr><td colspan="6" class="sec">Sin tickets</td></tr>'}</tbody></table>`
    $('#fe').value = estado
    $('#fe').onchange = (e) => VISTAS.soporte(e.target.value)
    document.querySelectorAll('[data-t]').forEach((tr) => (tr.onclick = () => abrirTicket(Number(tr.dataset.t))))
  },

  async errores(resueltos = false) {
    const lista = await api(`/panel/errores?resueltos=${resueltos}`)
    $('#m').innerHTML = `<h2>Errores</h2><div class="barra"><button class="btn ${!resueltos ? 'p' : ''}" id="ep">Pendientes</button><button class="btn ${resueltos ? 'p' : ''}" id="er">Resueltos</button></div>
      <table><thead><tr><th>Error</th><th>Origen</th><th>Cliente</th><th>Versión</th><th>Veces</th><th>Última vez</th></tr></thead><tbody>
      ${lista.map((e) => `<tr class="clic" data-e="${e.id}"><td>${esc(e.mensaje.slice(0, 140))}<div class="sec">${esc(e.ruta || '')}</div></td><td><span class="chip">${e.origen}</span></td>
        <td>${esc(e.instalacion.cliente.empresa)}</td><td>${esc(e.version || '—')}</td><td>${e.conteo}</td><td>${hace(e.ultimaVez)}</td></tr>`).join('') || '<tr><td colspan="6" class="sec">Sin errores</td></tr>'}</tbody></table>`
    $('#ep').onclick = () => VISTAS.errores(false); $('#er').onclick = () => VISTAS.errores(true)
    document.querySelectorAll('[data-e]').forEach((tr) => (tr.onclick = () => {
      const e = lista.find((x) => x.id === Number(tr.dataset.e))
      hoja(`<h2>Error</h2><p>${esc(e.mensaje)}</p><p class="sec">${esc(e.instalacion.cliente.empresa)}, ${esc(e.instalacion.nombre)}. Ocurrió ${e.conteo} veces, desde ${fecha(e.primeraVez)} hasta ${fecha(e.ultimaVez)}.</p>
        ${e.stack ? `<pre>${esc(e.stack)}</pre>` : ''}<p><button class="btn p" id="res">${e.resuelto ? 'Marcar como pendiente' : 'Marcar como resuelto'}</button></p>`)
      $('#res').onclick = async () => { await api(`/panel/errores/${e.id}`, { method: 'PUT', body: { resuelto: !e.resuelto } }); cerrarHoja(); VISTAS.errores(resueltos) }
    }))
  },

  async anuncios() {
    const lista = await api('/panel/anuncios')
    $('#m').innerHTML = `<h2>Anuncios y avisos</h2><p class="sec">Los avisos llegan a todos los planes indicados. La publicidad se recomienda solo para el plan Básico. Nunca se muestran durante el cobro.</p>
      <div class="barra"><button class="btn p" id="na">Nuevo anuncio</button></div>
      <table><thead><tr><th>Título</th><th>Tipo</th><th>Dónde</th><th>Planes</th><th>Vigencia</th><th>Impresiones</th><th>Clics</th><th>Estado</th></tr></thead><tbody>
      ${lista.map((a) => `<tr class="clic" data-a="${a.id}"><td>${esc(a.titulo)}<div class="sec">${esc(a.texto.slice(0, 80))}</div></td><td><span class="chip ${a.tipo === 'publicidad' ? 'warn' : ''}">${a.tipo}</span></td>
        <td>${a.ubicaciones.join(', ')}</td><td>${a.planes.length ? esc(a.planes.join(', ')) : 'Todos'}</td><td>${fecha(a.desde).split(' ')[0]} a ${a.hasta ? fecha(a.hasta).split(' ')[0] : 'sin fin'}</td>
        <td>${a.impresiones}</td><td>${a.clics}${a.impresiones ? ` <span class="sec">(${((a.clics / a.impresiones) * 100).toFixed(1)}%)</span>` : ''}</td><td>${a.activo ? '<span class="chip ok">Activo</span>' : '<span class="chip">Pausado</span>'}</td></tr>`).join('') || '<tr><td colspan="8" class="sec">Sin anuncios</td></tr>'}</tbody></table>`
    $('#na').onclick = () => formularioAnuncio()
    document.querySelectorAll('[data-a]').forEach((tr) => (tr.onclick = () => formularioAnuncio(lista.find((x) => x.id === Number(tr.dataset.a)))))
  },

  async versiones() {
    const lista = await api('/panel/versiones')
    $('#m').innerHTML = `<h2>Versiones</h2><p class="sec">Publique aquí cada instalador. Las tiendas del canal correspondiente verán el aviso de actualización. Un parche crítico se muestra con prioridad.</p>
      <div class="barra"><button class="btn p" id="nv">Publicar versión</button></div>
      <table><thead><tr><th>Versión</th><th>Canal</th><th>Notas</th><th>Publicada</th><th></th></tr></thead><tbody>
      ${lista.map((v) => `<tr><td><b>${esc(v.numero)}</b></td><td>${esc(v.canal)}</td><td>${esc(v.notas.slice(0, 120))}</td><td>${fecha(v.publicada)}</td><td>${v.critica ? '<span class="chip mal">Seguridad</span>' : ''}</td></tr>`).join('') || '<tr><td colspan="5" class="sec">Sin versiones</td></tr>'}</tbody></table>`
    $('#nv').onclick = () => {
      hoja(`<h2>Publicar versión</h2><form id="fv"><label>Número<input name="numero" required placeholder="2.3.0"></label>
        <label>Canal<select name="canal"><option value="pruebas">Pruebas (primero)</option><option value="estable">Estable</option></select></label>
        <label>Notas para el cliente<textarea name="notas" rows="5" required placeholder="Qué hay de nuevo, en lenguaje sencillo"></textarea></label>
        <label>Enlace de descarga del instalador<input name="url" type="url" required></label>
        <label>SHA-256 (archivo .sha256 que genera empaquetar.ps1)<input name="sha256" required></label>
        <label><input type="checkbox" name="critica" style="width:auto"> Parche de seguridad (se avisa con prioridad)</label>
        <p><button class="btn p">Publicar</button></p></form>`)
      $('#fv').onsubmit = async (e) => { e.preventDefault(); const d = Object.fromEntries(new FormData(e.target)); await api('/panel/versiones', { method: 'POST', body: { ...d, sha256: d.sha256.trim().split(/\s+/)[0], critica: d.critica === 'on' } }); cerrarHoja(); VISTAS.versiones() }
    }
  },
}

/** Resumen legible de una licencia (sin verificar la firma: eso lo hace la tienda). */
function resumenLicencia(token, detallado = false) {
  if (!token) return '<span class="sec">Sin asignar</span>'
  try {
    const b64 = token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/')
    const l = JSON.parse(decodeURIComponent(escape(atob(b64 + '==='.slice((b64.length + 3) % 4)))))
    const base = `${esc(l.plan)} · vence ${esc(l.vence)}`
    return detallado ? `<b>${esc(l.empresa)}</b> (NIT ${esc(l.nit)})<br>${base}<br>Módulos: ${esc((l.modulos || []).join(', '))}` : `${base}<div class="sec">${esc((l.modulos || []).join(', '))}</div>`
  } catch { return '<span class="chip mal">Ilegible</span>' }
}

function mostrarToken(t) {
  $('#tok').innerHTML = `<p><b>Token de la instalación</b> (cópielo ahora, no se volverá a mostrar):</p><p class="token">${esc(t)}</p>
    <p class="sec">En el servidor de la tienda, agréguelo a C:\\ProgramData\\SPVI\\config\\.env:</p>
    <pre>CENTRAL_URL=${esc(urlPublica || location.origin)}\nCENTRAL_TOKEN=${esc(t)}</pre><p class="sec">Luego reinicie el servicio SPVI-API.</p>`
}

async function abrirTicket(id) {
  const t = await api(`/panel/tickets/${id}`)
  const ctx = t.contexto ? `<details><summary class="sec">Datos técnicos</summary><pre>${esc(JSON.stringify(t.contexto, null, 2))}</pre></details>` : ''
  hoja(`<h2>#${t.id} ${esc(t.asunto)}</h2>
    <p class="sec">${esc(t.instalacion.cliente.empresa)}, ${esc(t.instalacion.nombre)} (versión ${esc(t.instalacion.version || '—')}, plan ${esc(t.instalacion.plan || '—')})<br>
    ${esc(t.usuarioNombre)} (${esc(t.usuario)}) · Tel. ${esc(t.instalacion.cliente.telefono || '—')}</p>
    <div class="msg"><small>${fecha(t.creadoEn)}</small><p>${esc(t.descripcion)}</p>${t.tieneCaptura ? `<img id="cap" style="max-width:100%;border-radius:8px" alt="Captura enviada por el usuario">` : ''}</div>
    ${t.mensajes.map((m) => `<div class="msg ${m.autor}"><small>${esc(m.nombre)}, ${fecha(m.creadoEn)}</small><p>${esc(m.texto)}</p></div>`).join('')}
    ${ctx}
    <form id="fr"><label>Respuesta<textarea name="texto" rows="4" required></textarea></label>
    <label>Estado<select name="estado"><option value="EN_PROCESO">En proceso</option><option value="RESUELTO">Resuelto</option><option value="ABIERTO">Abierto</option></select></label>
    <p><button class="btn p">Enviar respuesta</button> <button type="button" class="btn" id="pr">${t.prioridad === 'ALTA' ? 'Prioridad normal' : 'Marcar prioridad alta'}</button></p></form>`)
  if (t.tieneCaptura) {
    const r = await fetch(`/api/panel/tickets/${id}/captura`, { headers: { Authorization: `Bearer ${token}` } })
    $('#cap').src = URL.createObjectURL(await r.blob())
  }
  $('#fr').onsubmit = async (e) => { e.preventDefault(); await api(`/panel/tickets/${id}/mensajes`, { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); abrirTicket(id) }
  $('#pr').onclick = async () => { await api(`/panel/tickets/${id}`, { method: 'PUT', body: { prioridad: t.prioridad === 'ALTA' ? 'NORMAL' : 'ALTA' } }); abrirTicket(id) }
}

function formularioAnuncio(a) {
  const v = (k, d = '') => esc(a?.[k] ?? d)
  hoja(`<h2>${a ? 'Editar anuncio' : 'Nuevo anuncio'}</h2><form id="fa">
    <label>Tipo<select name="tipo"><option value="aviso">Aviso del proveedor</option><option value="publicidad" ${a?.tipo === 'publicidad' ? 'selected' : ''}>Publicidad</option></select></label>
    <label>Título<input name="titulo" required maxlength="80" value="${v('titulo')}"></label>
    <label>Texto<textarea name="texto" required maxlength="300" rows="3">${v('texto')}</textarea></label>
    <label>Enlace (opcional)<input name="enlace" type="url" value="${v('enlace')}"></label>
    <label>Imagen (URL, opcional)<input name="imagenUrl" type="url" value="${v('imagenUrl')}"></label>
    <label>Dónde<select name="ubicaciones" multiple size="2"><option value="inicio" ${!a || a.ubicaciones.includes('inicio') ? 'selected' : ''}>Pantalla de inicio</option><option value="login" ${a?.ubicaciones.includes('login') ? 'selected' : ''}>Pantalla de ingreso</option></select></label>
    <label>Planes (separados por coma; vacío = todos)<input name="planes" value="${esc((a?.planes || []).join(', '))}" placeholder="BASICO"></label>
    <label>Desde<input name="desde" type="date" value="${a?.desde ? a.desde.slice(0, 10) : ''}"></label>
    <label>Hasta (opcional)<input name="hasta" type="date" value="${a?.hasta ? a.hasta.slice(0, 10) : ''}"></label>
    <label><input type="checkbox" name="activo" style="width:auto" ${!a || a.activo ? 'checked' : ''}> Activo</label>
    <p><button class="btn p">Guardar</button> ${a ? '<button type="button" class="btn" id="borrar" style="color:var(--rojo)">Eliminar</button>' : ''}</p></form>`)
  $('#fa').onsubmit = async (e) => {
    e.preventDefault()
    const f = new FormData(e.target)
    const cuerpo = {
      tipo: f.get('tipo'), titulo: f.get('titulo'), texto: f.get('texto'), enlace: f.get('enlace') || null, imagenUrl: f.get('imagenUrl') || null,
      ubicaciones: f.getAll('ubicaciones'), planes: String(f.get('planes')).split(',').map((p) => p.trim().toUpperCase()).filter(Boolean),
      desde: f.get('desde') || null, hasta: f.get('hasta') || null, activo: f.get('activo') === 'on',
    }
    await api(a ? `/panel/anuncios/${a.id}` : '/panel/anuncios', { method: a ? 'PUT' : 'POST', body: cuerpo })
    cerrarHoja(); VISTAS.anuncios()
  }
  if (a) $('#borrar').onclick = async () => { if (confirm('¿Eliminar este anuncio y sus métricas?')) { await api(`/panel/anuncios/${a.id}`, { method: 'DELETE' }); cerrarHoja(); VISTAS.anuncios() } }
}

token ? pintarApp('resumen') : pintarLogin()
