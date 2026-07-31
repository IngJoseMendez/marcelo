import { hora, hora12 } from './tiempo'
import type { EntradaCronica, Marca } from './tipos'

/**
 * Cómo se cuenta lo que hizo.
 *
 * En modo sombra habla en condicional —«la habría cancelado»— porque no tocó
 * nada. Decirlo en pasado durante las dos semanas de ensayo sería mentir en
 * la única pantalla que existe para generar confianza.
 */
export function firmaDe(m: Marca): string {
  const cuando = hora12(m.cuando)

  if (m.tipo === 'cancelar_instancia') {
    if (m.ensayo) return `La habría cancelado · ${cuando}`
    return m.porElla ? `Ella la canceló · ${cuando}` : `Cancelada · ${cuando}`
  }

  if (m.tipo === 'mover_evento') {
    const desde = m.desdeInicio ? ` de las ${hora(m.desdeInicio)}` : ''
    if (m.ensayo) return `La habría movido${desde} · ${cuando}`
    return m.porElla ? `Ella la movió${desde} · ${cuando}` : `Movida${desde} · ${cuando}`
  }

  if (m.tipo === 'crear_evento') {
    if (m.ensayo) return `La habría agendado · ${cuando}`
    return m.porElla ? `Ella la agendó · ${cuando}` : `La agendaste desde la bandeja · ${cuando}`
  }

  return `La tocó ella · ${cuando}`
}

export function cronicaEnPalabras(e: EntradaCronica): string {
  const titulo = `«${e.titulo}»`
  const aLas = e.objetivo?.inicio ? ` de las ${hora(e.objetivo.inicio)}` : ''

  // Todavía no lo ha hecho: contarlo en pasado sería mentir en la única
  // pantalla que existe para poder confiar en ella.
  if (e.estado === 'pendiente') {
    return `Entendí: ${e.resumen ?? `tocar ${titulo}`}. Esperando que confirmes.`
  }
  if (e.estado === 'descartada') {
    return `Entendí mal: ${e.resumen ?? `tocar ${titulo}`}.`
  }

  if (e.tipo === 'cancelar_instancia') {
    return `${e.ensayo ? 'Habría cancelado' : 'Cancelé'} ${titulo}${aLas}.`
  }
  if (e.tipo === 'mover_evento') {
    const desde = e.objetivo?.desdeInicio ? ` de las ${hora(e.objetivo.desdeInicio)}` : ''
    const hasta = e.objetivo?.inicio ? ` a las ${hora(e.objetivo.inicio)}` : ''
    return `${e.ensayo ? 'Habría movido' : 'Moví'} ${titulo}${desde}${hasta}.`
  }
  if (e.tipo === 'crear_evento') {
    return `${e.ensayo ? 'Habría agendado' : 'Agendé'} ${titulo}${aLas.replace(' de las', ' a las')}.`
  }
  if (e.tipo === 'borrar_serie') {
    return `${e.ensayo ? 'Habría borrado' : 'Borré'} ${titulo} completo.`
  }
  return `${e.ensayo ? 'Habría tocado' : 'Toqué'} ${titulo}.`
}

/** 'ramirez@uni.edu.co' → 'prof. Ramírez' no se puede inventar; se muestra el correo. */
export function deQuien(e: EntradaCronica): string | null {
  if (e.correo) return `correo de ${e.correo.remitente}`
  if (e.origen === 'voz') return 'se lo dijiste hablando'
  if (e.origen === 'texto') return 'se lo escribiste'
  return null
}
