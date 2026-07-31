import { DateTime } from 'luxon'
import type { Reloj } from '../puertos/reloj.ts'
import type {
  AccionCrearEvento, AccionDestructiva, SumideroCalendario,
} from '../puertos/sumidero-calendario.ts'
import type { Interprete } from '../pipeline/interprete.ts'
import type { Desempate } from '../pipeline/desempate.ts'
import type { RepoAcciones } from '../repos/acciones.ts'
import type { RepoCompromisos } from '../repos/compromisos.ts'
import type { RepoIntenciones } from '../repos/intenciones.ts'
import type { RepoReglas } from '../repos/reglas.ts'
import type { ServicioJornada } from './jornada.ts'
import type { ServicioDeshacer } from './deshacer.ts'
import type { Compromiso, Confianza, Origen } from '../dominio/tipos.ts'
import type { NombreHerramienta, Orden } from '../dominio/herramientas.ts'
import { resolverReferente } from '../dominio/fechas.ts'
import { resolver } from '../dominio/resolutor.ts'
import { decidir } from '../dominio/politica.ts'
import { calcularInversa } from '../dominio/inversas.ts'
import { aplicarConInversa, crearConInversa } from '../pipeline/actuador.ts'
import { nuevoIdEvento } from '../dominio/identificadores.ts'
import { calcularPrioridad, redondearDuracion } from '../dominio/intenciones.ts'

export interface Instruccion {
  texto: string
  /** Lo que decide la desconfianza: una voz transcrita no es texto confiable. */
  origen: Exclude<Origen, 'correo'>
  /** Sólo decide por dónde vuelve la respuesta. */
  canal: 'web' | 'telegram'
}

export type EstadoOrden = 'hecho' | 'confirma' | 'pregunta' | 'respuesta' | 'nada'

export interface ResultadoOrden {
  herramienta: NombreHerramienta
  estado: EstadoOrden
  /** Lo que entendió, en palabras. Se devuelve siempre, incluso al fallar. */
  entendido: string
  /** Lo que hay que contestarle. */
  respuesta: string
  /** Cuando hay que confirmar: la acción que espera guardada. */
  confirmaId?: number
  accionId?: number
  /** Se registró pero no se tocó el calendario. */
  ensayo?: boolean
}

export interface RespuestaInstruccion {
  texto: string
  resultados: ResultadoOrden[]
}

export interface DepsInstruccion {
  reloj: Reloj
  interprete: Interprete
  desempate: Desempate
  calendario: SumideroCalendario
  repoCompromisos: RepoCompromisos
  repoAcciones: RepoAcciones
  repoIntenciones: RepoIntenciones
  repoReglas: RepoReglas
  jornada: ServicioJornada
  deshacer: ServicioDeshacer
  calendarId: string
  nuevoId?: () => string
}

const DIAS_RRULE = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const
const iso = (d: DateTime) => d.toISO({ suppressMilliseconds: true })!
const enPalabras = (d: DateTime) => d.setLocale('es').toFormat("cccc d 'de' LLLL")

/**
 * El canal de instrucciones.
 *
 * El LLM entiende; de ahí en adelante decide y actúa el mismo código que
 * atiende los correos: el mismo resolutor, la misma política, el mismo
 * actuador, la misma auditoría y el mismo deshacer. Sólo cambia la parte de
 * *entender* — si hubiera una segunda vía de escritura, agenda y auditoría
 * acabarían contando historias distintas.
 */
export function crearServicioInstruccion(d: DepsInstruccion) {
  const nuevoId = d.nuevoId ?? (() => nuevoIdEvento())

  const zona = () => d.reloj.ahora().zoneName ?? 'America/Bogota'

  function fallo(
    herramienta: NombreHerramienta, entendido: string, respuesta: string
  ): ResultadoOrden {
    return { herramienta, estado: 'pregunta', entendido, respuesta }
  }

  // ── consultar ────────────────────────────────────────────────
  async function consultarAgenda(orden: Orden & { herramienta: 'consultar_agenda' }) {
    const ahora = d.reloj.ahora()
    const resuelto = resolverReferente(orden.referente, ahora)
    const dia = resuelto?.intervalo.inicio ?? ahora
    const jornada = await d.jornada.del(dia.toISODate()!)

    const cuando = dia.hasSame(ahora, 'day') ? 'hoy' : enPalabras(dia)
    const entendido = `qué tienes ${cuando}`

    const porVenir = jornada.eventos.filter(
      (e) => e.estado === 'confirmado' && e.momento !== 'pasado')
    const libre = [...jornada.huecos].sort((a, b) => b.minutos - a.minutos)[0]

    if (jornada.eventos.length === 0) {
      return {
        herramienta: 'consultar_agenda' as const, estado: 'respuesta' as const, entendido,
        respuesta: `No tienes nada en el calendario ${cuando}.`,
      }
    }

    const lista = (porVenir.length > 0 ? porVenir : jornada.eventos)
      .slice(0, 6)
      .map((e) => `${e.inicio.slice(11, 16)} ${e.titulo}${e.estado === 'cancelado' ? ' (cancelada)' : ''}`)
      .join(' · ')

    const hueco = libre
      ? ` Tienes ${Math.floor(libre.minutos / 60) > 0 ? `${Math.floor(libre.minutos / 60)} h` : `${libre.minutos} min`} libres entre las ${libre.inicio.slice(11, 16)} y las ${libre.fin.slice(11, 16)}.`
      : ''

    return {
      herramienta: 'consultar_agenda' as const, estado: 'respuesta' as const, entendido,
      respuesta: `${porVenir.length > 0 ? `Te queda ${cuando}` : `${cuando.charAt(0).toUpperCase()}${cuando.slice(1)}`}: ${lista}.${hueco}`,
    }
  }

  // ── cancelar y mover ─────────────────────────────────────────
  async function tocarCalendario(
    orden: Extract<Orden, { herramienta: 'cancelar' | 'mover' }>,
    inst: Instruccion
  ): Promise<ResultadoOrden> {
    const herramienta = orden.herramienta
    const ahora = d.reloj.ahora()
    const resuelto = resolverReferente(orden.referente, ahora)

    if (!resuelto) {
      return fallo(herramienta, `${herramienta} «${orden.que}»`,
        `¿Qué día quieres que ${herramienta === 'cancelar' ? 'cancele' : 'mueva'} «${orden.que}»?`)
    }

    const intervalo = resuelto.intervalo
    const cuando = enPalabras(intervalo.inicio)

    const compromisos = await d.repoCompromisos.listarActivos()
    const resolucion = resolver({
      compromisos,
      // Una orden suya no viene de ningún remitente: aquí sólo pesan las
      // palabras que usó y la ventana temporal.
      remitente: '',
      texto: orden.que,
      intervalo,
      ambiguo: resuelto.ambiguo,
      threadCompromisoId: null,
    })

    let compromiso: Compromiso | undefined
    let confianza: Confianza = orden.confianza

    if (resolucion.estado === 'sin_candidatos') {
      const nombres = compromisos.slice(0, 6).map((c) => c.titulo).join(', ')
      return fallo(herramienta, `${herramienta} «${orden.que}» el ${cuando}`,
        nombres
          ? `No sé cuál es «${orden.que}». Lo que conozco es: ${nombres}.`
          : `Todavía no me has enseñado ningún compromiso, así que no sé qué es «${orden.que}».`)
    }

    if (resolucion.estado === 'empate') {
      const elegido = await d.desempate.elegir(resolucion.candidatos, orden.que)
      if (!elegido) {
        const nombres = resolucion.candidatos.map((c) => c.compromiso.titulo).join(' o ')
        return fallo(herramienta, `${herramienta} «${orden.que}» el ${cuando}`,
          `¿Cuál de los dos: ${nombres}?`)
      }
      compromiso = elegido.compromiso
      // Hubo que desempatar: eso nunca es confianza alta.
      confianza = 'media'
    } else {
      compromiso = resolucion.candidato.compromiso
      if (resolucion.confianza === 'media' && confianza === 'alta') confianza = 'media'
    }

    if (resuelto.ambiguo) confianza = 'media'

    const entendido = herramienta === 'cancelar'
      ? `cancelar «${compromiso.titulo}» el ${cuando}`
      : `mover «${compromiso.titulo}» del ${cuando} a las ${orden.nuevoInicio}`

    if (confianza === 'baja') {
      return fallo(herramienta, entendido, `No estoy segura. ¿Quieres que ${entendido}?`)
    }

    if (!compromiso.googleEventId) {
      return fallo(herramienta, entendido,
        `«${compromiso.titulo}» no tiene evento en tu calendario, así que no puedo tocarlo.`)
    }

    const instancias = await d.calendario.instanciasEnRango(
      compromiso.googleCalendarId, compromiso.googleEventId,
      iso(intervalo.inicio), iso(intervalo.fin))
    const instancia = instancias.find((i) => i.estado === 'confirmado')

    if (!instancia) {
      return fallo(herramienta, entendido,
        `No encuentro «${compromiso.titulo}» el ${cuando}. ¿Es otro día?`)
    }

    const fecha = intervalo.inicio.toISODate()!
    const accion: AccionDestructiva = herramienta === 'cancelar'
      ? {
          tipo: 'cancelar_instancia',
          calendarId: compromiso.googleCalendarId,
          instanciaId: instancia.instanciaId,
        }
      : {
          tipo: 'mover_evento',
          calendarId: compromiso.googleCalendarId,
          instanciaId: instancia.instanciaId,
          nuevoInicio: `${fecha}T${orden.nuevoInicio}:00`,
          nuevoFin: `${fecha}T${orden.nuevoFin ?? compromiso.horaFin}:00`,
        }

    const decision = decidir({
      origen: inst.origen, tipo: accion.tipo, confianza, silenciadoPorRegla: false,
    })

    if (decision === 'preguntar' || decision === 'ignorar') {
      return fallo(herramienta, entendido, `¿Quieres que ${entendido}?`)
    }

    // La voz confirma antes de tocar: la acción concreta queda guardada
    // como 'pendiente' para que confirmarla no vuelva a pasar por el
    // modelo. Reinterpretar la misma transcripción podría entender otra
    // cosa, y él ya habría dicho que sí a la primera.
    if (decision === 'confirmar') {
      const confirmaId = await d.repoAcciones.registrar({
        tipo: accion.tipo, origen: inst.origen, correoId: null,
        compromisoId: compromiso.id, confianza,
        payloadAplicado: accion,
        payloadInverso: calcularInversa(accion, { instancia, rrule: compromiso.rrule }),
        estado: 'pendiente',
        resumen: entendido,
      })
      return {
        herramienta, estado: 'confirma', entendido, confirmaId,
        respuesta: `Entendí: ${entendido}. ¿Lo hago?`,
      }
    }

    const inversa = await aplicarConInversa(
      d.calendario, accion, instancia, compromiso.rrule)
    const ensayo = d.calendario.sombra
    const accionId = await d.repoAcciones.registrar({
      tipo: accion.tipo, origen: inst.origen, correoId: null,
      compromisoId: compromiso.id, confianza,
      payloadAplicado: accion, payloadInverso: inversa,
      estado: ensayo ? 'sombra' : 'aplicada',
      resumen: entendido,
    })

    return {
      herramienta, estado: 'hecho', entendido, accionId, ensayo,
      respuesta: ensayo
        ? `En modo sombra: habría hecho «${entendido}», pero no toqué el calendario.`
        : `Listo: ${entendido}.`,
    }
  }

  // ── anotar en la bandeja ─────────────────────────────────────
  async function anotar(
    orden: Extract<Orden, { herramienta: 'anotar_pendiente' }>,
    inst: Instruccion
  ): Promise<ResultadoOrden> {
    const ahora = d.reloj.ahora()
    const vence = orden.vence ? resolverReferente(orden.vence, ahora) : null
    const prioridad = calcularPrioridad(
      orden.prioridad, vence ? vence.intervalo.fin : null, ahora)

    const intencion = await d.repoIntenciones.crear({
      titulo: orden.titulo,
      detalle: null,
      prioridad,
      duracionMin: redondearDuracion(orden.duracionMin),
      venceEl: vence ? vence.intervalo.fin.toJSDate() : null,
      origen: inst.origen,
    })

    const entendido = `anotar «${intencion.titulo}»`
    return {
      herramienta: 'anotar_pendiente', estado: 'hecho', entendido,
      respuesta: `Anotado: «${intencion.titulo}» (${intencion.duracionMin} min, ${intencion.prioridad}).`,
    }
  }

  // ── enseñar un compromiso ────────────────────────────────────
  async function ensenar(
    orden: Extract<Orden, { herramienta: 'ensenar_compromiso' }>,
    inst: Instruccion
  ): Promise<ResultadoOrden> {
    const ahora = d.reloj.ahora()
    const dias = [...new Set(orden.dias)].sort((a, b) => a - b)
    const rrule = `FREQ=WEEKLY;BYDAY=${dias.map((n) => DIAS_RRULE[n - 1]).join(',')}`

    const [h, m] = orden.horaInicio.split(':').map(Number)
    const [hf, mf] = orden.horaFin.split(':').map(Number)

    // La primera vez que cae: hoy si toca y todavía no ha pasado, si no el
    // siguiente día de la lista.
    let primera = ahora.set({ hour: h ?? 0, minute: m ?? 0, second: 0, millisecond: 0 })
    for (let i = 0; i < 8; i++) {
      const candidata = primera.plus({ days: i })
      if (dias.includes(candidata.weekday) && candidata > ahora) {
        primera = candidata
        break
      }
    }
    const fin = primera.set({ hour: hf ?? 0, minute: mf ?? 0 })

    const entendido = `enseñarte «${orden.titulo}» ${dias.length === 7 ? 'todos los días' : ''}`
      + ` de ${orden.horaInicio} a ${orden.horaFin}`

    if (orden.confianza === 'baja') {
      return fallo('ensenar_compromiso', entendido, `¿Te entendí bien: ${entendido}?`)
    }

    const ensayo = d.calendario.sombra
    let googleEventId: string | null = null
    let accionId: number | undefined

    // En sombra no se crea el evento, y entonces el compromiso queda sin
    // vínculo con el calendario: apuntar un id que no existe haría que
    // luego intentara cancelar la nada.
    if (!ensayo) {
      const accion: AccionCrearEvento = {
        tipo: 'crear_evento',
        calendarId: d.calendarId,
        eventoId: nuevoId(),
        titulo: orden.titulo,
        inicio: iso(primera),
        fin: iso(fin),
        rrule,
      }
      const inversa = await crearConInversa(d.calendario, accion)
      googleEventId = accion.eventoId
      accionId = await d.repoAcciones.registrar({
        tipo: 'crear_evento', origen: inst.origen, correoId: null,
        compromisoId: null, confianza: orden.confianza,
        payloadAplicado: accion, payloadInverso: inversa,
        estado: 'aplicada', resumen: entendido,
      })
    }

    await d.repoCompromisos.crear({
      titulo: orden.titulo,
      alias: orden.alias,
      rrule,
      horaInicio: orden.horaInicio,
      horaFin: orden.horaFin,
      tz: zona(),
      googleCalendarId: d.calendarId,
      googleEventId,
      remitentesVinculados: orden.remitentes,
    })

    return {
      herramienta: 'ensenar_compromiso', estado: 'hecho', entendido, accionId, ensayo,
      respuesta: ensayo
        ? `Aprendido «${orden.titulo}». En modo sombra no creo el evento en tu calendario todavía.`
        : `Aprendido: «${orden.titulo}», ${orden.horaInicio}–${orden.horaFin}. Ya lo puse en tu calendario.`,
    }
  }

  // ── una orden ────────────────────────────────────────────────
  async function ejecutar(orden: Orden, inst: Instruccion): Promise<ResultadoOrden> {
    switch (orden.herramienta) {
      case 'nada':
        return {
          herramienta: 'nada', estado: 'nada', entendido: 'nada claro',
          respuesta: `No te entendí. ${orden.motivo}`.trim(),
        }

      case 'consultar_agenda':
        return consultarAgenda(orden)

      case 'consultar_finanzas':
        return {
          herramienta: 'consultar_finanzas', estado: 'respuesta',
          entendido: 'preguntar por la plata',
          respuesta: 'Todavía no llevo tus cuentas: eso entra con el módulo financiero.',
        }

      case 'cancelar':
      case 'mover':
        return tocarCalendario(orden, inst)

      case 'anotar_pendiente':
        if (orden.confianza === 'baja') {
          return fallo('anotar_pendiente', `anotar «${orden.titulo}»`,
            `¿Te anoto «${orden.titulo}»?`)
        }
        return anotar(orden, inst)

      case 'ensenar_compromiso':
        return ensenar(orden, inst)

      case 'deshacer': {
        const r = await d.deshacer.deshacerUltima()
        return r.ok
          ? {
              herramienta: 'deshacer', estado: 'hecho', entendido: 'deshacer lo último',
              accionId: r.accionId, respuesta: 'Listo, lo devolví como estaba.',
            }
          : fallo('deshacer', 'deshacer lo último', r.motivo ?? 'No hay nada que deshacer.')
      }

      case 'crear_regla': {
        if (orden.confianza === 'baja') {
          return fallo('crear_regla', `una regla sobre «${orden.patron}»`,
            `¿Qué quieres que haga con los correos de «${orden.patron}»?`)
        }
        const regla = await d.repoReglas.crear(
          orden.tipo === 'ignorar' ? 'ignorar_remitente' : 'silenciar_remitente',
          orden.patron, inst.origen)
        const entendido = orden.tipo === 'ignorar'
          ? `ignorar los correos de «${regla.patron}»`
          : `no avisarte de «${regla.patron}»`
        return {
          herramienta: 'crear_regla', estado: 'hecho', entendido,
          respuesta: orden.tipo === 'ignorar'
            ? `Listo, ya no miro los correos de «${regla.patron}».`
            : `Listo, de «${regla.patron}» sigo anotando pero no te aviso.`,
        }
      }
    }
  }

  return {
    async atender(inst: Instruccion): Promise<RespuestaInstruccion> {
      const texto = inst.texto.trim()
      if (!texto) {
        return {
          texto: 'No me dijiste nada.',
          resultados: [{
            herramienta: 'nada', estado: 'nada',
            entendido: 'nada', respuesta: 'No me dijiste nada.',
          }],
        }
      }

      const interpretacion = await d.interprete.interpretar(
        texto, iso(d.reloj.ahora()))

      const resultados: ResultadoOrden[] = []
      // De una nota pueden salir tres cosas: se ejecuta la clara y se
      // repregunta sólo por las vagas, en vez de descartar el audio entero.
      for (const orden of interpretacion.ordenes) {
        resultados.push(await ejecutar(orden, inst))
      }

      return {
        texto: resultados.map((r) => r.respuesta).join(' '),
        resultados,
      }
    },

    /**
     * Confirmar una acción que quedó esperando.
     *
     * No vuelve a pasar por el modelo: aplica exactamente lo que él vio y
     * aprobó. La inversa se recalcula con el estado de AHORA, porque entre
     * que lo dijo y lo confirmó el evento pudo cambiar.
     */
    async confirmar(accionId: number): Promise<ResultadoOrden> {
      const accion = await d.repoAcciones.porId(accionId)
      if (!accion) return fallo('nada', 'confirmar', 'Esa acción ya no existe.')
      if (accion.estado !== 'pendiente') {
        return fallo('nada', 'confirmar', 'Esa acción ya no está esperando.')
      }

      const guardada = accion.payloadAplicado as AccionDestructiva
      const compromiso = accion.compromisoId === null
        ? null
        : await d.repoCompromisos.porId(accion.compromisoId)

      const instanciaId = guardada.tipo === 'borrar_serie' ? null : guardada.instanciaId
      let instancia = null

      if (compromiso?.googleEventId && instanciaId) {
        const objetivo = accion.payloadInverso.tipo === 'recrear_instancia'
          ? accion.payloadInverso.instancia.inicio
          : accion.payloadInverso.tipo === 'restaurar_horario'
            ? accion.payloadInverso.inicio
            : null
        const dia = objetivo
          ? DateTime.fromISO(objetivo, { zone: zona() })
          : d.reloj.ahora()
        const instancias = await d.calendario.instanciasEnRango(
          compromiso.googleCalendarId, compromiso.googleEventId,
          iso(dia.startOf('day')), iso(dia.endOf('day')))
        instancia = instancias.find((i) => i.instanciaId === instanciaId) ?? null
      }

      if (!instancia) {
        await d.repoAcciones.descartarPendiente(accionId)
        return fallo('nada', accion.resumen ?? 'confirmar',
          'Eso ya no está como estaba, así que no lo toqué. Dímelo otra vez si sigue haciendo falta.')
      }

      const inversa = calcularInversa(guardada, {
        instancia, rrule: compromiso?.rrule ?? null,
      })
      await d.calendario.aplicar(guardada)

      const ensayo = d.calendario.sombra
      await d.repoAcciones.aplicarPendiente(accionId, inversa, ensayo ? 'sombra' : 'aplicada')

      return {
        herramienta: 'nada', estado: 'hecho',
        entendido: accion.resumen ?? 'lo que confirmaste',
        accionId, ensayo,
        respuesta: ensayo
          ? `En modo sombra: habría hecho «${accion.resumen}».`
          : `Listo: ${accion.resumen}.`,
      }
    },

    async descartar(accionId: number): Promise<ResultadoOrden> {
      const ok = await d.repoAcciones.descartarPendiente(accionId)
      return {
        herramienta: 'nada', estado: ok ? 'nada' : 'pregunta',
        entendido: 'no era eso',
        respuesta: ok
          ? 'Bueno. Dímelo otra vez y lo vuelvo a intentar.'
          : 'Esa acción ya no estaba esperando.',
      }
    },
  }
}

export type ServicioInstruccion = ReturnType<typeof crearServicioInstruccion>
