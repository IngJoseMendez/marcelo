import type { Mensaje, Notificador } from '../../src/puertos/notificador.ts'

/**
 * Un arreglo de mensajes.
 *
 * Es lo que permite afirmar «si no hizo nada, no manda nada»: se comprueba
 * viendo que el arreglo siga vacío, y eso no se puede comprobar contra
 * Telegram sin mandarle un mensaje de verdad a alguien.
 */
export class NotificadorFalso implements Notificador {
  public readonly mensajes: Mensaje[] = []

  async enviar(mensaje: Mensaje): Promise<void> {
    this.mensajes.push(mensaje)
  }

  get ultimo(): Mensaje | undefined {
    return this.mensajes[this.mensajes.length - 1]
  }

  /** Los datos de todos los botones, para no ir escarbando a mano. */
  datos(): string[] {
    return this.mensajes.flatMap((m) => (m.botones ?? []).map((b) => b.dato ?? b.url ?? ''))
  }
}
