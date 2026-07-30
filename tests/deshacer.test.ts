import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { migrar } from '../src/db/migrar.ts'
import { crearBaseDePrueba } from './ayuda/db.ts'
import { crearRepoAcciones } from '../src/repos/acciones.ts'
import { crearServicioDeshacer } from '../src/servicios/deshacer.ts'
import { calcularInversa } from '../src/dominio/inversas.ts'
import { CalendarioFalso } from './fakes/calendario-falso.ts'
import { CalendarioSombra } from '../src/adaptadores/calendario-sombra.ts'
import type { BaseDatos } from '../src/db/base-datos.ts'
import type { EventoInstancia } from '../src/puertos/sumidero-calendario.ts'

let db: BaseDatos

const instancia: EventoInstancia = {
  eventoId: 'evt_1',
  instanciaId: 'inst_20260806',
  inicio: '2026-08-06T16:00:00-05:00',
  fin: '2026-08-06T17:00:00-05:00',
  titulo: 'Cálculo',
  estado: 'confirmado',
}

const RANGO = ['2026-08-06T00:00:00-05:00', '2026-08-06T23:59:59-05:00'] as const

before(async () => { db = await crearBaseDePrueba(); await migrar(db) })
after(async () => { await db.cerrar() })
beforeEach(async () => { await db.ejecutar('TRUNCATE acciones RESTART IDENTITY CASCADE') })

const guardar = (estado: 'aplicada' | 'sombra' = 'aplicada') =>
  crearRepoAcciones(db).registrar({
    tipo: 'cancelar_instancia', origen: 'correo', correoId: null,
    compromisoId: null, confianza: 'alta',
    payloadAplicado: { instanciaId: instancia.instanciaId },
    payloadInverso: { tipo: 'recrear_instancia', calendarId: 'primary', instancia },
    estado,
  })

// ── inversas ────────────────────────────────────────────────────

test('la inversa de cancelar una instancia la recrea completa', () => {
  const inv = calcularInversa(
    { tipo: 'cancelar_instancia', calendarId: 'primary', instanciaId: instancia.instanciaId },
    { instancia, rrule: 'FREQ=WEEKLY;BYDAY=WE' })
  assert.equal(inv.tipo, 'recrear_instancia')
  if (inv.tipo !== 'recrear_instancia') return
  assert.equal(inv.instancia.inicio, instancia.inicio)
  assert.equal(inv.instancia.titulo, 'Cálculo')
})

test('la inversa de mover guarda el horario ANTERIOR, no el nuevo', () => {
  const inv = calcularInversa(
    { tipo: 'mover_evento', calendarId: 'primary', instanciaId: instancia.instanciaId,
      nuevoInicio: '2026-08-06T18:00:00-05:00', nuevoFin: '2026-08-06T19:00:00-05:00' },
    { instancia, rrule: null })
  assert.equal(inv.tipo, 'restaurar_horario')
  if (inv.tipo !== 'restaurar_horario') return
  assert.equal(inv.inicio, '2026-08-06T16:00:00-05:00')
  assert.equal(inv.fin, '2026-08-06T17:00:00-05:00')
})

test('la inversa de borrar la serie conserva la RRULE', () => {
  const inv = calcularInversa(
    { tipo: 'borrar_serie', calendarId: 'primary', eventoId: 'evt_1' },
    { instancia, rrule: 'FREQ=WEEKLY;BYDAY=WE' })
  assert.equal(inv.tipo, 'recrear_serie')
  if (inv.tipo !== 'recrear_serie') return
  assert.equal(inv.rrule, 'FREQ=WEEKLY;BYDAY=WE')
  assert.equal(inv.titulo, 'Cálculo')
})

test('aplicar y luego restaurar deja el calendario idéntico', async () => {
  const cal = new CalendarioFalso([{ ...instancia }])
  const antes = await cal.instanciasEnRango('primary', 'evt_1', ...RANGO)

  const accion = {
    tipo: 'cancelar_instancia' as const,
    calendarId: 'primary', instanciaId: instancia.instanciaId,
  }
  const inv = calcularInversa(accion, { instancia, rrule: null })
  await cal.aplicar(accion)
  assert.equal((await cal.instanciasEnRango('primary', 'evt_1', ...RANGO))[0]!.estado, 'cancelado')

  await cal.restaurar(inv)
  assert.deepEqual(await cal.instanciasEnRango('primary', 'evt_1', ...RANGO), antes)
})

// ── modo sombra ─────────────────────────────────────────────────

test('el modo sombra lee igual que el real pero no escribe', async () => {
  const real = new CalendarioFalso([{ ...instancia }])
  const sombra = new CalendarioSombra(real)

  const leidas = await sombra.instanciasEnRango('primary', 'evt_1', ...RANGO)
  assert.equal(leidas.length, 1, 'la lectura debe ser idéntica a la de producción')

  await sombra.aplicar({
    tipo: 'cancelar_instancia', calendarId: 'primary', instanciaId: instancia.instanciaId,
  })

  assert.equal(sombra.aplicadas.length, 1, 'queda registrado lo que habría hecho')
  const despues = await real.instanciasEnRango('primary', 'evt_1', ...RANGO)
  assert.equal(despues[0]!.estado, 'confirmado', 'el calendario real no se tocó')
})

// ── deshacer ────────────────────────────────────────────────────

test('registrar guarda la acción con su inversa', async () => {
  const repo = crearRepoAcciones(db)
  const id = await guardar()
  const g = await repo.porId(id)
  assert.equal(g?.estado, 'aplicada')
  assert.equal(g?.payloadInverso.tipo, 'recrear_instancia')
})

test('deshacer aplica la inversa y devuelve el calendario', async () => {
  const repo = crearRepoAcciones(db)
  const cal = new CalendarioFalso([{ ...instancia }])
  await cal.aplicar({
    tipo: 'cancelar_instancia', calendarId: 'primary', instanciaId: instancia.instanciaId })

  const id = await guardar()
  const r = await crearServicioDeshacer(repo, cal).deshacer(id)
  assert.equal(r.ok, true)

  const [restaurada] = await cal.instanciasEnRango('primary', 'evt_1', ...RANGO)
  assert.equal(restaurada!.estado, 'confirmado')
})

test('deshacer marca la acción sin borrar el registro', async () => {
  const repo = crearRepoAcciones(db)
  const id = await guardar()
  await crearServicioDeshacer(repo, new CalendarioFalso([{ ...instancia }])).deshacer(id)

  const g = await repo.porId(id)
  assert.equal(g?.estado, 'deshecha')
  assert.ok(g?.deshechaEn, 'debe quedar cuándo se deshizo')

  const { rows } = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM acciones')
  assert.equal(rows[0]!.n, 1, 'append-only: nada se borra')
})

test('no se puede deshacer dos veces', async () => {
  const servicio = crearServicioDeshacer(
    crearRepoAcciones(db), new CalendarioFalso([{ ...instancia }]))
  const id = await guardar()
  await servicio.deshacer(id)
  const segundo = await servicio.deshacer(id)
  assert.equal(segundo.ok, false)
  assert.match(segundo.motivo!, /deshecha/i)
})

test('una acción en sombra no se puede deshacer', async () => {
  const id = await guardar('sombra')
  const r = await crearServicioDeshacer(
    crearRepoAcciones(db), new CalendarioFalso([{ ...instancia }])).deshacer(id)
  assert.equal(r.ok, false)
  assert.match(r.motivo!, /sombra/i)
})

test('deshacer algo inexistente no revienta', async () => {
  const r = await crearServicioDeshacer(
    crearRepoAcciones(db), new CalendarioFalso()).deshacer(9999)
  assert.equal(r.ok, false)
})

test('ultimaDeshacible ignora sombra y las ya deshechas', async () => {
  const repo = crearRepoAcciones(db)
  await guardar('sombra')
  const aplicada = await guardar('aplicada')
  await guardar('sombra')

  assert.equal((await repo.ultimaDeshacible())?.id, aplicada)
})

test('deshacerUltima revierte la más reciente aplicada', async () => {
  const repo = crearRepoAcciones(db)
  const cal = new CalendarioFalso([{ ...instancia }])
  await cal.aplicar({
    tipo: 'cancelar_instancia', calendarId: 'primary', instanciaId: instancia.instanciaId })
  const id = await guardar()

  const r = await crearServicioDeshacer(repo, cal).deshacerUltima()
  assert.equal(r.ok, true)
  assert.equal((await repo.porId(id))?.estado, 'deshecha')
})

test('deshacerUltima sin nada que deshacer avisa en vez de fallar', async () => {
  const r = await crearServicioDeshacer(
    crearRepoAcciones(db), new CalendarioFalso()).deshacerUltima()
  assert.equal(r.ok, false)
  assert.match(r.motivo!, /nada/i)
})
