import { NextResponse } from 'next/server'
import { enviar } from '@/lib/api'
import { haySesion } from '@/lib/sesion'

export async function POST(
  _peticion: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await haySesion())) {
    return NextResponse.json({ error: 'Sin sesión' }, { status: 401 })
  }

  const { id } = await params
  const r = await enviar<unknown>(`/instrucciones/${encodeURIComponent(id)}/confirmar`)
  return r.ok
    ? NextResponse.json(r.datos)
    : NextResponse.json({ error: r.error, motivo: r.error }, { status: r.estado ?? 502 })
}
