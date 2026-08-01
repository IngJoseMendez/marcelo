import { DateTime } from 'luxon'

/**
 * Ver el hueco y ver lo que cabe en él es la misma operación.
 *
 * La bandeja sabe qué hay por hacer y la jornada sabe dónde no hay nada.
 * Juntarlas es lo que convierte una herramienta en una asistente: en vez
 * de esperar a que le pidan, propone.
 *
 * Pero **proponer no es agendar**. Lo que sale de aquí es una sugerencia
 * con un id y una hora; meterla al calendario pasa por el mismo actuador,
 * la misma política y la misma auditoría que todo lo demás. Si hubiera un
 * atajo, agenda y auditoría acabarían contando historias distintas.
 */

export interface Intencion {
  id: number
  titulo: string
  prioridad: 'urgente' | 'alta' | 'normal' | 'baja'
  duracionMin: number
  /** ISO, o `null` si no tiene fecha límite. */
  venceEl: string | null
  estado: string
}

export interface Hueco {
  inicio: string
  fin: string
  minutos: number
}

export interface Propuesta {
  intencionId: number
  titulo: string
  /** ISO con zona: lo que se le pasa al actuador tal cual. */
  inicio: string
  duracionMin: number
  /** Por qué ésta y no otra. Se le enseña: proponer sin explicar es mandar. */
  porque: string
}

const PESO: Record<Intencion['prioridad'], number> = {
  urgente: 0, alta: 1, normal: 2, baja: 3,
}

/** Un hueco de 15 minutos entre dos clases no es tiempo de trabajo. */
const MINIMO_UTIL = 15

/**
 * Ordena lo que hay por hacer.
 *
 * La fecha límite manda sobre la prioridad declarada: algo que vence
 * mañana va primero aunque esté marcado «normal». Es la misma disciplina
 * que calcula la prioridad — el texto propone, la fecha decide.
 */
export function ordenar(
  intenciones: readonly Intencion[],
  ahora: DateTime
): Intencion[] {
  return [...intenciones]
    .filter((i) => i.estado === 'pendiente')
    .sort((a, b) => {
      const venceA = a.venceEl ? DateTime.fromISO(a.venceEl) : null
      const venceB = b.venceEl ? DateTime.fromISO(b.venceEl) : null

      const diasA = venceA?.isValid ? venceA.diff(ahora, 'days').days : Infinity
      const diasB = venceB?.isValid ? venceB.diff(ahora, 'days').days : Infinity

      // Lo que vence dentro de dos días adelanta a todo lo demás.
      const apuraA = diasA <= 2 ? 0 : 1
      const apuraB = diasB <= 2 ? 0 : 1
      if (apuraA !== apuraB) return apuraA - apuraB

      if (PESO[a.prioridad] !== PESO[b.prioridad]) {
        return PESO[a.prioridad] - PESO[b.prioridad]
      }
      if (diasA !== diasB) return diasA - diasB
      // A igualdad, lo largo primero: es lo que más difícil es de encajar.
      return b.duracionMin - a.duracionMin
    })
}

/**
 * El hueco donde mejor cabe.
 *
 * Se elige el **más justo** de los que sirven, no el más grande ni el más
 * temprano: meter media hora en el único bloque de dos que hay en el día
 * lo parte en dos trozos donde ya no cabe nada largo.
 */
export function mejorHueco(huecos: readonly Hueco[], duracionMin: number): Hueco | null {
  const sirven = huecos
    .filter((h) => h.minutos >= duracionMin && h.minutos >= MINIMO_UTIL)
    .sort((a, b) => a.minutos - b.minutos || a.inicio.localeCompare(b.inicio))
  return sirven[0] ?? null
}

export interface Entrada {
  intenciones: readonly Intencion[]
  huecos: readonly Hueco[]
  ahora: DateTime
  /** Cuántas proponer como mucho. Tres ya es una lista, no una sugerencia. */
  cuantas?: number
}

/**
 * Qué meter en los huecos de un día.
 *
 * Cada hueco se usa una sola vez: proponer dos cosas a la misma hora sería
 * proponer un conflicto, y hacerle elegir a él lo que el código puede
 * resolver es trabajo que se le devuelve sin motivo.
 */
export function proponer(e: Entrada): Propuesta[] {
  const cuantas = e.cuantas ?? 2
  const pendientes = ordenar(e.intenciones, e.ahora)
  const libres = [...e.huecos]
  const propuestas: Propuesta[] = []

  for (const i of pendientes) {
    if (propuestas.length >= cuantas) break

    const hueco = mejorHueco(libres, i.duracionMin)
    if (!hueco) continue

    const inicio = DateTime.fromISO(hueco.inicio)
    if (!inicio.isValid) continue

    // No proponer un hueco que ya pasó: sugerir las 9 de la mañana a las
    // 4 de la tarde es enseñar que no mira la hora.
    if (inicio < e.ahora) {
      libres.splice(libres.indexOf(hueco), 1)
      continue
    }

    // Ni uno posterior a la fecha límite: cumplir tarde no es cumplir.
    const vence = i.venceEl ? DateTime.fromISO(i.venceEl) : null
    if (vence?.isValid && inicio > vence) continue

    libres.splice(libres.indexOf(hueco), 1)
    propuestas.push({
      intencionId: i.id,
      titulo: i.titulo,
      inicio: hueco.inicio,
      duracionMin: i.duracionMin,
      porque: explicar(i, hueco, e.ahora),
    })
  }

  return propuestas
}

function explicar(i: Intencion, hueco: Hueco, ahora: DateTime): string {
  const vence = i.venceEl ? DateTime.fromISO(i.venceEl) : null
  if (vence?.isValid) {
    // Día contra día, no instante contra medianoche: una fecha límite a las
    // 11:59 de mañana está a 1,99 días, y redondeando hacia arriba saldría
    // «vence en 2 días» sobre algo que vence mañana.
    const dias = Math.round(
      vence.startOf('day').diff(ahora.startOf('day'), 'days').days)
    if (dias <= 0) return 'vence hoy'
    if (dias === 1) return 'vence mañana'
    if (dias <= 3) return `vence en ${dias} días`
  }
  if (i.prioridad === 'urgente') return 'está marcado urgente'
  if (i.prioridad === 'alta') return 'está marcado alto'

  const horas = Math.floor(hueco.minutos / 60)
  return horas > 0
    ? `ahí tienes ${horas} hora${horas === 1 ? '' : 's'} libres`
    : `ahí tienes ${hueco.minutos} minutos libres`
}
