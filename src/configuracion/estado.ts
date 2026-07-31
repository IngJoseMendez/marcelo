/**
 * Qué falta para que la asistente pueda arrancar.
 *
 * Es código puro sobre un mapa de variables: la misma función decide si el
 * proceso arranca el servicio de verdad o el asistente de configuración, y
 * decide qué pinta cada bloque de la página. Que sea una sola evita el
 * fallo clásico de estas pantallas — decir «todo listo» y no arrancar.
 */

export type Salud = 'listo' | 'parcial' | 'pendiente'

export type IdBloque =
  | 'base' | 'groq' | 'google' | 'outlook' | 'telegram' | 'tunel' | 'app'

export interface Bloque {
  id: IdBloque
  titulo: string
  salud: Salud
  /** Lo que se enseña cuando está resuelto. Nunca un secreto entero. */
  detalle: string
  /** Las claves que faltan, para poder señalarlas. */
  falta: string[]
  /** Sin esto la asistente no arranca. */
  imprescindible: boolean
}

export interface Revision {
  bloques: Bloque[]
  /** ¿Se puede arrancar el servicio de verdad? */
  listo: boolean
  /** Qué es lo siguiente que conviene hacer. */
  siguiente: IdBloque | null
  /** Cuántas piezas imprescindibles faltan. */
  faltantes: number
}

type Env = Record<string, string | undefined>

const hay = (env: Env, clave: string): boolean => Boolean(env[clave]?.trim())

/** Un secreto se enseña por sus puntas: sirve para reconocerlo, no para usarlo. */
export function asomar(valor: string | undefined, deja = 4): string {
  const v = (valor ?? '').trim()
  if (!v) return ''
  if (v.length <= deja * 2) return '·'.repeat(v.length)
  return `${v.slice(0, deja)}…${v.slice(-deja)}`
}

function bloque(
  id: IdBloque, titulo: string, imprescindible: boolean,
  claves: string[], env: Env, detalle: (env: Env) => string
): Bloque {
  const falta = claves.filter((c) => !hay(env, c))
  const salud: Salud = falta.length === 0
    ? 'listo'
    : falta.length === claves.length ? 'pendiente' : 'parcial'
  return {
    id, titulo, salud, falta, imprescindible,
    detalle: salud === 'listo' ? detalle(env) : '',
  }
}

/** Sólo los dos que hacen falta para leer correo: la voz es aparte. */
const MODELOS = ['LLM_MODELO_CLASIFICADOR', 'LLM_MODELO_EXTRACTOR']

/**
 * Lo nuevo si está, lo viejo si no.
 *
 * Un `.env` escrito antes de que el cerebro pudiera ser otro que Groq
 * tiene que seguir arrancando: renombrar variables no puede costarle a
 * nadie una tarde de depuración.
 */
function conRespaldo(env: Env): Env {
  const pares: Array<[string, string]> = [
    ['LLM_API_KEY', 'GROQ_API_KEY'],
    ['LLM_BASE_URL', 'GROQ_BASE_URL'],
    ['LLM_MODELO_CLASIFICADOR', 'GROQ_MODELO_CLASIFICADOR'],
    ['LLM_MODELO_EXTRACTOR', 'GROQ_MODELO_EXTRACTOR'],
    ['LLM_MODELO_TRANSCRIPTOR', 'GROQ_MODELO_TRANSCRIPTOR'],
  ]
  const mezcla: Env = { ...env }
  for (const [nuevo, viejo] of pares) {
    if (!mezcla[nuevo]?.trim() && env[viejo]?.trim()) mezcla[nuevo] = env[viejo]
  }
  return mezcla
}

export function revisar(entrada: Env): Revision {
  const env = conRespaldo(entrada)
  const bloques: Bloque[] = [
    bloque('base', 'Base de datos', true, ['DATABASE_URL'], env,
      (e) => {
        // Nunca la cadena entera: lleva la contraseña dentro.
        const m = /@([^/]+)\/(\w+)/.exec(e.DATABASE_URL ?? '')
        return m ? `${m[2]} en ${m[1]}` : 'configurada'
      }),

    bloque('groq', 'El cerebro', true, MODELOS, env,
      (e) => {
        const quien = e.LLM_PROVEEDOR?.trim() || 'groq'
        const oye = (e.VOZ_MODELO || e.LLM_MODELO_TRANSCRIPTOR)?.trim()
        return `${quien} · ${e.LLM_MODELO_EXTRACTOR}${oye ? ` · oye con ${oye}` : ' · sin voz'}`
      }),

    bloque('google', 'Google (Gmail + Calendar)', false,
      ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN'], env,
      (e) => e.GOOGLE_CUENTA?.trim() || 'conectado'),

    bloque('outlook', 'Outlook', false,
      ['MS_CLIENT_ID', 'MS_CLIENT_SECRET', 'MS_REFRESH_TOKEN'], env,
      (e) => e.MS_CUENTA?.trim() || 'conectado'),

    bloque('telegram', 'Telegram', false,
      ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'], env,
      (e) => e.TELEGRAM_BOT_NOMBRE?.trim() ? `@${e.TELEGRAM_BOT_NOMBRE}` : 'emparejado'),

    bloque('tunel', 'Túnel', false, ['URL_PUBLICA'], env,
      (e) => e.URL_PUBLICA ?? ''),

    bloque('app', 'La app', false, ['API_TOKEN'], env,
      (e) => (e.APP_URL?.trim() ? e.APP_URL : `token ${asomar(e.API_TOKEN)}`)),
  ]

  const porId = new Map(bloques.map((b) => [b.id, b]))

  // Una fuente de correo, la que sea: sin ninguna no hay nada que leer y el
  // servicio antes se caía al arrancar diciéndolo por el log, donde nadie
  // mira. Ahora es una casilla más de esta pantalla.
  const hayCorreo = porId.get('google')!.salud === 'listo'
    || porId.get('outlook')!.salud === 'listo'

  const imprescindiblesListos = bloques
    .filter((b) => b.imprescindible)
    .every((b) => b.salud === 'listo')

  const faltantes = bloques.filter((b) => b.imprescindible && b.salud !== 'listo').length
    + (hayCorreo ? 0 : 1)

  const orden: IdBloque[] = ['base', 'groq', 'google', 'telegram', 'tunel', 'app', 'outlook']
  const siguiente = orden.find((id) => porId.get(id)!.salud !== 'listo') ?? null

  return {
    bloques,
    listo: imprescindiblesListos && hayCorreo,
    siguiente,
    faltantes,
  }
}

/**
 * Lo que se le puede devolver a la página para rellenar los campos.
 *
 * Los secretos NO están aquí. No por miedo a quien mira —esta página sólo
 * se abre desde la propia laptop— sino porque devolverlos obligaría a que
 * viajaran de vuelta en cada guardado, y un campo que ya está bien no
 * tiene por qué volver a pasar por ningún sitio. Lo que se guardó, se
 * queda: si el campo llega vacío, el asistente conserva lo que ya tenía.
 */
const RECORDABLES = [
  'DATABASE_URL', 'LLM_PROVEEDOR', 'LLM_BASE_URL', 'VOZ_BASE_URL', 'GOOGLE_CLIENT_ID', 'MS_CLIENT_ID', 'API_TOKEN',
  'CODIGO_ACCESO', 'SECRETO_SESION', 'RESPALDO_CLAVE', 'APP_URL', 'URL_PUBLICA', 'TUNEL_NOMBRE',
  'VERCEL_PROYECTO', 'VERCEL_GANCHO',
] as const

/** Los que existen pero no se devuelven: la página sólo dirá «ya guardado». */
const GUARDADOS = [
  'LLM_API_KEY', 'VOZ_API_KEY', 'GOOGLE_CLIENT_SECRET', 'MS_CLIENT_SECRET',
  'TELEGRAM_BOT_TOKEN', 'VERCEL_TOKEN',
] as const

export function valoresRecordados(env: Env): {
  valores: Record<string, string>
  yaGuardados: string[]
} {
  const valores: Record<string, string> = {}
  for (const clave of RECORDABLES) {
    const v = env[clave]?.trim()
    if (v) valores[clave] = v
  }
  return {
    valores,
    yaGuardados: GUARDADOS.filter((c) => Boolean(env[c]?.trim())),
  }
}

/** Para el arranque: una línea que dice qué falta, sin abrir la página. */
export function resumirFaltantes(r: Revision): string {
  const pendientes = r.bloques
    .filter((b) => b.salud !== 'listo' && (b.imprescindible || b.id === 'google' || b.id === 'outlook'))
    .map((b) => b.titulo)
  return pendientes.join(', ')
}
