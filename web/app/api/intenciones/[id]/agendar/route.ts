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
  const cuerpo = await peticion.json().catch(() => null)
  if (!cuerpo) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })

  // El origen lo pone el servidor: desde la app es texto escrito, y eso es lo
  // que decide la política. Si lo mandara el navegador, cualquiera podría
  // decir "texto" para saltarse la confirmación de la voz.
  const r = await enviar<unknown>(`/intenciones/${encodeURIComponent(id)}/agendar`, {
    inicio: cuerpo.inicio,
    origen: 'texto',
  })
  return r.ok
    ? NextResponse.json(r.datos)
    : NextResponse.json({ error: r.error, motivo: r.error }, { status: r.estado ?? 502 })
}
