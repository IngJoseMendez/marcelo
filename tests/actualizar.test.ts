import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  pasosDeActualizacion, revisarVersion, type Ejecutar,
} from '../src/configuracion/actualizar.ts'

/** Un git de mentira: se le dice qué contesta a cada cosa. */
function git(respuestas: Record<string, string | null>): {
  ejecutar: Ejecutar; corridos: string[]
} {
  const corridos: string[] = []
  const ejecutar: Ejecutar = async (programa, argumentos) => {
    const clave = argumentos[0] ?? ''
    corridos.push([programa, ...argumentos].join(' '))
    const salida = respuestas[clave]
    return salida === null || salida === undefined
      ? { ok: false, salida: 'fatal: not a git repository' }
      : { ok: true, salida }
  }
  return { ejecutar, corridos }
}

const AL_DIA = {
  'rev-parse': 'true\n',
  fetch: '',
  'rev-list': '0\n',
  status: '',
  log: '',
}

test('al día no propone nada', async () => {
  const { ejecutar } = git(AL_DIA)

  const v = await revisarVersion(ejecutar)

  assert.equal(v.esRepo, true)
  assert.equal(v.hayQueActualizar, false)
  assert.equal(v.detras, 0)
})

test('con cambios publicados dice cuántos y qué llega', async () => {
  const { ejecutar } = git({
    ...AL_DIA,
    'rev-list': '3\n',
    log: 'Cualquier IA, no solo Groq\n',
  })

  const v = await revisarVersion(ejecutar)

  assert.equal(v.detras, 3)
  assert.equal(v.novedad, 'Cualquier IA, no solo Groq')
  assert.equal(v.hayQueActualizar, true)
})

test('pregunta al remoto antes de contar: si no, compara contra la semana pasada', async () => {
  const { ejecutar, corridos } = git(AL_DIA)

  await revisarVersion(ejecutar)

  const orden = corridos.map((c) => c.split(' ')[1])
  assert.ok(orden.indexOf('fetch') < orden.indexOf('rev-list'))
})

test('si no es un repo, lo dice en vez de intentar cosas', async () => {
  const { ejecutar } = git({})

  const v = await revisarVersion(ejecutar)

  assert.equal(v.esRepo, false)
  assert.equal(v.hayQueActualizar, false)
})

test('detecta que hay archivos tocados a mano', async () => {
  // Pisarlos sería peor: alguien los puso ahí por algo.
  const { ejecutar } = git({ ...AL_DIA, 'rev-list': '2\n', status: ' M src/index.ts\n' })

  assert.equal((await revisarVersion(ejecutar)).sucio, true)
})

// ── qué se corre al actualizar ──────────────────────────────────

test('el tirón es --ff-only: antes fallar que dejar un conflicto', async () => {
  const pull = pasosDeActualizacion()[0]!

  assert.equal(pull.programa, 'git')
  assert.ok(pull.argumentos.includes('--ff-only'),
    'un conflicto de merge en la máquina de Marcelo no lo resolvería nadie')
  assert.ok(!pull.opcional, 'si no se puede traer el código, no hay actualización')
})

test('después de traer, se ponen las dependencias', async () => {
  const pasos = pasosDeActualizacion()

  assert.equal(pasos[1]!.programa, 'npm')
  assert.ok(pasos[1]!.argumentos.includes('install'))
})

test('las pruebas se corren, pero no bloquean', async () => {
  // Si fallan hay que decirlo; pero el código ya está en disco y no
  // actualizar tampoco lo arregla.
  const prueba = pasosDeActualizacion().find((p) => p.argumentos.includes('test'))!

  assert.equal(prueba.opcional, true)
})

test('ningún paso toca el .env ni la base de datos', () => {
  // Es toda la razón por la que actualizar es seguro: la configuración no
  // está en git y los datos viven en un volumen de Docker, fuera de aquí.
  const todo = pasosDeActualizacion()
    .map((p) => [p.programa, ...p.argumentos].join(' '))
    .join(' ')

  assert.ok(!/\.env/.test(todo))
  assert.ok(!/docker/.test(todo))
  assert.ok(!/checkout|reset|clean/.test(todo),
    'nada que pueda borrar trabajo de alguien')
})
