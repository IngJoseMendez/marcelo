import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Bot } from 'grammy'
import { NotificadorTelegram, aTeclado } from '../src/adaptadores/telegram.ts'

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
