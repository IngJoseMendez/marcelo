import { ErrorTranscripcion, type Audio, type Transcriptor } from '../puertos/transcriptor.ts'
import type { Mensaje } from '../puertos/notificador.ts'
import { botonDeshacer } from '../dominio/resumen.ts'
import type { ResultadoOrden, ServicioInstruccion } from './instruccion.ts'
import type { ResultadoDeshacer, ServicioDeshacer } from './deshacer.ts'
import type { ServicioResumen } from './resumen.ts'
import type { ServicioPropuestas } from './propuestas.ts'
import type { ServicioAgenda } from './agendar.ts'

export interface DepsConversacion {
  instruccion: ServicioInstruccion
  deshacer: ServicioDeshacer
  /** Sin él, una nota de voz se rechaza diciéndolo. Nunca en silencio. */
  transcriptor?: Transcriptor
  /** Para «/hoy» y para el botón «Deshacer algo». */
  resumen?: ServicioResumen
  /** Lo que ella metería en los huecos. Proponer no escribe nada. */
  propuestas?: ServicioPropuestas
  /** Aceptar una propuesta pasa por aquí, como cualquier otra escritura. */
  agenda?: ServicioAgenda
  /** Sólo decide por dónde vuelve la respuesta, nunca qué se hace. */
  canal?: 'telegram' | 'web'
}

export interface Respuesta {
  /** El globito corto de Telegram al tocar un botón. */
  aviso?: string
  mensajes: Mensaje[]
}

/** Más botones que esto no se leen en un teléfono. */
const MAXIMO_BOTONES = 8

const AYUDA = [
  'Háblame o escríbeme:',
  '',
  '· «cancélame el gimnasio del viernes»',
  '· «los martes tengo laboratorio de 10 a 12»',
  '· «anótame estudiar para el parcial, dos horas»',
  '· «¿qué me queda hoy?»',
  '· «de Bancolombia no me avises»',
  '',
  '/hoy — lo que he hecho hoy por mi cuenta',
  '/huecos — dónde te cabe lo que tienes pendiente',
  '/deshacer — devolver lo último como estaba',
].join('\n')

/**
 * El canal de instrucciones, sin saber por dónde entra.
 *
 * Aquí no hay ni una línea de Telegram: entra texto, audio o el toque de
 * un botón, y sale lo que hay que contestar. Todo lo que decide y actúa
 * queda del otro lado, en el mismo `ServicioInstruccion` que atiende a la
 * app — si esto escribiera por su cuenta habría dos caminos de escritura,
 * y agenda y auditoría acabarían contando historias distintas.
 *
 * Por eso también es probable sin red: el adaptador de grammy sólo baja
 * audios y dibuja teclados.
 */
export function crearServicioConversacion(d: DepsConversacion) {
  const canal = d.canal ?? 'telegram'

  function mensajeDe(r: ResultadoOrden): Mensaje {
    // La voz confirma antes de tocar nada. El botón lleva el id de la
    // acción que ya quedó guardada como 'pendiente', así que confirmarla
    // aplica exactamente lo que él acaba de leer y no vuelve al modelo.
    if (r.estado === 'confirma' && r.confirmaId !== undefined) {
      return {
        texto: r.respuesta,
        botones: [
          { texto: '✅  Confirmar', dato: `confirmar:${r.confirmaId}` },
          { texto: '✖️  No, esa no', dato: `descartar:${r.confirmaId}` },
        ],
      }
    }

    // En sombra no se aplicó nada: ofrecer deshacer sería ofrecer una
    // mentira con forma de botón.
    if (r.estado === 'hecho' && r.accionId !== undefined && !r.ensayo) {
      return { texto: r.respuesta, botones: [botonDeshacer(r.accionId)] }
    }

    return { texto: r.respuesta }
  }

  const respuestaDeshacer = (r: ResultadoDeshacer): Mensaje => ({
    texto: r.ok
      ? '↩️  Listo, lo devolví como estaba.'
      : `No pude deshacerlo: ${r.motivo ?? 'ya no se puede'}.`,
  })

  async function menuDeshacer(): Promise<Mensaje> {
    const opciones = (await d.resumen?.deshacibles()) ?? []
    if (opciones.length === 0) {
      return { texto: 'No hay nada reciente que pueda deshacer.' }
    }
    return {
      texto: '¿Cuál deshago?',
      botones: opciones.slice(0, MAXIMO_BOTONES).map((o) => ({
        texto: `↩️  ${o.titulo}${o.cuando ? ` · ${o.cuando}` : ''}`,
        dato: `deshacer:${o.id}`,
      })),
    }
  }

  /**
   * «Tienes dos horas libres el jueves, ¿meto ahí el estudio del parcial?»
   *
   * Proponer no escribe nada: el botón lleva la intención y la hora, y
   * aceptarlo pasa por el mismo actuador, la misma política y la misma
   * auditoría que todo lo demás.
   */
  async function menuHuecos(): Promise<Mensaje[]> {
    if (!d.propuestas) return [{ texto: 'Todavía no sé mirar tus huecos.' }]

    const hoy = await d.propuestas.delDia()
    if (hoy.propuestas.length === 0) {
      return [{ texto: 'No veo dónde meter nada hoy: o no hay huecos, o no hay nada pendiente que quepa.' }]
    }

    return hoy.propuestas.map((p) => ({
      texto: `Tienes libre a las ${p.inicio.slice(11, 16)}. ¿Meto ahí «${p.titulo}»?`
        + `\n${p.porque}, y son ${p.duracionMin} min.`,
      botones: [
        { texto: '📌  Sí, méteme eso', dato: `agendar:${p.intencionId}:${p.inicio}` },
      ],
    }))
  }

  async function comando(texto: string): Promise<Mensaje[]> {
    // Telegram manda «/deshacer@MiBot» cuando el bot vive en un grupo.
    const [crudo = '', ...resto] = texto.split(/\s+/)
    const nombre = crudo.replace(/@.*$/, '').toLowerCase()

    if (nombre === '/start' || nombre === '/ayuda') return [{ texto: AYUDA }]

    if (nombre === '/deshacer') {
      const id = Number(resto[0])
      return [respuestaDeshacer(
        Number.isInteger(id) && id > 0
          ? await d.deshacer.deshacer(id)
          : await d.deshacer.deshacerUltima())]
    }

    if (nombre === '/huecos') return menuHuecos()

    if (nombre === '/hoy') {
      return [d.resumen
        ? await d.resumen.delDia()
        : { texto: 'Todavía no llevo la crónica del día.' }]
    }

    // Mandar esto al intérprete sería gastar una llamada al modelo para
    // que conteste que no entendió una barra.
    return [{ texto: `No conozco «${nombre}».\n\n${AYUDA}` }]
  }

  return {
    async atenderTexto(texto: string): Promise<Mensaje[]> {
      const limpio = texto.trim()
      if (!limpio) return [{ texto: 'No me dijiste nada.' }]
      if (limpio.startsWith('/')) return comando(limpio)

      const r = await d.instruccion.atender({ texto: limpio, origen: 'texto', canal })
      return r.resultados.map(mensajeDe)
    },

    /**
     * Una nota de voz.
     *
     * El eco de lo transcrito va siempre, y va primero: es la única forma
     * que él tiene de cachar que ella oyó «semana» donde él dijo «mañana».
     * La nota entera pasa igual al intérprete aunque el transcriptor no
     * esté seguro — descartarla sería tirar también la orden que sí se
     * entendió, y lo que protege de actuar sobre una transcripción torcida
     * no es el descarte, es la confirmación que la política le exige a
     * todo lo que toca algo que ya existe.
     */
    async atenderVoz(audio: Audio): Promise<Mensaje[]> {
      if (!d.transcriptor) {
        return [{ texto: 'Todavía no sé oír: me falta configurar el transcriptor.' }]
      }

      let transcripcion
      try {
        transcripcion = await d.transcriptor.transcribir(audio)
      } catch (e) {
        const motivo = e instanceof ErrorTranscripcion ? e.message : 'se me trabó el oído'
        return [{ texto: `No pude entender ese audio: ${motivo.slice(0, 200)}` }]
      }

      const eco = transcripcion.confianza === 'baja'
        ? `🎧  No te oí del todo bien. Entendí: «${transcripcion.texto}»`
        : `🎧  Te oí: «${transcripcion.texto}»`

      const r = await d.instruccion.atender({
        texto: transcripcion.texto, origen: 'voz', canal,
      })

      const mensajes = r.resultados.map(mensajeDe)
      const primero = mensajes[0]
      if (!primero) return [{ texto: eco }]

      // Pegado al primer mensaje y no aparte: dos notificaciones seguidas
      // por una sola nota de voz cansan en un teléfono.
      return [{ ...primero, texto: `${eco}\n\n${primero.texto}` }, ...mensajes.slice(1)]
    },

    async atenderBoton(dato: string): Promise<Respuesta> {
      const [accion = '', argumento = ''] = dato.split(':')

      if (accion === 'confirmar' || accion === 'descartar') {
        const id = Number(argumento)
        if (!Number.isInteger(id) || id <= 0) {
          return { aviso: 'Ese botón ya no sirve', mensajes: [] }
        }
        const r = accion === 'confirmar'
          ? await d.instruccion.confirmar(id)
          : await d.instruccion.descartar(id)
        return {
          aviso: accion === 'confirmar' ? 'Hecho' : 'Descartado',
          mensajes: [mensajeDe(r)],
        }
      }

      if (accion === 'deshacer') {
        const id = Number(argumento)
        const r = Number.isInteger(id) && id > 0
          ? await d.deshacer.deshacer(id)
          : await d.deshacer.deshacerUltima()
        return { aviso: r.ok ? 'Deshecho' : 'No se pudo', mensajes: [respuestaDeshacer(r)] }
      }

      if (accion === 'agendar') {
        const [, id, ...resto] = dato.split(':')
        const inicio = resto.join(':')
        const intencionId = Number(id)
        if (!d.agenda || !Number.isInteger(intencionId) || !inicio) {
          return { aviso: 'Ese botón ya no sirve', mensajes: [] }
        }
        // Por el mismo camino de siempre: política, inversa antes de
        // aplicar, auditoría y deshacer. Sin atajos.
        const r = await d.agenda.agendar(intencionId, inicio, 'texto')
        return {
          aviso: r.ok ? 'Agendado' : 'No se pudo',
          mensajes: [r.ok
            ? {
                texto: `📌  Listo, te lo puse a las ${inicio.slice(11, 16)}.`,
                botones: r.accionId ? [botonDeshacer(r.accionId)] : undefined,
              }
            : { texto: `No pude agendarlo: ${r.motivo ?? 'ya no está disponible'}.` }],
        }
      }

      if (accion === 'deshacer-algo') return { mensajes: [await menuDeshacer()] }

      // Un botón de un mensaje viejo, de una versión anterior, o de nadie.
      return { aviso: 'Ese botón ya no sirve', mensajes: [] }
    },

    ayuda: AYUDA,
  }
}

export type ServicioConversacion = ReturnType<typeof crearServicioConversacion>
