import { randomInt, timingSafeEqual } from 'node:crypto'

/**
 * El código de un solo uso que manda el bot.
 *
 * El spec lo pide así: sin contraseñas, sin OAuth, sin tabla de usuarios.
 * **Está autenticado por poseer el teléfono** — el código sale por
 * Telegram, que es un canal que ya sabemos que es suyo porque lo emparejó
 * él mismo desde la laptop.
 *
 * Un código fijo en una variable de entorno tenía dos problemas que esto
 * arregla: si se filtra no caduca nunca, y para cambiarlo hay que entrar a
 * Vercel y redesplegar.
 *
 * Vive en memoria a propósito. Un código de cinco minutos que no sobrevive
 * a un reinicio no es una pérdida: se pide otro. Guardarlo en la base
 * dejaría un rastro de credenciales por algo que dura menos que el café.
 */

export interface Vigente {
  codigo: string
  /** Milisegundos. */
  venceEn: number
  intentos: number
}

/** Cinco minutos: lo que tarda alguien en mirar el teléfono y volver. */
export const VIGENCIA_MS = 5 * 60_000

/** Pocos, y contados: seis dígitos se adivinan si se deja intentar. */
export const MAXIMO_INTENTOS = 5

/** Seis dígitos, y con `randomInt`: `Math.random` no sirve para esto. */
export function nuevoCodigo(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

function iguales(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  // Tiempo constante: un código no se adivina midiendo cuánto tarda el no.
  return x.length === y.length && timingSafeEqual(x, y)
}

export type Resultado =
  | { ok: true }
  | { ok: false; motivo: 'sin_codigo' | 'vencido' | 'agotado' | 'incorrecto' }

/**
 * Comprueba y consume.
 *
 * Devuelve también el estado que queda, para que quien llama decida si lo
 * guarda o lo tira. Que sea puro es lo que permite probar «vencido»,
 * «agotado» y «acertó al quinto intento» sin esperar cinco minutos.
 */
export function verificar(
  vigente: Vigente | null,
  intento: string,
  ahoraMs: number
): { resultado: Resultado; queda: Vigente | null } {
  if (!vigente) return { resultado: { ok: false, motivo: 'sin_codigo' }, queda: null }

  if (ahoraMs > vigente.venceEn) {
    return { resultado: { ok: false, motivo: 'vencido' }, queda: null }
  }
  if (vigente.intentos >= MAXIMO_INTENTOS) {
    // Se quema entero: dejarlo vivo tras cinco fallos es dejar que el
    // sexto acierte.
    return { resultado: { ok: false, motivo: 'agotado' }, queda: null }
  }

  if (!iguales(intento.trim(), vigente.codigo)) {
    return {
      resultado: { ok: false, motivo: 'incorrecto' },
      queda: { ...vigente, intentos: vigente.intentos + 1 },
    }
  }

  // De un solo uso: acertar lo consume. Si no, el mismo código serviría
  // toda la tarde y dejaría de ser de un solo uso.
  return { resultado: { ok: true }, queda: null }
}

export function emitir(ahoraMs: number): Vigente {
  return { codigo: nuevoCodigo(), venceEn: ahoraMs + VIGENCIA_MS, intentos: 0 }
}

/** Lo que se le dice a quien falló, sin regalar información de más. */
export const explicar = (motivo: Exclude<Resultado, { ok: true }>['motivo']): string => ({
  sin_codigo: 'No he mandado ningún código. Pídeme uno.',
  vencido: 'Ese código ya venció. Pídeme otro.',
  agotado: 'Demasiados intentos con ese código. Pídeme otro.',
  incorrecto: 'Ese código no es.',
}[motivo])
