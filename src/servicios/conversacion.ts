import { ErrorTranscripcion, type Audio, type Transcriptor } from '../puertos/transcriptor.ts'
import type { Mensaje } from '../puertos/notificador.ts'
import { botonDeshacer } from '../dominio/resumen.ts'
import type { ResultadoOrden, ServicioInstruccion } from './instruccion.ts'
import type { ResultadoDeshacer, ServicioDeshacer } from './deshacer.ts'
import type { ServicioResumen } from './resumen.ts'
import type { ServicioPropuestas } from './propuestas.ts'
import type { ServicioAgenda } from './agendar.ts'
import type { ServicioAMano } from './a-mano.ts'

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
  /**
   * Hacer las cosas sin que nadie tenga que entenderlas.
   *
   * Con esto los comandos a mano existen; sin esto, se dice que no se
   * puede. Va por el mismo actuador y la misma inversa que todo lo demás.
   */
  aMano?: ServicioAMano
  /** Para «/anotar». Apuntar algo no necesita ningún modelo. */
  intenciones?: {
    crear(i: { titulo: string; duracionMin: number; origen: 'texto' | 'voz' }):
      Promise<{ id: number; titulo: string }>
  }
  /** Para «/enlace»: la dirección de AHORA, que es la que nadie sabe. */
  enlacePublico?: () => string
  /** Sólo decide por dónde vuelve la respuesta, nunca qué se hace. */
  canal?: 'telegram' | 'web'
}

/** «90» → «hora y media». Nadie apunta cosas en minutos sueltos. */
function enPalabras(min: number): string {
  if (min < 60) return `${min} min`
  if (min === 60) return '1 hora'
  if (min === 90) return 'hora y media'
  const h = Math.floor(min / 60)
  const resto = min % 60
  return resto ? `${h} h ${resto} min` : `${h} horas`
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
  '',
  'Y si la IA está caída o sin cuota, esto funciona igual:',
  '',
  '/anotar comprar café · 30m',
  '/clase martes,jueves 10:00 12:00 Laboratorio',
  '/enlace — la dirección para la app',
].join('\n')

/**
 * Lo mismo, sin depender de que ningún modelo entienda nada.
 *
 * No es una comodidad: es lo que hace que la asistente siga siendo una
 * agenda el día que se acabe la cuota, se caiga el proveedor o él prefiera
 * escribirlo exacto. El intérprete es un atajo para hablar bonito, no el
 * único camino hacia sus propios datos.
 */
const AYUDA_MANO = [
  'A mano, sin pasar por la IA:',
  '',
  '📝  /anotar <qué> · <cuánto>',
  '     /anotar estudiar cálculo · 2h',
  '     /anotar llamar al banco        (media hora por defecto)',
  '',
  '📅  /clase <días> <desde> <hasta> <nombre>',
  '     /clase martes,jueves 10:00 12:00 Laboratorio',
  '     /clase lun,mie,vie 07:00 08:00 Gimnasio',
  '',
  '🔗  /enlace — por dónde te alcanza la app',
].join('\n')

/** Lunes es 1, como en Luxon y como en la RRULE. */
const DIAS: Record<string, number> = {
  lunes: 1, lun: 1, l: 1,
  martes: 2, mar: 2, ma: 2,
  miercoles: 3, 'miércoles': 3, mie: 3, 'mié': 3, mi: 3, x: 3,
  jueves: 4, jue: 4, j: 4,
  viernes: 5, vie: 5, v: 5,
  sabado: 6, 'sábado': 6, sab: 6, 'sáb': 6, s: 6,
  domingo: 7, dom: 7, d: 7,
}

/**
 * «2h», «90m», «hora y media». Devuelve minutos, o null si no dice nada.
 *
 * Deliberadamente cortito: lo que no se entienda cae al valor por defecto
 * en vez de rechazar la nota entera. Perder la duración es un detalle;
 * perder lo que quería apuntar, no.
 */
export function minutosDe(texto: string): number | null {
  const t = texto.trim().toLowerCase()
  if (!t) return null
  if (/^(una )?hora y media$/.test(t)) return 90
  if (/^(media hora|30)$/.test(t)) return 30
  if (/^(una )?hora$/.test(t)) return 60

  const m = /^(\d+(?:[.,]\d+)?)\s*(h|hora|horas|m|min|minuto|minutos)?$/.exec(t)
  if (!m) return null
  const n = Number(m[1]!.replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0) return null
  // Sin unidad, un número pequeño son horas y uno grande minutos: nadie
  // apunta «3 minutos» y a nadie le caben «120 horas».
  const unidad = m[2] ?? (n <= 12 ? 'h' : 'm')
  return Math.round(unidad.startsWith('h') ? n * 60 : n)
}

/** «martes,jueves» o «lun mie vie». Lo que no sea un día, fuera. */
export function diasDe(texto: string): number[] {
  const partes = texto.toLowerCase().split(/[,\s/y]+/).filter(Boolean)
  const dias = partes.map((p) => DIAS[p.replace(/\.$/, '')]).filter((n): n is number => !!n)
  return [...new Set(dias)].sort((a, b) => a - b)
}

const HORA = /^([01]?\d|2[0-3]):([0-5]\d)$/
const aHora = (t: string): string | null => {
  const m = HORA.exec(t.trim())
  return m ? `${m[1]!.padStart(2, '0')}:${m[2]}` : null
}

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

    if (nombre === '/mano' || nombre === '/manual') return [{ texto: AYUDA_MANO }]

    // ── lo que funciona sin cerebro ────────────────────────────
    // Estos tres no tocan el intérprete ni el modelo: lo que él escribió ya
    // dice exactamente qué hacer, y no hay nada que entender.

    if (nombre === '/anotar') return anotar(resto.join(' '))
    if (nombre === '/clase' || nombre === '/pacto') return ensenar(resto)

    if (nombre === '/enlace') {
      // La pregunta que nadie puede contestar desde la app cuando la app no
      // funciona: cuál es la dirección de AHORA. El túnel gratuito la
      // estrena en cada arranque, y la de Vercel se queda con la de ayer.
      const url = d.enlacePublico?.()
      if (!url) {
        return [{ texto: 'Ahora mismo no tengo dirección pública. '
          + 'Abre el túnel en la pantalla de configuración de la laptop.' }]
      }
      return [{
        texto: `La app me alcanza en:\n\n${url}\n\nSi te dice «el asistente no `
          + 'contesta», es que Vercel se quedó con la dirección de antes: '
          + 'ponla ahí como API_BASE y redespliega.',
      }]
    }

    // Mandar esto al intérprete sería gastar una llamada al modelo para
    // que conteste que no entendió una barra.
    return [{ texto: `No conozco «${nombre}».\n\n${AYUDA}` }]
  }

  /** «/anotar estudiar cálculo · 2h» */
  async function anotar(argumento: string): Promise<Mensaje[]> {
    const crudo = argumento.trim()
    if (!crudo) {
      return [{ texto: 'Dime qué anoto.\n\n/anotar comprar café · 30m' }]
    }
    if (!d.intenciones) {
      return [{ texto: 'La bandeja no está conectada; no puedo anotar nada.' }]
    }

    // El separador es opcional a propósito: sin él, todo es el título y la
    // duración cae al valor de siempre. Rechazar una nota por no llevar un
    // punto medio sería absurdo.
    const [titulo = '', duracion = ''] = crudo.split(/\s*[·|]\s*/)
    const minutos = minutosDe(duracion) ?? 30
    if (!titulo.trim()) return [{ texto: 'Dime qué anoto.' }]

    const r = await d.intenciones.crear({
      titulo: titulo.trim().slice(0, 200),
      duracionMin: minutos,
      origen: 'texto',
    })
    return [{
      texto: `Anotado: «${r.titulo}» · ${enPalabras(minutos)}.`,
      botones: d.propuestas ? [{ texto: '🗓  ¿Dónde me cabe?', dato: 'huecos' }] : undefined,
    }]
  }

  /** «/clase martes,jueves 10:00 12:00 Laboratorio» */
  async function ensenar(partes: string[]): Promise<Mensaje[]> {
    if (!d.aMano) {
      return [{ texto: 'No puedo tocar el calendario ahora mismo.' }]
    }
    const [diasCrudos = '', desde = '', hasta = '', ...nombre] = partes
    const dias = diasDe(diasCrudos)
    const inicio = aHora(desde)
    const fin = aHora(hasta)
    const titulo = nombre.join(' ').trim()

    if (!dias.length || !inicio || !fin || !titulo) {
      return [{
        texto: 'Así no me sale. Va en este orden:\n\n'
          + '/clase martes,jueves 10:00 12:00 Laboratorio\n\n'
          + 'días · desde · hasta · cómo se llama',
      }]
    }

    const r = await d.aMano.ensenarPacto({ titulo, dias, horaInicio: inicio, horaFin: fin })
    return [{ texto: r.ok ? r.mensaje : `No pude: ${r.motivo}` }]
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

      // El botón que sale al anotar algo a mano: enseñarle dónde le cabe
      // sin obligarlo a escribir otro comando.
      if (accion === 'huecos') return { mensajes: await menuHuecos() }

      // Un botón de un mensaje viejo, de una versión anterior, o de nadie.
      return { aviso: 'Ese botón ya no sirve', mensajes: [] }
    },

    ayuda: AYUDA,
  }
}

export type ServicioConversacion = ReturnType<typeof crearServicioConversacion>
