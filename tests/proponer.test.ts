import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mejorHueco, ordenar, proponer, type Hueco, type Intencion } from '../src/dominio/proponer.ts'
import { RelojFalso } from '../src/puertos/reloj.ts'
import { verificar, emitir, nuevoCodigo, MAXIMO_INTENTOS } from '../src/dominio/codigo-acceso.ts'

// viernes 7 de agosto de 2026, 8:00 am en Bogotá
const reloj = new RelojFalso('2026-08-07T08:00:00')
const ahora = reloj.ahora()

let id = 0
const tarea = (p: Partial<Intencion> = {}): Intencion => ({
  id: ++id,
  titulo: 'algo',
  prioridad: 'normal',
  duracionMin: 60,
  venceEl: null,
  estado: 'pendiente',
  ...p,
})

/** Con segundos, como los emite la jornada de verdad. */
const hueco = (desde: string, minutos: number): Hueco => ({
  inicio: `2026-08-07T${desde}:00:00-05:00`,
  fin: `2026-08-07T${desde}:00:00-05:00`,
  minutos,
})

// ── qué va primero ──────────────────────────────────────────────

test('lo que vence pronto adelanta a lo marcado urgente', () => {
  // La fecha límite manda sobre la prioridad declarada: es la misma
  // disciplina de siempre — el texto propone, la fecha decide.
  const vencePronto = tarea({ titulo: 'taller', prioridad: 'normal', venceEl: '2026-08-08T23:59:00-05:00' })
  const urgenteSinFecha = tarea({ titulo: 'urgente', prioridad: 'urgente' })

  const orden = ordenar([urgenteSinFecha, vencePronto], ahora)

  assert.equal(orden[0]!.titulo, 'taller')
})

test('a igualdad, primero lo largo: es lo más difícil de encajar', () => {
  const corta = tarea({ titulo: 'corta', duracionMin: 30 })
  const larga = tarea({ titulo: 'larga', duracionMin: 120 })

  assert.equal(ordenar([corta, larga], ahora)[0]!.titulo, 'larga')
})

test('lo que ya no está pendiente no se propone', () => {
  const hecha = tarea({ estado: 'hecha' })
  const agendada = tarea({ estado: 'agendada' })

  assert.deepEqual(ordenar([hecha, agendada], ahora), [])
})

// ── dónde cabe ──────────────────────────────────────────────────

test('se coge el hueco más justo, no el más grande', () => {
  // Meter media hora en el único bloque de dos horas del día lo parte en
  // dos trozos donde ya no cabe nada largo.
  const elegido = mejorHueco([hueco('09', 120), hueco('14', 45)], 30)

  assert.equal(elegido!.minutos, 45)
})

test('un hueco que no alcanza no sirve', () => {
  assert.equal(mejorHueco([hueco('09', 45)], 120), null)
})

test('los ratos de menos de un cuarto de hora no cuentan', () => {
  // Diez minutos entre dos clases no son tiempo de trabajo.
  assert.equal(mejorHueco([hueco('09', 10)], 10), null)
})

// ── las propuestas ──────────────────────────────────────────────

test('propone lo más apretado en el hueco donde mejor cabe', () => {
  const p = proponer({
    intenciones: [
      tarea({ titulo: 'estudiar parcial', duracionMin: 120, venceEl: '2026-08-08T23:59:00-05:00' }),
      tarea({ titulo: 'responder correo', duracionMin: 30 }),
    ],
    huecos: [hueco('14', 45), hueco('09', 150)],
    ahora,
  })

  assert.equal(p.length, 2)
  assert.equal(p[0]!.titulo, 'estudiar parcial')
  assert.equal(p[0]!.inicio, '2026-08-07T09:00:00-05:00')
  assert.equal(p[0]!.porque, 'vence mañana')
  assert.equal(p[1]!.titulo, 'responder correo')
  assert.equal(p[1]!.inicio, '2026-08-07T14:00:00-05:00')
})

test('nunca propone dos cosas a la misma hora', () => {
  // Proponer un conflicto es devolverle trabajo que el código podía
  // resolver solo.
  const p = proponer({
    intenciones: [tarea({ duracionMin: 30 }), tarea({ duracionMin: 30 })],
    huecos: [hueco('09', 60)],
    ahora,
  })

  assert.equal(p.length, 1)
})

test('no propone un hueco que ya pasó', () => {
  // Sugerir las 7 de la mañana a las 8 es enseñar que no mira la hora.
  const p = proponer({
    intenciones: [tarea({ duracionMin: 30 })],
    huecos: [hueco('07', 60)],
    ahora,
  })

  assert.deepEqual(p, [])
})

test('no propone después de la fecha límite: cumplir tarde no es cumplir', () => {
  const p = proponer({
    intenciones: [tarea({ duracionMin: 30, venceEl: '2026-08-07T10:00:00-05:00' })],
    huecos: [hueco('15', 60)],
    ahora,
  })

  assert.deepEqual(p, [])
})

test('sin huecos no propone nada, en vez de forzar algo', () => {
  assert.deepEqual(proponer({ intenciones: [tarea()], huecos: [], ahora }), [])
})

test('propone pocas: tres ya es una lista, no una sugerencia', () => {
  const p = proponer({
    intenciones: [tarea({ duracionMin: 30 }), tarea({ duracionMin: 30 }), tarea({ duracionMin: 30 })],
    huecos: [hueco('09', 30), hueco('11', 30), hueco('15', 30)],
    ahora,
  })

  assert.equal(p.length, 2)
})

test('cada propuesta dice por qué: proponer sin explicar es mandar', () => {
  const p = proponer({
    intenciones: [tarea({ prioridad: 'urgente', duracionMin: 60 })],
    huecos: [hueco('09', 120)],
    ahora,
  })

  assert.equal(p[0]!.porque, 'está marcado urgente')
})

// ── el código de un solo uso ────────────────────────────────────

const AHORA_MS = 1_800_000_000_000

test('el código correcto entra, y se consume al entrar', () => {
  // De un solo uso de verdad: si sirviera dos veces, valdría toda la tarde.
  const v = emitir(AHORA_MS)

  const primera = verificar(v, v.codigo, AHORA_MS + 1000)
  assert.equal(primera.resultado.ok, true)
  assert.equal(primera.queda, null)

  const segunda = verificar(primera.queda, v.codigo, AHORA_MS + 2000)
  assert.equal(segunda.resultado.ok, false)
})

test('un código vencido no sirve, aunque sea el correcto', () => {
  const v = emitir(AHORA_MS)

  const r = verificar(v, v.codigo, AHORA_MS + 10 * 60_000)

  assert.equal(r.resultado.ok, false)
  assert.equal(r.resultado.ok === false && r.resultado.motivo, 'vencido')
})

test('a los cinco fallos se quema entero', () => {
  // Dejarlo vivo tras cinco intentos es dejar que el sexto acierte.
  let estado = emitir(AHORA_MS)
  for (let i = 0; i < MAXIMO_INTENTOS; i++) {
    estado = verificar(estado, '000000', AHORA_MS + 1000).queda!
  }

  const r = verificar(estado, estado.codigo, AHORA_MS + 1000)

  assert.equal(r.resultado.ok, false)
  assert.equal(r.resultado.ok === false && r.resultado.motivo, 'agotado')
  assert.equal(r.queda, null)
})

test('sin código pedido, no hay nada que verificar', () => {
  const r = verificar(null, '123456', AHORA_MS)

  assert.equal(r.resultado.ok === false && r.resultado.motivo, 'sin_codigo')
})

test('el código son seis dígitos y no se repite', () => {
  const muchos = new Set(Array.from({ length: 200 }, () => nuevoCodigo()))

  assert.ok(muchos.size > 180, 'con randomInt no se repiten así')
  for (const c of muchos) assert.match(c, /^\d{6}$/)
})
