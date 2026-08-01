/**
 * Traerse las mejoras sin que Marcelo abra una terminal.
 *
 * La alternativa era decirle «corre `git pull` y luego `npm install`», que
 * es pedirle a alguien que no programa justo lo único que no sabe hacer —
 * y encima con dos comandos que si salen mal dejan la máquina a medias.
 *
 * Lo que NO toca una actualización, y por eso es segura:
 *
 * - **El `.env`** no está en git. Un `pull` no lo mira siquiera, así que
 *   las claves, los permisos de Google y el número de chat siguen ahí.
 * - **La base de datos** vive en un volumen de Docker, fuera del proyecto.
 *   Ni el código ni git la tocan.
 * - **Las migraciones** corren solas al arrancar, así que un cambio de
 *   esquema se aplica sin que nadie haga nada.
 *
 * Se usa `--ff-only` a propósito: si por lo que sea hubiera cambios
 * locales, el tirón falla y lo dice, en vez de abrir un conflicto de merge
 * en la máquina de alguien que no sabría qué hacer con él.
 */

export type Ejecutar = (
  programa: string,
  argumentos: string[]
) => Promise<{ ok: boolean; salida: string }>

export interface EstadoVersion {
  /** Si esto ni siquiera es un repo, no hay nada que actualizar. */
  esRepo: boolean
  version: string
  /** Cuántos commits hay publicados que aquí no están. */
  detras: number
  /** Lo último que se publicó, para saber qué llega. */
  novedad: string
  /** Hay cambios hechos a mano aquí que un tirón pisaría. */
  sucio: boolean
  hayQueActualizar: boolean
}

const limpio = (s: string): string => s.trim().split(/\r?\n/)[0]?.trim() ?? ''

export async function revisarVersion(ejecutar: Ejecutar): Promise<EstadoVersion> {
  const dentro = await ejecutar('git', ['rev-parse', '--is-inside-work-tree'])
  if (!dentro.ok) {
    return {
      esRepo: false, version: '', detras: 0, novedad: '',
      sucio: false, hayQueActualizar: false,
    }
  }

  const version = limpio((await ejecutar('git', ['rev-parse', '--short', 'HEAD'])).salida)

  // Sin `fetch` la cuenta de abajo compara contra lo que se sabía la última
  // vez, que puede ser de hace semanas. Es la parte lenta, y es la única
  // que de verdad averigua algo.
  await ejecutar('git', ['fetch', 'origin', '--quiet'])

  const cuenta = await ejecutar('git', ['rev-list', '--count', 'HEAD..origin/main'])
  const detras = cuenta.ok ? Number(limpio(cuenta.salida)) || 0 : 0

  const estado = await ejecutar('git', ['status', '--porcelain'])
  // El .env no cuenta como suciedad: no está en git y no lo estará nunca.
  const sucio = estado.ok && estado.salida.trim().length > 0

  const novedad = detras > 0
    ? limpio((await ejecutar('git', ['log', '-1', '--format=%s', 'origin/main'])).salida)
    : ''

  return { esRepo: true, version, detras, novedad, sucio, hayQueActualizar: detras > 0 }
}

export interface Paso {
  que: string
  programa: string
  argumentos: string[]
  /** Si falla, se sigue: no todo paso es imprescindible. */
  opcional?: boolean
}

export function pasosDeActualizacion(): Paso[] {
  return [
    {
      que: 'traerme los cambios',
      programa: 'git',
      // `--ff-only`: antes fallar que dejar un conflicto de merge en la
      // máquina de alguien que no sabría resolverlo.
      argumentos: ['pull', '--ff-only', 'origin', 'main'],
    },
    {
      que: 'poner las dependencias nuevas',
      programa: 'npm',
      argumentos: ['install', '--no-audit', '--no-fund'],
    },
    {
      que: 'comprobar que todo sigue en pie',
      programa: 'npm',
      argumentos: ['test'],
      // Informativo: si las pruebas fallan hay que decirlo, pero el código
      // ya está en disco y no actualizar tampoco lo arregla.
      opcional: true,
    },
  ]
}
