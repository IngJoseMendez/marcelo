import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * La boleta de voz: la prueba de que un texto salió del transcriptor.
 *
 * El origen decide la desconfianza, así que no puede ser un campo que
 * mande el navegador: bastaría con decir "texto" para saltarse la
 * confirmación que la política le exige a una transcripción. El
 * transcriptor firma lo que transcribió, y sólo un texto con su firma
 * intacta entra al sistema como voz. Cambiar una palabra invalida la
 * boleta, que es exactamente lo que queremos: si el texto no es el que ella
 * oyó, no es voz.
 */

const VIGENCIA_MS = 10 * 60_000

function firma(vence: number, texto: string, secreto: string): string {
  return createHmac('sha256', secreto).update(`${vence}\n${texto}`).digest('hex')
}

function iguales(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export function firmarVoz(texto: string, secreto: string, ahoraMs: number): string {
  const vence = ahoraMs + VIGENCIA_MS
  return `${vence}.${firma(vence, texto, secreto)}`
}

/** ¿Este texto exacto lo produjo el transcriptor hace poco? */
export function esDeVoz(
  texto: string,
  boleta: string | undefined,
  secreto: string,
  ahoraMs: number
): boolean {
  if (!boleta || !secreto) return false
  const [vence, recibida] = boleta.split('.')
  if (!vence || !recibida) return false
  if (Number(vence) < ahoraMs) return false
  return iguales(recibida, firma(Number(vence), texto, secreto))
}
