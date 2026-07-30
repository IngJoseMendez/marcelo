import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { migrar } from '../src/db/migrar.ts'
import { crearBaseDePrueba } from './ayuda/db.ts'
import { RelojFalso } from '../src/puertos/reloj.ts'
import { crearRepoCompromisos } from '../src/repos/compromisos.ts'
import { crearRepoCorreos, crearRepoCuentas } from '../src/repos/correos.ts'
import { crearRepoAcciones } from '../src/repos/acciones.ts'
import { crearClasificador } from '../src/pipeline/clasificador.ts'
import { crearExtractor } from '../src/pipeline/extractor.ts'
import { crearDesempate } from '../src/pipeline/desempate.ts'
import { crearProcesador } from '../src/pipeline/procesar-correo.ts'
import { CalendarioFalso } from './fakes/calendario-falso.ts'
import { CalendarioSombra } from '../src/adaptadores/calendario-sombra.ts'
import { LlmFalso } from './fakes/llm-falso.ts'
import type { BaseDatos } from '../src/db/base-datos.ts'
import type { CorreoCrudo } from '../src/dominio/tipos.ts'

let db: BaseDatos
let cuenta: number

// El correo llega el martes 4 de agosto a las 2:14 pm.
// La clase de Cálculo es el miércoles 6 de 4 a 5.
const reloj = new RelojFalso('2026-08-04T14:14:00')

// El 5 de agosto de 2026 es miércoles; el 12, el miércoles siguiente.
// La serie es BYDAY=WE, así que las instancias caen ahí y en ningún otro día.
const miercoles5 = {
  eventoId: 'evt_calc', instanciaId: 'inst_20260805',
  inicio: '2026-08-05T16:00:00-05:00', fin: '2026-08-05T17:00:00-05:00',
  titulo: 'Cálculo', estado: 'confirmado' as const,
}
const miercoles12 = {
  ...miercoles5, instanciaId: 'inst_20260812',
  inicio: '2026-08-12T16:00:00-05:00', fin: '2026-08-12T17:00:00-05:00',
}

const RANGO = ['2026-08-05T00:00:00-05:00', '2026-08-05T23:59:59-05:00'] as const
const RANGO_12 = ['2026-08-12T00:00:00-05:00', '2026-08-12T23:59:59-05:00'] as const

before(async () => { db = await crearBaseDePrueba(); await migrar(db) })
after(async () => { await db.cerrar() })

beforeEach(async () => {
  await db.ejecutar(
    `TRUNCATE acciones, cola, correos_procesados, compromisos, sync_cuenta,
              cuentas_correo RESTART IDENTITY CASCADE`)
  cuenta = (await crearRepoCuentas(db).registrar('gmail', 'marcelo@gmail.com')).id
})

const correo = (over: Partial<CorreoCrudo> = {}): CorreoCrudo => ({
  cuentaId: cuenta, messageId: 'm-profe-1', threadId: 't1',
  remitente: 'ramirez@uni.edu.co', asunto: 'Clase',
  cuerpo: 'No, no, la clase de mañana se cancela',
  recibidoEn: '2026-08-04T14:14:00-05:00', etiquetas: ['INBOX'],
  ...over,
})

const CANCELA_MANANA = [
  { clasificacion: 'agenda', confianza: 'alta' },
  { intencion: 'cancelar', referente: { tipo: 'manana' },
    nuevoInicio: null, nuevoFin: null, menciones: ['clase'], confianza: 'alta' },
]

async function armar(respuestas: unknown[], modoSombra: boolean) {
  const repoCompromisos = crearRepoCompromisos(db)
  await repoCompromisos.crear({
    titulo: 'Cálculo', alias: ['calculo', 'clase'],
    rrule: 'FREQ=WEEKLY;BYDAY=WE', horaInicio: '16:00', horaFin: '17:00',
    tz: 'America/Bogota', googleCalendarId: 'primary',
    googleEventId: 'evt_calc', remitentesVinculados: ['ramirez@uni.edu.co'],
  })
  const llm = new LlmFalso(respuestas)
  const real = new CalendarioFalso([{ ...miercoles5 }, { ...miercoles12 }])
  // El modo sombra se activa envolviendo el sumidero, no con una bandera
  // aparte: así el pipeline no puede quedar desincronizado del calendario.
  const calendario = modoSombra ? new CalendarioSombra(real) : real
  const procesador = crearProcesador({
    reloj, repoCompromisos,
    repoCorreos: crearRepoCorreos(db),
    repoAcciones: crearRepoAcciones(db),
    clasificador: crearClasificador(llm, 'm'),
    extractor: crearExtractor(llm, 'm'),
    desempate: crearDesempate(llm, 'm'),
    calendario,
    remitentesIgnorados: [], remitentesSilenciados: [],
  })
  return { procesador, calendario, real, llm }
}

test('el correo del profe cancela la instancia correcta', async () => {
  const { procesador, calendario } = await armar(CANCELA_MANANA, false)
  const r = await procesador.procesar(correo(), 'gmail')

  assert.equal(r.decision, 'actuar_callado')
  const [inst] = await calendario.instanciasEnRango('primary', 'evt_calc', ...RANGO)
  assert.equal(inst!.estado, 'cancelado')
})

test('la acción queda auditada con su inversa', async () => {
  const { procesador } = await armar(CANCELA_MANANA, false)
  const r = await procesador.procesar(correo(), 'gmail')
  assert.ok(r.accionId)

  const guardada = await crearRepoAcciones(db).porId(r.accionId!)
  assert.equal(guardada?.estado, 'aplicada')
  assert.equal(guardada?.payloadInverso.tipo, 'recrear_instancia')
  assert.equal(guardada?.confianza, 'alta')
})

test('en modo sombra no se toca el calendario pero sí se registra', async () => {
  const { procesador, real } = await armar(CANCELA_MANANA, true)
  const r = await procesador.procesar(correo(), 'gmail')

  const [inst] = await real.instanciasEnRango('primary', 'evt_calc', ...RANGO)
  assert.equal(inst!.estado, 'confirmado', 'el calendario real no se toca en sombra')

  const guardada = await crearRepoAcciones(db).porId(r.accionId!)
  assert.equal(guardada?.estado, 'sombra')
})

test('el mismo correo dos veces sólo produce una acción', async () => {
  const { procesador } = await armar(CANCELA_MANANA, false)
  await procesador.procesar(correo(), 'gmail')
  const segundo = await procesador.procesar(correo(), 'gmail')

  assert.equal(segundo.decision, 'descartado')
  const { rows } = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM acciones')
  assert.equal(rows[0]!.n, 1)
})

test('un correo de promociones nunca llega al modelo', async () => {
  // Sin respuestas guionadas: si consultara al LLM, la prueba reventaría.
  const { procesador, llm } = await armar([], false)
  const r = await procesador.procesar(
    correo({ messageId: 'm-promo', etiquetas: ['CATEGORY_PROMOTIONS'] }), 'gmail')
  assert.equal(r.decision, 'descartado')
  assert.equal(llm.peticiones.length, 0)
})

test('clasificado como ruido no produce acción', async () => {
  const { procesador } = await armar([{ clasificacion: 'ruido', confianza: 'alta' }], false)
  const r = await procesador.procesar(correo({ messageId: 'm-ruido' }), 'gmail')
  assert.equal(r.decision, 'descartado')
  assert.equal(r.accionId, null)
})

test('un referente ambiguo baja a confianza media y avisa', async () => {
  const { procesador } = await armar([
    { clasificacion: 'agenda', confianza: 'alta' },
    { intencion: 'cancelar',
      referente: { tipo: 'dia_semana', dia: 3, modificador: 'proximo' },
      nuevoInicio: null, nuevoFin: null, menciones: ['clase'], confianza: 'alta' },
  ], false)
  // "Próximo miércoles" dicho un martes: se elige la semana entrante
  // (el 12, no el 5 de mañana), pero no se hace en silencio.
  const r = await procesador.procesar(correo({ messageId: 'm-ambiguo' }), 'gmail')
  assert.equal(r.decision, 'actuar_y_avisar')

  const accion = await crearRepoAcciones(db).porId(r.accionId!)
  assert.equal(accion?.confianza, 'media')
  if (accion?.payloadInverso.tipo !== 'recrear_instancia') return
  assert.equal(accion.payloadInverso.instancia.instanciaId, 'inst_20260812',
    'debe tocar el miércoles de la semana entrante, no el de mañana')
})

test('sin instancia en la ventana no se actúa', async () => {
  const { procesador } = await armar([
    { clasificacion: 'agenda', confianza: 'alta' },
    // "Hoy" es martes 4; la clase es el miércoles 6.
    { intencion: 'cancelar', referente: { tipo: 'hoy' },
      nuevoInicio: null, nuevoFin: null, menciones: ['clase'], confianza: 'alta' },
  ], false)
  const r = await procesador.procesar(correo({ messageId: 'm-sin-inst' }), 'gmail')
  assert.equal(r.accionId, null)
  assert.match(r.motivo, /instancia/i)
})

test('mover el evento guarda el horario anterior como inversa', async () => {
  const { procesador, calendario } = await armar([
    { clasificacion: 'agenda', confianza: 'alta' },
    { intencion: 'mover', referente: { tipo: 'manana' },
      nuevoInicio: '18:00', nuevoFin: '19:00',
      menciones: ['clase'], confianza: 'alta' },
  ], false)
  const r = await procesador.procesar(correo({ messageId: 'm-mover' }), 'gmail')

  const [inst] = await calendario.instanciasEnRango('primary', 'evt_calc', ...RANGO)
  assert.match(inst!.inicio, /T18:00/)

  const guardada = await crearRepoAcciones(db).porId(r.accionId!)
  assert.equal(guardada?.payloadInverso.tipo, 'restaurar_horario')
  if (guardada?.payloadInverso.tipo !== 'restaurar_horario') return
  assert.equal(guardada.payloadInverso.inicio, '2026-08-05T16:00:00-05:00')
})

test('un remitente ignorado ni se procesa', async () => {
  const repoCompromisos = crearRepoCompromisos(db)
  const llm = new LlmFalso([])
  const procesador = crearProcesador({
    reloj, repoCompromisos,
    repoCorreos: crearRepoCorreos(db), repoAcciones: crearRepoAcciones(db),
    clasificador: crearClasificador(llm, 'm'),
    extractor: crearExtractor(llm, 'm'),
    desempate: crearDesempate(llm, 'm'),
    calendario: new CalendarioFalso(),
    remitentesIgnorados: ['ramirez@uni.edu.co'], remitentesSilenciados: [],
  })
  const r = await procesador.procesar(correo({ messageId: 'm-ign' }), 'gmail')
  assert.equal(r.decision, 'descartado')
  assert.equal(llm.peticiones.length, 0)
})

test('el empate sin resolver pregunta en vez de adivinar', async () => {
  const repoCompromisos = crearRepoCompromisos(db)
  for (const t of ['Cálculo', 'Taller de Cálculo']) {
    await repoCompromisos.crear({
      titulo: t, alias: [], rrule: null, horaInicio: '16:00', horaFin: '17:00',
      tz: 'America/Bogota', googleCalendarId: 'primary',
      googleEventId: 'evt_calc', remitentesVinculados: ['ramirez@uni.edu.co'],
    })
  }
  const llm = new LlmFalso([
    { clasificacion: 'agenda', confianza: 'alta' },
    { intencion: 'cancelar', referente: { tipo: 'manana' },
      nuevoInicio: null, nuevoFin: null, menciones: [], confianza: 'alta' },
    // El modelo inventa un id que no estaba en la lista.
    { compromisoId: 777, justificacion: 'alucinado' },
  ])
  const procesador = crearProcesador({
    reloj, repoCompromisos,
    repoCorreos: crearRepoCorreos(db), repoAcciones: crearRepoAcciones(db),
    clasificador: crearClasificador(llm, 'm'),
    extractor: crearExtractor(llm, 'm'),
    desempate: crearDesempate(llm, 'm'),
    calendario: new CalendarioFalso([{ ...miercoles5 }]),
    remitentesIgnorados: [], remitentesSilenciados: [],
  })

  const r = await procesador.procesar(
    correo({ messageId: 'm-empate', cuerpo: 'Se cancela lo de mañana' }), 'gmail')

  assert.equal(r.decision, 'preguntar')
  assert.equal(r.accionId, null, 'una alucinación no puede borrar nada')
})

test('el mismo message_id desde Outlook no se descarta por duplicado', async () => {
  // Gmail y Outlook numeran sus mensajes por separado. Si la llave de
  // idempotencia no incluyera la cuenta, este correo de Outlook se
  // perderia en silencio por parecer repetido.
  const outlook = await crearRepoCuentas(db).registrar('outlook', 'marcelo@outlook.com')
  const { procesador } = await armar([...CANCELA_MANANA, ...CANCELA_MANANA], false)

  const a = await procesador.procesar(correo(), 'gmail')
  const b = await procesador.procesar(correo({ cuentaId: outlook.id }), 'outlook')

  assert.ok(a.accionId, 'el de Gmail cancela la clase')
  assert.doesNotMatch(b.motivo, /ya estaba procesado/i,
    'el de Outlook debe llegar al pipeline, no morir en la deduplicación')

  const { rows } = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM correos_procesados WHERE message_id = 'm-profe-1'`)
  assert.equal(rows[0]!.n, 2, 'los dos correos quedan registrados')
})
