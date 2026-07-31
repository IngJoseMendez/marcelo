import { randomBytes } from 'node:crypto'

/**
 * Google acepta que el identificador de un evento lo ponga el cliente,
 * siempre que sea base32hex (0-9 y a-v) y tenga entre 5 y 1024 caracteres.
 *
 * Que lo pongamos nosotros es lo que permite guardar «borra el evento X»
 * antes de crear el evento X. Además vuelve idempotente el reintento: si la
 * primera llamada llegó y la respuesta se perdió, repetirla choca contra el
 * mismo id en vez de crear un duplicado.
 */
const ALFABETO = '0123456789abcdefghijklmnopqrstuv'

export function nuevoIdEvento(bytes: Uint8Array = randomBytes(20)): string {
  let id = ''
  for (const b of bytes) id += ALFABETO[b % 32]
  return id.length >= 5 ? id : id.padEnd(5, '0')
}
