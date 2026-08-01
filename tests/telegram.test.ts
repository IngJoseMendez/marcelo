import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Bot } from 'grammy'
import {
  BOTONES_DE_ABAJO, COMANDOS_DEL_MENU, NotificadorTelegram, aTeclado,
  preguntaPara, traducirToque,
} from '../src/adaptadores/telegram.ts'

/**
 * El adaptador de verdad, sin red.
 *
 * Lo que se prueba aquí no es Telegram —eso es de ellos— sino la única
 * parte del adaptador que puede equivocarse sola: cómo traduce un mensaje
 * del puerto a lo que la API espera.
 */

interface Envio {
  chat: string | number
  texto: string
  opciones?: { reply_markup?: unknown }
}

function botFalso(): { bot: Bot; enviados: Envio[] } {
  const enviados: Envio[] = []
  const bot = {
    api: {
      async sendMessage(chat: string | number, texto: string, opciones?: { reply_markup?: unknown }) {
        enviados.push({ chat, texto, opciones })
      },
    },
  } as unknown as Bot
  return { bot, enviados }
}

// ── el teclado ──────────────────────────────────────────────────

test('los botones de callback llevan su dato', () => {
  const teclado = aTeclado([
    { texto: 'Confirmar', dato: 'confirmar:7' },
    { texto: 'No, esa no', dato: 'descartar:7' },
  ])

  assert.deepEqual(teclado!.inline_keyboard, [[
    { text: 'Confirmar', callback_data: 'confirmar:7' },
    { text: 'No, esa no', callback_data: 'descartar:7' },
  ]])
})

test('un botón de URL sale como URL, no como dato', () => {
  const teclado = aTeclado([{ texto: 'Ver detalle', url: 'https://x.test/cronica' }])

  assert.deepEqual(teclado!.inline_keyboard,
    [[{ text: 'Ver detalle', url: 'https://x.test/cronica' }]])
})

test('a partir del tercero baja de fila', () => {
  const teclado = aTeclado(
    ['a', 'b', 'c'].map((t) => ({ texto: t, dato: `deshacer:${t}` })))

  assert.equal(teclado!.inline_keyboard.length, 2)
  assert.equal(teclado!.inline_keyboard[0]!.length, 2)
})

test('un botón sin dato ni URL no se dibuja', () => {
  // Tocarlo daría un error de Telegram; no dibujarlo no engaña a nadie.
  assert.equal(aTeclado([{ texto: 'vacío' }]), undefined)
  assert.equal(aTeclado([]), undefined)
  assert.equal(aTeclado(), undefined)
})

test('el dato se recorta a los 64 bytes que admite el protocolo', () => {
  const teclado = aTeclado([{ texto: 'x', dato: 'd'.repeat(200) }])
  const boton = teclado!.inline_keyboard[0]![0] as { callback_data: string }

  assert.equal(boton.callback_data.length, 64)
})

// ── el notificador ──────────────────────────────────────────────

test('el notificador manda al chat de Marcelo con su teclado', async () => {
  const { bot, enviados } = botFalso()

  await new NotificadorTelegram(bot, '12345').enviar({
    texto: '🌙  Hoy hice esto por ti:',
    botones: [{ texto: 'Deshacer algo', dato: 'deshacer-algo' }],
  })

  assert.equal(enviados.length, 1)
  assert.equal(enviados[0]!.chat, '12345')
  assert.match(enviados[0]!.texto, /Hoy hice esto/)
  assert.deepEqual(
    (enviados[0]!.opciones!.reply_markup as { inline_keyboard: unknown }).inline_keyboard,
    [[{ text: 'Deshacer algo', callback_data: 'deshacer-algo' }]])
})

test('sin chat configurado no manda nada, pero tampoco revienta', async () => {
  // Que no haya a quién avisarle no puede tumbar el pipeline que ya hizo
  // el trabajo: la acción quedó aplicada y auditada.
  const { bot, enviados } = botFalso()
  const avisos: string[] = []

  await new NotificadorTelegram(bot, '', {
    info: () => {}, error: () => {},
    warn: (_o, m) => avisos.push(m ?? ''),
  }).enviar({ texto: 'algo' })

  assert.deepEqual(enviados, [])
  assert.match(avisos[0]!, /TELEGRAM_CHAT_ID/)
})

// ── los botones de abajo ───────────────────────────────────────
//
// «Escribe /anotar» no es una interfaz: un comando que hay que recordar y
// teclear bien no existe para quien no lo sabe. Estos botones salen solos
// al abrir el chat, y por eso son el camino real para meter cosas a mano.
//
// Se prueban porque el fallo es silencioso: si el texto de un botón deja
// de coincidir con lo que se atiende, el botón simplemente no hace nada al
// tocarlo, y en ningún log aparece nada.

test('los botones que no piden datos disparan su comando', () => {
  assert.equal(traducirToque('🗓  Qué hay hoy'), '/hoy')
  assert.equal(traducirToque('↩️  Deshacer'), '/deshacer')
})

test('todo botón dibujado hace algo al tocarlo', () => {
  for (const boton of BOTONES_DE_ABAJO) {
    const hace = preguntaPara(boton) !== undefined || traducirToque(boton).startsWith('/')
    assert.ok(hace, `el botón «${boton}» no está atendido por nadie`)
  }
})

test('los que sí piden datos preguntan antes, en vez de fallar', () => {
  const p = preguntaPara('📝  Anotar algo')
  assert.ok(p)
  assert.equal(p.comando, '/anotar')
  // La pregunta empieza por la marca: es lo que la reconoce al contestarla.
  assert.ok(p.pregunta.startsWith(p.marca))
})

test('el comando pelado del menú «/» pregunta igual que el botón', () => {
  // Quien lo elige de una lista no vio la sintaxis: contestarle con la
  // ayuda sería mandarlo a escribirlo todo otra vez.
  assert.equal(preguntaPara('/anotar')?.comando, '/anotar')
  assert.equal(preguntaPara('/clase')?.comando, '/clase')
  assert.equal(preguntaPara('/anotar@MiBot')?.comando, '/anotar')
})

test('un comando con datos NO pregunta: ya los trae', () => {
  assert.equal(preguntaPara('/anotar comprar pan'), undefined)
})

/**
 * El contexto lo guarda Telegram, no nosotros: la respuesta llega citando
 * la pregunta, y la pregunta dice qué se había pedido. Sin estado propio no
 * hay nada que se pierda al reiniciar ni que se cruce entre dos cosas a
 * medias.
 */
test('contestar a la pregunta arma el comando entero', () => {
  assert.equal(
    traducirToque('estudiar cálculo · 2h', '¿Qué tienes que hacer?\n\nEscríbelo y ya…'),
    '/anotar estudiar cálculo · 2h')
  assert.equal(
    traducirToque('martes,jueves 10:00 12:00 Laboratorio', '¿Qué clase o compromiso?\n\n…'),
    '/clase martes,jueves 10:00 12:00 Laboratorio')
})

test('contestar a cualquier otro mensaje sigue siendo hablarle normal', () => {
  assert.equal(
    traducirToque('cancélame el gimnasio', 'Listo, cancelé «Gimnasio».'),
    'cancélame el gimnasio')
})

test('escribir normal no se toca', () => {
  assert.equal(traducirToque('  qué tengo mañana  '), 'qué tengo mañana')
})

test('el menú del «/» no ofrece comandos que no existen', () => {
  // Un menú que ofrece algo que contesta «no conozco eso» es peor que no
  // tener menú: lo eligió de una lista que le dimos nosotros.
  const conocidos = ['anotar', 'clase', 'hoy', 'huecos', 'deshacer', 'enlace',
    'diagnostico', 'ayuda', 'mano', 'start', 'revisar', 'manual', 'pacto']
  for (const c of COMANDOS_DEL_MENU) {
    assert.ok(conocidos.includes(c.command), `«/${c.command}» no lo atiende nadie`)
    assert.ok(c.description.length > 0 && c.description.length <= 60, c.command)
  }
})
