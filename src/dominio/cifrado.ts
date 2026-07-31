import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

/**
 * Cifrar el respaldo antes de que salga de la laptop.
 *
 * El volcado lleva dentro la agenda de Marcelo y sus movimientos
 * bancarios, y sale de la máquina por un canal que no es suyo. Sin cifrar,
 * el respaldo sería el punto más débil de todo el sistema: el único sitio
 * donde todo está junto, en claro y fuera de casa.
 *
 * AES-256-GCM y no CBC porque GCM **autentica**: si un byte cambió por el
 * camino, descifrar falla en vez de devolver basura silenciosa. En un
 * respaldo eso importa más que en ningún otro sitio — se descubre el día
 * que hace falta, y ese día ya no hay dónde volver.
 */

const ALGORITMO = 'aes-256-gcm'
const SAL = 16
const VECTOR = 12
const SELLO = 16
/** Cabecera: para reconocer el formato y poder cambiarlo algún día. */
const MARCA = Buffer.from('MSC1')

/**
 * La clave se deriva con scrypt y sal aleatoria por archivo.
 *
 * Aunque la clave del `.env` ya sea aleatoria, derivarla cuesta poco y
 * hace que dos respaldos de la misma noche no compartan material. Si
 * mañana alguien pone ahí una frase corta, esto es lo que la salva.
 */
const derivar = (clave: string, sal: Buffer): Buffer =>
  scryptSync(clave, sal, 32, { N: 16384, r: 8, p: 1 })

export function cifrar(datos: Uint8Array, clave: string): Buffer {
  if (!clave) throw new Error('No hay clave de respaldo: no voy a sacar esto en claro')

  const sal = randomBytes(SAL)
  const vector = randomBytes(VECTOR)
  const cifrador = createCipheriv(ALGORITMO, derivar(clave, sal), vector)
  const cuerpo = Buffer.concat([cifrador.update(datos), cifrador.final()])

  return Buffer.concat([MARCA, sal, vector, cifrador.getAuthTag(), cuerpo])
}

export function descifrar(sobre: Uint8Array, clave: string): Buffer {
  const b = Buffer.from(sobre)
  if (!b.subarray(0, MARCA.length).equals(MARCA)) {
    throw new Error('Esto no es un respaldo de Mi Segundo Cerebro')
  }

  let i = MARCA.length
  const sal = b.subarray(i, (i += SAL))
  const vector = b.subarray(i, (i += VECTOR))
  const sello = b.subarray(i, (i += SELLO))

  const descifrador = createDecipheriv(ALGORITMO, derivar(clave, sal), vector)
  descifrador.setAuthTag(sello)

  try {
    return Buffer.concat([descifrador.update(b.subarray(i)), descifrador.final()])
  } catch {
    // GCM no distingue «clave mala» de «archivo tocado», y está bien: en
    // los dos casos lo que hay que hacer es lo mismo.
    throw new Error('La clave no es o el archivo está dañado')
  }
}

/** Una clave nueva. Se enseña una vez y se guarda FUERA de la laptop. */
export const nuevaClaveRespaldo = (): string => randomBytes(32).toString('base64url')
