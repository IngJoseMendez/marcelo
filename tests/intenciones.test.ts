import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { migrar } from '../src/db/migrar.ts'
import { crearBaseDePrueba } from './ayuda/db.ts'
import { crearRepoIntenciones } from '../src/repos/intenciones.ts'
import { RelojFalso } from '../src/puertos/reloj.ts'
import { huecosLibres } from '../src/dominio/huecos.ts'
import {
  cabeEn, calcularPrioridad, compararIntenciones, redondearDuracion,
} from '../src/dominio/intenciones.ts'
import type { BaseDatos } from '../src/db/base-datos.ts'

const reloj = new RelojFalso('2026-08-04T09:00:00')
const ahora = reloj.ahora()
const en = (horas: number) => ahora.plus({ hours: horas })

// ── prioridad ───────────────────────────────────────────────────

test('sin fecha límite se respeta lo que propuso el modelo', () => {
  assert.equal(calcularPrioridad('normal', null, ahora), 'normal')
  assert.equal(calcularPrioridad('baja', null, ahora), 'baja')
})

test('lo que vence en menos de un día es urgente aunque suene tranquilo', () => {
  assert.equal(calcularPrioridad('baja', en(5), ahora), 'urgente')
})

test('lo ya vencido también es urgente', () => {
  assert.equal(calcularPrioridad('normal', en(-10), ahora), 'urgente')
})

test('a tres días sube a alta', () => {
  assert.equal(calcularPrioridad('baja', en(60), ahora), 'alta')
})

test('la fecha límite NUNCA baja la prioridad, sólo la sube', () => {
  // Un plazo lejano no es evidencia de calma: puede ser algo enorme.
  assert.equal(calcularPrioridad('urgente', en(24 * 30), ahora), 'urgente')
  assert.equal(calcularPrioridad('alta', en(24 * 10), ahora), 'alta')
})

test('la bandeja ordena urgente arriba y a igual prioridad por vencimiento', () => {
  const items = [
    { prioridad: 'normal' as const, venceEl: null },
    { prioridad: 'urgente' as const, venceEl: new Date('2026-08-10') },
    { prioridad: 'urgente' as const, venceEl: new Date('2026-08-05') },
    { prioridad: 'alta' as const, venceEl: null },
  ]
  const orden = [...items].sort(compararIntenciones)
  assert.equal(orden[0]!.venceEl?.toISOString().slice(0, 10), '2026-08-05')
  assert.equal(orden[1]!.venceEl?.toISOString().slice(0, 10), '2026-08-10')
  assert.equal(orden[2]!.prioridad, 'alta')
  assert.equal(orden[3]!.prioridad, 'normal')
})

// ── duración ────────────────────────────────────────────────────

test('las estimaciones sueltas caen al bloque más cercano', () => {
  assert.equal(redondearDuracion(37), 30)
  assert.equal(redondearDuracion(50), 60)
  assert.equal(redondearDuracion(95), 120)
  assert.equal(redondearDuracion(5), 15)
})

test('una duración absurda cae a media hora en vez de reventar', () => {
  assert.equal(redondearDuracion(0), 30)
  assert.equal(redondearDuracion(-4), 30)
  assert.equal(redondearDuracion(NaN), 30)
})

test('cabe exacto es que cabe: sin colchones inventados', () => {
  assert.equal(cabeEn(30, 30), true)
  assert.equal(cabeEn(60, 45), false)
})

// ── huecos ──────────────────────────────────────────────────────

const ventana = { inicio: ahora.set({ hour: 7 }), fin: ahora.set({ hour: 22 }) }
const bloque = (h1: number, h2: number) => ({
  inicio: ahora.set({ hour: h1, minute: 0 }),
  fin: ahora.set({ hour: h2, minute: 0 }),
})

test('un día vacío es un solo hueco', () => {
  const h = huecosLibres([], ventana)
  assert.equal(h.length, 1)
  assert.equal(h[0]!.minutos, 15 * 60)
})

test('encuentra el hueco entre dos clases', () => {
  const h = huecosLibres([bloque(9, 11), bloque(16, 17)], ventana)
  const medio = h.find((x) => x.inicio.hour === 11)
  assert.ok(medio, 'debe existir el hueco de 11 a 16')
  assert.equal(medio.minutos, 300)
})

test('dos eventos solapados no producen un hueco fantasma', () => {
  // Sin fundir los solapes, entre 10 y 9 saldría un hueco negativo o vacío.
  const h = huecosLibres([bloque(9, 12), bloque(10, 14)], ventana)
  assert.ok(!h.some((x) => x.inicio.hour >= 9 && x.inicio.hour < 14))
})

test('eventos que se tocan no dejan costura', () => {
  const h = huecosLibres([bloque(9, 10), bloque(10, 11)], ventana)
  assert.ok(!h.some((x) => x.minutos === 0))
  assert.ok(!h.some((x) => x.inicio.hour === 10 && x.fin.hour === 10))
})

test('los huecos por debajo del mínimo no se ofrecen', () => {
  const h = huecosLibres([bloque(7, 12), bloque(12, 22)], ventana, 15)
  assert.equal(h.length, 0)
})

test('un evento que se sale de la ventana se recorta', () => {
  const h = huecosLibres([bloque(5, 9)], ventana)
  assert.equal(h.length, 1)
  assert.equal(h[0]!.inicio.hour, 9)
})

// ── repositorio ─────────────────────────────────────────────────

let db: BaseDatos
before(async () => { db = await crearBaseDePrueba(); await migrar(db) })
after(async () => { await db.cerrar() })
beforeEach(async () => {
  await db.ejecutar('TRUNCATE intenciones, acciones RESTART IDENTITY CASCADE')
})

const nueva = (over: Record<string, unknown> = {}) => ({
  titulo: 'Estudiar para el parcial', detalle: null,
  prioridad: 'alta' as const, duracionMin: 120 as const,
  venceEl: new Date('2026-08-09T23:59:00Z'), origen: 'voz' as const,
  ...over,
})

test('crea una intención y la devuelve en la bandeja', async () => {
  const repo = crearRepoIntenciones(db)
  await repo.crear(nueva())
  const bandeja = await repo.bandeja()
  assert.equal(bandeja.length, 1)
  assert.equal(bandeja[0]!.titulo, 'Estudiar para el parcial')
  assert.equal(bandeja[0]!.duracionMin, 120)
})

test('la base rechaza una duración fuera de los bloques', async () => {
  await assert.rejects(
    () => db.query(
      `INSERT INTO intenciones (titulo, prioridad, duracion_min, origen)
       VALUES ('x','alta',37,'voz')`), /check|constraint/i)
})

test('la bandeja ordena por prioridad y luego por vencimiento', async () => {
  const repo = crearRepoIntenciones(db)
  await repo.crear(nueva({ titulo: 'normal sin fecha', prioridad: 'normal', venceEl: null }))
  await repo.crear(nueva({ titulo: 'urgente lejana', prioridad: 'urgente',
    venceEl: new Date('2026-08-20T00:00:00Z') }))
  await repo.crear(nueva({ titulo: 'urgente cercana', prioridad: 'urgente',
    venceEl: new Date('2026-08-05T00:00:00Z') }))

  const titulos = (await repo.bandeja()).map((i) => i.titulo)
  assert.deepEqual(titulos, ['urgente cercana', 'urgente lejana', 'normal sin fecha'])
})

test('agendar la saca de la bandeja y deshacer la devuelve', async () => {
  const repo = crearRepoIntenciones(db)
  const i = await repo.crear(nueva())

  // Agendar crea un evento, y eso es una acción auditada: la intención
  // queda amarrada a ella para poder revertir las dos cosas juntas.
  const { rows } = await db.query<{ id: string | number }>(
    `INSERT INTO acciones (tipo, origen, confianza, payload_aplicado,
                           payload_inverso, estado)
     VALUES ('crear_evento','voz','alta','{}','{}','aplicada') RETURNING id`)
  const accionId = Number(rows[0]!.id)

  await repo.marcarAgendada(i.id, accionId, 'evt_nuevo')
  assert.equal((await repo.bandeja()).length, 0)
  assert.equal((await repo.porId(i.id))?.googleEventId, 'evt_nuevo')

  // Deshacer el agendamiento la devuelve intacta a la bandeja.
  await repo.devolverABandeja(i.id)
  assert.equal((await repo.bandeja()).length, 1)
  assert.equal((await repo.porId(i.id))?.googleEventId, null)
})

test('cerrar una intención la saca de la bandeja para siempre', async () => {
  const repo = crearRepoIntenciones(db)
  const i = await repo.crear(nueva())
  await repo.cerrar(i.id, 'hecha')
  assert.equal((await repo.bandeja()).length, 0)
  assert.equal((await repo.porId(i.id))?.estado, 'hecha')
})
