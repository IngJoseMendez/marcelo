import type { Notificador } from '../puertos/notificador.ts'
import {
  emitir, explicar, verificar, VIGENCIA_MS, type Vigente,
} from '../dominio/codigo-acceso.ts'

/**
 * Mandar el código de entrada por Telegram.
 *
 * Quien puede pedir un código es sólo la app, que ya viene con el token de
 * servicio. Y quien lo recibe es sólo el chat emparejado. Así que para
 * entrar hacen falta las dos cosas: llegar a la app y tener el teléfono.
 *
 * El código **nunca vuelve** por la respuesta de la API. Sale por Telegram
 * y por ningún otro lado; devolverlo aquí convertiría el token de servicio
 * en la llave entera y haría el segundo factor decorativo.
 */

export interface DepsAcceso {
  notificador: Notificador
  /** Inyectable para poder probar el vencimiento sin esperarlo. */
  ahora?: () => number
}

export function crearServicioAcceso(d: DepsAcceso) {
  const ahora = d.ahora ?? (() => Date.now())
  let vigente: Vigente | null = null

  return {
    async pedir(): Promise<{ enviado: boolean; motivo?: string }> {
      const nuevo = emitir(ahora())

      try {
        await d.notificador.enviar({
          texto: `🔑  Tu código para entrar es ${nuevo.codigo}\n\n`
            + `Vale ${Math.round(VIGENCIA_MS / 60_000)} minutos y sólo una vez. `
            + 'Si no lo pediste tú, no lo uses y avísale a Jose.',
        })
      } catch (e) {
        // Sin Telegram no hay forma de hacerle llegar nada, y decirle
        // «revisa tu teléfono» sería mandarlo a mirar un chat vacío.
        return {
          enviado: false,
          motivo: `No pude mandarlo por Telegram: ${e instanceof Error ? e.message : 'sin detalle'}`,
        }
      }

      vigente = nuevo
      return { enviado: true }
    },

    verificar(intento: string): { ok: boolean; motivo?: string } {
      const { resultado, queda } = verificar(vigente, intento, ahora())
      vigente = queda
      return resultado.ok ? { ok: true } : { ok: false, motivo: explicar(resultado.motivo) }
    },

    /** Para la pantalla: ¿tiene sentido ofrecer el botón? */
    hayPendiente(): boolean {
      return vigente !== null && ahora() <= vigente.venceEn
    },
  }
}

export type ServicioAcceso = ReturnType<typeof crearServicioAcceso>
