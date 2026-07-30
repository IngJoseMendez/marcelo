export interface EventoInstancia {
  eventoId: string
  instanciaId: string
  inicio: string
  fin: string
  titulo: string
  estado: 'confirmado' | 'cancelado'
}

export type AccionCalendario =
  | { tipo: 'cancelar_instancia'; calendarId: string; instanciaId: string }
  | {
      tipo: 'mover_evento'
      calendarId: string
      instanciaId: string
      nuevoInicio: string
      nuevoFin: string
    }
  | { tipo: 'borrar_serie'; calendarId: string; eventoId: string }

/** Lo que hay que aplicar para devolver el calendario a como estaba. */
export type Inversa =
  | { tipo: 'recrear_instancia'; calendarId: string; instancia: EventoInstancia }
  | {
      tipo: 'restaurar_horario'
      calendarId: string
      instanciaId: string
      inicio: string
      fin: string
    }
  | {
      tipo: 'recrear_serie'
      calendarId: string
      eventoId: string
      rrule: string | null
      titulo: string
    }

export interface SumideroCalendario {
  /**
   * Si este sumidero sólo ensaya. Vive en el puerto, y no como bandera
   * aparte, para que sea imposible marcar una acción como "sombra"
   * mientras el calendario real sí se está escribiendo.
   */
  readonly sombra: boolean

  instanciasEnRango(
    calendarId: string,
    eventoId: string,
    desdeIso: string,
    hastaIso: string
  ): Promise<EventoInstancia[]>

  aplicar(accion: AccionCalendario): Promise<void>

  restaurar(inversa: Inversa): Promise<void>
}
