import { DateTime } from 'luxon'
import type { Reloj } from '../puertos/reloj.ts'
import type {
  AccionCrearEvento, AccionDestructiva, SumideroCalendario,
} from '../puertos/sumidero-calendario.ts'
import type { RepoAcciones } from '../repos/acciones.ts'
import type { RepoCompromisos } from '../repos/compromisos.ts'
import { calcularInversa } from '../dominio/inversas.ts'
import { aplicarConInversa, crearConInversa } from '../pipeline/actuador.ts'
import { nuevoIdEvento } from '../dominio/identificadores.ts'

/**
 * Hacer las cosas a mano, sin pasar por ningún modelo.
 *
 * **La IA es un añadido, no el producto.** Si no hay cerebro, si se acabó
 * la cuota, si el proveedor está caído o si sencillamente él prefiere
 * escribirlo, tiene que poder enseñarle un compromiso y cancelar una clase
 * igual que siempre. Una agenda que sólo funciona cuando funciona una API
 * de terceros no es una agenda.
 *
 * Esto **no** es una segunda vía de escritura: pasa por el mismo actuador,
 * la misma inversa guardada antes de aplicar y la misma auditoría que el
 * intérprete. Lo único que se salta es la parte de *entender*, porque aquí
 * él ya dijo exactamente qué quiere. Por eso se puede deshacer igual, y
 * por eso sale en la Crónica junto a todo lo demás.
 */

export interface DepsAMano {
  reloj: Reloj
  calendario: SumideroCalendario
  repoCompromisos: RepoCompromisos
  repoAcciones: RepoAcciones
  calendarId: string
  nuevoId?: () => string
}

export interface NuevoPacto {
  titulo: string
  /** 1 = lunes … 7 = domingo. */
  dias: number[]
  horaInicio: string
  horaFin: string
  alias?: string[]
  remitentes?: string[]
}

export type Resultado =
  | { ok: true; mensaje: string; accionId?: number; ensayo: boolean }
  | { ok: false; motivo: string }

const DIAS_RRULE = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const
const iso = (d: DateTime) => d.toISO({ suppressMilliseconds: true })!

export function crearServicioAMano(d: DepsAMano) {
  const nuevoId = d.nuevoId ?? (() => nuevoIdEvento())
  const zona = () => d.reloj.ahora().zoneName ?? 'America/Bogota'

  return {
    /**
     * Enseñarle un compromiso escribiéndolo.
     *
     * Es lo mismo que decirle «los martes tengo laboratorio de 10 a 12»,
     * pero sin que nadie tenga que entenderlo: los días y las horas vienen
     * ya en su sitio.
     */
    async ensenarPacto(p: NuevoPacto): Promise<Resultado> {
      const dias = [...new Set(p.dias)].filter((n) => n >= 1 && n <= 7).sort((a, b) => a - b)
      if (dias.length === 0) return { ok: false, motivo: 'Dime al menos un día' }
      if (!p.titulo.trim()) return { ok: false, motivo: 'Ponle un nombre' }

      const rrule = `FREQ=WEEKLY;BYDAY=${dias.map((n) => DIAS_RRULE[n - 1]).join(',')}`
      const ahora = d.reloj.ahora()
      const [h, m] = p.horaInicio.split(':').map(Number)
      const [hf, mf] = p.horaFin.split(':').map(Number)

      // La primera vez que cae: el próximo día de la lista que aún no pasó.
      let primera = ahora.set({ hour: h ?? 0, minute: m ?? 0, second: 0, millisecond: 0 })
      for (let i = 0; i < 8; i++) {
        const candidata = primera.plus({ days: i })
        if (dias.includes(candidata.weekday) && candidata > ahora) {
          primera = candidata
          break
        }
      }
      const fin = primera.set({ hour: hf ?? 0, minute: mf ?? 0 })
      if (fin <= primera) return { ok: false, motivo: 'La hora de fin va después de la de inicio' }

      const ensayo = d.calendario.sombra
      let googleEventId: string | null = null
      let accionId: number | undefined

      // En sombra no se crea el evento, y entonces el compromiso queda sin
      // vínculo: apuntar un id que no existe haría que luego intentara
      // cancelar la nada.
      if (!ensayo) {
        const accion: AccionCrearEvento = {
          tipo: 'crear_evento',
          calendarId: d.calendarId,
          eventoId: nuevoId(),
          titulo: p.titulo.trim(),
          inicio: iso(primera),
          fin: iso(fin),
          rrule,
        }
        const inversa = await crearConInversa(d.calendario, accion)
        googleEventId = accion.eventoId
        accionId = await d.repoAcciones.registrar({
          tipo: 'crear_evento', origen: 'texto', correoId: null,
          compromisoId: null, confianza: 'alta',
          payloadAplicado: accion, payloadInverso: inversa,
          estado: 'aplicada',
          resumen: `enseñarte «${p.titulo.trim()}»`,
        })
      }

      await d.repoCompromisos.crear({
        titulo: p.titulo.trim(),
        alias: (p.alias ?? []).map((a) => a.trim()).filter(Boolean),
        rrule,
        horaInicio: p.horaInicio,
        horaFin: p.horaFin,
        tz: zona(),
        googleCalendarId: d.calendarId,
        googleEventId,
        remitentesVinculados: (p.remitentes ?? []).map((r) => r.trim()).filter(Boolean),
      })

      return {
        ok: true,
        accionId,
        ensayo,
        mensaje: ensayo
          ? `Aprendido «${p.titulo}». En sombra no lo pongo en el calendario todavía.`
          : `Aprendido: «${p.titulo}», ${p.horaInicio}–${p.horaFin}. Ya está en tu calendario.`,
      }
    },

    /**
     * Cancelar una instancia concreta, elegida a dedo en la pantalla.
     *
     * Aquí no hay resolutor ni desempate: él tocó ESE bloque del día, así
     * que no hay nada que adivinar. Es el caso donde prescindir del modelo
     * no cuesta absolutamente nada.
     */
    async cancelarEvento(instanciaId: string, fechaIso?: string): Promise<Resultado> {
      const ahora = d.reloj.ahora()
      const dia = fechaIso
        ? DateTime.fromISO(fechaIso, { zone: zona() })
        : ahora
      if (!dia.isValid) return { ok: false, motivo: 'Esa fecha no la entiendo' }

      const eventos = await d.calendario.eventosEnRango(
        d.calendarId, iso(dia.startOf('day')), iso(dia.endOf('day')))
      const instancia = eventos.find((e) => e.instanciaId === instanciaId)

      if (!instancia) {
        return { ok: false, motivo: 'Ese evento ya no está en tu calendario' }
      }

      const compromiso = (await d.repoCompromisos.listarActivos())
        .find((c) => c.googleEventId === instancia.eventoId)

      const accion: AccionDestructiva = {
        tipo: 'cancelar_instancia',
        calendarId: d.calendarId,
        instanciaId,
      }

      // La inversa ANTES de aplicar, igual que en todos los demás caminos:
      // nunca existe un instante en que algo pasó y nadie sepa deshacerlo.
      const inversa = await aplicarConInversa(
        d.calendario, accion, instancia, compromiso?.rrule ?? null)

      const ensayo = d.calendario.sombra
      const accionId = await d.repoAcciones.registrar({
        tipo: 'cancelar_instancia', origen: 'texto', correoId: null,
        compromisoId: compromiso?.id ?? null, confianza: 'alta',
        payloadAplicado: accion, payloadInverso: inversa,
        estado: ensayo ? 'sombra' : 'aplicada',
        resumen: `cancelar «${instancia.titulo}»`,
      })

      return {
        ok: true,
        accionId,
        ensayo,
        mensaje: ensayo
          ? `En sombra: habría cancelado «${instancia.titulo}».`
          : `Listo, cancelé «${instancia.titulo}».`,
      }
    },

    /** Calcular la inversa se hace igual aunque nadie haya hablado. */
    inversaDe: calcularInversa,
  }
}

export type ServicioAMano = ReturnType<typeof crearServicioAMano>
