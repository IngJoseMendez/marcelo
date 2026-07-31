import { NextResponse } from 'next/server'
import { subirAudio } from '@/lib/api'
import { haySesion } from '@/lib/sesion'

/** 10 MB: una nota de voz de dos minutos en opus pesa unos 300 KB. */
const MAXIMO = 10 * 1024 * 1024

export async function POST(peticion: Request) {
  if (!(await haySesion())) {
    return NextResponse.json({ error: 'Sin sesión' }, { status: 401 })
  }

  const datos = await peticion.arrayBuffer()
  if (datos.byteLength === 0) {
    return NextResponse.json({ error: 'No llegó audio' }, { status: 400 })
  }
  if (datos.byteLength > MAXIMO) {
    return NextResponse.json({ error: 'Esa nota es muy larga' }, { status: 413 })
  }

  // El audio pasa tal cual: quien decide si eso fue voz —y por tanto si hay
  // que confirmar antes de tocar el calendario— es la asistente, que es
  // quien firma la transcripción.
  const r = await subirAudio<unknown>(
    '/transcribir', datos,
    peticion.headers.get('content-type') ?? 'audio/webm')

  return r.ok
    ? NextResponse.json(r.datos)
    : NextResponse.json({ error: r.error }, { status: r.estado ?? 502 })
}
