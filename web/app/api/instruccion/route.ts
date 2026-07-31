import { NextResponse } from 'next/server'
import { enviar } from '@/lib/api'
import { haySesion } from '@/lib/sesion'

export async function POST(peticion: Request) {
  if (!(await haySesion())) {
    return NextResponse.json({ error: 'Sin sesión' }, { status: 401 })
  }

  const cuerpo = (await peticion.json().catch(() => ({}))) as
    { texto?: string; boleta?: string }
  if (!cuerpo.texto?.trim()) {
    return NextResponse.json({ error: 'No dijiste nada' }, { status: 400 })
  }

  // El origen no lo declara nadie: la asistente lo deduce de si el texto
  // viene con la firma que ella misma puso al transcribirlo. Por eso aquí
  // sólo se reenvía la boleta tal cual; mentir no es una opción disponible.
  const r = await enviar<unknown>('/instruccion', {
    texto: cuerpo.texto,
    boleta: cuerpo.boleta,
    canal: 'web',
  })

  return r.ok
    ? NextResponse.json(r.datos)
    : NextResponse.json({ error: r.error }, { status: r.estado ?? 502 })
}
