import OpenAI from 'openai'
import { ErrorLLM, type PeticionJson, type ProveedorLLM } from '../puertos/proveedor-llm.ts'

const REINTENTOS_POR_DEFECTO = 3

/**
 * Groq expone una API compatible con OpenAI, así que este mismo adaptador
 * sirve para cualquier proveedor compatible cambiando la URL base. Eso
 * convierte "cambiar de cerebro" en una variable de entorno.
 *
 * Requiere Zero Data Retention activado en Data Controls: este sistema le
 * manda al modelo correos bancarios de una persona real.
 */
export class ProveedorGroq implements ProveedorLLM {
  private readonly cliente: OpenAI

  constructor(apiKey: string, baseURL: string) {
    this.cliente = new OpenAI({ apiKey, baseURL })
  }

  async completarJson<T>(p: PeticionJson<T>): Promise<T> {
    const intentos = p.reintentos ?? REINTENTOS_POR_DEFECTO
    let ultima = ''
    let ultimoFallo: unknown

    for (let i = 0; i < intentos; i++) {
      try {
        const respuesta = await this.cliente.chat.completions.create({
          model: p.modelo,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: p.sistema },
            { role: 'user', content: p.usuario },
          ],
        })
        ultima = respuesta.choices[0]?.message?.content ?? ''
        return p.esquema.parse(JSON.parse(ultima))
      } catch (e) {
        ultimoFallo = e
        // JSON mal formado, campo fuera del esquema o error de red: los tres
        // suelen resolverse con otra pasada. Espera creciente.
        if (i < intentos - 1) {
          await new Promise((r) => setTimeout(r, 300 * 2 ** i))
        }
      }
    }

    throw new ErrorLLM(
      `El modelo no produjo JSON válido en ${intentos} intentos: ${String(ultimoFallo)}`,
      ultima)
  }
}
