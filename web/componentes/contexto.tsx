'use client'

import { createContext, useContext } from 'react'

export interface Cascaron {
  /** Mensaje corto abajo, el que confirma que algo pasó de verdad. */
  tostar: (mensaje: string) => void
  /** Abre la lámina de hablarle, opcionalmente con texto ya escrito. */
  hablar: (texto?: string) => void
}

export const ContextoApp = createContext<Cascaron>({
  tostar: () => {},
  hablar: () => {},
})

export const useApp = (): Cascaron => useContext(ContextoApp)
