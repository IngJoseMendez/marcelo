import type { PeticionJson, ProveedorLLM } from '../../src/puertos/proveedor-llm.ts'

/** Devuelve respuestas guionadas, validándolas con el mismo esquema real. */
export class LlmFalso implements ProveedorLLM {
  public readonly peticiones: PeticionJson<unknown>[] = []

  constructor(private readonly respuestas: unknown[]) {}

  async completarJson<T>(p: PeticionJson<T>): Promise<T> {
    this.peticiones.push(p as PeticionJson<unknown>)
    if (this.respuestas.length === 0) {
      throw new Error('LlmFalso: se consultó al modelo más veces de las esperadas')
    }
    return p.esquema.parse(this.respuestas.shift())
  }
}
