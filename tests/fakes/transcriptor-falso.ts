import { ErrorTranscripcion, type Audio, type Transcriptor } from '../../src/puertos/transcriptor.ts'
import type { Transcripcion } from '../../src/dominio/transcripcion.ts'
import type { Confianza } from '../../src/dominio/tipos.ts'

/**
 * Texto fijo en vez de Whisper.
 *
 * La confianza se fija a mano porque es justo lo que hay que poder mover
 * en una prueba: una nota mascullada no se distingue de una clara por su
 * contenido, sino por lo seguro que estaba el modelo de haberla oído.
 */
export class TranscriptorFalso implements Transcriptor {
  public readonly recibidos: Audio[] = []

  constructor(
    private readonly texto: string,
    private readonly confianza: Confianza = 'alta',
    /** Para probar qué pasa cuando el oído falla. */
    private readonly revienta = false
  ) {}

  async transcribir(audio: Audio): Promise<Transcripcion> {
    this.recibidos.push(audio)
    if (this.revienta) throw new ErrorTranscripcion('No se entendió nada en el audio')
    return {
      texto: this.texto,
      confianza: this.confianza,
      segmentos: [{ texto: this.texto, confianza: this.confianza }],
    }
  }
}
