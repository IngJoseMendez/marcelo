import type { RepoAcciones } from '../repos/acciones.ts'
import type { RepoIntenciones } from '../repos/intenciones.ts'
import type { SumideroCalendario } from '../puertos/sumidero-calendario.ts'

export interface ResultadoDeshacer {
  ok: boolean
  motivo?: string
  accionId?: number
}

export function crearServicioDeshacer(
  repo: RepoAcciones,
  calendario: SumideroCalendario,
  intenciones?: RepoIntenciones
) {
  async function deshacer(id: number): Promise<ResultadoDeshacer> {
    const accion = await repo.porId(id)
    if (!accion) return { ok: false, motivo: 'Esa acción no existe' }
    if (accion.estado === 'deshecha') return { ok: false, motivo: 'Ya estaba deshecha' }
    if (accion.estado === 'sombra') {
      return { ok: false, motivo: 'En modo sombra no se aplicó nada, no hay qué deshacer' }
    }

    await calendario.restaurar(accion.payloadInverso)
    // La auditoría es append-only: se marca el estado, nunca se borra la
    // fila. Si algo salió mal siempre queda el rastro de qué pasó y por qué.
    await repo.marcarDeshecha(id)

    // Si lo que se deshizo fue agendar algo, la tarea no desaparece: vuelve
    // a la bandeja. Perderla sería peor que no haberla agendado nunca.
    if (accion.tipo === 'crear_evento') await intenciones?.devolverPorAccion(id)

    return { ok: true, accionId: id }
  }

  return {
    deshacer,

    async deshacerUltima(): Promise<ResultadoDeshacer> {
      const ultima = await repo.ultimaDeshacible()
      if (!ultima) return { ok: false, motivo: 'No hay nada reciente que deshacer' }
      return deshacer(ultima.id)
    },
  }
}

export type ServicioDeshacer = ReturnType<typeof crearServicioDeshacer>
