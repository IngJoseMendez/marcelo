import { VistaCronica } from '@/componentes/VistaCronica'
import { SinConexion } from '@/componentes/SinConexion'
import { pedir } from '@/lib/api'
import { exigirSesion } from '@/lib/sesion'
import type { EntradaCronica, Graduacion } from '@/lib/tipos'

export const dynamic = 'force-dynamic'

interface Respuesta {
  ahora: string
  desde: string
  entradas: EntradaCronica[]
}

export default async function Pagina() {
  await exigirSesion()

  const [r, g] = await Promise.all([
    pedir<Respuesta>('/cronica?dias=14'),
    pedir<Graduacion>('/graduacion'),
  ])
  if (!r.ok) return <SinConexion error={r.error} que="la crónica" />

  // El "hoy" sale de la asistente, no del navegador: manda su zona horaria.
  return (
    <VistaCronica
      entradas={r.datos.entradas}
      hoy={r.datos.ahora.slice(0, 10)}
      graduacion={g.ok ? g.datos : null}
    />
  )
}
