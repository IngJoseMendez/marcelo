import type { ProveedorLLM } from '../puertos/proveedor-llm.ts'
import type { CorreoCrudo } from '../dominio/tipos.ts'
import { EsquemaClasificacion, type ResultadoClasificacion } from '../dominio/esquemas.ts'

const MAX_CUERPO = 3_000

const SISTEMA = `Clasificas correos de una sola persona en exactamente una categoría.

agenda   — menciona una clase, reunión, cita o compromiso que se cancela,
           se mueve, se agrega o cambia de horario.
finanzas — informa de un movimiento de dinero: un pago, una transferencia,
           un cobro, una compra o una factura.
ruido    — cualquier otra cosa.

Si dudas entre una categoría específica y ruido, responde la específica con
confianza baja. Perder una clase cancelada cuesta más que revisar de más.

Responde sólo JSON: {"clasificacion":"...","confianza":"..."}`

export function crearClasificador(llm: ProveedorLLM, modelo: string) {
  return {
    clasificar(correo: CorreoCrudo): Promise<ResultadoClasificacion> {
      return llm.completarJson({
        modelo,
        sistema: SISTEMA,
        usuario: [
          `De: ${correo.remitente}`,
          `Asunto: ${correo.asunto ?? '(sin asunto)'}`,
          '',
          correo.cuerpo.slice(0, MAX_CUERPO),
        ].join('\n'),
        esquema: EsquemaClasificacion,
      })
    },
  }
}

export type Clasificador = ReturnType<typeof crearClasificador>
