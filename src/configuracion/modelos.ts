/**
 * Elegir los tres modelos a partir del catálogo vivo de Groq.
 *
 * El spec lo deja como riesgo abierto: los identificadores de modelo
 * cambian y hay que verificarlos contra el catálogo vigente en vez de
 * darlos por sentados. Aquí se resuelve de raíz — nadie escribe un
 * identificador a mano, se pide la lista y se elige de ella. Si mañana
 * Groq retira un modelo, el asistente coge el siguiente de la preferencia
 * en vez de dejar el sistema apuntando a un nombre muerto.
 */

export interface Eleccion {
  clasificador: string
  extractor: string
  transcriptor: string
  avisos: string[]
}

/** De mejor a peor. Lo primero que exista, gana. */
const PREFERIDOS = {
  // Barato y rápido: sólo tiene que decir agenda / finanzas / ruido.
  clasificador: [
    'llama-3.1-8b-instant',
    'llama-3.3-70b-versatile',
  ],
  // El que lee de verdad. Aquí no se ahorra, así que en esta lista NO entra
  // ningún modelo pequeño: si entrara, le ganaría a uno grande que sí
  // estuviera en el catálogo sólo por estar escrito antes. Lo pequeño llega
  // por el último recurso de abajo, y sólo cuando no hay otra cosa.
  extractor: [
    'llama-3.3-70b-versatile',
    'llama-3.1-70b-versatile',
  ],
  // Con el acento costeño del cliente, un modelo pequeño produjo salida
  // inservible y uno mediano inventó palabras. Sólo large.
  transcriptor: [
    'whisper-large-v3',
    'whisper-large-v3-turbo',
  ],
} as const

const esVoz = (id: string) => /whisper/i.test(id)

/** Lo que no sirve para leer un correo: guardarraíles, voz, imágenes, embeddings. */
const noEsDeTexto = (id: string) =>
  esVoz(id) || /guard|tts|moderation|embed|vision|prompt-?guard/i.test(id)

const grande = (id: string) => /\b(70|90|120|405)b\b/i.test(id)
const pequeno = (id: string) => /\b([1-9]|1[0-7])b\b/i.test(id)

function primero(disponibles: Set<string>, preferidos: readonly string[]): string | null {
  return preferidos.find((m) => disponibles.has(m)) ?? null
}

/**
 * `ids` es tal cual lo que devuelve `/models`. No se filtra por nada que no
 * esté en la respuesta: adivinar precios o tamaños desde aquí sería volver
 * a dar por sentado lo que hay que verificar.
 */
export function elegirModelos(ids: readonly string[]): Eleccion {
  const disponibles = new Set(ids)
  const avisos: string[] = []

  const deTexto = ids.filter((id) => !noEsDeTexto(id))
  const deVoz = ids.filter(esVoz)

  const extractor = primero(disponibles, PREFERIDOS.extractor)
    ?? deTexto.find(grande)
    ?? deTexto[0]
    ?? ''

  const clasificador = primero(disponibles, PREFERIDOS.clasificador)
    ?? deTexto.find(pequeno)
    // Sin uno pequeño, mejor gastar de más que no clasificar.
    ?? extractor

  const transcriptor = primero(disponibles, PREFERIDOS.transcriptor)
    ?? deVoz.find((id) => /large/i.test(id))
    ?? ''

  if (!extractor) avisos.push('Groq no ofreció ningún modelo de texto que sirva para leer correos.')
  if (!transcriptor) {
    avisos.push('No hay ningún Whisper grande en el catálogo: sin él, las notas de voz no se transcriben.')
  } else if (!/large/i.test(transcriptor)) {
    avisos.push('El único modelo de voz disponible no es «large». Con acento costeño eso inventa palabras.')
  }
  if (clasificador === extractor && extractor) {
    avisos.push('No hay un modelo pequeño para clasificar: se usará el bueno, que gasta más cuota.')
  }

  return { clasificador, extractor, transcriptor, avisos }
}
