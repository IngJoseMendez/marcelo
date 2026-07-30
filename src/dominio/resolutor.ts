import type { Compromiso, Confianza } from './tipos.ts'
import type { Intervalo } from './fechas.ts'

/**
 * Responde la pregunta central del sistema: llega "la clase de hoy se
 * cancela" — ¿a cuál de sus compromisos apunta?
 *
 * Todo se calcula en código. El LLM sólo entra a desempatar, y ahí recibe
 * una lista cerrada de candidatos.
 */

const PESOS = {
  remitenteVinculado: 50,
  hiloConocido: 40,
  aliasEnTexto: 20,
  tituloEnTexto: 20,
  ventanaTemporal: 15,
} as const

const UMBRAL_ALTO = 70
const UMBRAL_MINIMO = 20
/** Dos candidatos más cerca que esto no se distinguen: hay que desempatar. */
const MARGEN_EMPATE = 10

export interface Candidato {
  compromiso: Compromiso
  puntaje: number
  senales: string[]
}

export type Resolucion =
  | { estado: 'resuelto'; candidato: Candidato; confianza: Confianza }
  | { estado: 'empate'; candidatos: Candidato[] }
  | { estado: 'sin_candidatos' }

export interface EntradaResolutor {
  compromisos: Compromiso[]
  remitente: string
  texto: string
  intervalo: Intervalo | null
  ambiguo: boolean
  threadCompromisoId: number | null
}

/** Minúsculas y sin tildes, para que "FÍSICA" empareje con "fisica". */
export function normalizar(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Saca "a@b.com" de "Nombre Visible <a@b.com>". */
export function correoDe(remitente: string): string {
  const m = remitente.match(/<([^>]+)>/)
  return (m?.[1] ?? remitente).trim().toLowerCase()
}

function puntuar(c: Compromiso, e: EntradaResolutor): Candidato {
  const senales: string[] = []
  let puntaje = 0

  const texto = normalizar(e.texto)
  const remitente = correoDe(e.remitente)

  if (c.remitentesVinculados.some((r) => r.trim().toLowerCase() === remitente)) {
    puntaje += PESOS.remitenteVinculado
    senales.push('remitente_vinculado')
  }
  if (e.threadCompromisoId === c.id) {
    puntaje += PESOS.hiloConocido
    senales.push('hilo_conocido')
  }
  if (c.alias.some((a) => a.length > 0 && texto.includes(normalizar(a)))) {
    puntaje += PESOS.aliasEnTexto
    senales.push('alias_en_texto')
  }
  if (c.titulo.length > 0 && texto.includes(normalizar(c.titulo))) {
    puntaje += PESOS.tituloEnTexto
    senales.push('titulo_en_texto')
  }
  if (e.intervalo !== null) {
    puntaje += PESOS.ventanaTemporal
    senales.push('ventana_temporal')
  }

  return { compromiso: c, puntaje, senales }
}

function calcularConfianza(c: Candidato, e: EntradaResolutor): Confianza {
  // Un referente ambiguo nunca produce confianza alta, por bien que
  // empareje el compromiso: el riesgo está en el día, no en cuál clase.
  if (e.ambiguo) return 'media'
  // Sin ventana temporal no se sabe qué instancia tocar.
  if (e.intervalo === null) return 'media'
  return c.puntaje >= UMBRAL_ALTO ? 'alta' : 'media'
}

export function resolver(e: EntradaResolutor): Resolucion {
  const candidatos = e.compromisos
    .filter((c) => c.activo)
    .map((c) => puntuar(c, e))
    .filter((c) => c.puntaje >= UMBRAL_MINIMO)
    .sort((a, b) => b.puntaje - a.puntaje)

  const mejor = candidatos[0]
  if (!mejor) return { estado: 'sin_candidatos' }

  const empatados = candidatos.filter((c) => mejor.puntaje - c.puntaje < MARGEN_EMPATE)
  if (empatados.length > 1) return { estado: 'empate', candidatos: empatados }

  return { estado: 'resuelto', candidato: mejor, confianza: calcularConfianza(mejor, e) }
}
