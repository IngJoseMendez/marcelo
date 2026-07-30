import type {
  AccionCalendario,
  EventoInstancia,
  Inversa,
} from '../puertos/sumidero-calendario.ts'

export interface EstadoPrevio {
  instancia: EventoInstancia
  rrule: string | null
}

/**
 * Calcula qué hay que hacer para deshacer una acción.
 *
 * Se llama SIEMPRE antes de aplicarla, porque necesita el estado que está a
 * punto de destruirse. Calcularla después devolvería la inversa equivocada
 * —o ninguna, si el evento ya desapareció.
 */
export function calcularInversa(
  accion: AccionCalendario,
  previo: EstadoPrevio
): Inversa {
  switch (accion.tipo) {
    case 'cancelar_instancia':
      return {
        tipo: 'recrear_instancia',
        calendarId: accion.calendarId,
        instancia: { ...previo.instancia },
      }

    case 'mover_evento':
      return {
        tipo: 'restaurar_horario',
        calendarId: accion.calendarId,
        instanciaId: accion.instanciaId,
        inicio: previo.instancia.inicio,
        fin: previo.instancia.fin,
      }

    case 'borrar_serie':
      return {
        tipo: 'recrear_serie',
        calendarId: accion.calendarId,
        eventoId: accion.eventoId,
        rrule: previo.rrule,
        titulo: previo.instancia.titulo,
      }
  }
}
