import { google } from 'googleapis'
import type { OAuth2Client } from 'google-auth-library'
import type {
  AccionCalendario, EventoInstancia, Inversa, SumideroCalendario,
} from '../puertos/sumidero-calendario.ts'

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
