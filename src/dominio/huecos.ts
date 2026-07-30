import type { DateTime } from 'luxon'

export interface Ocupado {
  inicio: DateTime
  fin: DateTime
}

export interface Hueco {
  inicio: DateTime
  fin: DateTime
  minutos: number
}

/**
 * Los ratos libres del día.
 *
 * Es lo que hace útil la vista de agenda: una lista es ciega al espacio
 * vacío, y sin ver el hueco no se puede decidir qué meterle. También es lo
 * que permite que la asistente proponga «tienes dos horas el jueves».
 *
 * Los eventos solapados se funden antes de medir; si no, dos clases que se
 * pisan producirían un hueco fantasma entre ellas.
 */
export function huecosLibres(
  ocupados: readonly Ocupado[],
  ventana: { inicio: DateTime; fin: DateTime },
  minimoMinutos = 15
): Hueco[] {
  const dentro = ocupados
    .map((o) => ({
      inicio: o.inicio < ventana.inicio ? ventana.inicio : o.inicio,
      fin: o.fin > ventana.fin ? ventana.fin : o.fin,
    }))
    .filter((o) => o.fin > o.inicio && o.inicio < ventana.fin && o.fin > ventana.inicio)
    .sort((a, b) => a.inicio.toMillis() - b.inicio.toMillis())

  const fundidos: Ocupado[] = []
  for (const o of dentro) {
    const ultimo = fundidos[fundidos.length - 1]
    // Se funden también los que apenas se tocan: entre las 10:00 y las
    // 10:00 no hay hueco, hay una costura.
    if (ultimo && o.inicio <= ultimo.fin) {
      if (o.fin > ultimo.fin) ultimo.fin = o.fin
    } else {
      fundidos.push({ ...o })
    }
  }

  const huecos: Hueco[] = []
  let cursor = ventana.inicio

  for (const o of fundidos) {
    if (o.inicio > cursor) agregar(huecos, cursor, o.inicio, minimoMinutos)
    if (o.fin > cursor) cursor = o.fin
  }
  if (cursor < ventana.fin) agregar(huecos, cursor, ventana.fin, minimoMinutos)

  return huecos
}

function agregar(destino: Hueco[], inicio: DateTime, fin: DateTime, minimo: number): void {
  const minutos = Math.round(fin.diff(inicio, 'minutes').minutes)
  if (minutos >= minimo) destino.push({ inicio, fin, minutos })
}
