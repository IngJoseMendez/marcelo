import type { Transcripcion } from '../dominio/transcripcion.ts'

export interface Audio {
  datos: Uint8Array
  /** El tipo que mandó el navegador: webm/opus en Chrome, mp4 en Safari. */
  tipo: string
}

/**
 * Pasar audio a texto.
 *
 * Es el punto más frágil del sistema: con el acento costeño del cliente,
 * un modelo pequeño produjo salida inservible y uno mediano inventó
 * palabras. Por eso la calidad de transcripción no es negociable y por eso
 * la transcripción viene con confianza: lo que no se oyó bien se pregunta,
 * no se adivina.
 */
export interface Transcriptor {
  transcribir(audio: Audio): Promise<Transcripcion>
}

export class ErrorTranscripcion extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'ErrorTranscripcion'
  }
}
