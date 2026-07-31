import { spawn } from 'node:child_process'
import OpenAI, { toFile } from 'openai'
import { ErrorTranscripcion, type Audio, type Transcriptor } from '../puertos/transcriptor.ts'
import { armarTranscripcion, type SegmentoCrudo, type Transcripcion } from '../dominio/transcripcion.ts'

const EXTENSIONES: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'mp4',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
}

interface RespuestaVerbose {
  text?: string
  segments?: Array<{ text?: string; avg_logprob?: number; no_speech_prob?: number }>
}

/**
 * Sube el volumen antes de transcribir.
 *
 * Las notas de voz llegan bajas y eso degrada la transcripción — medido con
 * el audio real del cliente. Si no hay ffmpeg configurado el audio pasa tal
 * cual: es mejor transcribir peor que no transcribir.
 */
function normalizar(ffmpeg: string, audio: Uint8Array): Promise<Uint8Array> {
  return new Promise((resolver) => {
    const proceso = spawn(ffmpeg, [
      '-hide_banner', '-loglevel', 'error',
      '-i', 'pipe:0',
      '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
      '-ac', '1', '-ar', '16000',
      '-f', 'wav', 'pipe:1',
    ])

    const trozos: Buffer[] = []
    proceso.stdout.on('data', (t: Buffer) => trozos.push(t))
    proceso.on('error', () => resolver(audio))
    proceso.on('close', (codigo) => {
      const salida = Buffer.concat(trozos)
      resolver(codigo === 0 && salida.length > 0 ? salida : audio)
    })

    proceso.stdin.on('error', () => {})
    proceso.stdin.end(Buffer.from(audio))
  })
}

export class TranscriptorGroq implements Transcriptor {
  private readonly cliente: OpenAI

  constructor(
    apiKey: string,
    baseURL: string,
    private readonly modelo: string,
    /** Ruta a ffmpeg. Vacío = se manda el audio como llegó. */
    private readonly ffmpeg = ''
  ) {
    this.cliente = new OpenAI({ apiKey, baseURL })
  }

  async transcribir(audio: Audio): Promise<Transcripcion> {
    if (!this.modelo) {
      throw new ErrorTranscripcion('No hay modelo de transcripción configurado')
    }
    if (audio.datos.length === 0) {
      throw new ErrorTranscripcion('El audio llegó vacío')
    }

    const limpio = this.ffmpeg ? await normalizar(this.ffmpeg, audio.datos) : audio.datos
    const usaWav = limpio !== audio.datos
    const base = audio.tipo.split(';')[0]?.trim() ?? ''
    const extension = usaWav ? 'wav' : EXTENSIONES[base] ?? 'webm'

    const archivo = await toFile(Buffer.from(limpio), `nota.${extension}`, {
      type: usaWav ? 'audio/wav' : base || 'audio/webm',
    })

    let respuesta: RespuestaVerbose
    try {
      respuesta = (await this.cliente.audio.transcriptions.create({
        file: archivo,
        model: this.modelo,
        // Español explícito: adivinar el idioma en una nota corta con acento
        // costeño es justo donde se equivoca.
        language: 'es',
        temperature: 0,
        // Sin esto no vienen los segmentos, y sin segmentos no hay confianza.
        response_format: 'verbose_json',
      })) as unknown as RespuestaVerbose
    } catch (e) {
      throw new ErrorTranscripcion(`No se pudo transcribir: ${String(e)}`)
    }

    const crudos: SegmentoCrudo[] = (respuesta.segments ?? []).map((s) => ({
      texto: s.text ?? '',
      avgLogprob: s.avg_logprob ?? -1,
      noSpeechProb: s.no_speech_prob ?? 0,
    }))

    const texto = (respuesta.text ?? '').trim()
    if (!texto) throw new ErrorTranscripcion('No se entendió nada en el audio')

    return armarTranscripcion(texto, crudos)
  }
}
