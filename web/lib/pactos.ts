const DIAS: Record<string, string> = {
  MO: 'lunes', TU: 'martes', WE: 'miércoles', TH: 'jueves',
  FR: 'viernes', SA: 'sábado', SU: 'domingo',
}

/** 'lunes, miércoles y viernes' — la coma seca en una lista se lee como error. */
function enumerar(partes: string[]): string {
  if (partes.length === 0) return ''
  if (partes.length === 1) return partes[0]!
  return `${partes.slice(0, -1).join(', ')} y ${partes.at(-1)}`
}

/**
 * 'FREQ=WEEKLY;BYDAY=MO,WE' + 07:00–08:15 → 'Lunes y miércoles · 07:00–08:15'
 *
 * La RRULE es lenguaje de máquina; en la pantalla de Pactos hay que leer de
 * un vistazo cuándo se metió uno en qué.
 */
export function horarioLegible(
  rrule: string | null,
  horaInicio: string,
  horaFin: string
): string {
  const horas = `${horaInicio}–${horaFin}`
  if (!rrule) return `Sin repetición · ${horas}`

  const partes = Object.fromEntries(
    rrule.split(';').map((p) => {
      const [k, v] = p.split('=')
      return [k?.toUpperCase() ?? '', v ?? '']
    })
  )

  const dias = (partes.BYDAY ?? '')
    .split(',')
    .map((d) => DIAS[d.trim().toUpperCase().slice(-2)])
    .filter((d): d is string => Boolean(d))

  if (dias.length > 0) {
    const lista = enumerar(dias)
    return `${lista.charAt(0).toUpperCase()}${lista.slice(1)} · ${horas}`
  }

  const frecuencia: Record<string, string> = {
    DAILY: 'Todos los días', WEEKLY: 'Cada semana',
    MONTHLY: 'Cada mes', YEARLY: 'Cada año',
  }
  return `${frecuencia[partes.FREQ ?? ''] ?? 'Se repite'} · ${horas}`
}
