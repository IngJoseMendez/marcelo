import type { z } from 'zod'

export interface PeticionJson<T> {
  modelo: string
  sistema: string
  usuario: string
  /**
   * Lo que entra es `unknown` a propósito: del modelo llega JSON arbitrario
   * y el esquema está justamente para eso. Con el `z.ZodType<T>` de antes
   * —que da por hecho que lo aceptado y lo producido son lo mismo— un
   * esquema que traduce al validar hacía que `T` se atara a lo aceptado, y
   * el tipo de lo aceptado se derramaba por todo el dominio.
   */
  esquema: z.ZodType<T, z.ZodTypeDef, unknown>
  reintentos?: number
}

/**
 * El LLM entra al sistema sólo por aquí, y sólo devolviendo objetos
 * validados. Nunca texto libre, nunca acciones.
 */
export interface ProveedorLLM {
  completarJson<T>(peticion: PeticionJson<T>): Promise<T>
}

/**
 * Por qué falló, que no es lo mismo que que falló.
 *
 * - `cuota`   el proveedor dice «ahora no» (429). Se resuelve esperando.
 * - `modelo`  ese identificador no existe ahí (404). No se resuelve nunca.
 * - `clave`   la credencial no vale (401/403). Tampoco.
 * - `formato` contestó, pero no con el JSON que se le pidió.
 * - `red`     no se llegó.
 *
 * La distinción no es documental: con `cuota` hay que parar y volver luego,
 * con `modelo` hay que avisar a alguien, y confundirlas hace que el sistema
 * se pase la tarde reintentando algo que no va a cambiar.
 */
export type CausaLLM = 'cuota' | 'modelo' | 'clave' | 'formato' | 'red'

export class ErrorLLM extends Error {
  constructor(
    mensaje: string,
    readonly ultimaRespuesta?: string,
    readonly causa: CausaLLM = 'formato',
    /** Cuántos milisegundos pidió esperar el proveedor, si lo dijo. */
    readonly esperar?: number
  ) {
    super(mensaje)
    this.name = 'ErrorLLM'
  }

  /** Volver a intentarlo más tarde tiene sentido. */
  get pasajero(): boolean {
    return this.causa === 'cuota' || this.causa === 'red'
  }
}
