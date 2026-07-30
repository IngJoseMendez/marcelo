import type { PeticionJson, ProveedorLLM } from '../../src/puertos/proveedor-llm.ts'

/** Devuelve respuestas guionadas, validándolas con el mismo esquema real. */
export class LlmFalso implements ProveedorLLM {
  public readonly peticiones: PeticionJson<unknown>[] = []
  private readonly respuestas: unknown[]

  constructor(respuestas: readonly unknown[]) {
    // Copia: consumir las respuestas no puede vaciar el array del que
    // llama. Si no, una constante compartida entre pruebas se agota en
    // la primera y las demás fallan sin razón aparente.
    this.respuestas = [...respuestas]
  }

  async completarJson<T>(p: PeticionJson<T>): Promise<T> {
    this.peticiones.push(p as PeticionJson<unknown>)
    if (this.respuestas.length === 0) {
      throw new Error('LlmFalso: se consultó al modelo más veces de las esperadas')
    }
    return p.esquema.parse(this.respuestas.shift())
  }
}
