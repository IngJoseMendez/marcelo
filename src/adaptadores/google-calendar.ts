import { google } from 'googleapis'
import type { OAuth2Client } from 'google-auth-library'
import type {
  AccionCalendario, EventoInstancia, Inversa, SumideroCalendario,
} from '../puertos/sumidero-calendario.ts'

/** Google responde 404/410 cuando el evento ya no está. Borrarlo dos veces no es un fallo. */
function yaNoEsta(e: unknown): boolean {
  const codigo = (e as { code?: number; status?: number }).code
    ?? (e as { status?: number }).status
  return codigo === 404 || codigo === 410
}

export class CalendarioGoogle implements SumideroCalendario {
  public readonly sombra = false
  private readonly cal

  constructor(auth: OAuth2Client, private readonly tz = 'America/Bogota') {
    this.cal = google.calendar({ version: 'v3', auth })
  }

  async instanciasEnRango(
    calendarId: string, eventoId: string, desdeIso: string, hastaIso: string
  ): Promise<EventoInstancia[]> {
    const r = await this.cal.events.instances({
      calendarId, eventId: eventoId,
      timeMin: desdeIso, timeMax: hastaIso, showDeleted: false,
    })
    return (r.data.items ?? []).map((e) => ({
      eventoId,
      instanciaId: e.id ?? '',
      inicio: e.start?.dateTime ?? e.start?.date ?? '',
      fin: e.end?.dateTime ?? e.end?.date ?? '',
      titulo: e.summary ?? '',
      estado: e.status === 'cancelled' ? 'cancelado' : 'confirmado',
    }))
  }

  async eventosEnRango(
    calendarId: string, desdeIso: string, hastaIso: string
  ): Promise<EventoInstancia[]> {
    // singleEvents expande las series en instancias concretas: sin eso, una
    // clase semanal llegaría como una sola fila con su RRULE y habría que
    // recalcular a mano en qué días cae.
    const r = await this.cal.events.list({
      calendarId,
      timeMin: desdeIso, timeMax: hastaIso,
      singleEvents: true, orderBy: 'startTime',
      showDeleted: false, maxResults: 250,
    })
    return (r.data.items ?? []).map((e) => ({
      // En una instancia de serie, `id` es la instancia y `recurringEventId`
      // la serie. Distinguirlos es lo que permite cancelar un solo miércoles.
      eventoId: e.recurringEventId ?? e.id ?? '',
      instanciaId: e.id ?? '',
      inicio: e.start?.dateTime ?? e.start?.date ?? '',
      fin: e.end?.dateTime ?? e.end?.date ?? '',
      titulo: e.summary ?? '(sin título)',
      estado: e.status === 'cancelled' ? 'cancelado' : 'confirmado',
    }))
  }

  async aplicar(a: AccionCalendario): Promise<void> {
    if (a.tipo === 'cancelar_instancia') {
      // Cancelar SÓLO esta instancia. Google lo modela como una excepción
      // de la serie, así que las demás semanas siguen intactas.
      await this.cal.events.patch({
        calendarId: a.calendarId, eventId: a.instanciaId,
        requestBody: { status: 'cancelled' },
      })
    } else if (a.tipo === 'mover_evento') {
      await this.cal.events.patch({
        calendarId: a.calendarId, eventId: a.instanciaId,
        requestBody: {
          start: { dateTime: a.nuevoInicio, timeZone: this.tz },
          end: { dateTime: a.nuevoFin, timeZone: this.tz },
        },
      })
    } else if (a.tipo === 'crear_evento') {
      await this.cal.events.insert({
        calendarId: a.calendarId,
        requestBody: {
          id: a.eventoId,
          summary: a.titulo,
          start: { dateTime: a.inicio, timeZone: this.tz },
          end: { dateTime: a.fin, timeZone: this.tz },
          recurrence: a.rrule ? [`RRULE:${a.rrule}`] : undefined,
        },
      })
    } else {
      await this.cal.events.delete({ calendarId: a.calendarId, eventId: a.eventoId })
    }
  }

  async restaurar(inv: Inversa): Promise<void> {
    if (inv.tipo === 'recrear_instancia') {
      await this.cal.events.patch({
        calendarId: inv.calendarId, eventId: inv.instancia.instanciaId,
        requestBody: {
          status: 'confirmed',
          start: { dateTime: inv.instancia.inicio, timeZone: this.tz },
          end: { dateTime: inv.instancia.fin, timeZone: this.tz },
        },
      })
    } else if (inv.tipo === 'restaurar_horario') {
      await this.cal.events.patch({
        calendarId: inv.calendarId, eventId: inv.instanciaId,
        requestBody: {
          start: { dateTime: inv.inicio, timeZone: this.tz },
          end: { dateTime: inv.fin, timeZone: this.tz },
        },
      })
    } else if (inv.tipo === 'borrar_evento') {
      try {
        await this.cal.events.delete({ calendarId: inv.calendarId, eventId: inv.eventoId })
      } catch (e) {
        if (!yaNoEsta(e)) throw e
      }
    } else {
      await this.cal.events.insert({
        calendarId: inv.calendarId,
        requestBody: {
          summary: inv.titulo,
          recurrence: inv.rrule ? [`RRULE:${inv.rrule}`] : undefined,
        },
      })
    }
  }
}
