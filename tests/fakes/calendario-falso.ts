import type {
  AccionCalendario,
  EventoInstancia,
  Inversa,
  SumideroCalendario,
} from '../../src/puertos/sumidero-calendario.ts'

export class CalendarioFalso implements SumideroCalendario {
  public readonly sombra = false
  public seriesBorradas: string[] = []
  public eventosBorrados: string[] = []

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

  async eventosEnRango(
    _calendarId: string,
    desdeIso: string,
    hastaIso: string
  ): Promise<EventoInstancia[]> {
    const desde = Date.parse(desdeIso)
    const hasta = Date.parse(hastaIso)
    return this.instancias
      // Como en Google con showDeleted=false: lo cancelado no vuelve en la lista.
      .filter((i) => i.estado === 'confirmado')
      .filter((i) => Date.parse(i.inicio) < hasta && Date.parse(i.fin) > desde)
      .sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio))
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
    } else if (a.tipo === 'crear_evento') {
      this.instancias.push({
        eventoId: a.eventoId,
        instanciaId: a.eventoId,
        inicio: a.inicio,
        fin: a.fin,
        titulo: a.titulo,
        estado: 'confirmado',
      })
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
    } else if (inv.tipo === 'borrar_evento') {
      this.eventosBorrados.push(inv.eventoId)
      this.instancias = this.instancias.filter((x) => x.eventoId !== inv.eventoId)
    } else {
      this.seriesBorradas = this.seriesBorradas.filter((e) => e !== inv.eventoId)
    }
  }
}
