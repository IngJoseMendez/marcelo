import { NextResponse } from 'next/server'
import { enviar } from '@/lib/api'
import { haySesion } from '@/lib/sesion'

export async function POST(peticion: Request) {
  if (!(await haySesion())) {
    return NextResponse.json({ error: 'Sin sesión' }, { status: 401 })
  }

  const cuerpo = (await peticion.json().catch(() => ({}))) as { texto?: string }
  if (!cuerpo.texto?.trim()) {
    return NextResponse.json({ error: 'No dijiste nada' }, { status: 400 })
  }

  // El origen lo pone el servidor. Lo que se escribe en la app es texto
  // confiable; el día que haya micrófono, la ruta que sube el audio será
  // otra y dirá 'voz'. Si lo mandara el navegador, bastaría con mentir en
  // un campo para saltarse la confirmación que la política le exige a la
  // transcripción.
  const r = await enviar<unknown>('/instruccion', {
    texto: cuerpo.texto,
    origen: 'texto',
    canal: 'web',
  })

  return r.ok
    ? NextResponse.json(r.datos)
    : NextResponse.json({ error: r.error }, { status: r.estado ?? 502 })
}
