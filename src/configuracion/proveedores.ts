/**
 * De dónde sale el cerebro.
 *
 * El spec ya lo dejaba abierto: el proveedor habla la misma API que
 * OpenAI, así que cambiarlo es una variable de entorno y no un refactor.
 * Esto sólo lo saca a la superficie — un desplegable en vez de un párrafo
 * de documentación que nadie lee.
 *
 * **Este catálogo es una comodidad, no una verdad.** Las direcciones y los
 * modelos cambian; por eso el asistente pregunta al endpoint qué modelos
 * tiene y elige de esa lista. Si mañana una de estas URL deja de valer, la
 * prueba lo dice al segundo y el campo se puede corregir a mano.
 */

export interface Proveedor {
  id: string
  nombre: string
  /** Vacío = lo escribe el usuario. */
  baseUrl: string
  /** Dónde se saca la clave. */
  donde: string
  precio: 'gratis' | 'gratis-con-limite' | 'pago' | 'local'
  /** ¿Sabe transcribir audio por el mismo sitio? */
  voz: boolean
  /** Lo que hay que saber antes de elegirlo, sin adornos. */
  nota: string
  /** Preferencias por papel. Si no encaja ninguna, manda la heurística. */
  preferidos?: { clasificador?: string[]; extractor?: string[]; transcriptor?: string[] }
}

export const PROVEEDORES: readonly Proveedor[] = [
  {
    id: 'groq',
    nombre: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    donde: 'https://console.groq.com/keys',
    precio: 'gratis-con-limite',
    voz: true,
    nota: 'Lo que trae puesto. Gratis con límites amplios, rapidísimo, y el único '
      + 'de la lista que además transcribe voz gratis con Whisper grande. '
      + 'Activa Zero Data Retention en Data Controls.',
    preferidos: {
      clasificador: ['llama-3.1-8b-instant'],
      extractor: ['llama-3.3-70b-versatile', 'llama-3.1-70b-versatile'],
      transcriptor: ['whisper-large-v3', 'whisper-large-v3-turbo'],
    },
  },
  {
    id: 'openai',
    nombre: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    donde: 'https://platform.openai.com/api-keys',
    precio: 'pago',
    voz: true,
    nota: 'Se paga por uso, sin capa gratuita. Entiende muy bien y transcribe por '
      + 'el mismo sitio. Con este volumen —unas 30 llamadas al día— el gasto es '
      + 'de pocos dólares al mes.',
    preferidos: {
      clasificador: ['gpt-4o-mini', 'gpt-4.1-mini'],
      extractor: ['gpt-4o', 'gpt-4.1'],
      transcriptor: ['whisper-1'],
    },
  },
  {
    id: 'openrouter',
    nombre: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    donde: 'https://openrouter.ai/keys',
    precio: 'gratis-con-limite',
    voz: false,
    nota: 'Una sola clave para modelos de casi todos. Tiene modelos gratuitos '
      + '(los que acaban en «:free») y de pago en la misma cuenta. No transcribe: '
      + 'para la voz habría que dejar Groq.',
  },
  {
    id: 'gemini',
    nombre: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    donde: 'https://aistudio.google.com/apikey',
    precio: 'gratis-con-limite',
    voz: false,
    nota: 'Capa gratuita generosa y modelos buenos leyendo texto largo. Ojo: '
      + 'en el plan gratuito Google puede usar lo que le mandes para mejorar sus '
      + 'modelos, y aquí se le mandan correos de una persona real.',
  },
  {
    id: 'deepseek',
    nombre: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    donde: 'https://platform.deepseek.com/api_keys',
    precio: 'pago',
    voz: false,
    nota: 'De lo más barato que hay por lo que entiende. Los servidores están en '
      + 'China, cosa que conviene saber antes de mandarle el correo de alguien.',
  },
  {
    id: 'cerebras',
    nombre: 'Cerebras',
    baseUrl: 'https://api.cerebras.ai/v1',
    donde: 'https://cloud.cerebras.ai',
    precio: 'gratis-con-limite',
    voz: false,
    nota: 'Muy rápido y con capa gratuita. Catálogo corto: casi todo Llama.',
  },
  {
    id: 'ollama',
    nombre: 'Ollama (en esta laptop)',
    baseUrl: 'http://localhost:11434/v1',
    donde: 'https://ollama.com/download',
    precio: 'local',
    voz: false,
    nota: 'No sale nada de la casa y no cuesta un peso. Pero el spec lo descartó '
      + 'con razón: con 4 GB de vídeo el techo son modelos de ~4B, y ahí es justo '
      + 'donde la extracción empieza a inventar. Sirve para probar, no para confiar.',
  },
  {
    id: 'lmstudio',
    nombre: 'LM Studio (en esta laptop)',
    baseUrl: 'http://localhost:1234/v1',
    donde: 'https://lmstudio.ai',
    precio: 'local',
    voz: false,
    nota: 'Lo mismo que Ollama pero con ventanas. Mismo techo y misma advertencia.',
  },
  {
    id: 'personalizado',
    nombre: 'Otro (escribo la dirección)',
    baseUrl: '',
    donde: '',
    precio: 'pago',
    voz: false,
    nota: 'Cualquier servicio que hable la API de OpenAI. Pega su dirección base '
      + '—la que termina en /v1— y su clave. Yo le pregunto qué modelos tiene.',
  },
]

export const proveedorPorId = (id: string): Proveedor | undefined =>
  PROVEEDORES.find((p) => p.id === id)

/** El de siempre, si no dicen otra cosa. */
export const POR_DEFECTO = 'groq'

/**
 * La dirección con la que hay que hablarle.
 *
 * Lo que el usuario escribió manda sobre el catálogo: si una de estas URL
 * envejece, se corrige en el campo sin tocar código.
 */
export function urlDe(id: string, escrita: string): string {
  const limpia = escrita.trim().replace(/\/+$/, '')
  if (limpia) return limpia
  return proveedorPorId(id)?.baseUrl ?? ''
}

/** Para pintarlo sin que nadie tenga que interpretar un enum. */
export function precioEnPalabras(p: Proveedor): string {
  if (p.precio === 'gratis') return 'gratis'
  if (p.precio === 'gratis-con-limite') return 'gratis, con límites'
  if (p.precio === 'local') return 'en tu máquina, sin costo'
  return 'de pago'
}
