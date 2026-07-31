import { NextResponse } from 'next/server'
import { enviar } from '@/lib/api'
import { haySesion } from '@/lib/sesion'

export async function POST(
  peticion: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await haySesion())) {
    return NextResponse.json({ error: 'Sin sesión' }, { status: 401 })
  }

  const { id } = await params
  const cuerpo = (await peticion.json().catch(() => ({}))) as { estado?: string }

  const r = await enviar<unknown>(`/intenciones/${encodeURIComponent(id)}/cerrar`, {
    estado: cuerpo.estado,
  })
  return r.ok
    ? NextResponse.json(r.datos)
    : NextResponse.json({ error: r.error, motivo: r.error }, { status: r.estado ?? 502 })
}
