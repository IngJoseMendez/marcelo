/**
 * Por dónde le habla la asistente.
 *
 * Es un puerto por la misma razón que lo es el calendario: la suite entera
 * corre sin red. La implementación falsa guarda los mensajes en un arreglo,
 * y eso permite afirmar lo que de otro modo no se puede afirmar — «si no
 * hizo nada, no manda nada» se comprueba viendo que el arreglo siga vacío.
 *
 * El puerto no sabe de chats ni de destinatarios: Marcelo es el único
 * usuario del sistema, así que a quién se le habla lo decide el adaptador
 * al construirse, no cada llamada.
 */

export interface Boton {
  texto: string
  /** Lo que vuelve cuando lo toca. */
  dato?: string
  /** Un botón que sólo abre algo: la app. Excluyente con `dato`. */
  url?: string
}

export interface Mensaje {
  texto: string
  botones?: Boton[]
}

export interface Notificador {
  enviar(mensaje: Mensaje): Promise<void>
}
