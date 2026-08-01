import { DateTime } from 'luxon'
import type { Boton } from '../puertos/notificador.ts'

/**
 * El resumen de las 21:00, armado en código puro.
 *
 * Lo que rinde cuentas es lo que ella hizo **sola**. Lo que Marcelo le
 * dictó no entra: él estaba ahí cuando pasó, y una asistente que a las
 * nueve de la noche le repite lo que él mismo le pidió a las tres de la
 * tarde se vuelve ruido — que es exactamente el modo en que este resumen
 * puede fallar. Por lo mismo, si no hizo nada no hay resumen: devolver
 * `null` es la única forma de que arriba nadie tenga que decidir si
 * mandar un «hoy no pasó nada».
 */

/** Lo que el resumen necesita de una acción. La crónica lo cumple tal cual. */
export interface AccionDelDia {
  id: number
  tipo: string
  estado: string
  /** La hizo sola, sin que nadie se lo pidiera. */
  porElla: boolean
  /** Modo sombra: la habría hecho, pero no tocó nada. */
  ensayo: boolean
  titulo: string
  creadaEn: string
  objetivo: { inicio: string; fin: string; desdeInicio: string | null } | null
  correo: { remitente: string; asunto: string | null; recibidoEn: string } | null
}

/** Lo que se puede revertir, con la hora a la que lo hizo para distinguirlas. */
export interface Deshacible {
  id: number
  titulo: string
  cuando: string
}

export interface Resumen {
  texto: string
  /** Las que de verdad se aplicaron: en sombra no hay nada que deshacer. */
  deshacibles: Deshacible[]
  /** Todo lo que hizo fue ensayo. Cambia el tono, no el contenido. */
  sombra: boolean
}

/** Más de esto no cabe cómodo en un mensaje, y tampoco se lee. */
const MAXIMO = 12

/**
 * El mismo botón en el aviso del momento, en el resumen y en el chat.
 *
 * Vive aquí y no en cada sitio porque el texto y el dato tienen que ir
 * juntos: un botón que diga «Deshacer» y mande otra cosa es peor que no
 * tener botón.
 */
export const botonDeshacer = (accionId: number): Boton => ({
  texto: '↩️  Deshacer',
  dato: `deshacer:${accionId}`,
})

/**
 * 12 horas a mano y no con `toFormat('h:mm a')`.
 *
 * El formateador de Intl devuelve «2:14 p. m.» en español según la versión
 * de ICU que traiga Node, y una hora es lo último que puede cambiar de
 * forma entre dos máquinas.
 */
function hora12(d: DateTime): string {
  const h = d.hour % 12 === 0 ? 12 : d.hour % 12
  return `${h}:${String(d.minute).padStart(2, '0')} ${d.hour < 12 ? 'am' : 'pm'}`
}

function dia(d: DateTime, hoy: DateTime): string {
  if (d.hasSame(hoy, 'day')) return 'hoy'
  if (d.hasSame(hoy.plus({ days: 1 }), 'day')) return 'mañana'
  if (d.hasSame(hoy.minus({ days: 1 }), 'day')) return 'ayer'
  return d.setLocale('es').toFormat(d.hasSame(hoy, 'month') ? 'cccc d' : "cccc d 'de' LLLL")
}

/** «de hoy», pero «del miércoles 6». */
const conDe = (cuando: string): string =>
  cuando === 'hoy' || cuando === 'mañana' || cuando === 'ayer'
    ? `de ${cuando}`
    : `del ${cuando}`

/** «Prof. Ramírez <r@uni.edu.co>» → «Prof. Ramírez». */
export function nombreDe(remitente: string): string {
  const conNombre = /^\s*"?([^"<]*?)"?\s*<[^>]+>\s*$/.exec(remitente)
  return conNombre?.[1]?.trim() || remitente.replace(/[<>]/g, '').trim()
}

function queHizo(a: AccionDelDia, zona: string, hoy: DateTime): string {
  const titulo = `«${a.titulo}»`
  const inicio = a.objetivo?.inicio
    ? DateTime.fromISO(a.objetivo.inicio, { zone: zona })
    : null
  const cuando = inicio?.isValid ? conDe(dia(inicio, hoy)) : ''

  if (a.tipo === 'cancelar_instancia') {
    return `Cancelé ${titulo} ${cuando}${inicio?.isValid ? `, ${hora12(inicio)}` : ''}`.trim()
  }

  if (a.tipo === 'mover_evento') {
    const desde = a.objetivo?.desdeInicio
      ? DateTime.fromISO(a.objetivo.desdeInicio, { zone: zona })
      : null
    const salto = desde?.isValid && inicio?.isValid
      ? `: de ${hora12(desde)} a ${hora12(inicio)}`
      : ''
    return `Moví ${titulo} ${cuando}${salto}`.trim()
  }

  if (a.tipo === 'crear_evento') {
    const donde = inicio?.isValid
      ? ` el ${dia(inicio, hoy)} a las ${hora12(inicio)}`
      : ''
    return `Puse ${titulo}${donde} en tu calendario`
  }

  if (a.tipo === 'borrar_serie') return `Quité ${titulo} de tu agenda`

  return `Toqué ${titulo}`
}

function lineaDe(a: AccionDelDia, zona: string, hoy: DateTime, marcarEnsayo: boolean): string {
  const cabeza = `📅  ${queHizo(a, zona, hoy)}${marcarEnsayo && a.ensayo ? ' (ensayo)' : ''}`
  if (!a.correo) return cabeza

  const cuando = DateTime.fromISO(a.creadaEn, { zone: zona })
  const sello = cuando.isValid ? ` · ${hora12(cuando)}` : ''
  return `${cabeza}\n    correo de ${nombreDe(a.correo.remitente)}${sello}`
}

/** Lo que pasó con la plata hoy, para el resumen. */
export interface Plata {
  cuantos: number
  ingresos: number
  egresos: number
}

export interface PorVencer {
  acreedor: string
  monto: string
  diasRestantes: number
}

/** «💰  3 movimientos  +$1.240.000  −$89.900» */
function lineaDePlata(p: Plata, comoPlata: (centavos: number) => string): string {
  const partes = [`💰  ${p.cuantos} movimiento${p.cuantos === 1 ? '' : 's'}`]
  if (p.ingresos > 0) partes.push(`+${comoPlata(p.ingresos)}`)
  if (p.egresos > 0) partes.push(`−${comoPlata(p.egresos)}`)
  return partes.join('  ')
}

function lineaDeVencimiento(c: PorVencer): string {
  const cuando = c.diasRestantes < 0
    ? `venció hace ${Math.abs(c.diasRestantes)} día${Math.abs(c.diasRestantes) === 1 ? '' : 's'}`
    : c.diasRestantes === 0
      ? 'vence hoy'
      : c.diasRestantes === 1
        ? 'vence mañana'
        : `vence en ${c.diasRestantes} días`
  return `⏰  ${cuando.charAt(0).toUpperCase()}${cuando.slice(1)}: ${c.acreedor} ${c.monto}`
}

/**
 * Devuelve el resumen, o `null` si ella no hizo nada.
 *
 * `ahora` manda la zona horaria y el «hoy» contra el que se nombran los
 * días: en UTC diría que canceló la clase cinco horas antes de cancelarla.
 */
export interface Extras {
  plata?: Plata | null
  porVencer?: readonly PorVencer[]
  /** Cómo se escribe una cifra. Lo inyecta quien sabe de qué moneda va. */
  comoPlata?: (centavos: number) => string
}

export function armarResumen(
  acciones: readonly AccionDelDia[],
  ahora: DateTime,
  extras: Extras = {}
): Resumen | null {
  // Lo pendiente nunca pasó y lo descartado tampoco; lo deshecho se
  // deshizo, y contarlo sería cobrar por un trabajo que ya no está hecho.
  const suyas = acciones
    .filter((a) => a.porElla && (a.estado === 'aplicada' || a.estado === 'sombra'))
    .sort((x, y) => x.creadaEn.localeCompare(y.creadaEn))

  const plata = extras.plata && extras.plata.cuantos > 0 ? extras.plata : null
  const vencen = extras.porVencer ?? []

  // Ahora hay tres razones para escribir de noche, no una. Callar porque no
  // tocó el calendario, cuando le entró plata o cuando algo vence mañana,
  // sería exactamente el fallo que este resumen intenta evitar.
  if (suyas.length === 0 && !plata && vencen.length === 0) return null

  const zona = ahora.zoneName ?? 'America/Bogota'
  const sombra = suyas.length > 0 && suyas.every((a) => a.ensayo)
  const mostradas = suyas.slice(0, MAXIMO)

  const cuerpo = mostradas
    .map((a) => lineaDe(a, zona, ahora, !sombra))
    .join('\n\n')

  const restantes = suyas.length - mostradas.length
  const cola = restantes > 0 ? `\n\n…y ${restantes} más en la Crónica.` : ''

  const cabecera = sombra
    ? '🌙  Esto es lo que habría hecho hoy:'
    : '🌙  Hoy hice esto por ti:'

  const pie = sombra
    ? '\n\nSigo en modo sombra: no toqué tu calendario.'
    : ''

  // El libro va aparte de la agenda y después: registrar es lectura, y lo
  // que ella decidió por su cuenta pesa más que lo que sólo anotó.
  const comoPlata = extras.comoPlata ?? ((c) => String(c))
  const dinero = plata ? `\n\n${lineaDePlata(plata, comoPlata)}` : ''
  const avisos = vencen.length > 0
    ? `\n\n${vencen.map(lineaDeVencimiento).join('\n')}`
    : ''

  const nadaEnAgenda = suyas.length === 0
  const texto = nadaEnAgenda
    // Sin nada de agenda, la cabecera «hice esto por ti» sobra: lo único
    // que hizo fue leer y anotar.
    ? `🌙  Del día:${dinero}${avisos}`.replace('🌙  Del día:\n\n', '🌙  ')
    : `${cabecera}\n\n${cuerpo}${cola}${pie}${dinero}${avisos}`

  return {
    texto,
    deshacibles: suyas
      .filter((a) => a.estado === 'aplicada')
      .map((a) => {
        // Dos cancelaciones del mismo compromiso en un día darían dos
        // botones idénticos; la hora es lo que las vuelve elegibles.
        const cuando = DateTime.fromISO(a.creadaEn, { zone: zona })
        return { id: a.id, titulo: a.titulo, cuando: cuando.isValid ? hora12(cuando) : '' }
      }),
    sombra,
  }
}

export interface Aviso {
  texto: string
  deshacible: boolean
}

/**
 * El aviso inmediato de una sola acción.
 *
 * Es el otro lado de la política: lo que decide «actúa y avisa» sale por
 * aquí en el momento, y lo que decide «actúa callada» espera al resumen.
 * Comparten formato a propósito — el mismo hecho no debería contarse de
 * dos maneras según la hora a la que se cuente.
 */
export function avisoDeAccion(a: AccionDelDia, ahora: DateTime): Aviso {
  const zona = ahora.zoneName ?? 'America/Bogota'
  const linea = lineaDe(a, zona, ahora, false)
  return {
    texto: a.ensayo
      ? `🌙  Habría hecho esto, pero sigo en sombra:\n\n${linea}`
      : `✅  ${linea}`,
    deshacible: a.estado === 'aplicada',
  }
}
