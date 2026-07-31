import type { Confianza, Origen } from './tipos.ts'

export type TipoAccion =
  | 'cancelar_instancia'
  | 'mover_evento'
  | 'borrar_serie'
  | 'crear_evento'

export type Decision =
  | 'actuar_callado'
  | 'actuar_y_avisar'
  | 'confirmar'
  | 'preguntar'
  | 'ignorar'

/**
 * Destructiva = no la recupera el usuario con un clic obvio.
 * Cancelar una instancia se deshace; borrar la serie entera, no tanto.
 */
export const ES_DESTRUCTIVA: Record<TipoAccion, boolean> = {
  cancelar_instancia: false,
  mover_evento: false,
  borrar_serie: true,
  // Meter algo en un hueco no quita nada: se borra con un toque.
  crear_evento: false,
}

export interface EntradaPolitica {
  origen: Origen
  tipo: TipoAccion
  confianza: Confianza
  silenciadoPorRegla: boolean
}

/**
 * Toda la autonomía del sistema cabe en esta función. Sin tokens, sin red,
 * sin estado: entra una situación y sale una decisión.
 */
export function decidir(e: EntradaPolitica): Decision {
  // Lo escribió él: es confiable y no pasó por ningún transcriptor.
  if (e.origen === 'texto') return 'actuar_callado'

  // La voz pasa por un transcriptor que puede cambiar palabras —"mañana"
  // por "semana"— así que lo destructivo se confirma siempre, por alta
  // que sea la confianza del modelo.
  if (e.origen === 'voz') {
    return ES_DESTRUCTIVA[e.tipo] ? 'confirmar' : 'actuar_y_avisar'
  }

  if (e.confianza === 'baja') return 'preguntar'

  const debeAvisar = e.confianza === 'media' || ES_DESTRUCTIVA[e.tipo]
  if (!debeAvisar) return 'actuar_callado'

  // Una regla de silencio sólo suprime el aviso de algo que ya se iba a
  // hacer. Nunca puede escalar un "preguntar" a una acción.
  return e.silenciadoPorRegla ? 'actuar_callado' : 'actuar_y_avisar'
}
