/**
 * Que la laptop no se duerma, y que la asistente vuelva sola.
 *
 * Un portátil de fábrica hace tres cosas que matan a un servicio como
 * éste, y ninguna se ve venir:
 *
 * 1. **Se suspende** a los pocos minutos. Dormido no es «más lento»: los
 *    procesos se congelan, la red se cae y los temporizadores no disparan.
 *    El resumen de las 21:00 simplemente no sale.
 * 2. **Se suspende al cerrar la tapa**, que es exactamente lo que alguien
 *    hace con una laptop que «va a dejar prendida en un rincón».
 * 3. **Tras reiniciar por Windows Update, nadie la vuelve a arrancar.**
 *
 * La pantalla de bloqueo, en cambio, no importa: bloquear no mata
 * procesos. Lo que mata es dormir y cerrar la sesión.
 */

export type Ejecutar = (
  programa: string,
  argumentos: string[]
) => Promise<{ ok: boolean; salida: string }>

export const NOMBRE_TAREA = 'MiSegundoCerebro'

/** Grupo «Botones y tapa» y ajuste «Al cerrar la tapa». */
const SUB_BOTONES = '4f971e89-eebd-4455-a8de-9e59040e7347'
const AJUSTE_TAPA = '5ca83367-6e45-459f-a27b-476b1d01c936'

/**
 * Los dos últimos números de `powercfg /query` son el valor con corriente
 * y con batería, en ese orden.
 *
 * Se leen por posición y no por el texto de la etiqueta porque ese texto
 * está traducido: en un Windows en español no dice «Current AC Power
 * Setting Index», y buscar esa frase fallaría en la única máquina que
 * importa, que es la de Marcelo.
 */
export function valoresDePowercfg(salida: string): { ac: number; dc: number } | null {
  const numeros = [...salida.matchAll(/0x([0-9a-f]{8})/gi)].map((m) => parseInt(m[1]!, 16))
  if (numeros.length < 2) return null
  return { ac: numeros.at(-2)!, dc: numeros.at(-1)! }
}

export interface EstadoVigilia {
  /** Minutos hasta suspender con corriente y con batería. 0 = nunca. */
  duerme: { ac: number; dc: number } | null
  /** Qué hace al cerrar la tapa. 0 = nada. */
  tapa: { ac: number; dc: number } | null
  /** Vuelve sola al reiniciar Windows. */
  arrancaSola: boolean
  siempreDespierta: boolean
  listo: boolean
}

export async function revisarVigilia(ejecutar: Ejecutar): Promise<EstadoVigilia> {
  const [dormir, tapa, tarea] = await Promise.all([
    ejecutar('powercfg', ['/query', 'SCHEME_CURRENT', 'SUB_SLEEP', 'STANDBYIDLE']),
    ejecutar('powercfg', ['/query', 'SCHEME_CURRENT', SUB_BOTONES, AJUSTE_TAPA]),
    ejecutar('schtasks', ['/query', '/tn', NOMBRE_TAREA]),
  ])

  const duerme = dormir.ok ? valoresDePowercfg(dormir.salida) : null
  const alCerrar = tapa.ok ? valoresDePowercfg(tapa.salida) : null

  // Con corriente es lo que manda: la laptop va a vivir enchufada. Con
  // batería puede dormirse, y de hecho es lo que salva la batería si se va
  // la luz un rato largo.
  //
  // Que la tapa no se pueda LEER no cuenta como que esté mal: Windows trae
  // ese ajuste oculto en muchos equipos y `powercfg` no lo devuelve, aunque
  // escribirlo sí funciona. Tratar «no lo sé» como «está mal» dejaría el
  // aviso encendido para siempre por algo que ya se arregló.
  const tapaEstorba = alCerrar !== null && alCerrar.ac !== 0
  const siempreDespierta = duerme?.ac === 0 && !tapaEstorba

  return {
    duerme,
    tapa: alCerrar,
    arrancaSola: tarea.ok,
    siempreDespierta,
    listo: siempreDespierta && tarea.ok,
  }
}

export interface Paso {
  programa: string
  argumentos: string[]
  /** Si falla, no pasa nada: se sigue con el resto sin dar error. */
  opcional?: boolean
}

/** Nunca dormir con corriente, y no hacer nada al cerrar la tapa. */
export function comandosDeVigilia(): Paso[] {
  return [
    // Primero, sacar el ajuste de la tapa de donde Windows lo esconde, para
    // poder enseñarlo después. Necesita administrador y por eso es opcional:
    // escribirlo funciona igual aunque esto falle.
    { programa: 'powercfg', argumentos: ['/attributes', SUB_BOTONES, AJUSTE_TAPA, '-ATTRIB_HIDE'], opcional: true },

    // La pantalla sí se puede apagar: eso no congela nada y alarga la vida
    // del panel. Lo que no puede es suspenderse la máquina.
    { programa: 'powercfg', argumentos: ['/change', 'monitor-timeout-ac', '10'] },
    { programa: 'powercfg', argumentos: ['/change', 'standby-timeout-ac', '0'] },
    { programa: 'powercfg', argumentos: ['/change', 'hibernate-timeout-ac', '0'] },
    { programa: 'powercfg', argumentos: ['/change', 'disk-timeout-ac', '0'] },
    { programa: 'powercfg', argumentos: ['/setacvalueindex', 'SCHEME_CURRENT', SUB_BOTONES, AJUSTE_TAPA, '0'] },
    { programa: 'powercfg', argumentos: ['/setactive', 'SCHEME_CURRENT'] },
  ]
}

/**
 * La tarea que la arranca al iniciar sesión.
 *
 * Sin `/rl highest` a propósito: la asistente no necesita permisos de
 * administrador, y pedirlos obligaría a aceptar un aviso de Windows cada
 * vez. Se registra para el usuario que está sentado ahí.
 */
export function comandoDeTarea(
  carpeta: string
): { programa: string; argumentos: string[] } {
  return {
    programa: 'schtasks',
    argumentos: [
      '/create', '/f',
      '/tn', NOMBRE_TAREA,
      '/sc', 'onlogon',
      '/tr', `cmd /c cd /d "${carpeta}" && "${carpeta}\\ARRANCAR.cmd"`,
    ],
  }
}

export const comandoQuitarTarea = (): { programa: string; argumentos: string[] } => ({
  programa: 'schtasks',
  argumentos: ['/delete', '/f', '/tn', NOMBRE_TAREA],
})

/** En palabras, para poder enseñarlo sin que nadie interprete un hexadecimal. */
export function enPalabras(e: EstadoVigilia): string[] {
  const dichos: string[] = []

  if (e.duerme === null) dichos.push('No pude leer los ajustes de energía.')
  else if (e.duerme.ac === 0) dichos.push('Enchufada no se duerme nunca. ✅')
  else dichos.push(`Enchufada se duerme a los ${Math.round(e.duerme.ac / 60)} min. ⚠️`)

  if (e.tapa === null) {
    dichos.push('Lo de la tapa Windows lo tiene oculto y no me deja leerlo, '
      + 'pero sí me deja cambiarlo: el botón se lo pone igual.')
  } else if (e.tapa.ac === 0) {
    dichos.push('Puedes cerrar la tapa y sigue trabajando. ✅')
  } else {
    dichos.push('Si cierras la tapa se duerme. ⚠️')
  }

  dichos.push(e.arrancaSola
    ? 'Vuelve sola cuando Windows se reinicia. ✅'
    : 'Si Windows se reinicia, no vuelve sola. ⚠️')

  return dichos
}
