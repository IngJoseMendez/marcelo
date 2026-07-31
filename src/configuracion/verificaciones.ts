import { elegirModelos, type Eleccion } from './modelos.ts'

/**
 * Probar cada credencial en el momento de pegarla.
 *
 * Una pantalla de configuración que sólo guarda lo que le escriben no
 * quita el trabajo: lo aplaza hasta que algo falla de noche, en un log que
 * nadie lee. Aquí cada bloque se prueba contra el servicio de verdad y lo
 * que devuelve la prueba es lo que se guarda — los modelos de Groq y el
 * chat de Telegram no se escriben a mano, salen de la respuesta.
 */

export type Buscar = (url: string, init?: RequestInit) => Promise<Response>

export interface Prueba {
  ok: boolean
  mensaje: string
  /** Lo que hay que guardar en el .env si salió bien. */
  guardar?: Record<string, string>
  avisos?: string[]
}

const falla = (mensaje: string): Prueba => ({ ok: false, mensaje })

/** Un error de red no puede tumbar la página que sirve para arreglar la red. */
async function intentar<T>(fn: () => Promise<T>, alFallar: (e: unknown) => T): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    return alFallar(e)
  }
}

/**
 * Sacarle a un error algo que se pueda enseñar.
 *
 * `localhost` resuelve a IPv6 y a IPv4, así que cuando no hay nadie
 * escuchando Node intenta las dos y lanza un `AggregateError` cuyo
 * `message` está **vacío**. Sin desenvolverlo, el fallo más común del
 * primer arranque —Docker sin levantar— se enseñaba como una caja de
 * error en blanco.
 */
function porque(e: unknown): string {
  if (e instanceof AggregateError) {
    const dentro = e.errors
      .map((x) => (x instanceof Error ? x.message : String(x)))
      .filter(Boolean)
    if (dentro.length > 0) return dentro.join(' · ')
  }
  if (e instanceof Error && e.message) return e.message
  const codigo = (e as { code?: string } | null)?.code
  return codigo || 'no se pudo llegar'
}

// ── Groq ──────────────────────────────────────────────────────

interface CatalogoGroq {
  data?: Array<{ id?: string }>
  error?: { message?: string }
}

export async function probarGroq(
  apiKey: string,
  baseUrl: string,
  buscar: Buscar = fetch
): Promise<Prueba & { eleccion?: Eleccion }> {
  if (!apiKey.trim()) return falla('Pega primero la clave.')

  return intentar(async () => {
    const r = await buscar(`${baseUrl.replace(/\/+$/, '')}/models`, {
      headers: { authorization: `Bearer ${apiKey.trim()}` },
    })
    const cuerpo = (await r.json().catch(() => ({}))) as CatalogoGroq

    if (r.status === 401) return falla('Esa clave no vale. Genera otra en console.groq.com.')
    if (!r.ok) return falla(cuerpo.error?.message ?? `Groq respondió ${r.status}`)

    const ids = (cuerpo.data ?? []).map((m) => m.id).filter((x): x is string => Boolean(x))
    if (ids.length === 0) return falla('Groq no devolvió ningún modelo.')

    // Aquí muere el riesgo abierto nº2 del spec: los identificadores no se
    // asumen, se leen del catálogo vigente y se eligen de ahí.
    const eleccion = elegirModelos(ids)

    return {
      ok: true,
      mensaje: `${ids.length} modelos. Elegí ${eleccion.extractor} para leer y ${eleccion.transcriptor} para oír.`,
      avisos: eleccion.avisos,
      eleccion,
      guardar: {
        GROQ_API_KEY: apiKey.trim(),
        GROQ_BASE_URL: baseUrl.replace(/\/+$/, ''),
        GROQ_MODELO_CLASIFICADOR: eleccion.clasificador,
        GROQ_MODELO_EXTRACTOR: eleccion.extractor,
        GROQ_MODELO_TRANSCRIPTOR: eleccion.transcriptor,
      },
    }
  }, (e) => falla(`No se pudo hablar con Groq: ${porque(e)}`))
}

// ── Telegram ──────────────────────────────────────────────────

interface RespuestaTelegram<T> {
  ok?: boolean
  result?: T
  description?: string
}

interface Actualizacion {
  update_id: number
  message?: { chat?: { id?: number; first_name?: string; username?: string } }
}

const API_TELEGRAM = 'https://api.telegram.org'

export async function probarTelegram(
  token: string,
  buscar: Buscar = fetch
): Promise<Prueba> {
  if (!token.trim()) return falla('Pega primero el token que te dio @BotFather.')

  return intentar(async () => {
    const r = await buscar(`${API_TELEGRAM}/bot${token.trim()}/getMe`)
    const cuerpo = (await r.json().catch(() => ({}))) as RespuestaTelegram<{ username?: string }>

    if (!r.ok || !cuerpo.ok) {
      return falla(cuerpo.description ?? 'Ese token no vale. Pídele otro a @BotFather.')
    }
    const usuario = cuerpo.result?.username ?? ''
    return {
      ok: true,
      mensaje: `Es @${usuario}. Ahora escríbele algo desde tu teléfono.`,
      guardar: { TELEGRAM_BOT_TOKEN: token.trim(), TELEGRAM_BOT_NOMBRE: usuario },
    }
  }, (e) => falla(`No se pudo hablar con Telegram: ${porque(e)}`))
}

/**
 * Esperar a que él le escriba, y quedarse con el número del chat.
 *
 * Es el dato que en toda guía se busca a mano abriendo una URL rara con el
 * token dentro. Aquí no: el bot ya sabe escuchar, así que basta con
 * escucharlo una vez.
 */
export async function esperarChat(
  token: string,
  buscar: Buscar = fetch,
  segundos = 25
): Promise<Prueba> {
  return intentar(async () => {
    const r = await buscar(
      `${API_TELEGRAM}/bot${token.trim()}/getUpdates?timeout=${segundos}&limit=1&allowed_updates=["message"]`)
    const cuerpo = (await r.json().catch(() => ({}))) as RespuestaTelegram<Actualizacion[]>

    if (!r.ok || !cuerpo.ok) return falla(cuerpo.description ?? 'Telegram no contestó.')

    const chat = cuerpo.result?.[0]?.message?.chat
    if (!chat?.id) return falla('Todavía no me has escrito. Mándale cualquier cosa al bot.')

    const quien = chat.first_name ?? chat.username ?? 'ti'
    return {
      ok: true,
      mensaje: `Listo, ya sé quién eres: ${quien}.`,
      guardar: { TELEGRAM_CHAT_ID: String(chat.id) },
    }
  }, (e) => falla(`No se pudo escuchar a Telegram: ${porque(e)}`))
}

// ── Base de datos ─────────────────────────────────────────────

export type Conectar = (url: string) => Promise<void>

export async function probarBase(url: string, conectar: Conectar): Promise<Prueba> {
  if (!url.trim()) return falla('Falta la cadena de conexión.')
  if (!/^postgres(ql)?:\/\//.test(url.trim())) {
    return falla('Tiene que empezar por postgres://')
  }

  return intentar<Prueba>(async () => {
    await conectar(url.trim())
    return {
      ok: true,
      mensaje: 'Conectada. Las tablas se crean solas al arrancar.',
      guardar: { DATABASE_URL: url.trim() },
    }
  }, (e) => {
    const causa = porque(e)
    // El fallo más común de todos, y el más fácil de decir en cristiano.
    if (/ECONNREFUSED/i.test(causa)) {
      return falla('Ahí no hay nadie escuchando. ¿Levantaste Docker con `docker compose up -d`?')
    }
    if (/password|autenti/i.test(causa)) return falla('La contraseña no cuadra.')
    return falla(causa)
  })
}
