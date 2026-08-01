import { NextResponse } from 'next/server'
import { abrirSesion, cerrarSesion, codigoCorrecto } from '@/lib/sesion'
import { enviar } from '@/lib/api'

/** ¿Es el código que la asistente acaba de mandar por Telegram? */
async function verificarConLaAsistente(codigo: string): Promise<boolean> {
  const r = await enviar<{ ok: boolean }>('/acceso/verificar', { codigo })
  return r.ok && r.datos.ok
}

/** Pedirle a la asistente que le mande un código nuevo al teléfono. */
export async function PUT() {
  const r = await enviar<{ enviado: boolean }>('/acceso/pedir')
  return r.ok
    ? NextResponse.json({ enviado: true })
    : NextResponse.json({ error: r.error }, { status: r.estado ?? 502 })
}

/** Freno tosco contra fuerza bruta: el código es corto y la puerta es única. */
const intentos = { fallos: 0, desde: Date.now() }
const VENTANA = 10 * 60_000
const MAXIMO = 12

export async function POST(peticion: Request) {
  if (Date.now() - intentos.desde > VENTANA) {
    intentos.fallos = 0
    intentos.desde = Date.now()
  }
  if (intentos.fallos >= MAXIMO) {
    return NextResponse.json(
      { error: 'Demasiados intentos. Espera unos minutos.' }, { status: 429 })
  }

  const cuerpo = (await peticion.json().catch(() => ({}))) as { codigo?: string }

  /**
   * Primero el código de un solo uso que manda el bot; si la asistente no
   * tiene Telegram, el código fijo del entorno.
   *
   * El de un solo uso caduca y se quema al usarse, así que un código
   * filtrado deja de servir en cinco minutos. El fijo es el respaldo para
   * que la app siga entrando cuando el bot no está configurado — pero es
   * un respaldo, no la puerta principal.
   */
  const valido = cuerpo.codigo
    ? (await verificarConLaAsistente(cuerpo.codigo)) || codigoCorrecto(cuerpo.codigo)
    : false

  if (!valido) {
    intentos.fallos++
    // Un fallo lento hace que probar códigos a mano deje de valer la pena.
    await new Promise((r) => setTimeout(r, 400))
    return NextResponse.json({ error: 'Código incorrecto' }, { status: 401 })
  }

  if (!(await abrirSesion())) {
    return NextResponse.json(
      { error: 'Falta SECRETO_SESION en el entorno' }, { status: 503 })
  }
  intentos.fallos = 0
  return NextResponse.json({ ok: true })
}

export async function DELETE() {
  await cerrarSesion()
  return NextResponse.json({ ok: true })
}
