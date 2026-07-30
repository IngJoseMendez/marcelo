import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RelojFalso } from '../src/puertos/reloj.ts'
import { resolverReferente } from '../src/dominio/fechas.ts'

// Martes 4 de agosto de 2026, 11:00 pm en Bogotá.
// Tarde a propósito: es cuando "hoy" y "mañana" se confunden.
const martes23 = new RelojFalso('2026-08-04T23:00:00').ahora()

test('el reloj falso cae en el día de la semana que decimos', () => {
  assert.equal(martes23.weekday, 2, 'el 4 de agosto de 2026 es martes')
  assert.equal(martes23.zoneName, 'America/Bogota')
})

test('"hoy" a las 11pm del martes sigue siendo martes, no miércoles', () => {
  const r = resolverReferente({ tipo: 'hoy' }, martes23)
  assert.ok(r)
  assert.equal(r.intervalo.inicio.toISODate(), '2026-08-04')
  assert.equal(r.ambiguo, false)
})

test('"mañana" a las 11pm del martes es miércoles', () => {
  const r = resolverReferente({ tipo: 'manana' }, martes23)
  assert.ok(r)
  assert.equal(r.intervalo.inicio.toISODate(), '2026-08-05')
})

test('"este miércoles" dicho el martes es el día siguiente', () => {
  const r = resolverReferente({ tipo: 'dia_semana', dia: 3, modificador: 'este' }, martes23)
  assert.ok(r)
  assert.equal(r.intervalo.inicio.toISODate(), '2026-08-05')
  assert.equal(r.ambiguo, false)
})

test('"este miércoles" dicho un miércoles es el siguiente, no hoy', () => {
  const miercoles = new RelojFalso('2026-08-05T10:00:00').ahora()
  const r = resolverReferente({ tipo: 'dia_semana', dia: 3, modificador: 'este' }, miercoles)
  assert.ok(r)
  assert.equal(r.intervalo.inicio.toISODate(), '2026-08-12')
})

test('"próximo miércoles" dicho el martes se marca AMBIGUO', () => {
  // Para unos hablantes es mañana, para otros la semana entrante. Marcarlo
  // ambiguo hace que la política avise en vez de borrar callada.
  const r = resolverReferente({ tipo: 'dia_semana', dia: 3, modificador: 'proximo' }, martes23)
  assert.ok(r)
  assert.equal(r.ambiguo, true)
  assert.equal(r.intervalo.inicio.toISODate(), '2026-08-12')
})

test('"próximo lunes" dicho el martes NO es ambiguo: faltan seis días', () => {
  const r = resolverReferente({ tipo: 'dia_semana', dia: 1, modificador: 'proximo' }, martes23)
  assert.ok(r)
  assert.equal(r.intervalo.inicio.toISODate(), '2026-08-10')
  assert.equal(r.ambiguo, false)
})

test('una fecha explícita se respeta tal cual', () => {
  const r = resolverReferente({ tipo: 'fecha', iso: '2026-08-06' }, martes23)
  assert.ok(r)
  assert.equal(r.intervalo.inicio.toISODate(), '2026-08-06')
  assert.equal(r.ambiguo, false)
})

test('el intervalo cubre el día completo en zona de Bogotá', () => {
  const r = resolverReferente({ tipo: 'hoy' }, martes23)
  assert.ok(r)
  assert.equal(r.intervalo.inicio.toFormat('HH:mm:ss'), '00:00:00')
  assert.equal(r.intervalo.fin.toFormat('HH:mm'), '23:59')
  assert.equal(r.intervalo.inicio.zoneName, 'America/Bogota')
  assert.equal(r.intervalo.inicio.toISO()?.slice(-6), '-05:00')
})

test('un referente desconocido devuelve null', () => {
  assert.equal(resolverReferente({ tipo: 'desconocido' }, martes23), null)
})

test('una fecha basura devuelve null en vez de una fecha inventada', () => {
  assert.equal(resolverReferente({ tipo: 'fecha', iso: 'el miércoles' }, martes23), null)
  assert.equal(resolverReferente({ tipo: 'fecha', iso: '2026-13-45' }, martes23), null)
})

test('un día de la semana fuera de rango devuelve null', () => {
  assert.equal(resolverReferente({ tipo: 'dia_semana', dia: 0, modificador: 'este' }, martes23), null)
  assert.equal(resolverReferente({ tipo: 'dia_semana', dia: 8, modificador: 'este' }, martes23), null)
})

test('cruzar fin de mes no rompe el cálculo', () => {
  // Lunes 31 de agosto: "este miércoles" cae en septiembre.
  const finDeMes = new RelojFalso('2026-08-31T09:00:00').ahora()
  assert.equal(finDeMes.weekday, 1)
  const r = resolverReferente({ tipo: 'dia_semana', dia: 3, modificador: 'este' }, finDeMes)
  assert.ok(r)
  assert.equal(r.intervalo.inicio.toISODate(), '2026-09-02')
})
