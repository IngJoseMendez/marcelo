import { DateTime } from 'luxon'
import type { Reloj } from '../puertos/reloj.ts'
import type { RepoIntenciones } from '../repos/intenciones.ts'
import type { ServicioJornada } from './jornada.ts'
import { proponer, type Propuesta } from '../dominio/proponer.ts'

/**
 * «Tienes dos horas libres el jueves, ¿meto ahí el estudio del parcial?»
 *
 * Es el salto de herramienta a asistente: en vez de esperar a que le
 * pidan, mira lo que hay por hacer y dónde no hay nada, y lo junta.
 *
 * Proponer no escribe nada. Aceptar una propuesta pasa por
 * `ServicioAgenda.agendar`, que es el mismo camino de siempre —política,
 * inversa antes de aplicar, auditoría, deshacer—. Una intención agendada
 * por error se revierte igual que una clase cancelada por error.
 */

export interface DepsPropuestas {
  reloj: Reloj
  jornada: ServicioJornada
  repoIntenciones: RepoIntenciones
}

export interface PropuestasDelDia {
  fecha: string
  propuestas: Propuesta[]
}

export function crearServicioPropuestas(d: DepsPropuestas) {
  async function delDia(fechaIso?: string, cuantas = 2): Promise<PropuestasDelDia> {
    const ahora = d.reloj.ahora()
    const jornada = await d.jornada.del(fechaIso)
    const intenciones = await d.repoIntenciones.bandeja()

    // El «ahora» contra el que se descartan los huecos pasados es el de
    // verdad sólo si el día es hoy. Para mañana, cuenta el día entero:
    // si no, a las 4 de la tarde no propondría nada antes de esa hora.
    const referencia = jornada.esHoy
      ? ahora
      : DateTime.fromISO(jornada.fecha, { zone: ahora.zoneName ?? undefined }).startOf('day')

    return {
      fecha: jornada.fecha,
      propuestas: proponer({
        intenciones: intenciones.map((i) => ({
          id: i.id,
          titulo: i.titulo,
          prioridad: i.prioridad,
          duracionMin: i.duracionMin,
          venceEl: i.venceEl ? new Date(i.venceEl).toISOString() : null,
          estado: i.estado,
        })),
        huecos: jornada.huecos,
        ahora: referencia,
        cuantas,
      }),
    }
  }

  return {
    delDia,

    /**
     * La de mañana, para el resumen de la noche.
     *
     * De noche, proponer huecos de hoy no sirve de nada: el día ya se fue.
     * Lo útil a las nueve es saber dónde va a caber mañana lo que quedó
     * pendiente.
     */
    async paraManana(): Promise<PropuestasDelDia> {
      const manana = d.reloj.ahora().plus({ days: 1 }).toISODate()!
      return delDia(manana, 1)
    },
  }
}

export type ServicioPropuestas = ReturnType<typeof crearServicioPropuestas>
