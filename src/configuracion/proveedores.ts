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
  /**
   * Los pasos para sacar la clave, en orden y con lo que hay que clicar.
   *
   * Viven aquí y no en la página porque cambian con el proveedor, no con
   * el diseño: quien elige DeepSeek no tiene por qué leer los de Google.
   * Admiten <a> y <b>: los pinta la propia guía.
   */
  pasos?: string[]
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
    pasos: [
      "Entra a <a class=\"fuera\" href=\"https://console.groq.com/keys\" target=\"_blank\" rel=\"noreferrer\">console.groq.com/keys</a> y crea la cuenta.",
      "Botón <b>Create API Key</b>. <b>Cópiala en ese momento</b>: no la vuelve a mostrar.",
      "Ve a <a class=\"fuera\" href=\"https://console.groq.com/settings/data-controls\" target=\"_blank\" rel=\"noreferrer\">Settings → Data Controls</a> y activa <b>Zero Data Retention</b>. No es opcional: aquí le mandas correos de una persona real.",
      "<b>Si el registro no te deja entrar</b> —pantalla en blanco o se queda cargando— no insistas: elige <b>OpenRouter</b> arriba y sigue con eso.",
    ],
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
    pasos: [
      "Entra a <a class=\"fuera\" href=\"https://platform.openai.com/api-keys\" target=\"_blank\" rel=\"noreferrer\">platform.openai.com/api-keys</a>.",
      "<b>Create new secret key</b> → cópiala en ese momento.",
      "En <b>Billing</b> hay que cargar saldo: no tiene capa gratuita. Con tu volumen —unas 30 llamadas al día— son pocos dólares al mes.",
      "Es el único de pago que además transcribe voz por el mismo sitio, así que con éste no hace falta tocar «El oído».",
    ],
  },
  {
    id: 'cloudflare',
    nombre: 'Cloudflare Workers AI',
    // Lleva el id de cuenta dentro, así que hay que editarla. Se deja el
    // hueco a la vista en vez de un campo vacío: así se ve qué falta.
    baseUrl: 'https://api.cloudflare.com/client/v4/accounts/TU_ID_DE_CUENTA/ai/v1',
    donde: 'https://dash.cloudflare.com/profile/api-tokens',
    precio: 'gratis-con-limite',
    voz: true,
    nota: 'La mejor alternativa si Groq no te deja entrar: **ya tienes cuenta de '
      + 'Cloudflare** por el túnel. Capa gratuita diaria, y trae Whisper grande. '
      + 'No publica su catálogo de modelos —lo comprobé—, así que en vez de '
      + 'elegir por ti pruebo hablándole y uso los que traigo apuntados. '
      + 'Cambia TU_ID_DE_CUENTA por el id que sale en el panel (Workers & Pages → '
      + 'a la derecha, «Account ID»), y crea un token con permiso de Workers AI.',
    preferidos: {
      transcriptor: ['@cf/openai/whisper-large-v3-turbo', '@cf/openai/whisper'],
      extractor: ['@cf/meta/llama-3.3-70b-instruct-fp8-fast', '@cf/meta/llama-3.1-70b-instruct'],
      clasificador: ['@cf/meta/llama-3.1-8b-instruct-fast', '@cf/meta/llama-3.1-8b-instruct'],
    },
    pasos: [
      "Entra a <a class=\"fuera\" href=\"https://dash.cloudflare.com\" target=\"_blank\" rel=\"noreferrer\">dash.cloudflare.com</a>. Si vas a usar el túnel, ya vas a tener esta cuenta.",
      "En el menú de la izquierda, <b>Workers &amp; Pages</b>. A la derecha de la pantalla sale <b>Account ID</b>: cópialo.",
      "Pega ese id en la dirección de abajo, donde dice <span class=\"mono\">TU_ID_DE_CUENTA</span>.",
      "Arriba a la derecha, tu perfil → <a class=\"fuera\" href=\"https://dash.cloudflare.com/profile/api-tokens\" target=\"_blank\" rel=\"noreferrer\">API Tokens</a> → <b>Create Token</b> → plantilla <b>Workers AI</b>. Si no la ves, usa <b>Custom token</b> con el permiso <span class=\"mono\">Workers AI · Read</span>.",
      "Cópialo y pégalo abajo. <b>Ojo:</b> Cloudflare no publica su lista de modelos —lo comprobé—, así que en vez de elegir por ti le hablo para ver si contesta, y uso los que traigo apuntados.",
    ],
  },
  {
    id: 'huggingface',
    nombre: 'Hugging Face',
    baseUrl: 'https://router.huggingface.co/v1',
    donde: 'https://huggingface.co/settings/tokens',
    precio: 'gratis-con-limite',
    voz: false,
    nota: 'Se entra con correo y contraseña, sin depender de Google ni GitHub — '
      + 'útil si otros no te dejan registrarte. Capa gratuita pequeña, y el '
      + 'catálogo cambia seguido. Dale a Probar y te digo qué hay hoy.',
    pasos: [
      "Entra a <a class=\"fuera\" href=\"https://huggingface.co/join\" target=\"_blank\" rel=\"noreferrer\">huggingface.co</a> y regístrate con <b>correo y contraseña</b>. Es la opción si otros no te dejan crear cuenta.",
      "<a class=\"fuera\" href=\"https://huggingface.co/settings/tokens\" target=\"_blank\" rel=\"noreferrer\">Settings → Access Tokens</a> → <b>New token</b>, tipo <b>Read</b>.",
      "Cópialo y dale a Probar. El catálogo cambia seguido, así que te digo qué hay hoy.",
    ],
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
    pasos: [
      "Entra a <a class=\"fuera\" href=\"https://openrouter.ai\" target=\"_blank\" rel=\"noreferrer\">openrouter.ai</a> → <b>Sign up</b>. Se puede con correo y contraseña, sin depender de Google ni GitHub.",
      "Ve a <a class=\"fuera\" href=\"https://openrouter.ai/keys\" target=\"_blank\" rel=\"noreferrer\">openrouter.ai/keys</a> → <b>Create Key</b>. Ponle cualquier nombre.",
      "Cópiala y pégala abajo. Dale a <b>Probar</b>: yo miro qué modelos hay y elijo.",
      "Los modelos que terminan en <span class=\"mono\">:free</span> no cuestan nada. Si algún día quieres uno de pago, se cargan créditos en la misma cuenta.",
      "<b>No transcribe voz.</b> Para las notas de voz, abre abajo «El oído» y pon Cloudflare o Groq.",
    ],
  },
  {
    id: 'gemini',
    nombre: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    donde: 'https://aistudio.google.com/apikey',
    precio: 'gratis-con-limite',
    voz: false,
    nota: 'Capa gratuita generosa. AVISO: no pude verificar esta dirección sin '
      + 'una clave, así que si Probar falla, la de bueno es la que salga en '
      + 'ai.google.dev/gemini-api/docs/openai. Ojo también: '
      + 'en el plan gratuito Google puede usar lo que le mandes para mejorar sus '
      + 'modelos, y aquí se le mandan correos de una persona real.',
    pasos: [
      "Entra a <a class=\"fuera\" href=\"https://aistudio.google.com/apikey\" target=\"_blank\" rel=\"noreferrer\">aistudio.google.com/apikey</a> → <b>Create API key</b>.",
      "Cópiala y pégala abajo.",
      "<b>Si Probar falla</b>, la dirección cambió: la buena está en <a class=\"fuera\" href=\"https://ai.google.dev/gemini-api/docs/openai\" target=\"_blank\" rel=\"noreferrer\">su documentación</a>, y la pegas en el campo de la dirección.",
      "<b>Piénsalo antes:</b> en el plan gratuito Google puede usar lo que le mandes para mejorar sus modelos, y aquí se le mandan los correos de Marcelo.",
    ],
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
    pasos: [
      "Entra a <a class=\"fuera\" href=\"https://platform.deepseek.com/api_keys\" target=\"_blank\" rel=\"noreferrer\">platform.deepseek.com</a> → <b>API keys</b> → crear.",
      "Hay que cargar saldo, pero es de lo más barato que existe por lo que entiende.",
      "<b>Ten en cuenta:</b> los servidores están en China. Aquí se le mandan los correos de una persona real.",
    ],
  },
  {
    id: 'cerebras',
    nombre: 'Cerebras',
    baseUrl: 'https://api.cerebras.ai/v1',
    donde: 'https://cloud.cerebras.ai',
    precio: 'gratis-con-limite',
    voz: false,
    nota: 'Muy rápido y con capa gratuita. Catálogo corto: casi todo Llama.',
    pasos: [
      "Entra a <a class=\"fuera\" href=\"https://cloud.cerebras.ai\" target=\"_blank\" rel=\"noreferrer\">cloud.cerebras.ai</a> y crea la cuenta.",
      "En <b>API Keys</b>, genera una y cópiala.",
      "Es rapidísimo y tiene capa gratuita, pero el catálogo es corto: casi todo Llama. No transcribe voz.",
    ],
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
    pasos: [
      "Instala <a class=\"fuera\" href=\"https://ollama.com/download\" target=\"_blank\" rel=\"noreferrer\">Ollama</a> en esta misma laptop.",
      "En una terminal: <span class=\"mono\">ollama pull llama3.1</span> y espera a que baje.",
      "Deja el campo de la clave <b>vacío</b>: lo que corre en tu máquina no pide ninguna.",
      "<b>Lee esto antes:</b> con 4 GB de vídeo el techo son modelos de unos 4B, y ahí es justo donde la extracción empieza a inventar fechas. Sirve para probar sin mandar nada afuera, no para confiarle la agenda.",
    ],
  },
  {
    id: 'lmstudio',
    nombre: 'LM Studio (en esta laptop)',
    baseUrl: 'http://localhost:1234/v1',
    donde: 'https://lmstudio.ai',
    precio: 'local',
    voz: false,
    nota: 'Lo mismo que Ollama pero con ventanas. Mismo techo y misma advertencia.',
    pasos: [
      "Instala <a class=\"fuera\" href=\"https://lmstudio.ai\" target=\"_blank\" rel=\"noreferrer\">LM Studio</a> y baja un modelo desde su buscador.",
      "En la pestaña <b>Developer</b>, arranca el servidor local.",
      "Deja la clave vacía. Misma advertencia que con Ollama: el techo de esta máquina es donde la extracción empieza a fallar.",
    ],
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
    pasos: [
      "Pega la dirección base del servicio: casi siempre termina en <span class=\"mono\">/v1</span>.",
      "Pega su clave, o déjala vacía si corre en esta máquina.",
      "Dale a Probar. Si publica su catálogo, elijo los modelos yo; si no, le hablo para ver si contesta.",
    ],
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
