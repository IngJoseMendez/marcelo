import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { migrar } from '../src/db/migrar.ts'
import { crearBaseDePrueba } from './ayuda/db.ts'
import { crearRepoAcciones } from '../src/repos/acciones.ts'
import { crearRepoIntenciones } from '../src/repos/intenciones.ts'
import { crearServicioAgenda } from '../src/servicios/agendar.ts'
import { crearServicioDeshacer } from '../src/servicios/deshacer.ts'
import { nuevoIdEvento } from '../src/dominio/identificadores.ts'
import { RelojFalso } from '../src/puertos/reloj.ts'
import { CalendarioFalso } from './fakes/calendario-falso.ts'
import { CalendarioSombra } from '../src/adaptadores/calendario-sombra.ts'
import type { BaseDatos } from '../src/db/base-datos.ts'
import type { SumideroCalendario } from '../src/puertos/sumidero-calendario.ts'

let db: BaseDatos
const reloj = new RelojFalso('2026-08-04T14:14:00')
const HUECO = '2026-08-04T18:00:00-05:00'

before(async () => { db = await crearBaseDePrueba(); await migrar(db) })
after(async () => { await db.cerrar() })
beforeEach(async () => {
  await db.ejecutar('TRUNCATE intenciones, acciones RESTART IDENTITY CASCADE')
})

function armar(calendario: SumideroCalendario) {
  const repoAcciones = crearRepoAcciones(db)
  const repoIntenciones = crearRepoIntenciones(db)
  return {
    repoAcciones,
    repoIntenciones,
    agenda: crearServicioAgenda({
      reloj, calendario, repoAcciones, repoIntenciones,
      calendarId: 'primary', nuevoId: () => 'evt00agendado',
    }),
    deshacer: crearServicioDeshacer(repoAcciones, calendario, repoIntenciones),
  }
}

const unaIntencion = (db: BaseDatos) =>
  crearRepoIntenciones(db).crear({
    titulo: 'Estudiar para el parcial', detalle: null,
    prioridad: 'alta', duracionMin: 120, venceEl: null, origen: 'texto',
  })

test('agendar mete la intención en el calendario y la saca de la bandeja', async () => {
  const cal = new CalendarioFalso()
  const { agenda, repoIntenciones } = armar(cal)
  const intencion = await unaIntencion(db)

  const r = await agenda.agendar(intencion.id, HUECO)

  assert.equal(r.ok, true)
  assert.equal(r.fin, '2026-08-04T20:00:00-05:00', 'dos horas después del inicio')

  const enCalendario = await cal.eventosEnRango(
    'primary', '2026-08-04T00:00:00-05:00', '2026-08-04T23:59:59-05:00')
  assert.equal(enCalendario.length, 1)
  assert.equal(enCalendario[0]!.titulo, 'Estudiar para el parcial')

  assert.equal((await repoIntenciones.bandeja()).length, 0, 'ya no está pendiente')
  assert.equal((await repoIntenciones.porId(intencion.id))?.estado, 'agendada')
})

test('la inversa se guarda antes de escribir y borra ese evento', async () => {
  const { agenda, repoAcciones } = armar(new CalendarioFalso())
  const intencion = await unaIntencion(db)
  const r = await agenda.agendar(intencion.id, HUECO)

  const accion = await repoAcciones.porId(r.accionId!)
  assert.equal(accion?.payloadInverso.tipo, 'borrar_evento')
  if (accion?.payloadInverso.tipo !== 'borrar_evento') return
  assert.equal(accion.payloadInverso.eventoId, 'evt00agendado')
})

test('deshacer borra el evento y devuelve la intención a la bandeja', async () => {
  const cal = new CalendarioFalso()
  const { agenda, deshacer, repoIntenciones } = armar(cal)
  const intencion = await unaIntencion(db)
  const r = await agenda.agendar(intencion.id, HUECO)

  const d = await deshacer.deshacer(r.accionId!)

  assert.equal(d.ok, true)
  assert.deepEqual(cal.eventosBorrados, ['evt00agendado'])
  const bandeja = await repoIntenciones.bandeja()
  assert.equal(bandeja.length, 1, 'la tarea no se pierde: vuelve a estar por hacer')
  assert.equal(bandeja[0]!.titulo, 'Estudiar para el parcial')
})

test('en modo sombra se registra el ensayo y la bandeja no miente', async () => {
  const real = new CalendarioFalso()
  const { agenda, repoAcciones, repoIntenciones } = armar(new CalendarioSombra(real))
  const intencion = await unaIntencion(db)

  const r = await agenda.agendar(intencion.id, HUECO)

  assert.equal(r.ok, true)
  assert.equal(r.ensayo, true)
  assert.equal((await repoAcciones.porId(r.accionId!))?.estado, 'sombra')
  assert.equal(
    (await real.eventosEnRango('primary', '2026-08-04T00:00:00-05:00',
      '2026-08-04T23:59:59-05:00')).length, 0, 'no tocó el calendario')
  assert.equal((await repoIntenciones.porId(intencion.id))?.estado, 'pendiente',
    'si no se creó el evento, la intención sigue por hacer')
})

test('una intención ya agendada no se agenda dos veces', async () => {
  const { agenda } = armar(new CalendarioFalso())
  const intencion = await unaIntencion(db)
  await agenda.agendar(intencion.id, HUECO)

  const segundo = await agenda.agendar(intencion.id, HUECO)
  assert.equal(segundo.ok, false)
  assert.match(segundo.motivo!, /bandeja/i)
})

test('una hora inválida no llega al calendario', async () => {
  const cal = new CalendarioFalso()
  const { agenda } = armar(cal)
  const intencion = await unaIntencion(db)

  const r = await agenda.agendar(intencion.id, 'el jueves por ahí')
  assert.equal(r.ok, false)
  assert.equal((await cal.eventosEnRango('primary', '2026-01-01', '2027-01-01')).length, 0)
})

test('el id de evento que generamos le sirve a Google', () => {
  // base32hex (0-9, a-v) y al menos 5 caracteres, o la API lo rechaza.
  for (let i = 0; i < 50; i++) {
    const id = nuevoIdEvento()
    assert.match(id, /^[0-9a-v]{5,1024}$/)
  }
  assert.notEqual(nuevoIdEvento(), nuevoIdEvento())
})
