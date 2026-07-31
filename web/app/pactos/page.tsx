import { SinConexion } from '@/componentes/SinConexion'
import { pedir } from '@/lib/api'
import { exigirSesion } from '@/lib/sesion'
import { horarioLegible } from '@/lib/pactos'
import type { Compromiso } from '@/lib/tipos'

export const dynamic = 'force-dynamic'

export default async function Pagina() {
  await exigirSesion()

  const r = await pedir<{ compromisos: Compromiso[] }>('/pactos')
  if (!r.ok) return <SinConexion error={r.error} que="tus pactos" />

  const { compromisos } = r.datos

  return (
    <section className="vista">
      <div className="cabecera" data-anim>
        <p className="ojal">pactos</p>
        <h1 className="titular titular--corto">Lo que le enseñaste</h1>
        <p className="subtitular">Ella sólo se mete donde tú la dejaste entrar.</p>
      </div>

      <div className="bloque">
        {compromisos.length === 0 ? (
          <div className="tarjeta vacio" data-anim>
            <strong>Todavía no conoce ningún compromiso</strong>
            Sin pactos no puede reconocer de qué habla un correo, y por eso no
            toca nada. Enséñale el primero y empieza a servir.
          </div>
        ) : (
          <div className="pactos">
            {compromisos.map((c, i) => (
              <article
                key={c.id} className="tarjeta pacto" data-anim
                style={{ '--i': i } as React.CSSProperties}
              >
                <h3 className="pacto__titulo">{c.titulo}</h3>
                <span className="pacto__horario">
                  {horarioLegible(c.rrule, c.horaInicio, c.horaFin)}
                </span>
                <div className="pacto__pie">
                  {c.remitentesVinculados.length === 0 ? (
                    <span className="oreja" data-vacio="true">sin correo vinculado</span>
                  ) : (
                    c.remitentesVinculados.map((r) => (
                      <span className="oreja" key={r}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 8.5a8 8 0 0 1 16 0M7.5 12a4.5 4.5 0 0 1 9 0M12 12v5.5" /></svg>
                        escucha a <span className="mono">{r}</span>
                      </span>
                    ))
                  )}
                  {!c.googleEventId && (
                    <span className="oreja" data-vacio="true">sin evento en el calendario</span>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}

        <p className="pie" data-anim>
          Un pacto es lo que le da permiso: sin el remitente vinculado, un correo
          que cancela una clase no le dice nada. Enseñarle uno nuevo hablando
          —«los martes tengo laboratorio de 10 a 12 con la profe Cardona»— llega
          con el canal de voz.
        </p>
      </div>
    </section>
  )
}
