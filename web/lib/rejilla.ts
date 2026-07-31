import { minutosEntre } from './tiempo'

/**
 * La aritmética de la vista de agenda, aparte del dibujo.
 *
 * Una lista es ciega al espacio vacío: un hueco de dos horas entre clases no
 * se ve. La rejilla lo enseña porque la altura de cada bloque es su duración
 * y lo que no tiene bloque es tiempo libre. Todo lo de aquí es geometría en
 * minutos; los píxeles los pone el componente.
 */

export interface EnRejilla {
  id: string
  inicio: string
  fin: string
}

export interface Ventana {
  inicio: string
  fin: string
}

export interface Bloque<T extends EnRejilla> {
  evento: T
  /** Minutos desde el inicio de la ventana. */
  desde: number
  /** Duración ya recortada a la ventana. */
  minutos: number
  /** Columna que ocupa dentro de su grupo de solapes. */
  columna: number
  /** Cuántas columnas hay que repartirse en ese grupo. */
  columnas: number
}

/**
 * Reparte los eventos en columnas paralelas.
 *
 * Dos clases a la misma hora no pueden dibujarse una encima de la otra: se
 * parten el ancho. El reparto se calcula por grupo de solapes encadenados,
 * no evento a evento, porque si no un grupo de tres quedaría con anchos
 * distintos y el día se vería roto.
 */
export function disponer<T extends EnRejilla>(
  eventos: readonly T[],
  ventana: Ventana
): Array<Bloque<T>> {
  const totalVentana = minutosEntre(ventana.inicio, ventana.fin)
  if (!Number.isFinite(totalVentana) || totalVentana <= 0) return []

  const dentro = eventos
    .map((evento) => {
      const desdeCrudo = minutosEntre(ventana.inicio, evento.inicio)
      const hastaCrudo = minutosEntre(ventana.inicio, evento.fin)
      if (!Number.isFinite(desdeCrudo) || !Number.isFinite(hastaCrudo)) return null
      const desde = Math.max(0, desdeCrudo)
      const hasta = Math.min(totalVentana, hastaCrudo)
      // Fuera de la ventana no se dibuja; pegado al borde tampoco cuenta.
      if (hasta <= 0 || desde >= totalVentana || hasta <= desde) return null
      return { evento, desde, minutos: hasta - desde, columna: 0, columnas: 1 }
    })
    .filter((b): b is Bloque<T> => b !== null)
    // Empatados en hora, primero el más largo: deja el corto a la derecha,
    // que es como se lee un calendario.
    .sort((a, b) => a.desde - b.desde || b.minutos - a.minutos)

  let grupo: Array<Bloque<T>> = []
  let finColumna: number[] = []
  let finGrupo = -Infinity

  const cerrarGrupo = () => {
    for (const b of grupo) b.columnas = finColumna.length || 1
    grupo = []
    finColumna = []
    finGrupo = -Infinity
  }

  for (const bloque of dentro) {
    // Si empieza después de que todo lo anterior terminó, es otro grupo.
    if (bloque.desde >= finGrupo) cerrarGrupo()

    const fin = bloque.desde + bloque.minutos
    const libre = finColumna.findIndex((f) => f <= bloque.desde)
    if (libre === -1) {
      finColumna.push(fin)
      bloque.columna = finColumna.length - 1
    } else {
      finColumna[libre] = fin
      bloque.columna = libre
    }

    grupo.push(bloque)
    finGrupo = Math.max(finGrupo, fin)
  }
  cerrarGrupo()

  return dentro
}

export interface MarcaHora {
  /** '07:00' */
  etiqueta: string
  /** Minutos desde el inicio de la ventana. */
  desde: number
}

/**
 * Las horas de la izquierda.
 *
 * La ventana siempre empieza en hora en punto, así que la etiqueta se cuenta
 * a partir de ahí en vez de reformatear fechas: nada que dependa de la zona
 * horaria del navegador.
 */
export function horasDe(ventana: Ventana): MarcaHora[] {
  const total = minutosEntre(ventana.inicio, ventana.fin)
  if (!Number.isFinite(total) || total <= 0) return []
  const primera = Number(ventana.inicio.slice(11, 13))
  const marcas: MarcaHora[] = []
  for (let desde = 0; desde <= total; desde += 60) {
    const h = (primera + desde / 60) % 24
    marcas.push({ etiqueta: `${String(h).padStart(2, '0')}:00`, desde })
  }
  return marcas
}

/** Dónde cae un instante dentro de la ventana, o null si se sale. */
export function posicionDe(iso: string, ventana: Ventana): number | null {
  const total = minutosEntre(ventana.inicio, ventana.fin)
  const desde = minutosEntre(ventana.inicio, iso)
  if (!Number.isFinite(desde) || desde < 0 || desde > total) return null
  return desde
}

export function minutosDeVentana(ventana: Ventana): number {
  const total = minutosEntre(ventana.inicio, ventana.fin)
  return Number.isFinite(total) && total > 0 ? total : 0
}
