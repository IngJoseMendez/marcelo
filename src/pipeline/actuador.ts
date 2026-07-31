import type {
  AccionCrearEvento,
  AccionDestructiva,
  EventoInstancia,
  Inversa,
  SumideroCalendario,
} from '../puertos/sumidero-calendario.ts'
import { calcularInversa, inversaDeCreacion } from '../dominio/inversas.ts'

/**
 * Aplica la acción y devuelve la inversa.
 *
 * El orden importa y no es negociable: la inversa se calcula ANTES de
 * escribir, con el estado que está a punto de cambiar.
 */
export async function aplicarConInversa(
  calendario: SumideroCalendario,
  accion: AccionDestructiva,
  instancia: EventoInstancia,
  rrule: string | null
): Promise<Inversa> {
  const inversa = calcularInversa(accion, { instancia, rrule })
  await calendario.aplicar(accion)
  return inversa
}

/** Lo mismo para crear: la inversa —borrar ese id— se conoce antes de escribir. */
export async function crearConInversa(
  calendario: SumideroCalendario,
  accion: AccionCrearEvento
): Promise<Inversa> {
  const inversa = inversaDeCreacion(accion)
  await calendario.aplicar(accion)
  return inversa
}
