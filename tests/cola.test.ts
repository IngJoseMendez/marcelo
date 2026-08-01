import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { migrar } from '../src/db/migrar.ts'
import { crearBaseDePrueba } from './ayuda/db.ts'
import { crearRepoCola } from '../src/repos/cola.ts'
import { crearRepoCuentas } from '../src/repos/correos.ts'
import type { BaseDatos } from '../src/db/base-datos.ts'

let db: BaseDatos
let cuenta: number

before(async () => { db = await crearBaseDePrueba(); await migrar(db) })
after(async () => { await db.cerrar() })

beforeEach(async () => {
  await db.ejecutar('TRUNCATE cola, cuentas_correo RESTART IDENTITY CASCADE')
  cuenta = (await crearRepoCuentas(db).registrar('gmail', 'marcelo@gmail.com')).id
})

test('encolar el mismo mensaje dos veces deja una sola entrada', async () => {
  const cola = crearRepoCola(db)
  await cola.encolar(cuenta, 'm1')
  await cola.encolar(cuenta, 'm1')
  assert.equal((await cola.tomarPendientes(10)).length, 1)
})

test('el mismo message_id en otra cuenta sí entra a la cola', async () => {
  const cola = crearRepoCola(db)
  const outlook = await crearRepoCuentas(db).registrar('outlook', 'marcelo@outlook.com')
  await cola.encolar(cuenta, 'm1')
  await cola.encolar(outlook.id, 'm1')
  assert.equal((await cola.tomarPendientes(10)).length, 2)
})

test('tomarPendientes lo marca en procesando para que nadie más lo tome', async () => {
  const cola = crearRepoCola(db)
  await cola.encolar(cuenta, 'm1')
  assert.equal((await cola.tomarPendientes(10)).length, 1)
  assert.equal((await cola.tomarPendientes(10)).length, 0)
})

test('marcarError lo devuelve a pendiente y cuenta el intento', async () => {
  const cola = crearRepoCola(db)
  await cola.encolar(cuenta, 'm1')
  const [item] = await cola.tomarPendientes(10)
  await cola.marcarError(item!.id, 'timeout')

  const reintento = await cola.tomarPendientes(10)
  assert.equal(reintento.length, 1)
  assert.equal(reintento[0]!.intentos, 1)
})

test('tras tres fallos queda muerto y deja de reintentarse', async () => {
  const cola = crearRepoCola(db)
  await cola.encolar(cuenta, 'm1')
  for (let i = 0; i < 3; i++) {
    const [item] = await cola.tomarPendientes(10)
    assert.ok(item, `debía seguir disponible en el intento ${i + 1}`)
    await cola.marcarError(item.id, 'falla')
  }
  assert.equal((await cola.tomarPendientes(10)).length, 0)
  assert.equal((await cola.muertos()).length, 1)
})

/**
 * Un correo borrado —o de una cuenta que ya no es ésta— da 404 hoy, mañana
 * y siempre. En la máquina de Marcelo eran veintidós encolados así: tres
 * intentos cada uno, sesenta y seis llamadas a Google para nada y una
 * pantalla de rojo que tapaba los errores de verdad.
 */
test('lo que no existe muere a la primera, sin gastar tres intentos', async () => {
  const cola = crearRepoCola(db)
  await cola.encolar(cuenta, 'm1')
  const [item] = await cola.tomarPendientes(10)
  await cola.marcarError(item!.id, 'El correo m1 ya no está en gmail', true)

  assert.equal((await cola.tomarPendientes(10)).length, 0, 'no se vuelve a intentar')
  assert.equal((await cola.muertos()).length, 1, 'y queda anotado, no desaparece')
})

test('marcarListo lo saca de la cola para siempre', async () => {
  const cola = crearRepoCola(db)
  await cola.encolar(cuenta, 'm1')
  const [item] = await cola.tomarPendientes(10)
  await cola.marcarListo(item!.id)
  assert.equal((await cola.tomarPendientes(10)).length, 0)
  assert.equal((await cola.muertos()).length, 0)
})

test('respeta el límite del lote', async () => {
  const cola = crearRepoCola(db)
  for (let i = 0; i < 5; i++) await cola.encolar(cuenta, `m${i}`)
  assert.equal((await cola.tomarPendientes(2)).length, 2)
  assert.equal((await cola.tomarPendientes(10)).length, 3)
})

test('un error larguísimo no revienta la inserción', async () => {
  const cola = crearRepoCola(db)
  await cola.encolar(cuenta, 'm1')
  const [item] = await cola.tomarPendientes(10)
  await cola.marcarError(item!.id, 'x'.repeat(50_000))
  assert.equal((await cola.tomarPendientes(10)).length, 1)
})
