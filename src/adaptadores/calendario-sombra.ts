import type {
  AccionCalendario,
  EventoInstancia,
  Inversa,
  SumideroCalendario,
} from '../puertos/sumidero-calendario.ts'

/**
 * Modo sombra: lee del calendario real pero nunca escribe.
 *
 * Envuelve al sumidero de verdad para que la lectura —y por tanto la
 * resolución de entidades y la decisión— sea idéntica a la de producción.
 * Lo único que cambia es la escritura. Por eso lo que se mida en sombra
 * predice lo que va a pasar cuando se le suelte la correa: si el modo
 * sombra fuera un flujo aparte, estaríamos midiendo otro sistema.
 */
export class CalendarioSombra implements SumideroCalendario {
  public readonly sombra = true
  public readonly aplicadas: AccionCalendario[] = []

  constructor(private readonly lector: SumideroCalendario) {}

  instanciasEnRango(
    calendarId: string,
    eventoId: string,
    desdeIso: string,
    hastaIso: string
  ): Promise<EventoInstancia[]> {
    return this.lector.instanciasEnRango(calendarId, eventoId, desdeIso, hastaIso)
  }

  async aplicar(accion: AccionCalendario): Promise<void> {
    this.aplicadas.push(accion)
  }

  async restaurar(_inversa: Inversa): Promise<void> {
    // En sombra no se escribió nada, así que no hay nada que restaurar.
  }
}
