import { gzipSync, gunzipSync } from 'node:zlib'
import { spawn } from 'node:child_process'
import { mkdir, readdir, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DateTime } from 'luxon'
import type { Reloj } from '../puertos/reloj.ts'
import { cifrar, descifrar } from '../dominio/cifrado.ts'

/**
 * El respaldo de cada noche.
 *
 * El volumen de Docker aguanta apagones y reinicios, pero no aguanta que
 * se muera el disco. Este es el único seguro contra eso, y el spec lo pide
 * explícitamente: volcado cifrado, cada noche, **fuera del equipo**.
 *
 * Sale por Telegram porque es el único canal fuera de la laptop que ya
 * existe: sin cuenta nueva, sin credenciales nuevas, sin factura. Va
 * cifrado porque un chat de bot no es privado y ahí dentro está la agenda
 * entera y los movimientos del banco.
 */

/** Lo que produce el volcado. Puerto: en pruebas no se levanta ningún Postgres. */
export type Volcar = () => Promise<Buffer>

export type EnviarArchivo = (
  nombre: string, datos: Uint8Array, leyenda: string
) => Promise<void>

export interface Registro {
  info(objeto: object, mensaje?: string): void
  warn(objeto: object, mensaje?: string): void
  error(objeto: object, mensaje?: string): void
}

export interface DepsRespaldo {
  reloj: Reloj
  volcar: Volcar
  /** Sin clave no se hace nada: sacar esto en claro no es una opción. */
  clave: string
  carpeta: string
  /** Cuántos días de respaldos se guardan en la laptop. */
  retenerDias: number
  /** Si falta, el respaldo se queda en el disco y se avisa. */
  enviar?: EnviarArchivo
  registro?: Registro
  /** Inyectables para probar sin tocar el disco. */
  escribir?: (ruta: string, datos: Uint8Array) => Promise<void>
  listar?: (carpeta: string) => Promise<string[]>
  borrar?: (ruta: string) => Promise<void>
  crearCarpeta?: (carpeta: string) => Promise<void>
}

export interface Resultado {
  ok: boolean
  archivo?: string
  bytes?: number
  /** Salió de la laptop. Un respaldo que se queda dentro no es un respaldo. */
  fuera: boolean
  motivo?: string
  borrados?: string[]
}

const PREFIJO = 'respaldo-'
const SUFIJO = '.sql.gz.enc'

const nombreDe = (cuando: DateTime): string =>
  `${PREFIJO}${cuando.toFormat('yyyy-LL-dd-HHmm')}${SUFIJO}`

/**
 * La fecha vive en el nombre: no hace falta preguntarle nada al disco.
 *
 * Y sólo se borra lo que encaja con el patrón. Si alguien deja otra cosa
 * en esa carpeta, no es asunto de esta función tocarla.
 */
export function esViejo(nombre: string, hoy: DateTime, dias: number): boolean {
  if (!nombre.startsWith(PREFIJO) || !nombre.endsWith(SUFIJO)) return false

  const marca = nombre.slice(PREFIJO.length, PREFIJO.length + 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(marca)) return false

  const fecha = DateTime.fromISO(marca, { zone: hoy.zone })
  if (!fecha.isValid) return false

  return hoy.startOf('day').diff(fecha.startOf('day'), 'days').days > dias
}

export function crearServicioRespaldo(d: DepsRespaldo) {
  const escribir = d.escribir ?? ((ruta, datos) => writeFile(ruta, datos))
  const listar = d.listar ?? ((c) => readdir(c))
  const borrar = d.borrar ?? ((ruta) => unlink(ruta))
  const crearCarpeta = d.crearCarpeta ?? (async (c) => { await mkdir(c, { recursive: true }) })

  async function rotar(hoy: DateTime): Promise<string[]> {
    const borrados: string[] = []
    for (const nombre of await listar(d.carpeta)) {
      if (!esViejo(nombre, hoy, d.retenerDias)) continue
      await borrar(join(d.carpeta, nombre))
      borrados.push(nombre)
    }
    return borrados
  }

  return {
    async hacer(): Promise<Resultado> {
      if (!d.clave) {
        return { ok: false, fuera: false, motivo: 'Sin RESPALDO_CLAVE no voy a sacar esto en claro' }
      }

      const cuando = d.reloj.ahora()
      const nombre = nombreDe(cuando)

      try {
        const volcado = await d.volcar()
        if (volcado.length === 0) {
          return { ok: false, fuera: false, motivo: 'El volcado salió vacío' }
        }

        // Comprimir antes de cifrar: al revés no comprime nada, porque lo
        // cifrado no tiene patrones que aprovechar.
        const sobre = cifrar(gzipSync(volcado, { level: 9 }), d.clave)

        await crearCarpeta(d.carpeta)
        const ruta = join(d.carpeta, nombre)
        await escribir(ruta, sobre)

        let fuera = false
        let motivo: string | undefined
        if (d.enviar) {
          try {
            await d.enviar(nombre, sobre,
              `🗄️  Respaldo del ${cuando.setLocale('es').toFormat("d 'de' LLLL")}. `
              + 'Guárdalo: sin él, si se muere la laptop se pierde todo.')
            fuera = true
          } catch (e) {
            motivo = `No pude sacarlo de la laptop: ${e instanceof Error ? e.message : 'sin detalle'}`
          }
        } else {
          motivo = 'Sin Telegram configurado, el respaldo se queda en la laptop'
        }

        const borrados = await rotar(cuando).catch(() => [])
        if (!fuera) d.registro?.warn({ motivo }, 'RESPALDO SIN SALIR DE LA LAPTOP')

        return { ok: true, archivo: ruta, bytes: sobre.length, fuera, motivo, borrados }
      } catch (e) {
        const motivo = e instanceof Error ? e.message : 'sin detalle'
        d.registro?.error({ err: e }, 'FALLÓ EL RESPALDO DE ESTA NOCHE')
        return { ok: false, fuera: false, motivo }
      }
    },
  }
}

export type ServicioRespaldo = ReturnType<typeof crearServicioRespaldo>

/**
 * El volcado de verdad.
 *
 * `pg_dump` casi nunca está instalado en Windows, pero sí está dentro del
 * contenedor de Postgres, que es donde vive la base. Por eso el comando
 * por defecto entra por Docker en vez de asumir un binario en el PATH.
 */
export function volcarConComando(comando: string, urlBaseDatos: string): Volcar {
  return () => new Promise<Buffer>((cumplir, fallar) => {
    const partes = comando.trim().split(/\s+/)
    const proceso = spawn(partes[0]!, partes.slice(1), {
      // pg_dump lee la contraseña de aquí y así no queda en la línea de
      // comandos, donde la vería cualquiera que liste procesos.
      env: { ...process.env, PGURL: urlBaseDatos },
      shell: false,
    })

    const trozos: Buffer[] = []
    const errores: Buffer[] = []
    proceso.stdout.on('data', (t: Buffer) => trozos.push(t))
    proceso.stderr.on('data', (t: Buffer) => errores.push(t))
    proceso.on('error', (e) => fallar(new Error(`No pude ejecutar «${partes[0]}»: ${e.message}`)))
    proceso.on('close', (codigo) => {
      if (codigo === 0 && trozos.length > 0) return cumplir(Buffer.concat(trozos))
      fallar(new Error(
        Buffer.concat(errores).toString().trim().slice(0, 300) || `pg_dump salió con ${codigo}`))
    })
  })
}

/** Deshace lo que hizo `hacer`. Un respaldo que no se sabe abrir no es un respaldo. */
export const abrirRespaldo = (sobre: Uint8Array, clave: string): Buffer =>
  gunzipSync(descifrar(sobre, clave))
