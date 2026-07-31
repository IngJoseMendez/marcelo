import type { Confianza } from './tipos.ts'

/**
 * Lo que devuelve Whisper por cada trozo de audio.
 *
 * `avgLogprob` es la seguridad media del modelo con esas palabras y
 * `noSpeechProb` la probabilidad de que ahí no hubiera nadie hablando.
 */
export interface SegmentoCrudo {
  texto: string
  avgLogprob: number
  noSpeechProb: number
}

export interface Segmento {
  texto: string
  confianza: Confianza
}

export interface Transcripcion {
  texto: string
  confianza: Confianza
  segmentos: Segmento[]
}

/** Por encima de esto el modelo estaba cómodo con lo que oyó. */
const LOGPROB_ALTA = -0.32
const LOGPROB_MEDIA = -0.62
/** Si es probable que ahí no hubiera voz, da igual lo seguro que suene. */
const SIN_VOZ = 0.55

export function confianzaDeSegmento(s: SegmentoCrudo): Confianza {
  if (s.noSpeechProb >= SIN_VOZ) return 'baja'
  if (s.avgLogprob >= LOGPROB_ALTA) return 'alta'
  if (s.avgLogprob >= LOGPROB_MEDIA) return 'media'
  return 'baja'
}

/**
 * La confianza de la nota entera es la del peor trozo.
 *
 * Promediar escondería justo el caso que importa: una nota clara con una
 * frase mascullada en la mitad, que es donde el transcriptor inventa. Con
 * la peor mandando, la asistente pregunta en vez de adivinar sobre lo que
 * no oyó — y quien pregunta es el código, no el modelo.
 */
export function armarTranscripcion(
  texto: string,
  crudos: readonly SegmentoCrudo[]
): Transcripcion {
  const segmentos = crudos.map((s) => ({
    texto: s.texto.trim(),
    confianza: confianzaDeSegmento(s),
  }))

  // Sin segmentos no hay nada que medir: se asume lo peor antes que fingir
  // una certeza que nadie calculó.
  const confianza: Confianza = segmentos.length === 0
    ? 'baja'
    : segmentos.some((s) => s.confianza === 'baja')
      ? 'baja'
      : segmentos.some((s) => s.confianza === 'media')
        ? 'media'
        : 'alta'

  return { texto: texto.trim(), confianza, segmentos }
}
