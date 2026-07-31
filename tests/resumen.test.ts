import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { migrar } from '../src/db/migrar.ts'
import { crearBaseDePrueba } from './ayuda/db.ts'
import { crearRepoAcciones } from '../src/repos/acciones.ts'
import { crearRepoCorreos, crearRepoCuentas } from '../src/repos/correos.ts'
import { crearServicioCronica } from '../src/servicios/cronica.ts'
import { crearServicioResumen } from '../src/servicios/resumen.ts'
import { armarResumen, nombreDe, type AccionDelDia } from '../src/dominio/resumen.ts'
import { RelojFalso } from '../src/puertos/reloj.ts'
import { NotificadorFalso } from './fakes/notificador-falso.ts'
import type { BaseDatos } from '../src/db/base-datos.ts'
import type { EventoInstancia } from '../src/puertos/sumidero-calendario.ts'
import type { Origen } from '../src/dominio/tipos.ts'

let db: BaseDatos

// martes 4 de agosto de 2026, 9:00 pm en Bogotá: la hora del resumen.
const reloj = new RelojFalso('2026-08-04T21:00:00')

const calculo: EventoInstancia = {
  eventoId: 'serie-calc', instanciaId: 'calc-04',
  inicio: '2026-08-04T16:00:00-05:00', fin: '2026-08-04T17:00:00-05:00',
  titulo: 'Cálculo', estado: 'confirmado',
}

before(async () => { db = await crearBaseDePrueba(); await migrar(db) })
after(async () => { await db.cerrar() })
beforeEach(async () => {
  await db.ejecutar(
    'TRUNCATE acciones, correos_procesados, cuentas_correo, compromisos RESTART IDENTITY CASCADE')
})

/** Un correo de verdad en la base, para que la crónica tenga a quién citar. */
async function unCorreo(remitente: string, id = 'm1'): Promise<number> {
  const cuenta = await crearRepoCuentas(db).registrar('gmail', 'gmail')
  const r = await crearRepoCorreos(db).registrarSiEsNuevo({
    cuentaId: cuenta.id, messageId: id, threadId: null,
    remitente, asunto: 'La clase de hoy se cancela', cuerpo: '',
    recibidoEn: '2026-08-04T14:14:00-05:00', etiquetas: [],
  })
  return r.id
}

/**
 * Registra una acción y le pone la hora a mano.
 *
 * `creada_en` lo pone la base con su propio reloj, y el de las pruebas
 * está congelado en 2026: sin esto, nada caería nunca dentro de la ventana
 * del resumen.
 */
async function registrar(o: {
  cuando: string
  origen?: Origen
  estado?: 'aplicada' | 'sombra' | 'pendiente'
  tipo?: string
  instancia?: EventoInstancia
  correoId?: number | null
}): Promise<number> {
  const instancia = o.instancia ?? calculo
  const tipo = o.tipo ?? 'cancelar_instancia'

  const id = await crearRepoAcciones(db).registrar({
    tipo,
    origen: o.origen ?? 'correo',
    correoId: o.correoId ?? null,
    compromisoId: null,
    confianza: 'alta',
    payloadAplicado: {
      tipo, calendarId: 'primary', instanciaId: instancia.instanciaId,
      ...(tipo === 'mover_evento'
        ? { nuevoInicio: '2026-08-04T18:00:00-05:00', nuevoFin: '2026-08-04T19:00:00-05:00' }
        : {}),
    },
    payloadInverso: tipo === 'mover_evento'
      ? {
          tipo: 'restaurar_horario', calendarId: 'primary',
          instanciaId: instancia.instanciaId,
          inicio: instancia.inicio, fin: instancia.fin,
        }
      : { tipo: 'recrear_instancia', calendarId: 'primary', instancia },
    estado: o.estado ?? 'aplicada',
  })

  await db.query('UPDATE acciones SET creada_en = $2 WHERE id = $1', [id, o.cuando])
  return id
}

function armarServicio() {
  const notificador = new NotificadorFalso()
  return {
    notificador,
    resumen: crearServicioResumen({
      reloj,
      cronica: crearServicioCronica(db, 'America/Bogota'),
      notificador,
      urlApp: 'https://cerebro.example.com',
    }),
  }
}

// ── la regla que ordena todo lo demás ───────────────────────────

test('si no hizo nada, no manda nada', async () => {
  const { resumen, notificador } = armarServicio()

  const r = await resumen.enviar()

  assert.equal(r.enviado, false)
  assert.deepEqual(notificador.mensajes, [],
    'una asistente que escribe a diario «no pasó nada» se vuelve ruido en una semana')
})

test('lo que él le dictó no se lo repite de noche: él estaba ahí', async () => {
  const { resumen, notificador } = armarServicio()
  await registrar({ cuando: '2026-08-04T15:00:00-05:00', origen: 'voz' })
  await registrar({ cuando: '2026-08-04T15:30:00-05:00', origen: 'texto' })

  assert.equal((await resumen.enviar()).enviado, false)
  assert.equal(notificador.mensajes.length, 0)
})

test('lo que deshizo no se cobra como trabajo hecho', async () => {
  const { resumen } = armarServicio()
  const id = await registrar({ cuando: '2026-08-04T15:00:00-05:00' })
  await crearRepoAcciones(db).marcarDeshecha(id)

  assert.equal((await resumen.enviar()).enviado, false)
})

// ── lo que sí manda ─────────────────────────────────────────────

test('cuenta lo que hizo sola, con el correo que lo causó y a qué hora', async () => {
  const { resumen, notificador } = armarServicio()
  const correoId = await unCorreo('Prof. Ramírez <ramirez@uni.edu.co>')
  await registrar({ cuando: '2026-08-04T14:14:00-05:00', correoId })

  const r = await resumen.enviar()

  assert.equal(r.enviado, true)
  const texto = notificador.ultimo!.texto
  assert.match(texto, /Hoy hice esto por ti/)
  assert.match(texto, /Cancelé «Cálculo» de hoy, 4:00 pm/)
  assert.match(texto, /correo de Prof\. Ramírez · 2:14 pm/,
    'la hora sale en Bogotá: en UTC diría que la canceló cinco horas antes')
})

test('ofrece ver el detalle y deshacer algo', async () => {
  const { resumen, notificador } = armarServicio()
  await registrar({ cuando: '2026-08-04T14:14:00-05:00' })

  await resumen.enviar()

  assert.deepEqual(notificador.datos(),
    ['https://cerebro.example.com/cronica', 'deshacer-algo'])
})

test('el botón de deshacer sabe cuáles son y a qué hora las hizo', async () => {
  const { resumen } = armarServicio()
  await registrar({ cuando: '2026-08-04T14:14:00-05:00' })
  await registrar({ cuando: '2026-08-04T18:40:00-05:00' })

  const opciones = await resumen.deshacibles()

  assert.equal(opciones.length, 2)
  assert.deepEqual(opciones.map((o) => o.cuando), ['2:14 pm', '6:40 pm'],
    'dos cancelaciones del mismo compromiso darían dos botones idénticos sin la hora')
})

// ── la ventana: el caso de las once de la noche ─────────────────

test('lo que hizo anoche entra en el resumen de esta noche', async () => {
  // El caso obligatorio del spec: un correo que llega a las 11 pm
  // diciendo que la clase de mañana se cancela. Con ventanas que empiezan
  // en cada medianoche, esa cancelación no se contaría en ningún resumen.
  const { resumen, notificador } = armarServicio()
  await registrar({ cuando: '2026-08-03T23:10:00-05:00' })

  assert.equal((await resumen.enviar()).enviado, true)
  assert.match(notificador.ultimo!.texto, /Cancelé «Cálculo»/)
})

test('lo que ya se contó anoche no se vuelve a contar', async () => {
  const { resumen } = armarServicio()
  await registrar({ cuando: '2026-08-03T20:00:00-05:00' })

  assert.equal((await resumen.enviar()).enviado, false,
    'los tramos de 24 h se tocan sin solaparse')
})

// ── modo sombra ─────────────────────────────────────────────────

test('en sombra cambia el tono y no ofrece deshacer lo que no hizo', async () => {
  const { resumen, notificador } = armarServicio()
  await registrar({ cuando: '2026-08-04T14:14:00-05:00', estado: 'sombra' })

  await resumen.enviar()

  const mensaje = notificador.ultimo!
  assert.match(mensaje.texto, /Esto es lo que habría hecho hoy/)
  assert.match(mensaje.texto, /no toqué tu calendario/i)
  assert.ok(!notificador.datos().includes('deshacer-algo'),
    'en sombra no se aplicó nada: el botón sólo podría mentir')
})

// ── cuando él pregunta ──────────────────────────────────────────

test('a «/hoy» le contesta aunque no haya hecho nada', async () => {
  const { resumen } = armarServicio()

  const m = await resumen.delDia()

  assert.match(m.texto, /no he tocado nada/i,
    'no interrumpir es una cosa; no contestar a quien pregunta es otra')
})

// ── el aviso del momento ────────────────────────────────────────

test('avisar manda una sola acción con su botón de deshacer', async () => {
  const { resumen, notificador } = armarServicio()
  const correoId = await unCorreo('ramirez@uni.edu.co')
  const id = await registrar({ cuando: '2026-08-04T14:14:00-05:00', correoId })

  assert.equal(await resumen.avisar(id), true)

  const mensaje = notificador.ultimo!
  assert.match(mensaje.texto, /Cancelé «Cálculo»/)
  assert.deepEqual(mensaje.botones, [{ texto: '↩️  Deshacer', dato: `deshacer:${id}` }])
})

test('avisar de algo que no existe no revienta ni inventa', async () => {
  const { resumen, notificador } = armarServicio()

  assert.equal(await resumen.avisar(9999), false)
  assert.equal(notificador.mensajes.length, 0)
})

// ── el texto, sin base de datos ─────────────────────────────────

const ahora = reloj.ahora()

const accion = (p: Partial<AccionDelDia> = {}): AccionDelDia => ({
  id: 1, tipo: 'cancelar_instancia', estado: 'aplicada',
  porElla: true, ensayo: false, titulo: 'Cálculo',
  creadaEn: '2026-08-04T14:14:00-05:00',
  objetivo: { inicio: calculo.inicio, fin: calculo.fin, desdeInicio: null },
  correo: null,
  ...p,
})

test('nombra los días como los nombraría alguien', () => {
  const hoy = armarResumen([accion()], ahora)!
  assert.match(hoy.texto, /de hoy/)

  const otroDia = armarResumen([accion({
    objetivo: { inicio: '2026-08-12T16:00:00-05:00', fin: '', desdeInicio: null },
  })], ahora)!
  assert.match(otroDia.texto, /del miércoles 12/)

  const otroMes = armarResumen([accion({
    objetivo: { inicio: '2026-09-02T16:00:00-05:00', fin: '', desdeInicio: null },
  })], ahora)!
  assert.match(otroMes.texto, /del miércoles 2 de septiembre/)
})

test('al mover dice de qué hora a qué hora', () => {
  const r = armarResumen([accion({
    tipo: 'mover_evento', titulo: 'Cálculo',
    objetivo: {
      inicio: '2026-08-04T18:00:00-05:00', fin: '2026-08-04T19:00:00-05:00',
      desdeInicio: '2026-08-04T16:00:00-05:00',
    },
  })], ahora)!

  assert.match(r.texto, /Moví «Cálculo» de hoy: de 4:00 pm a 6:00 pm/)
})

test('mucho trabajo no se convierte en un muro de texto', () => {
  const muchas = Array.from({ length: 20 }, (_, i) => accion({ id: i + 1 }))

  const r = armarResumen(muchas, ahora)!

  assert.match(r.texto, /…y 8 más en la Crónica\./)
  assert.equal(r.deshacibles.length, 20, 'se acorta lo que se lee, no lo que se puede deshacer')
})

test('del remitente sale el nombre, no el sobre entero', () => {
  assert.equal(nombreDe('Prof. Ramírez <ramirez@uni.edu.co>'), 'Prof. Ramírez')
  assert.equal(nombreDe('"Banco X" <no-reply@banco.co>'), 'Banco X')
  assert.equal(nombreDe('ramirez@uni.edu.co'), 'ramirez@uni.edu.co')
})
