import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cargarConfig, fuentesConfiguradas } from '../src/config.ts'

const minimo = {
  DATABASE_URL: 'postgres://a:b@localhost:5433/c',
  GROQ_API_KEY: 'gsk_prueba',
}

test('rechaza configuración sin DATABASE_URL', () => {
  assert.throws(() => cargarConfig({ GROQ_API_KEY: 'x' }), /DATABASE_URL/)
})

test('rechaza configuración sin GROQ_API_KEY', () => {
  assert.throws(() => cargarConfig({ DATABASE_URL: minimo.DATABASE_URL }), /GROQ_API_KEY/)
})

test('usa America/Bogota por defecto', () => {
  assert.equal(cargarConfig(minimo).zonaHoraria, 'America/Bogota')
})

test('el modo sombra viene encendido por defecto', () => {
  assert.equal(cargarConfig(minimo).modoSombra, true)
})

test('sólo un "false" explícito apaga el modo sombra', () => {
  assert.equal(cargarConfig({ ...minimo, MODO_SOMBRA: 'false' }).modoSombra, false)
  // Un error de tipeo no puede soltarle la correa a la asistente sin querer.
  assert.equal(cargarConfig({ ...minimo, MODO_SOMBRA: 'FALSE' }).modoSombra, true)
  assert.equal(cargarConfig({ ...minimo, MODO_SOMBRA: '' }).modoSombra, true)
  assert.equal(cargarConfig({ ...minimo, MODO_SOMBRA: '0' }).modoSombra, true)
})

test('sin credenciales no hay ninguna fuente de correo', () => {
  assert.deepEqual(fuentesConfiguradas(cargarConfig(minimo)), [])
})

test('detecta Gmail cuando hay client id y refresh token', () => {
  const c = cargarConfig({ ...minimo, GOOGLE_CLIENT_ID: 'id', GOOGLE_REFRESH_TOKEN: 'tok' })
  assert.deepEqual(fuentesConfiguradas(c), ['gmail'])
})

test('detecta las dos fuentes cuando ambas están configuradas', () => {
  const c = cargarConfig({
    ...minimo,
    GOOGLE_CLIENT_ID: 'id', GOOGLE_REFRESH_TOKEN: 'tok',
    MS_CLIENT_ID: 'msid', MS_REFRESH_TOKEN: 'mstok',
  })
  assert.deepEqual(fuentesConfiguradas(c), ['gmail', 'outlook'])
})

test('un client id sin refresh token no cuenta como fuente', () => {
  const c = cargarConfig({ ...minimo, MS_CLIENT_ID: 'msid' })
  assert.deepEqual(fuentesConfiguradas(c), [])
})

test('el puerto se convierte a número', () => {
  assert.equal(cargarConfig({ ...minimo, PUERTO: '8080' }).puerto, 8080)
})
