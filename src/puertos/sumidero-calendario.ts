export interface EventoInstancia {
  eventoId: string
  instanciaId: string
  inicio: string
  fin: string
  titulo: string
  estado: 'confirmado' | 'cancelado'
}

/**
 * Crear un evento trae su propio identificador ya decidido.
 *
 * No es un capricho: la inversa se guarda ANTES de aplicar la acción, y la
 * inversa de crear es borrar *ese* evento. Si el identificador lo pusiera
 * el servidor, entre la escritura y el registro habría una ventana en la
 * que existe un evento que nadie sabe deshacer.
 */
export interface AccionCrearEvento {
  tipo: 'crear_evento'
  calendarId: string
  eventoId: string
  titulo: string
  inicio: string
  fin: string
  /** Con RRULE se crea la serie entera: es lo que hace un compromiso. */
  rrule?: string | null
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
  | AccionCrearEvento

/** Las que destruyen algo que ya existía: su inversa necesita el estado previo. */
export type AccionDestructiva = Exclude<AccionCalendario, AccionCrearEvento>

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
  | { tipo: 'borrar_evento'; calendarId: string; eventoId: string }

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

  /**
   * Todo lo que hay en el calendario dentro de una ventana, sin saber de
   * antemano a qué serie pertenece. Es lo que hace posible dibujar el día
   * entero —y por tanto ver dónde NO hay nada, que es el punto de la
   * vista de agenda.
   */
  eventosEnRango(
    calendarId: string,
    desdeIso: string,
    hastaIso: string
  ): Promise<EventoInstancia[]>

  aplicar(accion: AccionCalendario): Promise<void>

  restaurar(inversa: Inversa): Promise<void>
}
