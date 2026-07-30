import type { z } from 'zod'

export interface PeticionJson<T> {
  modelo: string
  sistema: string
  usuario: string
  esquema: z.ZodType<T>
  reintentos?: number
}

/**
 * El LLM entra al sistema sólo por aquí, y sólo devolviendo objetos
 * validados. Nunca texto libre, nunca acciones.
 */
export interface ProveedorLLM {
  completarJson<T>(peticion: PeticionJson<T>): Promise<T>
}

export class ErrorLLM extends Error {
  constructor(mensaje: string, readonly ultimaRespuesta?: string) {
    super(mensaje)
    this.name = 'ErrorLLM'
  }
}
