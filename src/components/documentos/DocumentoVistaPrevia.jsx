// Vista previa del documento a escala del papel, con las mismas medidas (puntos) que usa el generador de PDF:
// lo que se ve aquí es lo que sale en el PDF. Se actualiza al instante con cada cambio del diseño.
import { useCallback, useRef, useState } from 'react'

export const PAPEL = { CARTA: [612, 792], MEDIA_CARTA: [612, 396], A4: [595, 842] }
const LETRA = { PEQUENA: 8, NORMAL: 9.5, GRANDE: 11 }

/** Escala para que la hoja ocupe el ancho disponible (mide el contenedor, también si aparece más tarde). */
function useEscala(anchoPapel) {
  const [escala, setEscala] = useState(0.6)
  const observador = useRef(null)
  const ref = useCallback((el) => {
    observador.current?.disconnect()
    if (!el) return
    const medir = () => setEscala(Math.min(1.5, Math.max(0.25, el.getBoundingClientRect().width / anchoPapel)))
    medir()
    if (typeof ResizeObserver !== 'undefined') { observador.current = new ResizeObserver(medir); observador.current.observe(el) }
  }, [anchoPapel])
  return [ref, escala]
}

export default function DocumentoVistaPrevia({ datos: d, p, logoUrl }) {
  const [W, H] = PAPEL[p.papel]
  const base = LETRA[p.tamanoLetra]
  const [ref, esc] = useEscala(W)
  const ancho = W - 72
  const n = d.negocio
  const gris = '#52525b'

  const logo = p.logo.mostrar ? (
    logoUrl
      ? <img src={logoUrl} alt="" style={{ height: p.logo.alto, maxWidth: p.logo.alto * 2.2, objectFit: 'contain', display: 'block' }} />
      : <div style={{ height: p.logo.alto, width: p.logo.alto * 1.8, border: '1px dashed #a1a1aa', color: '#a1a1aa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: base }}>Su logo</div>
  ) : null

  const cols = []
  if (p.columnas.numero) cols.push({ k: 'n', t: '#', w: 22, a: 'center' })
  cols.push({ k: 'descripcion', t: 'Descripción', w: 0, a: 'left' })
  if (p.columnas.cantidad) cols.push({ k: 'cantidad', t: 'Cant.', w: 46, a: 'right' })
  if (p.columnas.precio) cols.push({ k: 'precio', t: 'Precio', w: 70, a: 'right' })
  if (p.columnas.descuento && d.lineas.some((l) => l.descuento)) cols.push({ k: 'descuento', t: 'Desc.', w: 62, a: 'right' })
  if (p.columnas.subtotal) cols.push({ k: 'subtotal', t: 'Subtotal', w: 78, a: 'right' })
  const plantilla = cols.map((c) => (c.k === 'descripcion' ? '1fr' : `${c.w}px`)).join(' ')

  const cliente = [['Cliente', d.cliente.nombre]]
  if (p.cliente.nit) cliente.push(['NIT', d.cliente.nit])
  if (p.cliente.direccion && d.cliente.direccion) cliente.push(['Dirección', d.cliente.direccion])
  if (p.cliente.telefono && d.cliente.telefono) cliente.push(['Teléfono', d.cliente.telefono])
  if (p.cliente.correo && d.cliente.correo) cliente.push(['Correo', d.cliente.correo])

  const totales = []
  if (p.mostrar.desglose) totales.push(['Subtotal', d.totales.subtotal])
  if (p.mostrar.desglose && d.totales.descuento !== 'Q 0.00') totales.push(['Descuento', `- ${d.totales.descuento}`])
  if (p.mostrar.desglose && d.totales.ivaIncluido !== 'Q 0.00') totales.push(['IVA incluido', d.totales.ivaIncluido])

  const datosNegocio = []
  if (p.encabezado.razonSocial && n.razonSocial && n.razonSocial !== n.nombreComercial) datosNegocio.push(n.razonSocial)
  if (p.encabezado.nit && n.nit) datosNegocio.push(`NIT: ${n.nit}`)
  if (p.encabezado.direccion && n.direccion) datosNegocio.push(n.direccion)
  const contacto = [p.encabezado.telefono && n.telefono ? `Tel: ${n.telefono}` : '', p.encabezado.correo && n.correo ? n.correo : ''].filter(Boolean).join('  -  ')
  if (contacto) datosNegocio.push(contacto)
  if (p.encabezado.eslogan && n.eslogan) datosNegocio.push(n.eslogan)

  return (
    <div ref={ref} className="w-full">
      <div className="relative overflow-hidden rounded-sm border bg-white shadow-md" style={{ width: W * esc, height: H * esc }} data-vista-previa>
        <div style={{ position: 'absolute', top: 0, left: 0, width: W, height: H, transform: `scale(${esc})`, transformOrigin: 'top left', padding: 36, fontFamily: 'Helvetica, Arial, sans-serif', fontSize: base, color: '#1d1d1f', lineHeight: 1.25 }}>
          {p.logo.posicion === 'CENTRO' && logo && <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>{logo}</div>}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10, width: ancho * 0.58 }}>
              {p.logo.posicion === 'IZQUIERDA' && logo && <div style={{ flexShrink: 0 }}>{logo}</div>}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: base + 5 }}>{n.nombreComercial || n.razonSocial}</div>
                {datosNegocio.map((l) => <div key={l} style={{ color: gris, fontSize: base - 0.5 }}>{l}</div>)}
              </div>
            </div>
            <div style={{ textAlign: 'right', width: ancho * 0.4 }}>
              {p.logo.posicion === 'DERECHA' && logo && <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>{logo}</div>}
              <div style={{ fontWeight: 700, fontSize: base + 7, color: p.colorAcento }}>{p.titulo}</div>
              <div style={{ fontWeight: 700, fontSize: base + 1 }}>No. {d.numero}</div>
              <div>Fecha: {d.fecha}</div>
              {p.mostrar.validez && d.validaHasta && <div>Válida hasta: {d.validaHasta}</div>}
              {d.anulado && <div style={{ fontWeight: 700, fontSize: base + 4, color: '#b91c1c' }}>ANULADO</div>}
            </div>
          </div>
          <div style={{ borderBottom: `1.4px solid ${p.colorAcento}`, margin: '8px 0' }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={{ width: ancho * 0.7 }}>{cliente.map(([k, v]) => <div key={k} style={{ display: 'flex', marginBottom: 2 }}><b style={{ width: 62, flexShrink: 0 }}>{k}:</b><span>{v}</span></div>)}</div>
            {p.vendedor && d.vendedor && <div style={{ width: ancho * 0.28 }}><b>Vendedor:</b><div>{d.vendedor}</div></div>}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: plantilla, background: p.colorAcento, color: '#fff', fontWeight: 700, fontSize: base - 0.5, padding: '4px 0' }}>
            {cols.map((c) => <div key={c.k} style={{ padding: '0 4px', textAlign: c.a }}>{c.t}</div>)}
          </div>
          {d.lineas.map((l, i) => (
            <div key={l.n} style={{ display: 'grid', gridTemplateColumns: plantilla, padding: '3.5px 0', background: i % 2 ? '#f4f4f5' : 'transparent' }}>
              {cols.map((c) => <div key={c.k} style={{ padding: '0 4px', textAlign: c.a }}>{l[c.k]}</div>)}
            </div>
          ))}
          <div style={{ borderTop: '0.8px solid #a1a1aa', marginTop: 0 }} />

          <div style={{ width: 210, marginLeft: 'auto', marginTop: 8 }}>
            {totales.map(([k, v]) => <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}><span>{k}</span><span>{v}</span></div>)}
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1.2px solid ${p.colorAcento}`, marginTop: 3, paddingTop: 4, fontWeight: 700, fontSize: base + 3 }}>
              <span>TOTAL</span><span style={{ color: p.colorAcento }}>{d.totales.total}</span>
            </div>
          </div>
          {p.mostrar.montoEnLetras && <div style={{ fontWeight: 700, fontSize: base - 0.5, marginTop: 6 }}>SON: {d.montoLetras}</div>}

          <div style={{ marginTop: 6, fontSize: base - 0.5, color: gris }}>
            {p.mostrar.pagos && d.pagos.length > 0 && <div style={{ marginBottom: 5, color: '#1d1d1f' }}><b>Forma de pago</b><div>{d.pagos.map((x) => `${x.medio}: ${x.monto}`).join('   ')}{d.cambio ? `   -   Cambio: ${d.cambio}` : ''}</div></div>}
            {d.fel ? <div style={{ marginBottom: 5 }}><b style={{ color: '#1d1d1f' }}>Documento tributario electrónico</b><div>Autorización: {d.fel.autorizacion}</div></div> : d.aviso && <div style={{ marginBottom: 5 }}>{d.aviso}</div>}
            {p.mostrar.observaciones && d.observaciones && <div style={{ marginBottom: 5, color: '#1d1d1f' }}><b>Observaciones</b><div>{d.observaciones}</div></div>}
            {p.textos.notas.trim() && <div style={{ marginBottom: 5, whiteSpace: 'pre-line' }}><b style={{ color: '#1d1d1f' }}>Notas</b><div>{p.textos.notas}</div></div>}
          </div>
          {p.firmas.mostrar && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 34, padding: '0 10px' }}>
              {[p.firmas.izquierda, p.firmas.derecha].map((t, i) => <div key={i} style={{ width: ancho * 0.38, borderTop: '0.6px solid #71717a', textAlign: 'center', color: gris, fontSize: base - 1, paddingTop: 3 }}>{t}</div>)}
            </div>
          )}

          <div style={{ position: 'absolute', left: 36, right: 36, bottom: 24, borderTop: '0.6px solid #e4e4e7', paddingTop: 4, fontSize: base - 0.5, color: gris }}>
            {p.textos.pie.trim() && <div style={{ textAlign: 'center' }}>{p.textos.pie}</div>}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: base - 2, color: '#71717a', marginTop: 2 }}>
              <span>Página 1 de 1</span>{d.conMarca && <b>SPVI by ALEXUS</b>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
