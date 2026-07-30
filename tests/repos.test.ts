import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { migrar } from '../src/db/migrar.ts'
import { crearBaseDePrueba } from './ayuda/db.ts'
import { crearRepoCompromisos } from '../src/repos/compromisos.ts'
import { crearRepoCorreos, crearRepoCuentas } from '../src/repos/correos.ts'
import type { BaseDatos } from '../src/db/base-datos.ts'

let db: BaseDatos
let cuentaGmail: number

before(async () => {
  db = await crearBaseDePrueba()
  await migrar(db)
})
after(async () => { await db.cerrar() })

beforeEach(async () => {
  await db.ejecutar(
    `TRUNCATE acciones, cola, correos_procesados, compromisos, sync_cuenta,
              cuentas_correo RESTART IDENTITY CASCADE`)
  cuentaGmail = (await crearRepoCuentas(db).registrar('gmail', 'marcelo@gmail.com')).id
})

const correoBase = () => ({
  cuentaId: cuentaGmail,
  messageId: 'msg-1',
  threadId: 't-1',
  remitente: 'ramirez@uni.edu.co',
  asunto: 'Clase cancelada',
  cuerpo: 'No hay clase hoy',
  recibidoEn: '2026-08-04T14:14:00-05:00',
  etiquetas: ['INBOX'],
})

test('crea y lista compromisos activos', async () => {
  const repo = crearRepoCompromisos(db)
  await repo.crear({
    titulo: 'Cálculo', alias: ['calculo', 'clase'],
    rrule: 'FREQ=WEEKLY;BYDAY=WE', horaInicio: '16:00', horaFin: '17:00',
    tz: 'America/Bogota', googleCalendarId: 'primary',
    googleEventId: 'evt_1', remitentesVinculados: ['ramirez@uni.edu.co'],
  })
  const activos = await repo.listarActivos()
  assert.equal(activos.length, 1)
  assert.equal(activos[0]!.titulo, 'Cálculo')
  assert.deepEqual(activos[0]!.alias, ['calculo', 'clase'])
  // Postgres devuelve TIME como "16:00:00"; el dominio usa "16:00".
  assert.equal(activos[0]!.horaInicio, '16:00')
  assert.equal(activos[0]!.horaFin, '17:00')
})

test('un compromiso desactivado desaparece de la lista', async () => {
  const repo = crearRepoCompromisos(db)
  const c = await repo.crear({
    titulo: 'Viejo', alias: [], rrule: null, horaInicio: '08:00', horaFin: '09:00',
    tz: 'America/Bogota', googleCalendarId: 'primary',
    googleEventId: null, remitentesVinculados: [],
  })
  await repo.desactivar(c.id)
  assert.equal((await repo.listarActivos()).length, 0)
  assert.equal((await repo.porId(c.id))?.activo, false)
})

test('el mismo correo dos veces sólo se registra una vez', async () => {
  const repo = crearRepoCorreos(db)
  const primero = await repo.registrarSiEsNuevo(correoBase())
  const segundo = await repo.registrarSiEsNuevo(correoBase())

  assert.equal(primero.nuevo, true)
  assert.equal(segundo.nuevo, false)
  assert.equal(primero.id, segundo.id)

  const { rows } = await db.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM correos_procesados')
  assert.equal(rows[0]!.n, 1)
})

test('el mismo message_id en otra cuenta sí entra', async () => {
  const repo = crearRepoCorreos(db)
  const outlook = await crearRepoCuentas(db).registrar('outlook', 'marcelo@outlook.com')

  const a = await repo.registrarSiEsNuevo(correoBase())
  const b = await repo.registrarSiEsNuevo({ ...correoBase(), cuentaId: outlook.id })

  assert.equal(a.nuevo, true)
  assert.equal(b.nuevo, true)
  assert.notEqual(a.id, b.id)
})

test('registrar una cuenta dos veces la reactiva en vez de duplicarla', async () => {
  const repo = crearRepoCuentas(db)
  const a = await repo.registrar('gmail', 'marcelo@gmail.com')
  const b = await repo.registrar('gmail', 'marcelo@gmail.com')
  assert.equal(a.id, b.id)
  assert.equal((await repo.listarActivas()).length, 1)
})

test('marcarProcesado guarda la clasificación', async () => {
  const repo = crearRepoCorreos(db)
  const { id } = await repo.registrarSiEsNuevo(correoBase())
  await repo.marcarProcesado(id, 'agenda')

  const { rows } = await db.query<{ clasificacion: string; estado: string }>(
    'SELECT clasificacion, estado FROM correos_procesados WHERE id = $1', [id])
  assert.equal(rows[0]!.clasificacion, 'agenda')
  assert.equal(rows[0]!.estado, 'procesado')
})

test('recuerda a qué compromiso se resolvió un hilo', async () => {
  const correos = crearRepoCorreos(db)
  const compromiso = await crearRepoCompromisos(db).crear({
    titulo: 'Cálculo', alias: [], rrule: null, horaInicio: '16:00', horaFin: '17:00',
    tz: 'America/Bogota', googleCalendarId: 'primary',
    googleEventId: 'evt_1', remitentesVinculados: [],
  })
  const { id: correoId } = await correos.registrarSiEsNuevo(correoBase())
  await db.query(
    `INSERT INTO acciones (tipo, origen, correo_id, compromiso_id, confianza,
                           payload_aplicado, payload_inverso, estado)
     VALUES ('cancelar_instancia','correo',$1,$2,'alta','{}','{}','aplicada')`,
    [correoId, compromiso.id])

  assert.equal(await correos.compromisoDelHilo(cuentaGmail, 't-1'), compromiso.id)
})

test('un hilo desconocido no inventa compromiso', async () => {
  const correos = crearRepoCorreos(db)
  assert.equal(await correos.compromisoDelHilo(cuentaGmail, 't-nuevo'), null)
  assert.equal(await correos.compromisoDelHilo(cuentaGmail, null), null)
})
