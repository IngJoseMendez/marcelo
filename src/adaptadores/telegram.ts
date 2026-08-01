import { Bot, InlineKeyboard, InputFile, Keyboard, type Context } from 'grammy'
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

/**
 * El teclado de abajo: los botones que están SIEMPRE.
 *
 * Hacía falta porque «escribe /anotar» no es una interfaz. Un comando que
 * hay que recordar y teclear bien no existe para quien no lo sabe, y quien
 * abre este chat quiere apuntar algo, no aprenderse una sintaxis. Estos
 * cuatro salen solos al abrir la conversación y no se van nunca.
 *
 * Van como teclado de respuesta y no como botones bajo un mensaje a
 * propósito: los de abajo sobreviven a que la conversación siga, los otros
 * se pierden hacia arriba en cuanto llegan tres mensajes más.
 */
const BOTONES_FIJOS = [
  ['📝  Anotar algo', '📅  Enseñarle una clase'],
  ['🗓  Qué hay hoy', '↩️  Deshacer'],
]

const TECLADO_FIJO = (() => {
  const k = new Keyboard()
  for (const fila of BOTONES_FIJOS) {
    for (const b of fila) k.text(b)
    k.row()
  }
  return k.resized().persistent()
})()

/**
 * El menú nativo del «/» de Telegram.
 *
 * Es la otra mitad: la lista con descripción que sale al tocar el icono de
 * comandos. Sin esto, saber qué se le puede pedir exige haber leído la
 * ayuda alguna vez.
 */
const COMANDOS = [
  { command: 'anotar', description: 'Apuntar algo que tienes que hacer' },
  { command: 'clase', description: 'Enseñarle un compromiso fijo' },
  { command: 'hoy', description: 'Lo que ha hecho hoy por su cuenta' },
  { command: 'huecos', description: 'Dónde te cabe lo que tienes pendiente' },
  { command: 'deshacer', description: 'Devolver lo último como estaba' },
  { command: 'enlace', description: 'La dirección para conectar la app' },
  { command: 'diagnostico', description: 'Por qué la app sale vacía' },
  { command: 'ayuda', description: 'Todo lo que sé hacer' },
]

/**
 * Lo que se pregunta al tocar un botón que necesita datos.
 *
 * La respuesta llega como *reply* al mensaje de la pregunta, así que el
 * propio mensaje lleva el contexto: no hace falta guardar en qué punto va
 * la conversación, y por lo tanto no hay estado que se pierda al
 * reiniciar ni que se cruce entre dos cosas a medias. Telegram guarda el
 * hilo por nosotros.
 */
const PREGUNTAS: Array<{ boton: string; marca: string; pregunta: string; comando: string }> = [
  {
    boton: '📝  Anotar algo',
    marca: '¿Qué tienes que hacer?',
    pregunta: '¿Qué tienes que hacer?\n\nEscríbelo y ya. Si quieres decir cuánto '
      + 'te toma, ponlo detrás de un punto:\n\nestudiar cálculo · 2h',
    comando: '/anotar',
  },
  {
    boton: '📅  Enseñarle una clase',
    marca: '¿Qué clase o compromiso?',
    pregunta: '¿Qué clase o compromiso?\n\nEscríbelo en este orden — días, desde, '
      + 'hasta, nombre:\n\nmartes,jueves 10:00 12:00 Laboratorio',
    comando: '/clase',
  },
]

/** Los que no piden nada: el botón ya es la orden entera. */
const ATAJOS: Record<string, string> = {
  '🗓  Qué hay hoy': '/hoy',
  '↩️  Deshacer': '/deshacer',
}

/**
 * Convertir el toque de un botón en la orden que toca.
 *
 * Vive aquí y no en el servicio porque los botones de abajo son una cosa de
 * Telegram: por la app se ven formularios, y el servicio no tiene por qué
 * enterarse de ninguna de las dos. Es pura para poder probarla: si esto se
 * desalinea de los textos de los botones, el botón deja de hacer nada al
 * tocarlo y no hay error en ningún log.
 */
export function traducirToque(texto: string, respondeA?: string): string {
  const limpio = texto.trim()

  const atajo = ATAJOS[limpio]
  if (atajo) return atajo

  // Una respuesta a una de nuestras preguntas: el mensaje al que contesta
  // dice qué se le había pedido. Así el contexto lo guarda Telegram y no
  // hay estado que se pierda al reiniciar ni que se cruce entre dos cosas
  // a medias.
  if (respondeA) {
    const p = PREGUNTAS.find((q) => respondeA.startsWith(q.marca))
    if (p) return `${p.comando} ${limpio}`
  }

  return limpio
}

/** ¿Este texto es un botón (o un comando pelado) que necesita preguntar antes? */
export function preguntaPara(texto: string) {
  const limpio = texto.trim()
  return PREGUNTAS.find((q) =>
    q.boton === limpio || limpio.replace(/@.*$/, '').toLowerCase() === q.comando)
}

/** Para las pruebas: que los botones dibujados y los atendidos sean los mismos. */
export const BOTONES_DE_ABAJO = BOTONES_FIJOS.flat()
export const COMANDOS_DEL_MENU = COMANDOS

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
    ctx.reply(m.texto, { reply_markup: aTeclado(m.botones) ?? TECLADO_FIJO })


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
      const crudo = ctx.msg.text.trim()

      // Un botón que pide datos: se pregunta y se espera la respuesta. El
      // `force_reply` es lo que hace que el teléfono cite este mensaje al
      // contestar, y así lo que él escriba llega ya con su contexto.
      //
      // El comando pelado del menú «/» entra por aquí también: quien lo
      // elige de una lista no vio la sintaxis, y contestarle con la ayuda
      // sería mandarlo a escribirlo todo otra vez.
      const pide = preguntaPara(crudo)
      if (pide) {
        await ctx.reply(pide.pregunta, {
          reply_markup: { force_reply: true, input_field_placeholder: 'Escríbelo aquí' },
        })
        return
      }

      await ctx.replyWithChatAction('typing').catch(() => {})
      const orden = traducirToque(crudo, ctx.msg.reply_to_message?.text)
      for (const m of await conversacion.atenderTexto(orden)) await responder(ctx, m)
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
      // El menú del «/». Que falle no puede impedir que el bot arranque:
      // es comodidad, no funcionamiento.
      void bot.api.setMyCommands(COMANDOS)
        .catch((e) => d.registro?.warn({ err: e }, 'no se pudo poner el menú de comandos'))

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
