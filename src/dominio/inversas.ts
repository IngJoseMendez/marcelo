import type {
  AccionCrearEvento,
  AccionDestructiva,
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
  accion: AccionDestructiva,
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

/**
 * Crear no destruye nada, así que no necesita estado previo: su inversa se
 * conoce entera de antemano. Va aparte para que la firma de `calcularInversa`
 * siga exigiendo el estado previo donde de verdad hace falta.
 */
export function inversaDeCreacion(accion: AccionCrearEvento): Inversa {
  return {
    tipo: 'borrar_evento',
    calendarId: accion.calendarId,
    eventoId: accion.eventoId,
  }
}
