import type { EventoInstancia, Inversa } from '../puertos/sumidero-calendario.ts'

export interface Objetivo {
  instanciaId: string
  inicio: string
  fin: string
  titulo: string
  /** Al mover, la hora de la que venía. */
  desdeInicio: string | null
  /** Sólo las cancelaciones ya aplicadas: el evento desapareció del calendario. */
  cancelado: EventoInstancia | null
}

export interface AccionLeida {
  tipo: string
  estado: string
  payloadAplicado: unknown
  payloadInverso: Inversa | null
}

/**
 * Sobre qué evento actuó una acción, leído de sus payloads.
 *
 * La auditoría guarda la inversa completa, así que una instancia cancelada
 * —que Google ya no devuelve— se puede volver a dibujar tal como era. Sin
 * eso, el día mostraría un hueco sin explicación en vez de la clase tachada,
 * y un hueco sin explicación es exactamente lo que da miedo de la autonomía.
 */
export function objetivoDe(a: AccionLeida): Objetivo | null {
  const aplicado = (a.payloadAplicado ?? {}) as Record<string, unknown>
  const inversa = a.payloadInverso

  if (a.tipo === 'cancelar_instancia') {
    if (inversa?.tipo !== 'recrear_instancia') return null
    const i = inversa.instancia
    return {
      instanciaId: i.instanciaId,
      inicio: i.inicio,
      fin: i.fin,
      titulo: i.titulo,
      desdeInicio: null,
      cancelado: a.estado === 'aplicada' ? i : null,
    }
  }

  if (a.tipo === 'mover_evento') {
    const instanciaId = String(aplicado.instanciaId ?? '')
    const inicio = String(aplicado.nuevoInicio ?? '')
    if (!instanciaId || !inicio) return null
    return {
      instanciaId,
      inicio,
      fin: String(aplicado.nuevoFin ?? ''),
      titulo: '',
      desdeInicio: inversa?.tipo === 'restaurar_horario' ? inversa.inicio : null,
      cancelado: null,
    }
  }

  if (a.tipo === 'crear_evento') {
    const eventoId = String(aplicado.eventoId ?? '')
    const inicio = String(aplicado.inicio ?? '')
    if (!eventoId || !inicio) return null
    return {
      instanciaId: eventoId,
      inicio,
      fin: String(aplicado.fin ?? ''),
      titulo: String(aplicado.titulo ?? ''),
      desdeInicio: null,
      cancelado: null,
    }
  }

  if (a.tipo === 'borrar_serie') {
    if (inversa?.tipo !== 'recrear_serie') return null
    return {
      instanciaId: inversa.eventoId,
      inicio: '',
      fin: '',
      titulo: inversa.titulo,
      desdeInicio: null,
      cancelado: null,
    }
  }

  return null
}
