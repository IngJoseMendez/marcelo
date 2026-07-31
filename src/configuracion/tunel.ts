import { spawn, type ChildProcess } from 'node:child_process'

/**
 * El túnel: la única forma de que la app en Vercel llegue a esta laptop.
 *
 * La app vive en internet para que Marcelo la use en la calle, y la
 * asistente vive aquí porque aquí están los datos. Sin IP pública no hay
 * manera de que la primera llame a la segunda, así que `cloudflared` abre
 * una conexión de SALIDA y Cloudflare le presta una URL https. No se abre
 * ningún puerto de la casa.
 */

/** Lo que imprime un túnel rápido, entre un montón de ruido. */
const URL_RAPIDA = /https:\/\/[a-z0-9][a-z0-9-]*\.trycloudflare\.com/i

export function urlEnSalida(texto: string): string | null {
  return URL_RAPIDA.exec(texto)?.[0] ?? null
}

export interface Tunel {
  url: string
  /** `true` si la URL cambia en cada arranque. */
  efimera: boolean
  detener(): void
}

export interface OpcionesTunel {
  puertoLocal: number
  /** Ruta a cloudflared. Vacío = se busca en el PATH. */
  ejecutable?: string
  /** Un túnel con nombre ya creado: entonces la URL es fija y es la suya. */
  nombre?: string
  urlFija?: string
  esperaMs?: number
  alSalir?: (codigo: number | null) => void
}

/**
 * Levanta el túnel y espera a que diga su URL.
 *
 * El túnel rápido no pide cuenta ni dominio y sirve para arrancar hoy,
 * pero **la URL cambia cada vez que se reinicia**, y eso deja a la app en
 * Vercel apuntando a un sitio que ya no existe. Por eso se devuelve
 * `efimera`: quien llama tiene que decidir qué hacer con eso, y lo que
 * hace el asistente es volver a publicarla en Vercel.
 */
export function abrirTunel(o: OpcionesTunel): Promise<Tunel> {
  const ejecutable = o.ejecutable?.trim() || 'cloudflared'
  const espera = o.esperaMs ?? 40_000

  const argumentos = o.nombre?.trim()
    ? ['tunnel', '--no-autoupdate', 'run', o.nombre.trim()]
    : ['tunnel', '--no-autoupdate', '--url', `http://localhost:${o.puertoLocal}`]

  return new Promise<Tunel>((cumplir, fallar) => {
    let proceso: ChildProcess
    try {
      proceso = spawn(ejecutable, argumentos, { stdio: ['ignore', 'pipe', 'pipe'] })
    } catch {
      fallar(new Error('No encontré cloudflared. Instálalo y vuelve a intentar.'))
      return
    }

    let resuelto = false
    const detener = () => { proceso.kill() }

    const reloj = setTimeout(() => {
      if (resuelto) return
      resuelto = true
      detener()
      fallar(new Error('cloudflared no dijo ninguna URL a tiempo.'))
    }, espera)

    const terminar = (url: string, efimera: boolean) => {
      if (resuelto) return
      resuelto = true
      clearTimeout(reloj)
      cumplir({ url, efimera, detener })
    }

    // Con túnel nombrado no hay URL que descubrir: es la que él configuró
    // en Cloudflare. Se le da un momento a que levante y se da por buena.
    if (o.nombre?.trim() && o.urlFija?.trim()) {
      setTimeout(() => terminar(o.urlFija!.trim(), false), 2500)
    }

    // cloudflared escribe la URL por stderr, no por stdout.
    const mirar = (trozo: Buffer) => {
      const url = urlEnSalida(trozo.toString())
      if (url) terminar(url, true)
    }
    proceso.stdout?.on('data', mirar)
    proceso.stderr?.on('data', mirar)

    proceso.on('error', (e) => {
      if (resuelto) return
      resuelto = true
      clearTimeout(reloj)
      fallar(new Error(
        /ENOENT/.test(String(e))
          ? 'No encontré cloudflared. Instálalo y vuelve a intentar.'
          : String(e)))
    })

    proceso.on('exit', (codigo) => {
      o.alSalir?.(codigo)
      if (resuelto) return
      resuelto = true
      clearTimeout(reloj)
      fallar(new Error(`cloudflared se cerró con código ${codigo}.`))
    })
  })
}
