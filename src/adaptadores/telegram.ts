import { Bot, InlineKeyboard, InputFile, type Context } from 'grammy'
import type { Boton, Mensaje, Notificador } from '../puertos/notificador.ts'
import type { Audio } from '../puertos/transcriptor.ts'
import type { ServicioConversacion } from '../servicios/conversacion.ts'

/** Lo que este adaptador necesita de un registro. `pino` lo cumple. */
export interface Registro {
  info(objeto: object, mensaje?: string): void
  warn(objeto: object, mensaje?: string): void
  error(objeto: object, mensaje?: string): void
}

export interface DepsTelegram {
  token: string
  /** El único chat que puede darle órdenes. Vacío = todavía sin emparejar. */
  chatId: string
  registro?: Registro
}

/** Dos por fila: más estrecho que eso, Telegram parte los textos. */
const POR_FILA = 2

/** Lo que cabe en `callback_data`, por protocolo. */
const TOPE_DATO = 64

/**
 * De botones del puerto a teclado de Telegram.
 *
 * Un botón lleva URL o dato, nunca los dos: la API los rechaza juntos. El
 * que no traiga ninguno se cae, porque un botón que no hace nada al
 * tocarlo es peor que no dibujarlo.
 */
export function aTeclado(botones?: Boton[]): InlineKeyboard | undefined {
  if (!botones || botones.length === 0) return undefined

  const teclado = new InlineKeyboard()
  let puestos = 0
  for (const b of botones) {
    if (puestos > 0 && puestos % POR_FILA === 0) teclado.row()
    if (b.url) teclado.url(b.texto, b.url)
    else if (b.dato) teclado.text(b.texto, b.dato.slice(0, TOPE_DATO))
    else continue
    puestos++
  }
  return puestos > 0 ? teclado : undefined
}

export class NotificadorTelegram implements Notificador {
  constructor(
    private readonly bot: Bot,
    private readonly chatId: string,
    private readonly registro?: Registro
  ) {}

  async enviar(mensaje: Mensaje): Promise<void> {
    if (!this.chatId) {
      // Callar aquí y seguir es correcto: que no haya a quién avisarle no
      // puede tumbar el pipeline que ya hizo el trabajo.
      this.registro?.warn(
        { texto: mensaje.texto.slice(0, 120) },
        'sin TELEGRAM_CHAT_ID: no hay a quién avisarle')
      return
    }
    await this.bot.api.sendMessage(this.chatId, mensaje.texto, {
      reply_markup: aTeclado(mensaje.botones),
    })
  }
}

/**
 * El canal de Telegram, por long polling.
 *
 * Long polling y no webhook porque el sistema vive en la laptop de
 * Marcelo: no hay IP pública, ni puerto abierto, ni certificado que
 * renovar. El bot sale a preguntar en vez de esperar a que le toquen.
 *
 * Se construye en dos tiempos —`notificador` primero, `conectar` después—
 * porque el resumen necesita por dónde hablar y la conversación necesita
 * el resumen. Partirlo aquí evita un ciclo en el arranque.
 */
export function crearCanalTelegram(d: DepsTelegram) {
  const bot = new Bot(d.token)
  const chatId = d.chatId.trim()

  async function descargarAudio(ctx: Context, tipo: string): Promise<Audio> {
    const archivo = await ctx.getFile()
    if (!archivo.file_path) throw new Error('Telegram no devolvió la ruta del audio')

    const respuesta = await fetch(
      `https://api.telegram.org/file/bot${d.token}/${archivo.file_path}`)
    if (!respuesta.ok) {
      throw new Error(`No se pudo bajar la nota de voz (${respuesta.status})`)
    }
    return { datos: new Uint8Array(await respuesta.arrayBuffer()), tipo }
  }

  const responder = (ctx: Context, m: Mensaje) =>
    ctx.reply(m.texto, { reply_markup: aTeclado(m.botones) })

  /** Un fallo atendiendo no puede dejarlo esperando una respuesta que no llega. */
  function seguro<C extends Context>(fn: (ctx: C) => Promise<void>) {
    return async (ctx: C): Promise<void> => {
      try {
        await fn(ctx)
      } catch (e) {
        d.registro?.error({ err: e }, 'fallo atendiendo un mensaje de Telegram')
        await ctx.reply('Se me atravesó algo y no pude con eso. Vuelve a decírmelo.')
          .catch(() => {})
      }
    }
  }

  function conectar(conversacion: ServicioConversacion): void {
    bot.use(async (ctx, next) => {
      const quien = ctx.chat?.id ?? ctx.from?.id
      if (quien === undefined) return

      // Todavía sin emparejar: la única manera de averiguar el número del
      // chat es que alguien escriba. Sólo se le devuelve su propio id, y
      // nada más ocurre hasta que ese número esté en la configuración.
      if (!chatId) {
        await ctx.reply(
          `Este chat es el ${quien}.\nPonlo en TELEGRAM_CHAT_ID y reiníciame.`)
        return
      }

      // Cualquier otro: silencio. Este bot mueve la agenda de una persona.
      if (String(quien) !== chatId) {
        d.registro?.warn({ chat: quien }, 'mensaje de un chat ajeno, ignorado')
        return
      }

      await next()
    })

    bot.on(['message:voice', 'message:audio'], seguro(async (ctx) => {
      const tipo = ctx.msg.voice?.mime_type ?? ctx.msg.audio?.mime_type ?? 'audio/ogg'
      // Transcribir tarda; sin esto parece que se quedó muda.
      await ctx.replyWithChatAction('typing').catch(() => {})

      const audio = await descargarAudio(ctx, tipo)
      for (const m of await conversacion.atenderVoz(audio)) await responder(ctx, m)
    }))

    bot.on('message:text', seguro(async (ctx) => {
      await ctx.replyWithChatAction('typing').catch(() => {})
      for (const m of await conversacion.atenderTexto(ctx.msg.text)) await responder(ctx, m)
    }))

    bot.on('callback_query:data', seguro(async (ctx) => {
      const r = await conversacion.atenderBoton(ctx.callbackQuery.data)

      // Telegram deja el botón girando hasta que se le contesta.
      await ctx.answerCallbackQuery(r.aviso ? { text: r.aviso } : undefined).catch(() => {})

      // Y se le quitan los botones al mensaje viejo: si se quedaran, un
      // segundo toque intentaría confirmar algo ya confirmado.
      await ctx.editMessageReplyMarkup().catch(() => {})

      for (const m of r.mensajes) await responder(ctx, m)
    }))

    bot.catch((e) => {
      d.registro?.error({ err: e.error }, 'error suelto en el canal de Telegram')
    })
  }

  return {
    notificador: new NotificadorTelegram(bot, chatId, d.registro),
    conectar,

    /**
     * Mandar un archivo al chat. Con esto el respaldo de cada noche sale
     * de la laptop sin necesidad de otra cuenta ni otra factura — y va
     * cifrado, porque un chat de bot no es un sitio privado.
     */
    async enviarArchivo(nombre: string, datos: Uint8Array, leyenda: string): Promise<void> {
      if (!chatId) throw new Error('sin TELEGRAM_CHAT_ID no hay a quién mandárselo')
      await bot.api.sendDocument(
        chatId,
        new InputFile(Buffer.from(datos), nombre),
        { caption: leyenda.slice(0, 1000) })
    },

    /**
     * Arranca el long polling. No se espera: no termina nunca.
     *
     * No se descartan los mensajes viejos a propósito. Si la laptop se
     * reinició, la orden que él dictó mientras tanto se atiende al
     * volver — y lo que fuera destructivo sigue pidiendo confirmación,
     * así que atenderla tarde no puede borrar nada a sus espaldas.
     */
    arrancar(): void {
      void bot.start({
        onStart: (yo) => d.registro?.info(
          { bot: yo.username, emparejado: Boolean(chatId) },
          'canal de Telegram escuchando'),
      }).catch((e) => d.registro?.error({ err: e }, 'el canal de Telegram se cayó'))
    },

    detener: () => bot.stop(),
  }
}

export type CanalTelegram = ReturnType<typeof crearCanalTelegram>
