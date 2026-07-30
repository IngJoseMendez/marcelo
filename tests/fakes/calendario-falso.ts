import type {
  AccionCalendario,
  EventoInstancia,
  Inversa,
  SumideroCalendario,
} from '../../src/puertos/sumidero-calendario.ts'

export class CalendarioFalso implements SumideroCalendario {
  public readonly sombra = false
  public seriesBorradas: string[] = []

  constructor(private instancias: EventoInstancia[] = []) {}

  async instanciasEnRango(
    _calendarId: string,
    eventoId: string,
    desdeIso: string,
    hastaIso: string
  ): Promise<EventoInstancia[]> {
    const desde = Date.parse(desdeIso)
    const hasta = Date.parse(hastaIso)
    return this.instancias
      .filter((i) => i.eventoId === eventoId)
      .filter((i) => {
        const t = Date.parse(i.inicio)
        return t >= desde && t <= hasta
      })
      .map((i) => ({ ...i }))
  }

  async aplicar(a: AccionCalendario): Promise<void> {
    if (a.tipo === 'cancelar_instancia') {
      const i = this.instancias.find((x) => x.instanciaId === a.instanciaId)
      if (i) i.estado = 'cancelado'
    } else if (a.tipo === 'mover_evento') {
      const i = this.instancias.find((x) => x.instanciaId === a.instanciaId)
      if (i) {
        i.inicio = a.nuevoInicio
        i.fin = a.nuevoFin
      }
    } else {
      this.seriesBorradas.push(a.eventoId)
      this.instancias = this.instancias.filter((x) => x.eventoId !== a.eventoId)
    }
  }

  async restaurar(inv: Inversa): Promise<void> {
    if (inv.tipo === 'recrear_instancia') {
      const i = this.instancias.find((x) => x.instanciaId === inv.instancia.instanciaId)
      if (i) Object.assign(i, inv.instancia)
      else this.instancias.push({ ...inv.instancia })
    } else if (inv.tipo === 'restaurar_horario') {
      const i = this.instancias.find((x) => x.instanciaId === inv.instanciaId)
      if (i) {
        i.inicio = inv.inicio
        i.fin = inv.fin
      }
    } else {
      this.seriesBorradas = this.seriesBorradas.filter((e) => e !== inv.eventoId)
    }
  }
}
