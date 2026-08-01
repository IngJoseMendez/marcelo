import { abrirTunel, type OpcionesTunel, type Tunel } from './tunel.ts'
import { leerVariable, publicarVariables, redesplegar } from './vercel.ts'

/**
 * Mantener viva la dirección por la que la app alcanza esta laptop.
 *
 * El túnel gratuito estrena dirección **cada vez que arranca**, así que
 * tras un apagón la app en Vercel queda llamando a un sitio que ya no
 * existe. Eso convertiría cada corte de luz en una visita del ingeniero,
 * que es justo lo que este proyecto no puede permitirse: la asistente vive
 * en la laptop de Marcelo y él no tiene por qué saber qué es un túnel.
 *
 * Así que el enlace se rehace solo al arrancar y se vuelve a publicar en
 * Vercel — pero **sólo si la dirección cambió**. Redesplegar en cada
 * arranque por costumbre dejaría la app caída un minuto cada vez sin que
 * hiciera falta.
 */

export interface Registro {
  info(objeto: object, mensaje?: string): void
  warn(objeto: object, mensaje?: string): void
  error(objeto: object, mensaje?: string): void
}

export interface DepsEnlace {
  puertoLocal: number
  /** La que quedó guardada la última vez. */
  urlConocida: string
  nombre?: string
  ejecutable?: string
  vercel?: { token: string; proyecto: string; gancho: string }
  /** Qué hacer con la dirección nueva: guardarla en el .env. */
  guardar: (url: string) => Promise<void>
  registro?: Registro
  /** Inyectables para poder probar esto sin red ni cloudflared. */
  abrir?: (o: OpcionesTunel) => Promise<Tunel>
  publicar?: typeof publicarVariables
  desplegar?: typeof redesplegar
  leer?: typeof leerVariable
}

export interface Resultado {
  url: string
  /** La dirección es otra que la de antes. */
  cambio: boolean
  /** Se le contó a Vercel. */
  publicado: boolean
  motivo?: string
}

/** Tras un corte, cloudflared puede tardar en poder salir. */
const ESPERAS_MS = [5_000, 15_000, 60_000, 300_000]

export function crearEnlacePublico(d: DepsEnlace) {
  const abrir = d.abrir ?? abrirTunel
  const publicar = d.publicar ?? publicarVariables
  const desplegar = d.desplegar ?? redesplegar
  const leer = d.leer ?? leerVariable

  let tunel: Tunel | null = null
  let vivo = true
  let intentos = 0

  async function contarleAVercel(url: string): Promise<Resultado> {
    const v = d.vercel
    if (!v?.token || !v.proyecto) {
      return {
        url, cambio: true, publicado: false,
        motivo: 'sin credenciales de Vercel: la app sigue apuntando a la dirección vieja',
      }
    }

    const puesta = await publicar(
      { token: v.token, proyecto: v.proyecto }, { API_BASE: url })
    if (!puesta.ok) return { url, cambio: true, publicado: false, motivo: puesta.mensaje }

    if (!v.gancho) {
      return {
        url, cambio: true, publicado: false,
        // Es la trampa clásica: las variables entran, pero Vercel sólo las
        // inyecta al desplegar. Sin gancho, la app sigue con las de ayer.
        motivo: 'variables puestas, pero sin gancho de despliegue no se aplican',
      }
    }

    const despliegue = await desplegar(v.gancho)
    return { url, cambio: true, publicado: despliegue.ok, motivo: despliegue.mensaje }
  }

  async function levantar(): Promise<Resultado> {
    tunel = await abrir({
      puertoLocal: d.puertoLocal,
      nombre: d.nombre,
      urlFija: d.urlConocida,
      ejecutable: d.ejecutable,
      alSalir: (codigo) => {
        if (!vivo) return
        d.registro?.warn({ codigo }, 'el túnel se cayó; lo vuelvo a levantar')
        void reintentar()
      },
    })

    const url = tunel.url
    if (url === d.urlConocida) {
      // Túnel con nombre, o suerte: la dirección es la de siempre. Pero
      // «no cambió» no quiere decir «Vercel la sabe»: si el túnel se abrió
      // antes de poner el token de Vercel —el orden en que uno rellena esa
      // pantalla— allá no llegó nunca, y saltarse la publicación aquí la
      // dejaría sin llegar para siempre. Una consulta barata lo zanja.
      const puesta = await leer(
        { token: d.vercel?.token ?? '', proyecto: d.vercel?.proyecto ?? '' }, 'API_BASE')
      if (puesta !== null && puesta.replace(/\/+$/, '') === url.replace(/\/+$/, '')) {
        return { url, cambio: false, publicado: false }
      }
      if (puesta === null && !d.vercel?.token) {
        return { url, cambio: false, publicado: false }
      }
      d.registro?.warn({ url, enVercel: puesta },
        'la dirección no cambió, pero Vercel no la tenía: se la cuento')
      return { ...(await contarleAVercel(url)), cambio: false }
    }

    await d.guardar(url)
    d.urlConocida = url
    return contarleAVercel(url)
  }

  async function reintentar(): Promise<void> {
    if (!vivo) return
    const espera = ESPERAS_MS[Math.min(intentos, ESPERAS_MS.length - 1)]!
    intentos++
    await new Promise((r) => setTimeout(r, espera))
    if (!vivo) return
    try {
      const r = await levantar()
      intentos = 0
      d.registro?.info({ url: r.url, publicado: r.publicado }, 'túnel de vuelta')
    } catch (e) {
      d.registro?.error({ err: e, intentos }, 'no se pudo levantar el túnel')
      void reintentar()
    }
  }

  return {
    async encender(): Promise<Resultado> {
      const r = await levantar()
      intentos = 0
      return r
    },

    /**
     * La dirección de AHORA.
     *
     * Hace falta porque el túnel se rehace solo y la del `.env` puede ser
     * de hace dos arranques. Es lo que contesta «/enlace» por Telegram —el
     * único canal que sigue vivo justo cuando la app no funciona— y sin
     * ella no hay forma de que él averigüe qué poner en Vercel.
     */
    url(): string {
      return tunel?.url ?? d.urlConocida
    },

    detener(): void {
      vivo = false
      tunel?.detener()
    },
  }
}
