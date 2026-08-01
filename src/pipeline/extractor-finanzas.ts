import { z } from 'zod'
import type { ProveedorLLM } from '../puertos/proveedor-llm.ts'
import type { CorreoCrudo } from '../dominio/tipos.ts'
import { EsquemaReferente } from '../dominio/esquemas.ts'
import { CATEGORIAS } from '../dominio/categorias.ts'

/**
 * Sacar de un correo bancario lo que pasó con la plata.
 *
 * Dos cosas que el modelo NO hace, por las mismas razones de siempre:
 *
 * - **No normaliza el monto.** Devuelve `"$1.240.000"` tal como está
 *   escrito, y el código lo convierte. Pedirle que devuelva `1240000` es
 *   pedirle aritmética, y devolvería `1.24` con el mismo aplomo.
 * - **No calcula la fecha.** Devuelve el referente en crudo y Luxon lo
 *   resuelve contra la hora real de Bogotá.
 *
 * Y una tercera que sí importa aquí: **decide si el correo es o no una
 * transacción**. Un correo que menciona dinero —una promoción, un
 * recordatorio, un extracto— no es un movimiento, y meterlo al libro lo
 * ensucia de una forma que después nadie sabe deshacer.
 */

export const EsquemaHechoFinanzas = z.object({
  /**
   * `movimiento` sólo cuando la plata YA se movió. Un cobro que aún no ha
   * pasado es `cuenta_por_pagar`; cualquier otra cosa es `ninguno`.
   */
  clase: z.enum(['movimiento', 'cuenta_por_pagar', 'ninguno']),
  tipo: z.enum(['ingreso', 'egreso']).nullable(),

  /** Tal como aparece en el correo: "$1.240.000", "USD 45.99". */
  montoTexto: z.string().max(60).nullable(),
  moneda: z.string().max(8).nullable(),

  referente: EsquemaReferente,

  /** A quién o de quién. "Bancolombia", "Claro", "Juan Pérez". */
  contraparte: z.string().max(120).nullable(),
  concepto: z.string().max(200).nullable(),

  /** Una propuesta: el código decide la definitiva. */
  categoria: z.enum(CATEGORIAS).nullable(),

  confianza: z.enum(['alta', 'media', 'baja']),
})

export type HechoFinanzas = z.infer<typeof EsquemaHechoFinanzas>

const MAX_CUERPO = 4_000

const SISTEMA = `Lees un correo y dices qué pasó con la plata. Sólo JSON.

clase:
  movimiento        la plata YA se movió (compra, pago, transferencia,
                    retiro, consignación, nómina)
  cuenta_por_pagar  todavía no se movió: una factura con fecha límite,
                    un cobro que vence
  ninguno           cualquier otra cosa

"ninguno" es la respuesta correcta muchas veces. Una promoción, un
extracto mensual, un aviso de seguridad, un cupo aprobado o un correo que
sólo menciona cifras NO son movimientos. Ante la duda: ninguno.

NO NORMALICES EL MONTO. Cópialo tal como está escrito:
  "$1.240.000"   -> montoTexto: "$1.240.000"
  "USD 45.99"    -> montoTexto: "45.99", moneda: "USD"

NO CALCULES FECHAS. Devuelve el referente en crudo:
  "hoy"              -> {"tipo":"hoy"}
  "el 6 de agosto"   -> {"tipo":"fecha","iso":"2026-08-06"}
  no se sabe         -> {"tipo":"desconocido"}
Para cuenta_por_pagar, el referente es la FECHA DE VENCIMIENTO.

tipo: "egreso" si sale plata de sus cuentas, "ingreso" si entra.
contraparte: el comercio, la persona o la empresa. No el banco que avisa,
salvo que el banco sea quien cobra.

confianza: "alta" si el correo lo dice explícito, "media" si hay que
inferir algo, "baja" si es dudoso.

Formato: {"clase":"...","tipo":null,"montoTexto":null,"moneda":null,
"referente":{...},"contraparte":null,"concepto":null,"categoria":null,
"confianza":"..."}`

export function crearExtractorFinanzas(llm: ProveedorLLM, modelo: string) {
  return {
    extraer(correo: CorreoCrudo, fechaRecepcionIso: string): Promise<HechoFinanzas> {
      return llm.completarJson({
        modelo,
        sistema: SISTEMA,
        usuario: [
          `Fecha y hora de recepción: ${fechaRecepcionIso} (zona America/Bogota)`,
          `De: ${correo.remitente}`,
          `Asunto: ${correo.asunto ?? '(sin asunto)'}`,
          '',
          correo.cuerpo.slice(0, MAX_CUERPO),
        ].join('\n'),
        esquema: EsquemaHechoFinanzas,
      })
    },
  }
}

export type ExtractorFinanzas = ReturnType<typeof crearExtractorFinanzas>
