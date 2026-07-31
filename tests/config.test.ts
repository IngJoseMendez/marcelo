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

test('rechaza configuración sin clave del cerebro', () => {
  assert.throws(() => cargarConfig({ DATABASE_URL: minimo.DATABASE_URL }), /LLM_API_KEY/)
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

test('un modelo que corre en esta misma máquina no necesita clave', () => {
  // Descartar lo local por no traer clave dejaría fuera justo la única
  // opción en la que no sale nada de la casa.
  const c = cargarConfig({
    DATABASE_URL: minimo.DATABASE_URL,
    LLM_BASE_URL: 'http://localhost:11434/v1',
  })
  assert.equal(c.groq.baseUrl, 'http://localhost:11434/v1')
})

test('un .env viejo con nombres GROQ_ sigue arrancando', () => {
  // Renombrar variables no puede costarle a nadie una tarde de depuración.
  const c = cargarConfig({
    DATABASE_URL: minimo.DATABASE_URL,
    GROQ_API_KEY: 'gsk_viejo',
    GROQ_MODELO_EXTRACTOR: 'llama-3.3-70b-versatile',
    GROQ_MODELO_TRANSCRIPTOR: 'whisper-large-v3',
  })
  assert.equal(c.groq.apiKey, 'gsk_viejo')
  assert.equal(c.groq.modeloExtractor, 'llama-3.3-70b-versatile')
  assert.equal(c.voz.modelo, 'whisper-large-v3', 'el oído hereda del cerebro')
})

test('el oído puede ir por su cuenta, con otro proveedor', () => {
  const c = cargarConfig({
    DATABASE_URL: minimo.DATABASE_URL,
    LLM_API_KEY: 'sk-openrouter', LLM_BASE_URL: 'https://openrouter.ai/api/v1',
    VOZ_API_KEY: 'gsk_groq', VOZ_BASE_URL: 'https://api.groq.com/openai/v1',
    VOZ_MODELO: 'whisper-large-v3',
  })
  assert.equal(c.groq.baseUrl, 'https://openrouter.ai/api/v1')
  assert.equal(c.voz.baseUrl, 'https://api.groq.com/openai/v1',
    'hay proveedores buenísimos leyendo que no saben oír')
})
