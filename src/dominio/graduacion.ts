import { DateTime } from 'luxon'

/**
 * ¿Ya se le puede soltar la correa?
 *
 * El spec pone un número y no una sensación: **≥95 % de aciertos en
 * agenda durante 5 días consecutivos**. Sin esto, salir del modo sombra
 * era una corazonada, y la corazonada de quien construyó el sistema es la
 * peor consejera que hay para decidir si puede borrar eventos de verdad.
 *
 * Todo el cálculo es código puro sobre los veredictos que puso Marcelo. No
 * se infiere nada: una acción sin juzgar no cuenta ni a favor ni en
 * contra, porque suponer que lo que no revisó estaba bien es exactamente
 * cómo un número así se vuelve mentira.
 */

export interface AccionJuzgada {
  id: number
  creadaEn: string
  veredicto: 'acierto' | 'error' | null
}

export interface Dia {
  fecha: string
  aciertos: number
  errores: number
  /** Hechas ese día pero todavía sin ✓ ni ✗. */
  sinJuzgar: number
  /** `null` cuando ese día no hay nada juzgado: no es 0 %, es «no se sabe». */
  precision: number | null
  cumple: boolean
}

export interface Graduacion {
  dias: Dia[]
  /** Días consecutivos, hasta hoy, que cumplen el listón. */
  rachaActual: number
  /** Cuántos hacen falta. */
  rachaNecesaria: number
  precisionNecesaria: number
  /** Ya cumple el criterio del spec. */
  puedeGraduarse: boolean
  totalJuzgadas: number
  sinJuzgar: number
  /** Qué falta, en una frase. */
  dictamen: string
}

const LISTON = 0.95
const DIAS_SEGUIDOS = 5

/**
 * Un día cuenta si tiene algo juzgado.
 *
 * Un día sin acciones no rompe la racha —no pasó nada, no hay nada que
 * medir— pero tampoco la alimenta. Si contara como acierto, cinco días de
 * vacaciones graduarían a la asistente sin que hubiera leído un correo.
 */
export function evaluarDia(acciones: readonly AccionJuzgada[], fecha: string): Dia {
  const aciertos = acciones.filter((a) => a.veredicto === 'acierto').length
  const errores = acciones.filter((a) => a.veredicto === 'error').length
  const sinJuzgar = acciones.filter((a) => a.veredicto === null).length
  const juzgadas = aciertos + errores

  const precision = juzgadas === 0 ? null : aciertos / juzgadas
  return {
    fecha,
    aciertos,
    errores,
    sinJuzgar,
    precision,
    cumple: precision !== null && precision >= LISTON,
  }
}

export function medirGraduacion(
  acciones: readonly AccionJuzgada[],
  ahora: DateTime,
  dias = 14
): Graduacion {
  const zona = ahora.zoneName ?? 'America/Bogota'

  const porDia = new Map<string, AccionJuzgada[]>()
  for (const a of acciones) {
    const f = DateTime.fromISO(a.creadaEn, { zone: zona }).toISODate()
    if (!f) continue
    porDia.set(f, [...(porDia.get(f) ?? []), a])
  }

  // De más viejo a más nuevo, incluyendo los días vacíos: la racha se mide
  // sobre el calendario, no sobre los días en que hubo trabajo.
  const evaluados: Dia[] = []
  for (let i = dias - 1; i >= 0; i--) {
    const fecha = ahora.minus({ days: i }).toISODate()!
    evaluados.push(evaluarDia(porDia.get(fecha) ?? [], fecha))
  }

  // Se cuenta hacia atrás desde hoy. Un día sin nada juzgado no suma pero
  // tampoco corta: lo que corta es un día con errores por encima del listón.
  let racha = 0
  for (let i = evaluados.length - 1; i >= 0; i--) {
    const d = evaluados[i]!
    if (d.precision === null) continue
    if (!d.cumple) break
    racha++
  }

  const totalJuzgadas = evaluados.reduce((t, d) => t + d.aciertos + d.errores, 0)
  const sinJuzgar = evaluados.reduce((t, d) => t + d.sinJuzgar, 0)
  const puedeGraduarse = racha >= DIAS_SEGUIDOS

  return {
    dias: evaluados,
    rachaActual: racha,
    rachaNecesaria: DIAS_SEGUIDOS,
    precisionNecesaria: LISTON,
    puedeGraduarse,
    totalJuzgadas,
    sinJuzgar,
    dictamen: dictaminar({ racha, puedeGraduarse, totalJuzgadas, sinJuzgar }),
  }
}

function dictaminar(e: {
  racha: number; puedeGraduarse: boolean; totalJuzgadas: number; sinJuzgar: number
}): string {
  if (e.totalJuzgadas === 0) {
    return e.sinJuzgar > 0
      ? `Hay ${e.sinJuzgar} acciones sin revisar. Márcalas ✓ o ✗ y empiezo a contar.`
      : 'Todavía no ha hecho nada por su cuenta que puedas juzgar.'
  }
  if (e.puedeGraduarse) {
    return 'Ya cumple el criterio: ≥95 % durante 5 días seguidos. '
      + 'Puedes soltarle la correa con MODO_SOMBRA=false.'
  }
  const faltan = DIAS_SEGUIDOS - e.racha
  const cola = e.sinJuzgar > 0 ? ` Te quedan ${e.sinJuzgar} sin revisar.` : ''
  return e.racha === 0
    ? `Aún no encadena ningún día al 95 %. Faltan ${DIAS_SEGUIDOS}.${cola}`
    : `Lleva ${e.racha} día${e.racha === 1 ? '' : 's'} seguidos al 95 %. `
      + `Faltan ${faltan}.${cola}`
}
