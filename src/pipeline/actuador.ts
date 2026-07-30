import type {
  AccionCalendario,
  EventoInstancia,
  Inversa,
  SumideroCalendario,
} from '../puertos/sumidero-calendario.ts'
import { calcularInversa } from '../dominio/inversas.ts'

/**
 * Aplica la acción y devuelve la inversa.
 *
 * El orden importa y no es negociable: la inversa se calcula ANTES de
 * escribir, con el estado que está a punto de cambiar.
 */
export async function aplicarConInversa(
  calendario: SumideroCalendario,
  accion: AccionCalendario,
  instancia: EventoInstancia,
  rrule: string | null
): Promise<Inversa> {
  const inversa = calcularInversa(accion, { instancia, rrule })
  await calendario.aplicar(accion)
  return inversa
}
