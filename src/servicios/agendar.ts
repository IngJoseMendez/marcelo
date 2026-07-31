import { DateTime } from 'luxon'
import { nuevoIdEvento } from '../dominio/identificadores.ts'
import { decidir, type Decision } from '../dominio/politica.ts'
import { crearConInversa } from '../pipeline/actuador.ts'
import type { Reloj } from '../puertos/reloj.ts'
import type { AccionCrearEvento, SumideroCalendario } from '../puertos/sumidero-calendario.ts'
import type { RepoAcciones } from '../repos/acciones.ts'
import type { RepoIntenciones } from '../repos/intenciones.ts'
import type { Origen } from '../dominio/tipos.ts'

export interface ResultadoAgendar {
  ok: boolean
  motivo?: string
  decision?: Decision
  accionId?: number
  eventoId?: string
  inicio?: string
  fin?: string
  ensayo?: boolean
}

export interface DepsAgenda {
  reloj: Reloj
  calendario: SumideroCalendario
  repoAcciones: RepoAcciones
  repoIntenciones: RepoIntenciones
  calendarId: string
  /** Inyectable para que las pruebas no dependan del azar. */
  nuevoId?: () => string
}

/**
 * Meter una intención en un hueco.
 *
 * No hay una segunda vía de escritura al calendario: agendar pasa por la
 * misma política, deja la misma inversa y se deshace igual que una clase
 * cancelada por error. Si hubiera un atajo, agenda y auditoría acabarían
 * contando historias distintas.
 */
export function crearServicioAgenda(d: DepsAgenda) {
  const nuevoId = d.nuevoId ?? (() => nuevoIdEvento())

  return {
    async agendar(
      intencionId: number,
      inicioIso: string,
      origen: Origen = 'texto'
    ): Promise<ResultadoAgendar> {
      const intencion = await d.repoIntenciones.porId(intencionId)
      if (!intencion) return { ok: false, motivo: 'Esa intención no existe' }
      if (intencion.estado !== 'pendiente') {
        return { ok: false, motivo: 'Esa intención ya no está en la bandeja' }
      }

      const zona = d.reloj.ahora().zoneName ?? 'America/Bogota'
      const inicio = DateTime.fromISO(inicioIso, { zone: zona })
      if (!inicio.isValid) return { ok: false, motivo: 'Hora de inicio inválida' }
      const fin = inicio.plus({ minutes: intencion.duracionMin })

      const decision = decidir({
        origen,
        tipo: 'crear_evento',
        confianza: 'alta',
        silenciadoPorRegla: false,
      })
      if (decision === 'preguntar' || decision === 'confirmar' || decision === 'ignorar') {
        return { ok: false, decision, motivo: 'Necesita que Marcelo confirme' }
      }

      const accion: AccionCrearEvento = {
        tipo: 'crear_evento',
        calendarId: d.calendarId,
        eventoId: nuevoId(),
        titulo: intencion.titulo,
        inicio: inicio.toISO({ suppressMilliseconds: true })!,
        fin: fin.toISO({ suppressMilliseconds: true })!,
      }

      const inversa = await crearConInversa(d.calendario, accion)

      const ensayo = d.calendario.sombra
      const accionId = await d.repoAcciones.registrar({
        tipo: 'crear_evento',
        origen,
        correoId: null,
        compromisoId: null,
        confianza: 'alta',
        payloadAplicado: accion,
        payloadInverso: inversa,
        estado: ensayo ? 'sombra' : 'aplicada',
      })

      // En sombra no se creó nada, así que la intención sigue en la bandeja:
      // marcarla agendada dejaría la bandeja mintiendo.
      if (!ensayo) {
        await d.repoIntenciones.marcarAgendada(intencionId, accionId, accion.eventoId)
      }

      return {
        ok: true, decision, accionId, ensayo,
        eventoId: accion.eventoId, inicio: accion.inicio, fin: accion.fin,
      }
    },
  }
}

export type ServicioAgenda = ReturnType<typeof crearServicioAgenda>
