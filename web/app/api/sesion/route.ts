import { NextResponse } from 'next/server'
import { abrirSesion, cerrarSesion, codigoCorrecto } from '@/lib/sesion'

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
  if (!cuerpo.codigo || !codigoCorrecto(cuerpo.codigo)) {
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
