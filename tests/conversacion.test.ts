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
import { crearServicioCronica } from '../src/servicios/cronica.ts'
import { crearServicioResumen } from '../src/servicios/resumen.ts'
import { crearServicioConversacion } from '../src/servicios/conversacion.ts'
import { RelojFalso } from '../src/puertos/reloj.ts'
import { CalendarioFalso } from './fakes/calendario-falso.ts'
import { CalendarioSombra } from '../src/adaptadores/calendario-sombra.ts'
import { LlmFalso } from './fakes/llm-falso.ts'
import { NotificadorFalso } from './fakes/notificador-falso.ts'
import { TranscriptorFalso } from './fakes/transcriptor-falso.ts'
import type { BaseDatos } from '../src/db/base-datos.ts'
import type { EventoInstancia, SumideroCalendario } from '../src/puertos/sumidero-calendario.ts'
import type { Audio } from '../src/puertos/transcriptor.ts'
import type { Confianza } from '../src/dominio/tipos.ts'

let db: BaseDatos

// martes 4 de agosto de 2026, 2:14 pm en Bogotá
const reloj = new RelojFalso('2026-08-04T14:14:00')

const gimnasioViernes: EventoInstancia = {
  eventoId: 'serie-gym', instanciaId: 'gym-07',
  inicio: '2026-08-07T07:00:00-05:00', fin: '2026-08-07T08:15:00-05:00',
  titulo: 'Gimnasio', estado: 'confirmado',
}

const RANGO_VIERNES = ['2026-08-07T00:00:00-05:00', '2026-08-07T23:59:59-05:00'] as const

/** «cancélame el gimnasio del viernes», tal como lo devolvería el modelo. */
const CANCELAR_VIERNES = {
  ordenes: [{
    herramienta: 'cancelar', que: 'el gimnasio',
    referente: { tipo: 'dia_semana', dia: 5, modificador: 'este' },
    confianza: 'alta',
  }],
}

const ANOTAR = {
  ordenes: [{
    herramienta: 'anotar_pendiente', titulo: 'comprar café',
    duracionMin: 15, prioridad: 'normal', vence: null, confianza: 'alta',
  }],
}

/** Una nota de voz de Telegram: ogg/opus, como las manda la aplicación. */
const NOTA_DE_VOZ: Audio = { datos: new Uint8Array([1, 2, 3]), tipo: 'audio/ogg' }

before(async () => { db = await crearBaseDePrueba(); await migrar(db) })
after(async () => { await db.cerrar() })
beforeEach(async () => {
  await db.ejecutar(
    'TRUNCATE acciones, intenciones, reglas, compromisos RESTART IDENTITY CASCADE')
})

async function armar(respuestas: readonly unknown[], opciones: {
  calendario?: SumideroCalendario
  transcripcion?: { texto: string; confianza?: Confianza; revienta?: boolean }
  sinTranscriptor?: boolean
} = {}) {
  const cal = opciones.calendario ?? new CalendarioFalso([{ ...gimnasioViernes }])
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
  const deshacer = crearServicioDeshacer(repoAcciones, cal, repoIntenciones)
  const notificador = new NotificadorFalso()

  const transcriptor = opciones.sinTranscriptor
    ? undefined
    : new TranscriptorFalso(
        opciones.transcripcion?.texto ?? 'cancélame el gimnasio del viernes',
        opciones.transcripcion?.confianza ?? 'alta',
        opciones.transcripcion?.revienta ?? false)

  return {
    cal, llm, repoAcciones, notificador, transcriptor,
    conversacion: crearServicioConversacion({
      instruccion: crearServicioInstruccion({
        reloj,
        interprete: crearInterprete(llm, 'modelo-de-prueba'),
        desempate: crearDesempate(llm, 'modelo-de-prueba'),
        calendario: cal,
        repoCompromisos, repoAcciones, repoIntenciones, repoReglas,
        jornada, deshacer,
        calendarId: 'primary',
        nuevoId: () => 'evt00nuevo',
      }),
      deshacer,
      transcriptor,
      resumen: crearServicioResumen({
        reloj, cronica: crearServicioCronica(db, 'America/Bogota'), notificador,
      }),
      canal: 'telegram',
    }),
  }
}

const estadoGimnasio = async (cal: CalendarioFalso) =>
  (await cal.instanciasEnRango('primary', 'serie-gym', ...RANGO_VIERNES))[0]?.estado

const datos = (m: { botones?: Array<{ dato?: string }> }) =>
  (m.botones ?? []).map((b) => b.dato)

// ── escribirle por Telegram ─────────────────────────────────────

test('lo que escribe se hace, y queda el botón para devolverlo', async () => {
  const { conversacion, cal, repoAcciones } = await armar([CANCELAR_VIERNES])

  const [mensaje, ...resto] = await conversacion.atenderTexto(
    'cancélame el gimnasio del viernes')

  assert.equal(resto.length, 0)
  assert.match(mensaje!.texto, /Listo: cancelar «Gimnasio» el viernes 7 de agosto/)
  assert.equal(await estadoGimnasio(cal as CalendarioFalso), 'cancelado')

  const [dato] = datos(mensaje!)
  const accionId = Number(dato!.split(':')[1])
  const accion = await repoAcciones.porId(accionId)
  assert.equal(accion?.origen, 'texto')
  assert.equal(accion?.payloadInverso.tipo, 'recrear_instancia',
    'la inversa se guarda antes de aplicar, venga la orden por donde venga')
})

// ── mandarle una nota de voz ────────────────────────────────────

test('una nota de voz pasa por el transcriptor y por el mismo servicio de siempre', async () => {
  const { conversacion, cal, transcriptor, repoAcciones } = await armar([CANCELAR_VIERNES])

  const [mensaje] = await conversacion.atenderVoz(NOTA_DE_VOZ)

  assert.deepEqual(transcriptor!.recibidos, [NOTA_DE_VOZ],
    'el audio de Telegram entra por el mismo puerto que el del navegador')
  assert.match(mensaje!.texto, /Te oí: «cancélame el gimnasio del viernes»/)
  assert.match(mensaje!.texto, /Entendí: cancelar «Gimnasio» el viernes 7 de agosto/)
  assert.deepEqual(datos(mensaje!), ['confirmar:1', 'descartar:1'])

  assert.equal(await estadoGimnasio(cal as CalendarioFalso), 'confirmado',
    'una transcripción sin confirmar no puede borrar nada')

  const pendiente = await repoAcciones.porId(1)
  assert.equal(pendiente?.estado, 'pendiente')
  assert.equal(pendiente?.origen, 'voz',
    'el origen es lo que decide la desconfianza, y por Telegram no cambia')
})

test('el botón Confirmar aplica lo que él leyó, sin volver a preguntarle al modelo', async () => {
  // El LlmFalso revienta si se le consulta de más: si confirmar
  // reinterpretara la transcripción, esta prueba fallaría.
  const { conversacion, cal } = await armar([CANCELAR_VIERNES])
  await conversacion.atenderVoz(NOTA_DE_VOZ)

  const r = await conversacion.atenderBoton('confirmar:1')

  assert.equal(r.aviso, 'Hecho')
  assert.match(r.mensajes[0]!.texto, /Listo/)
  assert.equal(await estadoGimnasio(cal as CalendarioFalso), 'cancelado')
})

test('«No, esa no» deja el calendario intacto y guarda que entendió mal', async () => {
  const { conversacion, cal, repoAcciones } = await armar([CANCELAR_VIERNES])
  await conversacion.atenderVoz(NOTA_DE_VOZ)

  const r = await conversacion.atenderBoton('descartar:1')

  assert.equal(r.aviso, 'Descartado')
  assert.equal(await estadoGimnasio(cal as CalendarioFalso), 'confirmado')
  assert.equal((await repoAcciones.porId(1))?.estado, 'descartada')
})

test('cuando no la oyó bien lo dice, pero no tira la nota entera', async () => {
  const { conversacion } = await armar([CANCELAR_VIERNES], {
    transcripcion: { texto: 'cancélame el gimnasio del viernes', confianza: 'baja' },
  })

  const [mensaje] = await conversacion.atenderVoz(NOTA_DE_VOZ)

  assert.match(mensaje!.texto, /No te oí del todo bien/)
  assert.match(mensaje!.texto, /Entendí: cancelar «Gimnasio»/,
    'descartar el audio tiraría también la orden que sí se entendió')
  assert.deepEqual(datos(mensaje!), ['confirmar:1', 'descartar:1'],
    'y lo que protege de una transcripción torcida es la confirmación, no el descarte')
})

test('lo que sólo agrega se hace y se cuenta, sin pedir permiso', async () => {
  const { conversacion } = await armar([ANOTAR], {
    transcripcion: { texto: 'anótame comprar café' },
  })

  const [mensaje] = await conversacion.atenderVoz(NOTA_DE_VOZ)

  assert.match(mensaje!.texto, /Te oí: «anótame comprar café»/)
  assert.match(mensaje!.texto, /Anotado: «comprar café»/)
})

test('si no sabe oír lo dice, en vez de tragarse el audio en silencio', async () => {
  const { conversacion } = await armar([], { sinTranscriptor: true })

  const [mensaje] = await conversacion.atenderVoz(NOTA_DE_VOZ)

  assert.match(mensaje!.texto, /todavía no sé oír/i)
})

test('si el oído falla, contesta el porqué', async () => {
  const { conversacion } = await armar([], {
    transcripcion: { texto: '', revienta: true },
  })

  const [mensaje] = await conversacion.atenderVoz(NOTA_DE_VOZ)

  assert.match(mensaje!.texto, /No pude entender ese audio: No se entendió nada/)
})

// ── deshacer ────────────────────────────────────────────────────

test('el botón Deshacer devuelve esa acción a como estaba', async () => {
  const { conversacion, cal } = await armar([CANCELAR_VIERNES])
  const [hecho] = await conversacion.atenderTexto('cancélame el gimnasio del viernes')
  const [dato] = datos(hecho!)

  const r = await conversacion.atenderBoton(dato!)

  assert.equal(r.aviso, 'Deshecho')
  assert.equal(await estadoGimnasio(cal as CalendarioFalso), 'confirmado')
})

test('«/deshacer» sin más devuelve lo último', async () => {
  const { conversacion, cal } = await armar([CANCELAR_VIERNES])
  await conversacion.atenderTexto('cancélame el gimnasio del viernes')

  const [mensaje] = await conversacion.atenderTexto('/deshacer')

  assert.match(mensaje!.texto, /lo devolví como estaba/)
  assert.equal(await estadoGimnasio(cal as CalendarioFalso), 'confirmado')
})

test('«/deshacer» cuando no hay nada no inventa', async () => {
  const { conversacion } = await armar([])

  const [mensaje] = await conversacion.atenderTexto('/deshacer')

  assert.match(mensaje!.texto, /No pude deshacerlo/)
})

test('«Deshacer algo» sólo ofrece lo que ella hizo sola', async () => {
  const { conversacion } = await armar([CANCELAR_VIERNES])
  await conversacion.atenderTexto('cancélame el gimnasio del viernes')

  const r = await conversacion.atenderBoton('deshacer-algo')

  assert.match(r.mensajes[0]!.texto, /No hay nada reciente/,
    'lo que él mismo dictó no entra en la lista de ella')
})

// ── modo sombra ─────────────────────────────────────────────────

test('en sombra no ofrece deshacer lo que nunca aplicó', async () => {
  const real = new CalendarioFalso([{ ...gimnasioViernes }])
  const { conversacion } = await armar([CANCELAR_VIERNES], {
    calendario: new CalendarioSombra(real),
  })

  const [mensaje] = await conversacion.atenderTexto('cancélame el gimnasio del viernes')

  assert.match(mensaje!.texto, /En modo sombra/)
  assert.equal(mensaje!.botones, undefined)
  assert.equal(await estadoGimnasio(real), 'confirmado')
})

// ── comandos y botones que no son ───────────────────────────────

test('a «/ayuda» le enseña lo que sabe hacer', async () => {
  const { conversacion } = await armar([])

  const [mensaje] = await conversacion.atenderTexto('/start')

  assert.match(mensaje!.texto, /Háblame o escríbeme/)
  assert.match(mensaje!.texto, /\/deshacer/)
})

test('un comando que no existe no se le manda al modelo', async () => {
  // El LlmFalso revienta si se le consulta: preguntarle qué significa una
  // barra sería gastar un token para que conteste que no entendió.
  const { conversacion } = await armar([])

  const [mensaje] = await conversacion.atenderTexto('/vaina')

  assert.match(mensaje!.texto, /No conozco «\/vaina»/)
})

test('«/deshacer@ElBot» también vale: en un grupo llegan así', async () => {
  const { conversacion } = await armar([])

  const [mensaje] = await conversacion.atenderTexto('/deshacer@ElBot')

  assert.match(mensaje!.texto, /No pude deshacerlo/,
    'lo importante es que lo reconoció como comando y no como una orden')
})

test('un botón viejo o inventado no hace nada', async () => {
  const { conversacion, cal } = await armar([])

  for (const dato of ['vaina:9', 'confirmar:abc', 'confirmar:-1', '']) {
    const r = await conversacion.atenderBoton(dato)
    assert.equal(r.aviso, 'Ese botón ya no sirve', `con «${dato}»`)
    assert.deepEqual(r.mensajes, [])
  }
  assert.equal(await estadoGimnasio(cal as CalendarioFalso), 'confirmado')
})

test('confirmar dos veces el mismo botón no aplica dos veces', async () => {
  const { conversacion, cal } = await armar([CANCELAR_VIERNES])
  await conversacion.atenderVoz(NOTA_DE_VOZ)
  await conversacion.atenderBoton('confirmar:1')

  const r = await conversacion.atenderBoton('confirmar:1')

  assert.match(r.mensajes[0]!.texto, /ya no está esperando/)
  assert.equal(await estadoGimnasio(cal as CalendarioFalso), 'cancelado')
})

test('todo lo que va en un botón cabe en los 64 bytes de Telegram', async () => {
  const { conversacion } = await armar([CANCELAR_VIERNES])
  const mensajes = await conversacion.atenderVoz(NOTA_DE_VOZ)

  for (const dato of mensajes.flatMap(datos)) {
    assert.ok(Buffer.byteLength(dato ?? '') <= 64, `«${dato}» no cabe`)
  }
})
