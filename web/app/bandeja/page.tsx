import { VistaBandeja } from '@/componentes/VistaBandeja'
import { SinConexion } from '@/componentes/SinConexion'
import { pedir } from '@/lib/api'
import { exigirSesion } from '@/lib/sesion'
import type { Bandeja } from '@/lib/tipos'

export const dynamic = 'force-dynamic'

export default async function Pagina({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string }>
}) {
  await exigirSesion()
  const { desde } = await searchParams

  const r = await pedir<Bandeja>('/bandeja')
  if (!r.ok) return <SinConexion error={r.error} que="tu bandeja" />

  return <VistaBandeja bandeja={r.datos} huecoPreferido={desde ?? null} />
}
