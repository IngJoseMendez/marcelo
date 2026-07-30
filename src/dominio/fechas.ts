import { DateTime } from 'luxon'

/**
 * Cómo el correo se refirió a un momento, en crudo.
 *
 * El modelo devuelve esto y NUNCA una fecha calculada: la aritmética de
 * calendario es lo que peor hace un LLM, y aquí un error de una semana
 * significa borrar la clase equivocada.
 */
export type Referente =
  | { tipo: 'hoy' }
  | { tipo: 'manana' }
  | { tipo: 'fecha'; iso: string }
  | { tipo: 'dia_semana'; dia: number; modificador: 'este' | 'proximo' }
  | { tipo: 'desconocido' }

export interface Intervalo {
  inicio: DateTime
  fin: DateTime
}

export interface ResultadoReferente {
  intervalo: Intervalo
  /** El español coloquial no distingue bien: mejor preguntar que adivinar. */
  ambiguo: boolean
}

/**
 * Un "próximo <día>" que cae dentro de esta ventana se marca ambiguo.
 * Dicho un martes, "el próximo miércoles" significa mañana para unos
 * hablantes y la semana entrante para otros.
 */
const DIAS_ZONA_AMBIGUA = 2

function diaCompleto(d: DateTime): Intervalo {
  return { inicio: d.startOf('day'), fin: d.endOf('day') }
}

export function resolverReferente(
  ref: Referente,
  ahora: DateTime
): ResultadoReferente | null {
  switch (ref.tipo) {
    case 'hoy':
      return { intervalo: diaCompleto(ahora), ambiguo: false }

    case 'manana':
      return { intervalo: diaCompleto(ahora.plus({ days: 1 })), ambiguo: false }

    case 'fecha': {
      const fecha = DateTime.fromISO(ref.iso, { zone: ahora.zoneName ?? undefined })
      if (!fecha.isValid) return null
      return { intervalo: diaCompleto(fecha), ambiguo: false }
    }

    case 'dia_semana': {
      if (!Number.isInteger(ref.dia) || ref.dia < 1 || ref.dia > 7) return null

      // Luxon: 1 = lunes … 7 = domingo
      let delta = (ref.dia - ahora.weekday + 7) % 7
      // "Este miércoles" dicho un miércoles se refiere al siguiente, no a hoy.
      if (delta === 0) delta = 7

      if (ref.modificador === 'proximo' && delta <= DIAS_ZONA_AMBIGUA) {
        // Se elige la semana entrante, que es la lectura más común, pero se
        // marca ambiguo para que la política avise en vez de actuar callada.
        return { intervalo: diaCompleto(ahora.plus({ days: delta + 7 })), ambiguo: true }
      }

      return { intervalo: diaCompleto(ahora.plus({ days: delta })), ambiguo: false }
    }

    case 'desconocido':
      return null
  }
}
