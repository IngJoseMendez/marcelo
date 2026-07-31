import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { migrar } from '../src/db/migrar.ts'
import { crearBaseDePrueba } from './ayuda/db.ts'
import { crearRepoAcciones } from '../src/repos/acciones.ts'
import { crearRepoCompromisos } from '../src/repos/compromisos.ts'
import { crearRepoIntenciones } from '../src/repos/intenciones.ts'
import { crearRepoReglas } from '../src/repos/reglas.ts'
import { crearInterprete } from '../src/pipeline/interprete.ts'
import { crearDesempate } from '../src/pipeline/desempate.ts'
import { crearServicioJornada } from '../src/servicios/jornada.ts'
import { crearServicioDeshacer } from '../src/servicios/deshacer.ts'
import { crearServicioInstruccion } from '../src/servicios/instruccion.ts'
import { RelojFalso } from '../src/puertos/reloj.ts'
import { CalendarioFalso } from './fakes/calendario-falso.ts'
import { CalendarioSombra } from '../src/adaptadores/calendario-sombra.ts'
import { LlmFalso } from './fakes/llm-falso.ts'
import type { BaseDatos } from '../src/db/base-datos.ts'
import type { EventoInstancia, SumideroCalendario } from '../src/puertos/sumidero-calendario.ts'

let db: BaseDatos

// martes 4 de agosto de 2026, 2:14 pm en Bogotá
const reloj = new RelojFalso('2026-08-04T14:14:00')

const gimnasioViernes: EventoInstancia = {
  eventoId: 'serie-gym', instanciaId: 'gym-07',
  inicio: '2026-08-07T07:00:00-05:00', fin: '2026-08-07T08:15:00-05:00',
  titulo: 'Gimnasio', estado: 'confirmado',
}

const RANGO_VIERNES = ['2026-08-07T00:00:00-05:00', '2026-08-07T23:59:59-05:00'] as const

/** «cancélame el gimnasio del viernes» tal como lo devolvería el modelo. */
const CANCELAR_VIERNES = {
  ordenes: [{
    herramienta: 'cancelar', que: 'el gimnasio',
    referente: { tipo: 'dia_semana', dia: 5, modificador: 'este' },
    confianza: 'alta',
  }],
}

before(async () => { db = await crearBaseDePrueba(); await migrar(db) })
after(async () => { await db.cerrar() })
beforeEach(async () => {
  await db.ejecutar(
    'TRUNCATE acciones, intenciones, reglas, compromisos RESTART IDENTITY CASCADE')
})

async function armar(respuestas: readonly unknown[], calendario?: SumideroCalendario) {
  const cal = calendario ?? new CalendarioFalso([{ ...gimnasioViernes }])
  const llm = new LlmFalso(respuestas)
  const repoAcciones = crearRepoAcciones(db)
  const repoCompromisos = crearRepoCompromisos(db)
  const repoIntenciones = crearRepoIntenciones(db)
  const repoReglas = crearRepoReglas(db)

  await repoCompromisos.crear({
    titulo: 'Gimnasio', alias: ['gym'], rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR',
    horaInicio: '07:00', horaFin: '08:15', tz: 'America/Bogota',
    googleCalendarId: 'primary', googleEventId: 'serie-gym',
    remitentesVinculados: [],
  })

  const jornada = crearServicioJornada({
    reloj, calendario: cal, repoAcciones, calendarId: 'primary',
    desde: '07:00', hasta: '22:00',
  })

  return {
    cal, llm, repoAcciones, repoCompromisos, repoIntenciones, repoReglas,
    servicio: crearServicioInstruccion({
      reloj,
      interprete: crearInterprete(llm, 'modelo-de-prueba'),
      desempate: crearDesempate(llm, 'modelo-de-prueba'),
      calendario: cal,
      repoCompromisos, repoAcciones, repoIntenciones, repoReglas,
      jornada,
      deshacer: crearServicioDeshacer(repoAcciones, cal, repoIntenciones),
      calendarId: 'primary',
      nuevoId: () => 'evt00nuevo',
    }),
  }
}

const estadoGimnasio = async (cal: CalendarioFalso) =>
  (await cal.instanciasEnRango('primary', 'serie-gym', ...RANGO_VIERNES))[0]?.estado

// ── escrito por él: se hace ─────────────────────────────────────

test('una orden escrita se ejecuta sin fricción', async () => {
  const { servicio, cal, repoAcciones } = await armar([CANCELAR_VIERNES])

  const r = await servicio.atender({
    texto: 'cancélame el gimnasio del viernes', origen: 'texto', canal: 'web' })

  const orden = r.resultados[0]!
  assert.equal(orden.estado, 'hecho')
  assert.match(orden.entendido, /cancelar «Gimnasio» el viernes 7 de agosto/)
  assert.equal(await estadoGimnasio(cal as CalendarioFalso), 'cancelado')

  const accion = await repoAcciones.porId(orden.accionId!)
  assert.equal(accion?.estado, 'aplicada')
  assert.equal(accion?.origen, 'texto')
  assert.equal(accion?.payloadInverso.tipo, 'recrear_instancia',
    'la inversa se guarda para poder deshacerlo')
})

// ── hablado: confirma antes de tocar ────────────────────────────

test('la misma orden hablada NO toca nada hasta que él confirma', async () => {
  const { servicio, cal, repoAcciones } = await armar([CANCELAR_VIERNES])

  const r = await servicio.atender({
    texto: 'cancélame el gimnasio del viernes', origen: 'voz', canal: 'web' })
  const orden = r.resultados[0]!

  assert.equal(orden.estado, 'confirma')
  assert.ok(orden.confirmaId)
  assert.match(orden.respuesta, /Entendí: cancelar «Gimnasio»/)
  assert.equal(await estadoGimnasio(cal as CalendarioFalso), 'confirmado',
    'una transcripción no confirmada no puede borrar nada')
  assert.equal((await repoAcciones.porId(orden.confirmaId!))?.estado, 'pendiente')
})

test('confirmar aplica exactamente lo que él vio, sin volver al modelo', async () => {
  // El LlmFalso revienta si se le consulta de más: si confirmar
  // reinterpretara la frase, esta prueba fallaría.
  const { servicio, cal, repoAcciones } = await armar([CANCELAR_VIERNES])
  const { confirmaId } = (await servicio.atender({
    texto: 'cancélame el gimnasio del viernes', origen: 'voz', canal: 'web' })).resultados[0]!

  const r = await servicio.confirmar(confirmaId!)

  assert.equal(r.estado, 'hecho')
  assert.equal(await estadoGimnasio(cal as CalendarioFalso), 'cancelado')
  const accion = await repoAcciones.porId(confirmaId!)
  assert.equal(accion?.estado, 'aplicada')
  assert.equal(accion?.payloadInverso.tipo, 'recrear_instancia')
})

test('rechazar deja el calendario intacto y el rastro de que entendió mal', async () => {
  const { servicio, cal, repoAcciones } = await armar([CANCELAR_VIERNES])
  const { confirmaId } = (await servicio.atender({
    texto: 'cancélame el gimnasio del viernes', origen: 'voz', canal: 'web' })).resultados[0]!

  await servicio.descartar(confirmaId!)

  assert.equal(await estadoGimnasio(cal as CalendarioFalso), 'confirmado')
  assert.equal((await repoAcciones.porId(confirmaId!))?.estado, 'descartada')
})

test('confirmar algo que ya cambió no lo toca a ciegas', async () => {
  const { servicio, cal } = await armar([CANCELAR_VIERNES])
  const { confirmaId } = (await servicio.atender({
    texto: 'cancélame el gimnasio del viernes', origen: 'voz', canal: 'web' })).resultados[0]!

  // Entre que lo dijo y lo confirmó, el evento desapareció.
  await (cal as CalendarioFalso).aplicar({
    tipo: 'borrar_serie', calendarId: 'primary', eventoId: 'serie-gym' })

  const r = await servicio.confirmar(confirmaId!)
  assert.equal(r.estado, 'pregunta')
  assert.match(r.respuesta, /ya no está/i)
})

// ── el modelo se equivoca o duda ────────────────────────────────

test('con confianza baja pregunta en vez de adivinar', async () => {
  const { servicio, cal } = await armar([{
    ordenes: [{
      herramienta: 'cancelar', que: 'la clase',
      referente: { tipo: 'manana' }, confianza: 'baja',
    }],
  }])

  const r = await servicio.atender({
    texto: 'cancela la clase de… no sé', origen: 'voz', canal: 'web' })

  assert.equal(r.resultados[0]!.estado, 'pregunta')
  assert.equal(await estadoGimnasio(cal as CalendarioFalso), 'confirmado')
})

test('si no sabe a qué compromiso se refiere, lo dice y ofrece lo que conoce', async () => {
  const { servicio } = await armar([{
    ordenes: [{
      herramienta: 'cancelar', que: 'la cita con el dentista',
      referente: { tipo: 'manana' }, confianza: 'alta',
    }],
  }])

  const r = await servicio.atender({
    texto: 'cancela la cita con el dentista de mañana', origen: 'texto', canal: 'web' })

  assert.equal(r.resultados[0]!.estado, 'pregunta')
  assert.match(r.resultados[0]!.respuesta, /Gimnasio/)
})

test('sin día no cancela nada: pregunta cuál', async () => {
  const { servicio, cal } = await armar([{
    ordenes: [{
      herramienta: 'cancelar', que: 'el gimnasio',
      referente: { tipo: 'desconocido' }, confianza: 'alta',
    }],
  }])

  const r = await servicio.atender({
    texto: 'cancela el gimnasio', origen: 'texto', canal: 'web' })

  assert.equal(r.resultados[0]!.estado, 'pregunta')
  assert.match(r.resultados[0]!.respuesta, /qué día/i)
  assert.equal(await estadoGimnasio(cal as CalendarioFalso), 'confirmado')
})

// ── varias órdenes en una sola frase ────────────────────────────

test('ejecuta la orden clara y repregunta sólo por la vaga', async () => {
  const { servicio, repoIntenciones } = await armar([{
    ordenes: [
      {
        herramienta: 'anotar_pendiente', titulo: 'estudiar para el parcial',
        duracionMin: 120, prioridad: 'alta', vence: null, confianza: 'alta',
      },
      {
        herramienta: 'cancelar', que: 'eso otro',
        referente: { tipo: 'manana' }, confianza: 'baja',
      },
    ],
  }])

  const r = await servicio.atender({
    texto: 'anótame estudiar para el parcial y cancela eso otro… mmm',
    origen: 'voz', canal: 'web' })

  assert.equal(r.resultados[0]!.estado, 'hecho')
  assert.equal(r.resultados[1]!.estado, 'pregunta')
  assert.equal((await repoIntenciones.bandeja()).length, 1,
    'lo claro se hace aunque lo demás quede en duda')
})

// ── el resto de las herramientas ────────────────────────────────

test('consultar la agenda responde sin tocar nada', async () => {
  const { servicio, repoAcciones } = await armar([{
    ordenes: [{ herramienta: 'consultar_agenda', referente: { tipo: 'hoy' }, confianza: 'alta' }],
  }])

  const r = await servicio.atender({
    texto: '¿qué me queda hoy?', origen: 'voz', canal: 'web' })

  assert.equal(r.resultados[0]!.estado, 'respuesta')
  assert.equal((await repoAcciones.enRango(
    '2026-01-01T00:00:00-05:00', '2027-01-01T00:00:00-05:00')).length, 0)
})

test('enseñarle un compromiso lo pone en el calendario y lo deja aprendido', async () => {
  const { servicio, cal, repoCompromisos } = await armar([{
    ordenes: [{
      herramienta: 'ensenar_compromiso', titulo: 'Laboratorio',
      dias: [2], horaInicio: '10:00', horaFin: '12:00',
      alias: ['lab'], remitentes: ['cardona@uni.edu.co'], confianza: 'alta',
    }],
  }])

  const r = await servicio.atender({
    texto: 'los martes tengo laboratorio de 10 a 12 con la profe Cardona',
    origen: 'texto', canal: 'web' })

  assert.equal(r.resultados[0]!.estado, 'hecho')

  const pacto = (await repoCompromisos.listarActivos())
    .find((c) => c.titulo === 'Laboratorio')
  assert.ok(pacto)
  assert.equal(pacto.rrule, 'FREQ=WEEKLY;BYDAY=TU')
  assert.equal(pacto.googleEventId, 'evt00nuevo')
  assert.deepEqual(pacto.remitentesVinculados, ['cardona@uni.edu.co'])

  const enCalendario = await (cal as CalendarioFalso).eventosEnRango(
    'primary', '2026-08-11T00:00:00-05:00', '2026-08-11T23:59:59-05:00')
  assert.equal(enCalendario[0]?.titulo, 'Laboratorio',
    'la primera vez que cae es el martes siguiente')
})

test('en sombra aprende el compromiso pero no lo mete al calendario', async () => {
  const real = new CalendarioFalso([{ ...gimnasioViernes }])
  const { servicio, repoCompromisos } = await armar([{
    ordenes: [{
      herramienta: 'ensenar_compromiso', titulo: 'Laboratorio',
      dias: [2], horaInicio: '10:00', horaFin: '12:00',
      alias: [], remitentes: [], confianza: 'alta',
    }],
  }], new CalendarioSombra(real))

  await servicio.atender({
    texto: 'los martes tengo laboratorio de 10 a 12', origen: 'texto', canal: 'web' })

  const pacto = (await repoCompromisos.listarActivos())
    .find((c) => c.titulo === 'Laboratorio')
  assert.equal(pacto?.googleEventId, null,
    'apuntar un id que no existe haría que después intentara cancelar la nada')
  assert.equal((await real.eventosEnRango(
    'primary', '2026-08-11T00:00:00-05:00', '2026-08-11T23:59:59-05:00')).length, 0)
})

test('una regla dictada queda guardada', async () => {
  const { servicio, repoReglas } = await armar([{
    ordenes: [{
      herramienta: 'crear_regla', tipo: 'silenciar',
      patron: 'Bancolombia', confianza: 'alta',
    }],
  }])

  const r = await servicio.atender({
    texto: 'de Bancolombia no me avises', origen: 'voz', canal: 'web' })

  assert.equal(r.resultados[0]!.estado, 'hecho')
  assert.deepEqual(await repoReglas.porTipo('silenciar_remitente'), ['bancolombia'])
})

test('deshacer por voz revierte lo último aplicado', async () => {
  const { servicio, cal } = await armar([
    CANCELAR_VIERNES,
    { ordenes: [{ herramienta: 'deshacer', confianza: 'alta' }] },
  ])

  await servicio.atender({
    texto: 'cancélame el gimnasio del viernes', origen: 'texto', canal: 'web' })
  assert.equal(await estadoGimnasio(cal as CalendarioFalso), 'cancelado')

  const r = await servicio.atender({ texto: 'deshaz eso', origen: 'voz', canal: 'web' })

  assert.equal(r.resultados[0]!.estado, 'hecho')
  assert.equal(await estadoGimnasio(cal as CalendarioFalso), 'confirmado')
})

test('preguntar por la plata no inventa cifras', async () => {
  const { servicio } = await armar([{
    ordenes: [{ herramienta: 'consultar_finanzas', confianza: 'alta' }],
  }])

  const r = await servicio.atender({
    texto: '¿cuánto me entró este mes?', origen: 'voz', canal: 'web' })

  assert.equal(r.resultados[0]!.estado, 'respuesta')
  assert.match(r.resultados[0]!.respuesta, /todavía no llevo tus cuentas/i)
})

// ── la garantía estructural ─────────────────────────────────────

test('una herramienta inventada por el modelo no llega a ejecutarse', async () => {
  const { servicio } = await armar([{
    ordenes: [{ herramienta: 'borrar_todo', confianza: 'alta' }],
  }])

  // El esquema la rechaza antes de que nadie decida nada: lo que no está
  // en la lista de herramientas no existe.
  await assert.rejects(() => servicio.atender({
    texto: 'bórralo todo', origen: 'voz', canal: 'web' }))
})

test('el modelo nunca recibe la opción de mandar un identificador', async () => {
  const { servicio, llm } = await armar([CANCELAR_VIERNES])
  await servicio.atender({
    texto: 'cancélame el gimnasio del viernes', origen: 'texto', canal: 'web' })

  const sistema = llm.peticiones[0]!.sistema
  assert.match(sistema, /NO INVENTES IDENTIFICADORES/)
  assert.match(sistema, /NO CALCULES FECHAS/)
})
