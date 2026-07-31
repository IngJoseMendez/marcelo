import { test } from 'node:test'
import assert from 'node:assert/strict'
import { disponer, horasDe, posicionDe } from '../web/lib/rejilla.ts'
import { duracion, fechaLarga, hora, hora12, relativa, diasHasta, pesos } from '../web/lib/tiempo.ts'

const VENTANA = {
  inicio: '2026-08-04T07:00:00-05:00',
  fin: '2026-08-04T22:00:00-05:00',
}

const ev = (id: string, desde: string, hasta: string) => ({
  id, inicio: `2026-08-04T${desde}:00-05:00`, fin: `2026-08-04T${hasta}:00-05:00`,
})

// ── geometría ───────────────────────────────────────────────────

test('la altura de un bloque es su duración', () => {
  const [b] = disponer([ev('a', '09:00', '11:00')], VENTANA)
  assert.equal(b!.desde, 120, 'dos horas después de las 7')
  assert.equal(b!.minutos, 120)
})

test('lo que no se solapa ocupa el ancho completo', () => {
  const bloques = disponer([ev('a', '09:00', '10:00'), ev('b', '10:00', '11:00')], VENTANA)
  assert.deepEqual(bloques.map((b) => [b.columna, b.columnas]), [[0, 1], [0, 1]])
})

test('dos eventos a la misma hora se parten el ancho', () => {
  const bloques = disponer([ev('a', '16:00', '17:00'), ev('b', '16:30', '18:00')], VENTANA)
  assert.deepEqual(bloques.map((b) => [b.columna, b.columnas]), [[0, 2], [1, 2]])
})

test('una cadena de solapes reparte el mismo ancho a todo el grupo', () => {
  // A y C no se tocan, pero B los encadena: los tres viven en 2 columnas.
  const bloques = disponer([
    ev('a', '10:00', '11:00'),
    ev('b', '10:30', '11:30'),
    ev('c', '11:15', '12:00'),
  ], VENTANA)
  assert.deepEqual(bloques.map((b) => b.evento.id), ['a', 'b', 'c'])
  assert.deepEqual(bloques.map((b) => [b.columna, b.columnas]), [[0, 2], [1, 2], [0, 2]])
})

test('el que empieza a la misma hora y dura más va primero', () => {
  const bloques = disponer([ev('corto', '16:00', '16:30'), ev('largo', '16:00', '18:00')], VENTANA)
  assert.equal(bloques[0]!.evento.id, 'largo')
})

test('lo que empieza antes de la ventana se recorta, no se sale', () => {
  const [b] = disponer([ev('madrugada', '06:00', '08:00')], VENTANA)
  assert.equal(b!.desde, 0)
  assert.equal(b!.minutos, 60, 'sólo se dibuja lo que cae dentro')
})

test('lo que termina después de la ventana también se recorta', () => {
  const [b] = disponer([ev('trasnocho', '21:00', '23:30')], VENTANA)
  assert.equal(b!.desde, 840)
  assert.equal(b!.minutos, 60)
})

test('lo que queda entero fuera no se dibuja', () => {
  assert.deepEqual(disponer([ev('anoche', '02:00', '03:00')], VENTANA), [])
})

test('un evento sin duración no ocupa columna', () => {
  assert.deepEqual(disponer([ev('instante', '10:00', '10:00')], VENTANA), [])
})

test('una ventana inválida no revienta', () => {
  assert.deepEqual(disponer([ev('a', '09:00', '10:00')], { inicio: 'x', fin: 'y' }), [])
})

// ── horas y línea de ahora ──────────────────────────────────────

test('las horas van de borde a borde de la ventana', () => {
  const marcas = horasDe(VENTANA)
  assert.equal(marcas[0]!.etiqueta, '07:00')
  assert.equal(marcas[0]!.desde, 0)
  assert.equal(marcas.at(-1)!.etiqueta, '22:00')
  assert.equal(marcas.at(-1)!.desde, 900)
})

test('las horas no se rompen si la ventana cruza la medianoche', () => {
  const marcas = horasDe({
    inicio: '2026-08-04T23:00:00-05:00', fin: '2026-08-05T01:00:00-05:00' })
  assert.deepEqual(marcas.map((m) => m.etiqueta), ['23:00', '00:00', '01:00'])
})

test('la línea de ahora cae donde toca', () => {
  assert.equal(posicionDe('2026-08-04T14:20:00-05:00', VENTANA), 440)
})

test('si ahora está fuera de la ventana, no hay línea', () => {
  assert.equal(posicionDe('2026-08-04T05:00:00-05:00', VENTANA), null)
  assert.equal(posicionDe('2026-08-04T23:30:00-05:00', VENTANA), null)
})

// ── formato, leído de la cadena y no del reloj del navegador ────

test('la hora sale de la cadena ISO, no de la zona del teléfono', () => {
  assert.equal(hora('2026-08-04T16:00:00-05:00'), '16:00')
  assert.equal(hora12('2026-08-04T16:00:00-05:00'), '4:00 pm')
  assert.equal(hora12('2026-08-04T00:30:00-05:00'), '12:30 am')
  assert.equal(hora12('2026-08-04T12:05:00-05:00'), '12:05 pm')
})

test('la fecha larga se escribe en español', () => {
  assert.equal(fechaLarga('2026-07-30'), 'jueves 30 de julio')
  assert.equal(relativa('2026-07-30', '2026-07-30'), 'hoy')
  assert.equal(relativa('2026-07-31', '2026-07-30'), 'mañana')
  assert.equal(relativa('2026-07-29', '2026-07-30'), 'ayer')
  assert.equal(relativa('2026-08-06', '2026-07-30'), 'jueves 6 de agosto')
})

test('los días que faltan cruzan el cambio de mes', () => {
  assert.equal(diasHasta('2026-08-01', '2026-07-30'), 2)
  assert.equal(diasHasta('2026-07-29', '2026-07-30'), -1)
})

test('las duraciones se dicen como las diría alguien', () => {
  assert.equal(duracion(45), '45 min')
  assert.equal(duracion(60), '1 h')
  assert.equal(duracion(90), '1 h 30')
})

test('los pesos van con puntos de mil y sin decimales', () => {
  assert.equal(pesos(1240000), '$1.240.000')
  assert.equal(pesos(-89900), '−$89.900')
  assert.equal(pesos(0), '$0')
})
