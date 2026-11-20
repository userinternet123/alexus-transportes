import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clasificarServidor, servidorPermitido } from './servidor'
const nivel = (d: string) => clasificarServidor(d).nivel

test('HTTPS siempre va cifrado, sea cual sea el destino', () => {
  for (const d of ['https://tienda.ejemplo.com', 'https://192.168.1.10:8443', 'HTTPS://Central.AlexusGT.com/api']) assert.equal(nivel(d), 'cifrada', d)
})
test('Tailscale por HTTP va cifrado (100.64.0.0 a 100.127.255.255 y nombres .ts.net)', () => {
  for (const d of ['http://100.64.0.1:8080', 'http://100.101.102.103:8080', 'http://100.127.255.255', 'http://tienda.tail1234.ts.net:8080']) assert.equal(nivel(d), 'tailscale', d)
  assert.equal(nivel('http://100.63.255.255:8080'), 'insegura'); assert.equal(nivel('http://100.128.0.1:8080'), 'insegura') // justo fuera del rango de Tailscale: son de internet
})
test('la red de la tienda por HTTP se permite, pero se avisa que no va cifrada', () => {
  for (const d of ['http://192.168.1.10:8080', 'http://10.0.0.5:8080', 'http://172.16.0.1', 'http://172.31.255.255:8080', 'http://127.0.0.1:8080', 'http://localhost:8080', 'http://servidor:8080', 'http://caja1.local:8080', 'http://169.254.10.10']) {
    assert.equal(nivel(d), 'red-local', d); assert.equal(servidorPermitido(d), true, d)
  }
  assert.match(clasificarServidor('http://192.168.1.10:8080').mensaje, /SIN cifrar/)
})
test('HTTP hacia internet se BLOQUEA: la contraseña viajaría sin cifrar', () => {
  for (const d of ['http://tienda.ejemplo.com', 'http://200.35.10.20:8080', 'http://8.8.8.8', 'http://172.32.0.1:8080', 'http://172.15.0.1', 'http://192.169.1.1', 'http://11.0.0.1', 'http://central.alexusgt.com']) {
    assert.equal(nivel(d), 'insegura', d); assert.equal(servidorPermitido(d), false, d)
  }
})
test('direcciones mal escritas no se aceptan (ni se intenta enviar nada)', () => {
  for (const d of ['', 'http://', '192.168.1.10:8080', 'ftp://192.168.1.10', 'http:// 192.168.1.10', 'http://usuario:clave@192.168.1.10', 'javascript:alert(1)']) {
    assert.equal(nivel(d), 'invalida', JSON.stringify(d)); assert.equal(servidorPermitido(d), false)
  }
  assert.equal(nivel('http://999.1.1.1:8080'), 'insegura') // no es una IP válida: se trata como un nombre de internet
})
test('espacios alrededor y barra final no cambian el resultado', () => {
  assert.equal(nivel('  http://192.168.1.10:8080/  '), 'red-local'); assert.equal(nivel('https://tienda.ejemplo.com/'), 'cifrada')
})
