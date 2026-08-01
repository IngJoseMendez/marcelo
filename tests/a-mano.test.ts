import { test } from 'node:test'
import assert from 'node:assert/strict'
import { diasDe, minutosDe } from '../src/servicios/conversacion.ts'
import { crearServicioAMano } from '../src/servicios/a-mano.ts'
import { RelojFalso } from '../src/puertos/reloj.ts'
import { CalendarioFalso } from './fakes/calendario-falso.ts'
import { CalendarioSombra } from '../src/adaptadores/calendario-sombra.ts'
import type { SumideroCalendario } from '../src/puertos/sumidero-calendario.ts'

/**
 * Todo esto tiene que funcionar con el proveedor apagado.
 *
 * No es una comodidad: es lo que hace que la asistente siga siendo una
 * agenda el día que se acabe la cuota o el modelo esté caído. Si la única
 * forma de meter una clase es que una API de terceros esté de buenas, no
 * es una agenda — es un cliente de una API de terceros.
 */

// ── entender lo que él escribió, sin modelo ────────────────────

test('los días se dicen como se dicen', () => {
  assert.deepEqual(diasDe('martes,jueves'), [2, 4])
  assert.deepEqual(diasDe('lun mie vie'), [1, 3, 5])
  assert.deepEqual(diasDe('L,X,V'), [1, 3, 5])
  assert.deepEqual(diasDe('lunes y miércoles'), [1, 3])
})

test('salen ordenados y sin repetir, aunque él los diga al revés', () => {
  assert.deepEqual(diasDe('viernes,lunes,viernes'), [1, 5])
})

test('lo que no es un día no se cuela', () => {
  assert.deepEqual(diasDe('cuandosea'), [])
  assert.deepEqual(diasDe(''), [])
})

test('la duración se dice de varias formas', () => {
  assert.equal(minutosDe('2h'), 120)
  assert.equal(minutosDe('90m'), 90)
  assert.equal(minutosDe('30 min'), 30)
  assert.equal(minutosDe('hora y media'), 90)
  assert.equal(minutosDe('1 hora'), 60)
  assert.equal(minutosDe('1,5h'), 90)
})

// Nadie apunta «3 minutos» y a nadie le caben «120 horas»: sin unidad, el
// tamaño del número dice cuál quiso decir.
test('un número suelto se interpreta por su tamaño', () => {
  assert.equal(minutosDe('2'), 120)
  assert.equal(minutosDe('45'), 45)
})

test('lo que no se entiende no rompe nada: devuelve null y ya', () => {
  assert.equal(minutosDe('un rato'), null)
  assert.equal(minutosDe(''), null)
  assert.equal(minutosDe('-3h'), null)
})

// ── enseñar y cancelar, por el mismo camino de siempre ─────────

/** Miércoles 11 de marzo de 2026, 9 de la mañana en Bogotá. */
const AHORA = '2026-03-11T09:00:00'

function armar(sombra = false) {
  const reloj = new RelojFalso(AHORA)
  const base = new CalendarioFalso()
  const calendario: SumideroCalendario = sombra ? new CalendarioSombra(base) : base
  const compromisos: Array<Record<string, unknown>> = []
  const acciones: Array<Record<string, unknown>> = []

  const servicio = crearServicioAMano({
    reloj,
    calendario,
    calendarId: 'primary',
    nuevoId: () => 'ev-nuevo',
    repoCompromisos: {
      crear: async (c: Record<string, unknown>) => { compromisos.push(c); return c },
      listarActivos: async () => [],
    } as never,
    repoAcciones: {
      registrar: async (a: Record<string, unknown>) => {
        acciones.push(a)
        return acciones.length
      },
    } as never,
  })

  const enElCalendario = () =>
    base.eventosEnRango('primary', '2026-03-01T00:00:00-05:00', '2026-04-01T00:00:00-05:00')

  return { servicio, base, enElCalendario, compromisos, acciones }
}

test('un compromiso escrito a mano queda en el calendario y en la auditoría', async () => {
  const { servicio, enElCalendario, compromisos, acciones } = armar()

  const r = await servicio.ensenarPacto({
    titulo: 'Laboratorio', dias: [2, 4], horaInicio: '10:00', horaFin: '12:00',
  })

  assert.equal(r.ok, true)
  assert.equal(compromisos.length, 1)
  assert.match(String(compromisos[0]!.rrule), /BYDAY=TU,TH/)

  // La misma auditoría que todo lo demás: si esto no quedara anotado, no
  // se podría deshacer y no saldría en la crónica.
  assert.equal(acciones.length, 1)
  assert.equal(acciones[0]!.tipo, 'crear_evento')
  assert.equal(acciones[0]!.estado, 'aplicada')
  assert.ok(acciones[0]!.payloadInverso, 'la inversa se guarda ANTES de aplicar')
  assert.equal(acciones[0]!.origen, 'texto')

  assert.equal((await enElCalendario()).length, 1)
})

test('la primera vez cae en el próximo día de la lista, no hoy porque sí', async () => {
  // Miércoles 11 a las 9. Un compromiso de martes y jueves empieza el
  // jueves 12: ni «hoy a las 10» ni el martes que ya pasó.
  const { servicio, enElCalendario } = armar()
  await servicio.ensenarPacto({
    titulo: 'Laboratorio', dias: [2, 4], horaInicio: '10:00', horaFin: '12:00',
  })
  const [evento] = await enElCalendario()
  assert.match(evento!.inicio, /^2026-03-12T10:00/)
})

test('sin días no se inventa ninguno', async () => {
  const { servicio } = armar()
  const r = await servicio.ensenarPacto({
    titulo: 'X', dias: [], horaInicio: '10:00', horaFin: '11:00',
  })
  assert.equal(r.ok, false)
})

test('una hora de fin antes que la de inicio se rechaza en vez de crear algo raro', async () => {
  const { servicio, enElCalendario } = armar()
  const r = await servicio.ensenarPacto({
    titulo: 'X', dias: [1], horaInicio: '12:00', horaFin: '10:00',
  })
  assert.equal(r.ok, false)
  assert.equal((await enElCalendario()).length, 0)
})

/**
 * En sombra no se crea el evento, y entonces el compromiso no puede
 * apuntar a ninguno: guardar un id inventado haría que el día de mañana
 * intentara cancelar algo que no existe.
 */
test('en sombra aprende el compromiso pero no toca el calendario', async () => {
  const { servicio, enElCalendario, compromisos, acciones } = armar(true)

  const r = await servicio.ensenarPacto({
    titulo: 'Laboratorio', dias: [2], horaInicio: '10:00', horaFin: '12:00',
  })

  assert.equal(r.ok, true)
  assert.equal((r as { ensayo: boolean }).ensayo, true)
  assert.equal((await enElCalendario()).length, 0)
  assert.equal(compromisos.length, 1, 'lo aprende igual: eso no toca nada de nadie')
  assert.equal(compromisos[0]!.googleEventId, null)
  assert.equal(acciones.length, 0)
})

test('cancelar algo que ya no está se dice, no se revienta', async () => {
  const { servicio } = armar()
  const r = await servicio.cancelarEvento('no-existe', '2026-03-11')
  assert.equal(r.ok, false)
  assert.match((r as { motivo: string }).motivo, /ya no está/)
})

test('cancelar a mano guarda la inversa antes de aplicar, como todo lo demás', async () => {
  const { servicio, enElCalendario, acciones } = armar()
  await servicio.ensenarPacto({
    titulo: 'Laboratorio', dias: [4], horaInicio: '10:00', horaFin: '12:00',
  })
  const [evento] = await enElCalendario()

  const r = await servicio.cancelarEvento(evento!.instanciaId, '2026-03-12')

  assert.equal(r.ok, true)
  assert.equal((await enElCalendario()).length, 0, 'ya no está en el calendario')

  const cancelacion = acciones.at(-1)!
  assert.equal(cancelacion.tipo, 'cancelar_instancia')
  assert.ok(cancelacion.payloadInverso, 'sin inversa no habría cómo deshacerlo')
})
