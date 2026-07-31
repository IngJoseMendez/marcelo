/**
 * Empujar la configuración a Vercel desde la laptop.
 *
 * La app vive en Vercel para que Marcelo la use en la calle; la asistente
 * vive aquí porque aquí están sus datos. Lo único que las une son dos
 * valores en el entorno de Vercel:
 *
 *   API_BASE   la URL del túnel  →  por dónde se llega a esta laptop
 *   API_TOKEN  el mismo de aquí  →  con qué se identifica al llamar
 *
 * En Vercel no se puede escribir un archivo —su disco es de sólo lectura y
 * efímero— así que esas variables sólo entran por su API. Y como el túnel
 * rápido estrena URL en cada arranque, esto no es un paso de instalación:
 * es algo que hay que rehacer cada vez que la laptop se reinicia. Por eso
 * está automatizado en vez de documentado.
 */

export type Buscar = (url: string, init?: RequestInit) => Promise<Response>

const API = 'https://api.vercel.com'

export interface DepsVercel {
  /** Token personal de Vercel, con permiso sobre el proyecto. */
  token: string
  /** El id o el nombre del proyecto. */
  proyecto: string
  /** Sólo si el proyecto vive en un equipo y no en la cuenta personal. */
  equipo?: string
  buscar?: Buscar
}

export interface Resultado {
  ok: boolean
  mensaje: string
  puestas?: string[]
}

/** Los tres entornos: si sólo se pone producción, las vistas previas mienten. */
const DESTINOS = ['production', 'preview', 'development']

interface ErrorVercel {
  error?: { message?: string; code?: string }
}

function conEquipo(url: string, equipo?: string): string {
  if (!equipo?.trim()) return url
  return `${url}${url.includes('?') ? '&' : '?'}teamId=${encodeURIComponent(equipo.trim())}`
}

/**
 * Crea o actualiza cada variable. `upsert=true` evita el baile de
 * consultar-si-existe-y-decidir, que en una API con reintentos es donde se
 * cuelan los duplicados.
 */
export async function publicarVariables(
  d: DepsVercel,
  variables: Record<string, string>
): Promise<Resultado> {
  const buscar = d.buscar ?? fetch
  if (!d.token.trim() || !d.proyecto.trim()) {
    return { ok: false, mensaje: 'Faltan el token de Vercel o el proyecto.' }
  }

  const puestas: string[] = []
  for (const [clave, valor] of Object.entries(variables)) {
    if (!valor) continue
    try {
      const r = await buscar(
        conEquipo(
          `${API}/v10/projects/${encodeURIComponent(d.proyecto.trim())}/env?upsert=true`,
          d.equipo),
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${d.token.trim()}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            key: clave,
            value: valor,
            type: 'encrypted',
            target: DESTINOS,
          }),
        })

      if (!r.ok) {
        const cuerpo = (await r.json().catch(() => ({}))) as ErrorVercel
        if (r.status === 403) {
          return { ok: false, mensaje: 'El token de Vercel no tiene permiso sobre ese proyecto.', puestas }
        }
        if (r.status === 404) {
          return { ok: false, mensaje: `Vercel no encuentra el proyecto «${d.proyecto}».`, puestas }
        }
        return {
          ok: false,
          mensaje: cuerpo.error?.message ?? `Vercel respondió ${r.status} al poner ${clave}.`,
          puestas,
        }
      }
      puestas.push(clave)
    } catch (e) {
      return {
        ok: false,
        mensaje: `No se pudo llegar a Vercel: ${e instanceof Error ? e.message : 'sin detalle'}`,
        puestas,
      }
    }
  }

  return {
    ok: true,
    mensaje: `${puestas.length} variables puestas en Vercel.`,
    puestas,
  }
}

/**
 * Redesplegar por gancho.
 *
 * Cambiar una variable no toca el despliegue que ya está sirviendo: Vercel
 * las inyecta al desplegar. Sin este paso, el asistente diría «listo» y la
 * app seguiría apuntando al túnel de ayer. El gancho se prefiere al token
 * porque es una sola URL, no da permiso para nada más, y se pega igual.
 */
export async function redesplegar(gancho: string, buscar: Buscar = fetch): Promise<Resultado> {
  const url = gancho.trim()
  if (!url) return { ok: false, mensaje: 'Falta el gancho de despliegue.' }
  if (!url.startsWith('https://api.vercel.com/v1/integrations/deploy/')) {
    return { ok: false, mensaje: 'Eso no parece un gancho de despliegue de Vercel.' }
  }

  try {
    const r = await buscar(url, { method: 'POST' })
    return r.ok
      ? { ok: true, mensaje: 'Vercel está redesplegando la app. Tarda un minuto.' }
      : { ok: false, mensaje: `El gancho respondió ${r.status}.` }
  } catch (e) {
    return {
      ok: false,
      mensaje: `No se pudo disparar el despliegue: ${e instanceof Error ? e.message : 'sin detalle'}`,
    }
  }
}

/** Lo que la app necesita saber. Es todo lo que las une. */
export function variablesDeLaApp(env: Record<string, string | undefined>): Record<string, string> {
  return {
    API_BASE: env.URL_PUBLICA?.trim() ?? '',
    API_TOKEN: env.API_TOKEN?.trim() ?? '',
    CODIGO_ACCESO: env.CODIGO_ACCESO?.trim() ?? '',
    SECRETO_SESION: env.SECRETO_SESION?.trim() ?? '',
  }
}
