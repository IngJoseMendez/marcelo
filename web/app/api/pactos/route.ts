import { NextResponse } from 'next/server'
import { enviar } from '@/lib/api'
import { haySesion } from '@/lib/sesion'

/**
 * Enseñarle un compromiso escribiéndolo.
 *
 * El camino que no necesita ni IA ni micrófono: el día que se acabe la
 * cuota o el proveedor esté caído, esto sigue en pie. Del otro lado va por
 * el mismo actuador, con la inversa guardada antes de aplicar y la misma
 * auditoría — aquí no se decide nada, sólo se pasa el recado.
 */
export async function POST(peticion: Request) {
  if (!(await haySesion())) {
    return NextResponse.json({ error: 'Sin sesión' }, { status: 401 })
  }

  const cuerpo = await peticion.json().catch(() => null)
  if (!cuerpo) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })

  const r = await enviar<unknown>('/pactos', cuerpo)
  return r.ok
    ? NextResponse.json(r.datos)
    : NextResponse.json({ error: r.error }, { status: r.estado ?? 502 })
}
