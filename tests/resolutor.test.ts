import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RelojFalso } from '../src/puertos/reloj.ts'
import { resolverReferente } from '../src/dominio/fechas.ts'
import { resolver } from '../src/dominio/resolutor.ts'
import type { Compromiso } from '../src/dominio/tipos.ts'

const base = {
  rrule: 'FREQ=WEEKLY;BYDAY=WE', horaInicio: '16:00', horaFin: '17:00',
  tz: 'America/Bogota', googleCalendarId: 'primary',
  googleEventId: 'evt', activo: true,
}

const calculo: Compromiso = {
  ...base, id: 1, titulo: 'Cálculo', alias: ['calculo', 'clase'],
  remitentesVinculados: ['ramirez@uni.edu.co'],
}
const fisica: Compromiso = {
  ...base, id: 2, titulo: 'Física', alias: ['fisica'],
  remitentesVinculados: ['lopez@uni.edu.co'],
}
// Mismo profesor, mismo día: el caso tramposo.
const taller: Compromiso = {
  ...base, id: 3, titulo: 'Taller de Cálculo', alias: ['taller'],
  remitentesVinculados: ['ramirez@uni.edu.co'],
}

const martes = new RelojFalso('2026-08-04T14:14:00').ahora()
const hoy = resolverReferente({ tipo: 'hoy' }, martes)!.intervalo

const entrada = (over: Partial<Parameters<typeof resolver>[0]> = {}) => ({
  compromisos: [calculo, fisica],
  remitente: 'ramirez@uni.edu.co',
  texto: 'La clase de cálculo de hoy se cancela',
  intervalo: hoy,
  ambiguo: false,
  threadCompromisoId: null,
  ...over,
})

test('remitente vinculado + alias resuelve con confianza alta', () => {
  const r = resolver(entrada())
  assert.equal(r.estado, 'resuelto')
  if (r.estado !== 'resuelto') return
  assert.equal(r.candidato.compromiso.id, 1)
  assert.equal(r.confianza, 'alta')
})

test('sin remitente vinculado ni alias no hay candidatos', () => {
  const r = resolver(entrada({
    remitente: 'promos@tienda.com',
    texto: 'Grandes descuentos esta semana',
  }))
  assert.equal(r.estado, 'sin_candidatos')
})

test('dos compromisos del mismo profesor producen empate', () => {
  const r = resolver(entrada({
    compromisos: [calculo, taller],
    texto: 'Se cancela lo de hoy',
  }))
  assert.equal(r.estado, 'empate')
  if (r.estado !== 'empate') return
  assert.equal(r.candidatos.length, 2)
})

test('el alias desempata entre compromisos del mismo profesor', () => {
  const r = resolver(entrada({
    compromisos: [calculo, taller],
    texto: 'El taller de hoy se cancela',
  }))
  assert.equal(r.estado, 'resuelto')
  if (r.estado !== 'resuelto') return
  assert.equal(r.candidato.compromiso.id, 3)
})

test('un referente ambiguo baja la confianza a media', () => {
  const r = resolver(entrada({
    compromisos: [calculo],
    texto: 'La clase de cálculo del próximo miércoles se cancela',
    ambiguo: true,
  }))
  assert.equal(r.estado, 'resuelto')
  if (r.estado !== 'resuelto') return
  assert.equal(r.confianza, 'media')
})

test('sin ventana temporal la confianza no puede ser alta', () => {
  const r = resolver(entrada({ compromisos: [calculo], intervalo: null }))
  assert.equal(r.estado, 'resuelto')
  if (r.estado !== 'resuelto') return
  assert.notEqual(r.confianza, 'alta')
})

test('el hilo conocido aporta puntaje con remitente desconocido', () => {
  const r = resolver(entrada({
    remitente: 'desconocido@x.com',
    texto: 'Confirmado, se cancela',
    threadCompromisoId: 2,
  }))
  assert.equal(r.estado, 'resuelto')
  if (r.estado !== 'resuelto') return
  assert.equal(r.candidato.compromiso.id, 2)
})

test('el emparejamiento ignora tildes y mayúsculas', () => {
  const r = resolver(entrada({
    remitente: 'otro@uni.edu.co',
    texto: 'La FÍSICA de hoy se cancela',
  }))
  assert.equal(r.estado, 'resuelto')
  if (r.estado !== 'resuelto') return
  assert.equal(r.candidato.compromiso.id, 2)
})

test('el remitente empareja aunque venga con nombre visible', () => {
  const r = resolver(entrada({
    remitente: 'Prof. Ramírez <RAMIREZ@uni.edu.co>',
    texto: 'Se cancela lo de hoy',
  }))
  assert.equal(r.estado, 'resuelto')
  if (r.estado !== 'resuelto') return
  assert.equal(r.candidato.compromiso.id, 1)
  assert.ok(r.candidato.senales.includes('remitente_vinculado'))
})

test('un compromiso inactivo nunca es candidato', () => {
  const r = resolver(entrada({
    compromisos: [{ ...calculo, activo: false }],
  }))
  assert.equal(r.estado, 'sin_candidatos')
})

test('las señales quedan registradas para la auditoría', () => {
  const r = resolver(entrada())
  assert.equal(r.estado, 'resuelto')
  if (r.estado !== 'resuelto') return
  assert.ok(r.candidato.senales.includes('remitente_vinculado'))
  assert.ok(r.candidato.senales.includes('ventana_temporal'))
})
