import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

/**
 * Sesión sin contraseñas ni tabla de usuarios.
 *
 * Marcelo es el único usuario: está autenticado por saber el código. Cuando
 * exista el bot de Telegram, el código lo mandará él y será de un solo uso;
 * la cookie firmada de aquí no cambia. Lo que no puede pasar es que la app
 * quede abierta: enseña movimientos bancarios, y una URL secreta no es
 * autenticación.
 */

const NOMBRE = 'sc_sesion'
const DIAS = 30

function firma(dato: string, secreto: string): string {
  return createHmac('sha256', secreto).update(dato).digest('hex')
}

function iguales(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

function secreto(): string | null {
  return process.env.SECRETO_SESION || null
}

export function codigoConfigurado(): boolean {
  return Boolean(process.env.CODIGO_ACCESO && process.env.SECRETO_SESION)
}

export function codigoCorrecto(codigo: string): boolean {
  const esperado = process.env.CODIGO_ACCESO
  if (!esperado) return false
  return iguales(codigo.trim(), esperado)
}

/** `<vence>.<firma>` — la firma es lo que impide fabricarla desde el navegador. */
function valorFirmado(venceEn: number, clave: string): string {
  return `${venceEn}.${firma(String(venceEn), clave)}`
}

export async function abrirSesion(): Promise<boolean> {
  const clave = secreto()
  if (!clave) return false
  const venceEn = Date.now() + DIAS * 86400_000
  const galletas = await cookies()
  galletas.set(NOMBRE, valorFirmado(venceEn, clave), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: DIAS * 86400,
  })
  return true
}

export async function cerrarSesion(): Promise<void> {
  const galletas = await cookies()
  galletas.delete(NOMBRE)
}

/** Toda pantalla con datos empieza por aquí. */
export async function exigirSesion(): Promise<void> {
  if (!(await haySesion())) redirect('/entrar')
}

export async function haySesion(): Promise<boolean> {
  const clave = secreto()
  if (!clave) return false

  const valor = (await cookies()).get(NOMBRE)?.value
  if (!valor) return false

  const [vence, recibida] = valor.split('.')
  if (!vence || !recibida) return false
  if (!iguales(recibida, firma(vence, clave))) return false
  return Number(vence) > Date.now()
}
