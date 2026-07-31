import { test } from 'node:test'
import assert from 'node:assert/strict'
import { armarTranscripcion, confianzaDeSegmento } from '../src/dominio/transcripcion.ts'
import { esDeVoz, firmarVoz } from '../src/dominio/firma-voz.ts'

const seg = (avgLogprob: number, noSpeechProb = 0, texto = 'algo') =>
  ({ texto, avgLogprob, noSpeechProb })

// ── confianza por trozo ─────────────────────────────────────────

test('un trozo que el modelo oyó claro es de confianza alta', () => {
  assert.equal(confianzaDeSegmento(seg(-0.15)), 'alta')
})

test('un trozo dudoso es medio, y uno malo es bajo', () => {
  assert.equal(confianzaDeSegmento(seg(-0.5)), 'media')
  assert.equal(confianzaDeSegmento(seg(-0.9)), 'baja')
})

test('si probablemente ahí no había voz, da igual lo seguro que suene', () => {
  // El caso clásico: ruido de fondo que el modelo "transcribe" con
  // aplomo. Sin esta regla, un carro pasando se vuelve una orden.
  assert.equal(confianzaDeSegmento(seg(-0.05, 0.8)), 'baja')
})

// ── la nota entera ──────────────────────────────────────────────

test('la nota vale lo que su peor trozo', () => {
  const t = armarTranscripcion('cancela la clase de mañana', [
    seg(-0.1, 0, 'cancela la clase'),
    seg(-0.95, 0, 'de mañana'),
  ])
  assert.equal(t.confianza, 'baja',
    'promediar escondería justo la frase mascullada donde inventa')
  assert.equal(t.segmentos.length, 2)
  assert.equal(t.segmentos[1]!.confianza, 'baja')
})

test('una nota clara de punta a punta es de confianza alta', () => {
  const t = armarTranscripcion('qué tengo hoy', [seg(-0.2), seg(-0.1)])
  assert.equal(t.confianza, 'alta')
})

test('sin segmentos se asume lo peor', () => {
  assert.equal(armarTranscripcion('algo', []).confianza, 'baja')
})

test('el texto llega sin espacios de sobra', () => {
  assert.equal(armarTranscripcion('  hola  ', [seg(-0.1)]).texto, 'hola')
})

// ── la boleta de voz ────────────────────────────────────────────

const SECRETO = 'secreto-de-prueba'
const AHORA = 1_800_000_000_000

test('lo que sale del transcriptor entra como voz', () => {
  const boleta = firmarVoz('cancela el gimnasio', SECRETO, AHORA)
  assert.equal(esDeVoz('cancela el gimnasio', boleta, SECRETO, AHORA + 1000), true)
})

test('cambiar una palabra invalida la boleta', () => {
  // Y eso es lo correcto: si el texto no es el que ella oyó, no es voz.
  const boleta = firmarVoz('cancela el gimnasio', SECRETO, AHORA)
  assert.equal(esDeVoz('cancela la clase', boleta, SECRETO, AHORA + 1000), false)
})

test('una boleta vieja ya no vale', () => {
  const boleta = firmarVoz('cancela el gimnasio', SECRETO, AHORA)
  assert.equal(esDeVoz('cancela el gimnasio', boleta, SECRETO, AHORA + 3_600_000), false)
})

test('sin boleta, o con una inventada, es texto escrito', () => {
  assert.equal(esDeVoz('cancela el gimnasio', undefined, SECRETO, AHORA), false)
  assert.equal(esDeVoz('cancela el gimnasio', '99999999999.abc', SECRETO, AHORA), false)
  assert.equal(esDeVoz('cancela el gimnasio', 'basura', SECRETO, AHORA), false)
})

test('otra firma no sirve: la boleta la emite quien transcribe', () => {
  const boleta = firmarVoz('cancela el gimnasio', 'otro-secreto', AHORA)
  assert.equal(esDeVoz('cancela el gimnasio', boleta, SECRETO, AHORA + 1000), false)
})
