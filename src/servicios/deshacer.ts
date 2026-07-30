import type { RepoAcciones } from '../repos/acciones.ts'
import type { SumideroCalendario } from '../puertos/sumidero-calendario.ts'

export interface ResultadoDeshacer {
  ok: boolean
  motivo?: string
}

export function crearServicioDeshacer(
  repo: RepoAcciones,
  calendario: SumideroCalendario
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
    return { ok: true }
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
