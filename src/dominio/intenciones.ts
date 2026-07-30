import type { DateTime } from 'luxon'

export type Prioridad = 'urgente' | 'alta' | 'normal' | 'baja'
export type EstadoIntencion = 'pendiente' | 'agendada' | 'hecha' | 'descartada'

/** Cuatro bloques bastan para decidir si algo cabe en un hueco. */
export const DURACIONES = [15, 30, 60, 120] as const
export type Duracion = (typeof DURACIONES)[number]

const ORDEN: Record<Prioridad, number> = { urgente: 3, alta: 2, normal: 1, baja: 0 }

/** Ordena la bandeja: lo urgente arriba, y a igual prioridad lo que vence antes. */
export function compararIntenciones(
  a: { prioridad: Prioridad; venceEl: Date | null },
  b: { prioridad: Prioridad; venceEl: Date | null }
): number {
  const porPrioridad = ORDEN[b.prioridad] - ORDEN[a.prioridad]
  if (porPrioridad !== 0) return porPrioridad
  // Sin fecha límite va al final: no compite con lo que sí tiene reloj.
  if (a.venceEl === null && b.venceEl === null) return 0
  if (a.venceEl === null) return 1
  if (b.venceEl === null) return -1
  return a.venceEl.getTime() - b.venceEl.getTime()
}

/**
 * La prioridad final la decide el código, no el modelo.
 *
 * El LLM propone una base leyendo el texto, pero la fecha límite manda: algo
 * que vence mañana es urgente aunque el correo suene tranquilo.
 *
 * Regla: **la fecha límite sólo puede subir la prioridad, nunca bajarla.**
 * Un plazo lejano no es evidencia de calma — puede ser algo enorme.
 */
export function calcularPrioridad(
  base: Prioridad,
  venceEl: DateTime | null,
  ahora: DateTime
): Prioridad {
  if (venceEl === null) return base

  const horas = venceEl.diff(ahora, 'hours').hours

  let porPlazo: Prioridad
  if (horas <= 24) porPlazo = 'urgente'
  else if (horas <= 72) porPlazo = 'alta'
  else if (horas <= 24 * 7) porPlazo = 'normal'
  else porPlazo = 'baja'

  return ORDEN[porPlazo] > ORDEN[base] ? porPlazo : base
}

/** Lleva una estimación libre al bloque más cercano. */
export function redondearDuracion(minutos: number): Duracion {
  if (!Number.isFinite(minutos) || minutos <= 0) return 30
  let mejor: Duracion = DURACIONES[0]
  for (const d of DURACIONES) {
    if (Math.abs(d - minutos) < Math.abs(mejor - minutos)) mejor = d
  }
  return mejor
}

/**
 * ¿Cabe la intención en el hueco? Sin colchón artificial: si el hueco es
 * de 30 y la tarea de 30, cabe. Inventar márgenes esconde tiempo real.
 */
export function cabeEn(duracion: Duracion, huecoMinutos: number): boolean {
  return huecoMinutos >= duracion
}
