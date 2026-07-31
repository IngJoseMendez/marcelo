import { redirect } from 'next/navigation'
import { FormaEntrar } from '@/componentes/FormaEntrar'
import { codigoConfigurado, haySesion } from '@/lib/sesion'

export const dynamic = 'force-dynamic'

export default async function Pagina() {
  if (await haySesion()) redirect('/')

  return (
    <section className="vista entrar">
      <span className="entrar__marca" aria-hidden="true" />
      <div>
        <p className="ojal">mi segundo cerebro</p>
        <h1 className="titular">Entra con tu código</h1>
        <p className="subtitular">
          Sin contraseñas: estás autenticado por tener el teléfono. Cuando exista
          el bot de Telegram, el código te lo manda ella.
        </p>
      </div>

      {codigoConfigurado()
        ? <FormaEntrar />
        : (
          <div className="tarjeta vacio">
            <strong>Falta configurar el acceso</strong>
            Pon <span className="mono">CODIGO_ACCESO</span> y{' '}
            <span className="mono">SECRETO_SESION</span> en el entorno de la app.
          </div>
        )}
    </section>
  )
}
