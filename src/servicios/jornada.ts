import { DateTime } from 'luxon'
import { huecosLibres } from '../dominio/huecos.ts'
import { objetivoDe, type Objetivo } from '../dominio/objetivo-accion.ts'
import type { Reloj } from '../puertos/reloj.ts'
import type { SumideroCalendario } from '../puertos/sumidero-calendario.ts'
import type { AccionGuardada, RepoAcciones } from '../repos/acciones.ts'
import type { Confianza, Origen } from '../dominio/tipos.ts'

/**
 * La huella que deja una acción sobre un evento del día.
 *
 * `porElla` no es lo mismo que «existe una acción»: si Marcelo le dictó la
 * orden, la mano es suya aunque el brazo sea de ella. El acento violeta de
 * la interfaz marca sólo lo que hizo sola, que es justo lo que hay que poder
 * distinguir de un vistazo.
 */
export interface Marca {
  accionId: number
  tipo: string
  origen: Origen
  confianza: Confianza
  cuando: string
  porElla: boolean
  /** En modo sombra la acción se registró pero el calendario no se tocó. */
  ensayo: boolean
  deshecha: boolean
  /** Al mover, la hora de la que venía. */
  desdeInicio: string | null
}

export interface EventoJornada {
  id: string
  eventoId: string
  titulo: string
  inicio: string
  fin: string
  todoElDia: boolean
  estado: 'confirmado' | 'cancelado'
  momento: 'pasado' | 'ahora' | 'futuro'
  marca: Marca | null
}

export interface HuecoJornada {
  inicio: string
  fin: string
  minutos: number
}

export interface Jornada {
  fecha: string
  zonaHoraria: string
  ahora: string
  esHoy: boolean
  /** El tramo que dibuja la rejilla y sobre el que se miden los huecos. */
  ventana: { inicio: string; fin: string }
  eventos: EventoJornada[]
  huecos: HuecoJornada[]
  cambiosDeElla: number
  modoSombra: boolean
}

export interface DepsJornada {
  reloj: Reloj
  calendario: SumideroCalendario
  repoAcciones: RepoAcciones
  calendarId: string
  /** Ventana de trabajo: fuera de ella el tiempo libre no se cuenta como hueco. */
  desde: string
  hasta: string
  /** Cuánto hacia atrás se buscan acciones que puedan afectar a este día. */
  diasDeAuditoria?: number
}

const marcaDe = (a: AccionGuardada, o: Objetivo, zona: string): Marca => ({
  accionId: a.id,
  tipo: a.tipo,
  origen: a.origen,
  confianza: a.confianza,
  // En hora de Bogotá y no en UTC: la app formatea cortando la cadena, así
  // que si esto viniera en UTC diría que canceló la clase cinco horas antes.
  cuando: DateTime.fromJSDate(a.creadaEn, { zone: zona }).toISO({ suppressMilliseconds: true })!,
  porElla: a.origen === 'correo',
  ensayo: a.estado === 'sombra',
  deshecha: a.estado === 'deshecha',
  desdeInicio: o.desdeInicio,
})

/** Sin milisegundos: las horas de una agenda no los tienen y ensucian el JSON. */
const iso = (d: DateTime): string => d.toISO({ suppressMilliseconds: true })!

export function crearServicioJornada(d: DepsJornada) {
  const zona = () => d.reloj.ahora().zoneName ?? 'America/Bogota'

  function aHora(base: DateTime, hhmm: string): DateTime {
    const [h, m] = hhmm.split(':')
    return base.set({ hour: Number(h ?? 0), minute: Number(m ?? 0), second: 0, millisecond: 0 })
  }

  return {
    async del(fechaIso?: string): Promise<Jornada> {
      const ahora = d.reloj.ahora()
      const zonaHoraria = zona()
      const base = fechaIso
        ? DateTime.fromISO(fechaIso, { zone: zonaHoraria })
        : ahora
      if (!base.isValid) throw new Error(`Fecha inválida: ${fechaIso}`)

      const inicioDia = base.startOf('day')
      const finDia = base.endOf('day')

      const crudos = await d.calendario.eventosEnRango(
        d.calendarId, inicioDia.toISO()!, finDia.toISO()!)

      // Una acción de anteayer puede haber cancelado la clase de hoy, así que
      // no basta con mirar las acciones creadas hoy.
      const dias = d.diasDeAuditoria ?? 45
      const acciones = await d.repoAcciones.enRango(
        ahora.minus({ days: dias }).toISO()!, ahora.plus({ days: 1 }).toISO()!)

      const marcas = new Map<string, { marca: Marca; objetivo: Objetivo }>()
      for (const a of acciones) {
        if (a.estado === 'pendiente') continue
        const objetivo = objetivoDe(a)
        if (!objetivo) continue
        const cuando = DateTime.fromISO(objetivo.inicio, { zone: zonaHoraria })
        if (!cuando.isValid || cuando < inicioDia || cuando > finDia) continue
        // La más reciente manda: si movió y luego canceló, vale la cancelación.
        marcas.set(objetivo.instanciaId, { marca: marcaDe(a, objetivo, zonaHoraria), objetivo })
      }

      const momentoDe = (inicio: DateTime, fin: DateTime): EventoJornada['momento'] =>
        fin <= ahora ? 'pasado' : inicio <= ahora ? 'ahora' : 'futuro'

      const eventos: EventoJornada[] = []
      const vistos = new Set<string>()

      for (const e of crudos) {
        const todoElDia = !e.inicio.includes('T')
        const inicio = DateTime.fromISO(e.inicio, { zone: zonaHoraria })
        const fin = DateTime.fromISO(e.fin, { zone: zonaHoraria })
        const anotada = marcas.get(e.instanciaId)
        vistos.add(e.instanciaId)
        eventos.push({
          id: e.instanciaId,
          eventoId: e.eventoId,
          titulo: e.titulo,
          inicio: inicio.isValid ? iso(inicio) : e.inicio,
          fin: fin.isValid ? iso(fin) : e.fin,
          todoElDia,
          estado: 'confirmado',
          momento: todoElDia ? 'futuro' : momentoDe(inicio, fin),
          marca: anotada && !anotada.marca.deshecha ? anotada.marca : null,
        })
      }

      // Lo que ella quitó ya no está en el calendario: se vuelve a dibujar
      // desde la inversa guardada, tachado y con su firma.
      for (const [id, { marca, objetivo }] of marcas) {
        if (vistos.has(id) || !objetivo.cancelado || marca.deshecha) continue
        const inicio = DateTime.fromISO(objetivo.inicio, { zone: zonaHoraria })
        const fin = DateTime.fromISO(objetivo.fin, { zone: zonaHoraria })
        eventos.push({
          id,
          eventoId: objetivo.cancelado.eventoId,
          titulo: objetivo.titulo,
          inicio: iso(inicio),
          fin: fin.isValid ? iso(fin) : objetivo.fin,
          todoElDia: false,
          estado: 'cancelado',
          momento: momentoDe(inicio, fin),
          marca,
        })
      }

      eventos.sort((a, b) => a.inicio.localeCompare(b.inicio))

      // La ventana se estira para no dejar ningún evento fuera de la rejilla:
      // una clase a las 6 am no puede quedar dibujada encima del borde.
      const conHora = eventos.filter((e) => !e.todoElDia)
      const inicios = conHora.map((e) => DateTime.fromISO(e.inicio, { zone: zonaHoraria }))
      const fines = conHora.map((e) => DateTime.fromISO(e.fin, { zone: zonaHoraria }))
      const ventanaInicio = [aHora(inicioDia, d.desde), ...inicios]
        .reduce((a, b) => (b < a ? b : a))
        .startOf('hour')
      const finMayor = [aHora(inicioDia, d.hasta), ...fines].reduce((a, b) => (b > a ? b : a))
      const ventanaFin = finMayor.equals(finMayor.startOf('hour'))
        ? finMayor
        : finMayor.startOf('hour').plus({ hours: 1 })

      const ocupados = eventos
        .filter((e) => e.estado === 'confirmado' && !e.todoElDia)
        .map((e) => ({
          inicio: DateTime.fromISO(e.inicio, { zone: zonaHoraria }),
          fin: DateTime.fromISO(e.fin, { zone: zonaHoraria }),
        }))

      const huecos = huecosLibres(ocupados, { inicio: ventanaInicio, fin: ventanaFin })
        .map((h) => ({ inicio: iso(h.inicio), fin: iso(h.fin), minutos: h.minutos }))

      return {
        fecha: inicioDia.toISODate()!,
        zonaHoraria,
        ahora: iso(ahora),
        esHoy: inicioDia.hasSame(ahora, 'day'),
        ventana: { inicio: iso(ventanaInicio), fin: iso(ventanaFin) },
        eventos,
        huecos,
        cambiosDeElla: eventos.filter((e) => e.marca?.porElla).length,
        modoSombra: d.calendario.sombra,
      }
    },
  }
}

export type ServicioJornada = ReturnType<typeof crearServicioJornada>
