import 'server-only'

/**
 * El único sitio por donde se habla con la asistente.
 *
 * Vive en el servidor de Next: el token nunca se envía al navegador. Todo lo
 * que el cliente necesita mutar pasa por una route handler, que a su vez
 * llama aquí. Si esto se importara desde un componente de cliente, el build
 * falla — para eso está `server-only`.
 */

export type Respuesta<T> =
  | { ok: true; datos: T }
  | { ok: false; error: string; estado?: number }

const TIEMPO_LIMITE = 8000

export function baseConfigurada(): boolean {
  return Boolean(process.env.API_BASE && process.env.API_TOKEN)
}

export async function pedir<T>(
  ruta: string,
  init: RequestInit = {},
  limiteMs = TIEMPO_LIMITE
): Promise<Respuesta<T>> {
  const base = process.env.API_BASE
  const token = process.env.API_TOKEN
  if (!base || !token) {
    return { ok: false, error: 'La app no tiene configurado API_BASE o API_TOKEN' }
  }

  try {
    const r = await fetch(`${base.replace(/\/$/, '')}/api${ruta}`, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        ...(init.headers ?? {}),
      },
      // Una agenda que se cachea es una agenda que miente.
      cache: 'no-store',
      // Con la laptop apagada, esto se queda colgado para siempre. Ocho
      // segundos y la app dice "sin conexión", que es una respuesta.
      signal: AbortSignal.timeout(limiteMs),
    })

    if (!r.ok) {
      const cuerpo = await r.text()
      let error = `La asistente respondió ${r.status}`
      try {
        const json = JSON.parse(cuerpo) as { error?: string }
        if (json.error) error = json.error
      } catch {
        /* el cuerpo no era JSON: se queda el mensaje genérico */
      }
      return { ok: false, error, estado: r.status }
    }

    return { ok: true, datos: (await r.json()) as T }
  } catch (e) {
    const causa = e instanceof Error && e.name === 'TimeoutError'
      ? 'La asistente no contestó a tiempo'
      : 'No se pudo llegar a la asistente'
    return { ok: false, error: causa }
  }
}

export const enviar = <T>(ruta: string, cuerpo?: unknown): Promise<Respuesta<T>> =>
  pedir<T>(ruta, {
    method: 'POST',
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  })

/**
 * El audio va crudo, con su propio content-type. Transcribir tarda más que
 * leer una agenda, así que se le da más cuerda antes de darlo por perdido.
 */
export const subirAudio = <T>(
  ruta: string, datos: ArrayBuffer, tipo: string
): Promise<Respuesta<T>> =>
  pedir<T>(ruta, {
    method: 'POST',
    body: datos,
    headers: { 'content-type': tipo },
  }, 30_000)
