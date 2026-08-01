import { elegirModelos, type Eleccion, type Preferencias } from './modelos.ts'

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

/**
 * Cuando no se puede preguntar el catálogo, se le habla.
 *
 * Es una prueba **más fuerte** que listar modelos, no un consuelo: listar
 * dice que la clave vale; hablar dice que la clave vale, que el modelo
 * existe y que la ruta de completado es la correcta. Cuesta un token, y
 * ese token compra saber que el día que llegue un correo esto va a
 * funcionar.
 */
async function probarHablando(
  apiKey: string,
  url: string,
  quien: string,
  preferidos: Preferencias,
  buscar: Buscar
): Promise<Prueba & { eleccion?: Eleccion }> {
  const extractor = preferidos.extractor?.[0]
  const clasificador = preferidos.clasificador?.[0] ?? extractor
  const transcriptor = preferidos.transcriptor?.[0] ?? ''

  if (!extractor) {
    return falla(`${quien} no publica su catálogo y no sé qué modelo pedirle. `
      + 'Escribe la dirección de otro proveedor.')
  }

  return intentar(async () => {
    const r = await buscar(`${url}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(apiKey.trim() ? { authorization: `Bearer ${apiKey.trim()}` } : {}),
      },
      // Lo más corto que se puede pedir: sólo hace falta saber que contesta.
      body: JSON.stringify({
        model: extractor,
        messages: [{ role: 'user', content: 'di ok' }],
        max_tokens: 4,
      }),
    })

    if (r.status === 401 || r.status === 403) {
      return falla(`${quien} no acepta esa clave. Genera otra y vuelve a intentar.`)
    }
    if (r.status === 404) {
      // Ni catálogo ni chat: entonces sí, la dirección no es.
      return falla('Ahí no hay una API de este tipo. Revisa la dirección: suele acabar en /v1.')
    }
    if (!r.ok) {
      const cuerpo = (await r.json().catch(() => ({}))) as CatalogoGroq
      return falla(cuerpo.error?.message
        ?? `${quien} respondió ${r.status} al probar el modelo ${extractor}.`)
    }

    const eleccion: Eleccion = { clasificador: clasificador!, extractor, transcriptor, avisos: [] }
    return {
      ok: true,
      mensaje: `Contesta. Usaré ${extractor} para leer`
        + `${transcriptor ? ` y ${transcriptor} para oír` : ''}.`,
      avisos: [`${quien} no publica su catálogo, así que no puedo elegir por ti: `
        + 'uso los modelos que traigo apuntados. Si algún día retiran uno, '
        + 'esta prueba te lo va a decir.'],
      eleccion,
      guardar: {
        LLM_API_KEY: apiKey.trim(),
        LLM_BASE_URL: url,
        LLM_MODELO_CLASIFICADOR: clasificador!,
        LLM_MODELO_EXTRACTOR: extractor,
        ...(transcriptor ? { LLM_MODELO_TRANSCRIPTOR: transcriptor } : {}),
      },
    }
  }, (e) => falla(`No se pudo hablar con ${quien}: ${porque(e)}`))
}

/**
 * Preguntarle al proveedor qué modelos tiene, y elegir de esa lista.
 *
 * Sirve para cualquiera que hable la API de OpenAI, que es toda la gracia
 * de que el puerto exista. Y aquí muere el riesgo abierto nº2 del spec:
 * los identificadores de modelo no se asumen —cambian— se leen del
 * catálogo vigente en el momento de configurar.
 */
export async function probarProveedor(
  apiKey: string,
  baseUrl: string,
  opciones: { nombre?: string; preferidos?: Preferencias; buscar?: Buscar } = {}
): Promise<Prueba & { eleccion?: Eleccion }> {
  const buscar = opciones.buscar ?? fetch
  const quien = opciones.nombre ?? 'el proveedor'
  const url = baseUrl.trim().replace(/\/+$/, '')

  if (!url) return falla('Falta la dirección del proveedor.')
  // Un modelo que corre en la propia laptop no pide clave, y exigirla
  // dejaría fuera justo la opción de no mandar nada a internet.
  const esLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(url)
  if (!apiKey.trim() && !esLocal) return falla('Pega primero la clave.')

  return intentar(async () => {
    const r = await buscar(`${url}/models`, {
      headers: apiKey.trim() ? { authorization: `Bearer ${apiKey.trim()}` } : {},
    })
    const cuerpo = (await r.json().catch(() => ({}))) as CatalogoGroq

    if (r.status === 401 || r.status === 403) {
      return falla(`${quien} no acepta esa clave. Genera otra y vuelve a intentar.`)
    }
    // Hay proveedores que sencillamente no publican su catálogo: Cloudflare
    // contesta «GET not supported for requested URI» a esta misma ruta, y
    // otros devuelven 404. Que no se pueda preguntar no significa que no
    // sirva, así que en vez de rendirse se le hace la pregunta que de
    // verdad importa — ¿contestas? Y de paso eso desambigua: si el chat
    // responde, la dirección estaba bien; si tampoco, estaba mal.
    if (r.status === 404 || r.status === 405) {
      return probarHablando(apiKey, url, quien, opciones.preferidos ?? {}, buscar)
    }
    if (!r.ok) return falla(cuerpo.error?.message ?? `${quien} respondió ${r.status}`)

    const ids = (cuerpo.data ?? []).map((m) => m.id).filter((x): x is string => Boolean(x))
    if (ids.length === 0) {
      return probarHablando(apiKey, url, quien, opciones.preferidos ?? {}, buscar)
    }

    const eleccion = elegirModelos(ids, opciones.preferidos ?? {})

    const oye = eleccion.transcriptor
      ? ` y ${eleccion.transcriptor} para oír`
      : ''
    return {
      ok: true,
      mensaje: `${ids.length} modelos. Elegí ${eleccion.extractor} para leer${oye}.`,
      avisos: eleccion.avisos,
      eleccion,
      guardar: {
        LLM_API_KEY: apiKey.trim(),
        LLM_BASE_URL: url,
        LLM_MODELO_CLASIFICADOR: eleccion.clasificador,
        LLM_MODELO_EXTRACTOR: eleccion.extractor,
        // Sólo si este proveedor sabe oír. Si no, se deja lo que hubiera:
        // borrarlo dejaría muda a la asistente por cambiar de cerebro.
        ...(eleccion.transcriptor
          ? { LLM_MODELO_TRANSCRIPTOR: eleccion.transcriptor }
          : {}),
      },
    }
  }, (e) => falla(`No se pudo hablar con ${quien}: ${porque(e)}`))
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
