import { VistaJornada } from '@/componentes/VistaJornada'
import { SinConexion } from '@/componentes/SinConexion'
import { pedir } from '@/lib/api'
import { exigirSesion } from '@/lib/sesion'
import type { Jornada } from '@/lib/tipos'

export const dynamic = 'force-dynamic'

export default async function Pagina({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string }>
}) {
  await exigirSesion()
  const { fecha } = await searchParams

  const r = await pedir<Jornada>(
    fecha ? `/jornada?fecha=${encodeURIComponent(fecha)}` : '/jornada')

  if (!r.ok) return <SinConexion error={r.error} que="tu día" />
  return <VistaJornada jornada={r.datos} />
}
