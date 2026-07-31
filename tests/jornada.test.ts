import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { migrar } from '../src/db/migrar.ts'
import { crearBaseDePrueba } from './ayuda/db.ts'
import { crearRepoAcciones } from '../src/repos/acciones.ts'
import { crearServicioJornada } from '../src/servicios/jornada.ts'
import { RelojFalso } from '../src/puertos/reloj.ts'
import { CalendarioFalso } from './fakes/calendario-falso.ts'
import { CalendarioSombra } from '../src/adaptadores/calendario-sombra.ts'
import type { BaseDatos } from '../src/db/base-datos.ts'
import type { EventoInstancia, SumideroCalendario } from '../src/puertos/sumidero-calendario.ts'

let db: BaseDatos

// martes 4 de agosto de 2026, 2:14 pm en Bogotá
const reloj = new RelojFalso('2026-08-04T14:14:00')

const gimnasio: EventoInstancia = {
  eventoId: 'serie-gym', instanciaId: 'gym-04',
  inicio: '2026-08-04T07:00:00-05:00', fin: '2026-08-04T08:15:00-05:00',
  titulo: 'Gimnasio', estado: 'confirmado',
}
const calculo: EventoInstancia = {
  eventoId: 'serie-calc', instanciaId: 'calc-04',
  inicio: '2026-08-04T16:00:00-05:00', fin: '2026-08-04T17:00:00-05:00',
  titulo: 'Cálculo', estado: 'confirmado',
}

before(async () => { db = await crearBaseDePrueba(); await migrar(db) })
after(async () => { await db.cerrar() })
beforeEach(async () => { await db.ejecutar('TRUNCATE acciones RESTART IDENTITY CASCADE') })

function servicio(calendario: SumideroCalendario) {
  return crearServicioJornada({
    reloj, calendario, repoAcciones: crearRepoAcciones(db),
    calendarId: 'primary', desde: '07:00', hasta: '22:00',
  })
}

/** Registra la cancelación tal como la deja el pipeline: inversa incluida. */
function registrarCancelacion(
  instancia: EventoInstancia,
  estado: 'aplicada' | 'sombra' | 'deshecha' = 'aplicada'
) {
  return crearRepoAcciones(db).registrar({
    tipo: 'cancelar_instancia', origen: 'correo', correoId: null,
    compromisoId: null, confianza: 'alta',
    payloadAplicado: {
      tipo: 'cancelar_instancia', calendarId: 'primary', instanciaId: instancia.instanciaId,
    },
    payloadInverso: { tipo: 'recrear_instancia', calendarId: 'primary', instancia },
    estado: estado === 'deshecha' ? 'aplicada' : estado,
  })
}

test('el día trae los eventos del calendario en orden', async () => {
  const j = await servicio(new CalendarioFalso([{ ...calculo }, { ...gimnasio }])).del()

  assert.equal(j.fecha, '2026-08-04')
  assert.equal(j.esHoy, true)
  assert.deepEqual(j.eventos.map((e) => e.titulo), ['Gimnasio', 'Cálculo'])
  assert.equal(j.eventos[0]!.momento, 'pasado', 'el gimnasio de la mañana ya pasó')
  assert.equal(j.eventos[1]!.momento, 'futuro', 'la clase de las 4 todavía no')
})

test('lo que ella canceló se vuelve a dibujar tachado, no desaparece', async () => {
  const cal = new CalendarioFalso([{ ...calculo }, { ...gimnasio }])
  await registrarCancelacion(calculo)
  // El pipeline sí escribió: Google ya no devuelve esa instancia.
  await cal.aplicar({
    tipo: 'cancelar_instancia', calendarId: 'primary', instanciaId: calculo.instanciaId })

  const j = await servicio(cal).del()
  const clase = j.eventos.find((e) => e.titulo === 'Cálculo')

  assert.ok(clase, 'la clase cancelada tiene que seguir viéndose')
  assert.equal(clase.estado, 'cancelado')
  assert.equal(clase.inicio, '2026-08-04T16:00:00-05:00')
  assert.equal(clase.marca?.porElla, true)
  assert.equal(clase.marca?.tipo, 'cancelar_instancia')
  assert.equal(j.cambiosDeElla, 1)
})

test('una acción deshecha no deja marca ni resucita el evento', async () => {
  const repo = crearRepoAcciones(db)
  const cal = new CalendarioFalso([{ ...gimnasio }])
  const id = await registrarCancelacion(calculo)
  await repo.marcarDeshecha(id)

  const j = await servicio(cal).del()
  assert.deepEqual(j.eventos.map((e) => e.titulo), ['Gimnasio'])
  assert.equal(j.cambiosDeElla, 0)
})

test('en modo sombra el evento sigue en pie y la marca dice que fue ensayo', async () => {
  const real = new CalendarioFalso([{ ...calculo }])
  const sombra = new CalendarioSombra(real)
  await registrarCancelacion(calculo, 'sombra')

  const j = await servicio(sombra).del()
  const clase = j.eventos[0]!

  assert.equal(clase.estado, 'confirmado', 'en sombra no se tocó el calendario')
  assert.equal(clase.marca?.ensayo, true)
  assert.equal(j.modoSombra, true)
})

test('al mover, la marca conserva la hora de la que venía', async () => {
  const movido: EventoInstancia = {
    ...calculo, instanciaId: 'grupo-04', eventoId: 'serie-grupo',
    titulo: 'Grupo de estudio',
    inicio: '2026-08-04T16:00:00-05:00', fin: '2026-08-04T18:00:00-05:00',
  }
  await crearRepoAcciones(db).registrar({
    tipo: 'mover_evento', origen: 'correo', correoId: null, compromisoId: null,
    confianza: 'media',
    payloadAplicado: {
      tipo: 'mover_evento', calendarId: 'primary', instanciaId: 'grupo-04',
      nuevoInicio: movido.inicio, nuevoFin: movido.fin,
    },
    payloadInverso: {
      tipo: 'restaurar_horario', calendarId: 'primary', instanciaId: 'grupo-04',
      inicio: '2026-08-04T15:00:00-05:00', fin: '2026-08-04T17:00:00-05:00',
    },
    estado: 'aplicada',
  })

  const j = await servicio(new CalendarioFalso([movido])).del()
  assert.equal(j.eventos[0]!.marca?.desdeInicio, '2026-08-04T15:00:00-05:00')
})

test('los huecos libres salen entre los eventos, dentro de la ventana', async () => {
  const j = await servicio(new CalendarioFalso([{ ...gimnasio }, { ...calculo }])).del()

  assert.deepEqual(
    j.huecos.map((h) => [h.inicio.slice(11, 16), h.fin.slice(11, 16)]),
    [['08:15', '16:00'], ['17:00', '22:00']])
  assert.equal(j.huecos[1]!.minutos, 300)
})

test('la ventana se estira para que ningún evento quede fuera de la rejilla', async () => {
  const madrugador: EventoInstancia = {
    ...gimnasio, instanciaId: 'vuelo', titulo: 'Vuelo',
    inicio: '2026-08-04T05:30:00-05:00', fin: '2026-08-04T06:40:00-05:00',
  }
  const j = await servicio(new CalendarioFalso([madrugador])).del()

  assert.equal(j.ventana.inicio.slice(11, 16), '05:00')
  assert.equal(j.ventana.fin.slice(11, 16), '22:00')
})

test('un evento de todo el día no consume horas de la rejilla', async () => {
  const feriado: EventoInstancia = {
    eventoId: 'feriado', instanciaId: 'feriado',
    inicio: '2026-08-04', fin: '2026-08-05',
    titulo: 'Festivo', estado: 'confirmado',
  }
  const j = await servicio(new CalendarioFalso([feriado, { ...gimnasio }])).del()

  assert.equal(j.eventos.find((e) => e.titulo === 'Festivo')?.todoElDia, true)
  assert.equal(j.huecos[0]!.inicio.slice(11, 16), '08:15',
    'el festivo no puede tapar el día entero')
})

test('se puede pedir otro día distinto de hoy', async () => {
  const manana: EventoInstancia = {
    ...calculo, instanciaId: 'calc-05',
    inicio: '2026-08-05T16:00:00-05:00', fin: '2026-08-05T17:00:00-05:00',
  }
  const j = await servicio(new CalendarioFalso([manana])).del('2026-08-05')

  assert.equal(j.fecha, '2026-08-05')
  assert.equal(j.esHoy, false)
  assert.equal(j.eventos.length, 1)
  assert.equal(j.eventos[0]!.momento, 'futuro')
})
