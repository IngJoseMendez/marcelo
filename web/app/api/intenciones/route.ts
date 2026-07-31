import { NextResponse } from 'next/server'
import { enviar } from '@/lib/api'
import { haySesion } from '@/lib/sesion'

export async function POST(peticion: Request) {
  if (!(await haySesion())) {
    return NextResponse.json({ error: 'Sin sesión' }, { status: 401 })
  }

  const cuerpo = await peticion.json().catch(() => null)
  if (!cuerpo) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })

  const r = await enviar<unknown>('/intenciones', cuerpo)
  return r.ok
    ? NextResponse.json(r.datos)
    : NextResponse.json({ error: r.error }, { status: r.estado ?? 502 })
}
