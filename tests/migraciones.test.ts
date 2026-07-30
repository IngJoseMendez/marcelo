import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { migrar } from '../src/db/migrar.ts'
import { crearBaseDePrueba } from './ayuda/db.ts'
import type { BaseDatos } from '../src/db/base-datos.ts'

let db: BaseDatos

before(async () => {
  db = await crearBaseDePrueba()
  await migrar(db)
})

after(async () => {
  await db.cerrar()
})

test('crea todas las tablas del núcleo', async () => {
  const { rows } = await db.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public'`
  )
  const tablas = rows.map((r) => r.table_name)
  for (const t of ['cuentas_correo', 'sync_cuenta', 'compromisos',
                   'correos_procesados', 'acciones', 'cola', 'reglas']) {
    assert.ok(tablas.includes(t), `falta la tabla ${t}`)
  }
})

test('migrar es idempotente', async () => {
  const nuevas = await migrar(db)
  assert.deepEqual(nuevas, [], 'la segunda pasada no debe aplicar nada')
})

test('el mismo message_id se rechaza dentro de una cuenta', async () => {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO cuentas_correo (proveedor, direccion)
     VALUES ('gmail','uno@gmail.com') RETURNING id`)
  const cuenta = rows[0]!.id

  const ins = `INSERT INTO correos_procesados (cuenta_id, message_id, remitente, recibido_en)
               VALUES ($1,$2,'x@y.com', now())`
  await db.query(ins, [cuenta, 'dup-1'])
  await assert.rejects(() => db.query(ins, [cuenta, 'dup-1']), /duplicate key|unique/i)
})

test('el mismo message_id SÍ se acepta en cuentas distintas', async () => {
  // Gmail y Outlook numeran sus mensajes por separado: una colisión entre
  // proveedores no puede hacer que se descarte un correo real.
  const a = await db.query<{ id: string }>(
    `INSERT INTO cuentas_correo (proveedor, direccion)
     VALUES ('gmail','dos@gmail.com') RETURNING id`)
  const b = await db.query<{ id: string }>(
    `INSERT INTO cuentas_correo (proveedor, direccion)
     VALUES ('outlook','dos@outlook.com') RETURNING id`)

  const ins = `INSERT INTO correos_procesados (cuenta_id, message_id, remitente, recibido_en)
               VALUES ($1,'mismo-id','x@y.com', now())`
  await db.query(ins, [a.rows[0]!.id])
  await db.query(ins, [b.rows[0]!.id])

  const { rows } = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM correos_procesados WHERE message_id='mismo-id'`)
  assert.equal(rows[0]!.n, 2)
})

test('acciones rechaza un origen inventado', async () => {
  await assert.rejects(
    () => db.query(
      `INSERT INTO acciones (tipo, origen, confianza, payload_aplicado, payload_inverso, estado)
       VALUES ('cancelar_instancia','telepatia','alta','{}','{}','aplicada')`),
    /check|constraint/i)
})

test('acciones rechaza una confianza inventada', async () => {
  await assert.rejects(
    () => db.query(
      `INSERT INTO acciones (tipo, origen, confianza, payload_aplicado, payload_inverso, estado)
       VALUES ('cancelar_instancia','correo','regular','{}','{}','aplicada')`),
    /check|constraint/i)
})

test('una cuenta sólo admite proveedores conocidos', async () => {
  await assert.rejects(
    () => db.query(
      `INSERT INTO cuentas_correo (proveedor, direccion) VALUES ('hotmail97','x@y.com')`),
    /check|constraint/i)
})
