import { test } from 'node:test'
import assert from 'node:assert/strict'
import { medirGraduacion, evaluarDia, type AccionJuzgada } from '../src/dominio/graduacion.ts'
import { RelojFalso } from '../src/puertos/reloj.ts'

// viernes 7 de agosto de 2026, 9:00 pm en Bogotá
const reloj = new RelojFalso('2026-08-07T21:00:00')
const ahora = reloj.ahora()

let siguiente = 0
const acc = (dia: string, veredicto: AccionJuzgada['veredicto']): AccionJuzgada => ({
  id: ++siguiente,
  creadaEn: `${dia}T14:00:00-05:00`,
  veredicto,
})

/** Un día entero de aciertos, para construir rachas sin repetirse. */
const diaPerfecto = (dia: string, cuantas = 4): AccionJuzgada[] =>
  Array.from({ length: cuantas }, () => acc(dia, 'acierto'))

// ── un día ──────────────────────────────────────────────────────

test('sin nada juzgado, la precisión es «no se sabe», no cero', () => {
  // Cero por ciento diría que se equivocó en todo. Son cosas distintas y
  // confundirlas rompería la racha de alguien que sólo se fue de viaje.
  const d = evaluarDia([acc('2026-08-07', null), acc('2026-08-07', null)], '2026-08-07')

  assert.equal(d.precision, null)
  assert.equal(d.cumple, false)
  assert.equal(d.sinJuzgar, 2)
})

test('un error entre veinte todavía cumple; uno entre diez no', () => {
  const veinte = [...Array(19).fill(0).map(() => acc('2026-08-07', 'acierto')),
                  acc('2026-08-07', 'error')]
  const diez = [...Array(9).fill(0).map(() => acc('2026-08-06', 'acierto')),
                acc('2026-08-06', 'error')]

  assert.equal(evaluarDia(veinte, '2026-08-07').cumple, true, '95 % exacto pasa')
  assert.equal(evaluarDia(diez, '2026-08-06').cumple, false, '90 % no')
})

// ── la racha ────────────────────────────────────────────────────

test('cinco días seguidos al 95 % la gradúan', () => {
  const acciones = ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07']
    .flatMap((d) => diaPerfecto(d))

  const g = medirGraduacion(acciones, ahora)

  assert.equal(g.rachaActual, 5)
  assert.equal(g.puedeGraduarse, true)
  assert.match(g.dictamen, /Ya cumple el criterio/)
})

test('cuatro no bastan, y lo dice con cuántos faltan', () => {
  const acciones = ['2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07']
    .flatMap((d) => diaPerfecto(d))

  const g = medirGraduacion(acciones, ahora)

  assert.equal(g.rachaActual, 4)
  assert.equal(g.puedeGraduarse, false)
  assert.match(g.dictamen, /Lleva 4 días seguidos.*Faltan 1/s)
})

test('un error en medio corta la racha, aunque lo de antes fuera perfecto', () => {
  // Es el punto entero del criterio: no mide el promedio del mes, mide que
  // últimamente no se equivoque.
  const acciones = [
    ...diaPerfecto('2026-08-03'),
    ...diaPerfecto('2026-08-04'),
    ...diaPerfecto('2026-08-05', 3), acc('2026-08-05', 'error'),
    ...diaPerfecto('2026-08-06'),
    ...diaPerfecto('2026-08-07'),
  ]

  const g = medirGraduacion(acciones, ahora)

  assert.equal(g.rachaActual, 2, 'sólo cuentan el 6 y el 7')
  assert.equal(g.puedeGraduarse, false)
})

test('un día sin nada juzgado no corta la racha, pero tampoco suma', () => {
  // Si un día vacío contara como acierto, cinco días de vacaciones
  // graduarían a la asistente sin que hubiera leído un correo.
  const acciones = [
    ...diaPerfecto('2026-08-03'),
    ...diaPerfecto('2026-08-04'),
    ...diaPerfecto('2026-08-06'),
    ...diaPerfecto('2026-08-07'),
  ]

  const g = medirGraduacion(acciones, ahora)

  assert.equal(g.rachaActual, 4, 'el 5 no estaba y no cuenta ni a favor ni en contra')
  assert.equal(g.puedeGraduarse, false)
})

test('lo que está sin revisar no cuenta como acierto', () => {
  const acciones = [
    ...diaPerfecto('2026-08-07', 2),
    acc('2026-08-07', null), acc('2026-08-07', null),
  ]

  const g = medirGraduacion(acciones, ahora)

  assert.equal(g.totalJuzgadas, 2)
  assert.equal(g.sinJuzgar, 2)
  assert.match(g.dictamen, /2 sin revisar/)
})

test('sin nada que juzgar lo dice, en vez de dar un número vacío', () => {
  const g = medirGraduacion([], ahora)

  assert.equal(g.rachaActual, 0)
  assert.equal(g.totalJuzgadas, 0)
  assert.match(g.dictamen, /no ha hecho nada por su cuenta/)
})

test('con todo sin revisar, pide que lo revise', () => {
  const g = medirGraduacion([acc('2026-08-07', null)], ahora)

  assert.match(g.dictamen, /sin revisar.*✓ o ✗/s)
})

test('la ventana devuelve un día por fecha, incluso los vacíos', () => {
  const g = medirGraduacion(diaPerfecto('2026-08-07'), ahora, 7)

  assert.equal(g.dias.length, 7)
  assert.equal(g.dias.at(-1)!.fecha, '2026-08-07', 'el último es hoy')
  assert.equal(g.dias[0]!.fecha, '2026-08-01')
  assert.equal(g.dias[0]!.precision, null)
})

test('el listón y la racha que exige el spec salen en el resultado', () => {
  // Para que la pantalla no tenga que repetir los números y arriesgarse a
  // que se separen del código que de verdad decide.
  const g = medirGraduacion([], ahora)

  assert.equal(g.precisionNecesaria, 0.95)
  assert.equal(g.rachaNecesaria, 5)
})
