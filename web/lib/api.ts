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

/**
 * A dónde está llamando esta app, ahora mismo.
 *
 * Se enseña en la pantalla de error a propósito. Sin esto, «no contesta»
 * es indistinguible de «Vercel guardó las variables pero está sirviendo un
 * despliegue viejo con la dirección de antes» — que es el caso más común y
 * el más difícil de ver, porque en el panel de Vercel la variable se ve
 * correcta. Enseñar la dirección que REALMENTE se usó convierte eso en un
 * vistazo: si no es la de ahora, falta redesplegar.
 */
export function aDondeLlama(): { base: string; hayToken: boolean } {
  return {
    base: process.env.API_BASE ?? '',
    hayToken: Boolean(process.env.API_TOKEN),
  }
}

export async function pedir<T>(
  ruta: string,
  init: RequestInit = {},
  limiteMs = TIEMPO_LIMITE
): Promise<Respuesta<T>> {
  const base = process.env.API_BASE
  const token = process.env.API_TOKEN
  if (!base || !token) {
    // Cuál de las dos falta, no «una de las dos»: son dos arreglos
    // distintos y quien lo lee está delante del panel de Vercel.
    const falta = !base && !token ? 'API_BASE ni API_TOKEN' : !base ? 'API_BASE' : 'API_TOKEN'
    return { ok: false, error: `Vercel no tiene ${falta}` }
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
    // Con la dirección dentro del mensaje. Es la diferencia entre «no
    // contesta» —que no dice nada— y ver con los ojos que está llamando a
    // un túnel de hace tres arranques.
    const causa = e instanceof Error && e.name === 'TimeoutError'
      ? 'no contestó en 8 segundos'
      : 'no se pudo abrir la conexión'
    return { ok: false, error: `Llamé a ${base.replace(/\/$/, '')} y ${causa}` }
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
