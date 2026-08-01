import { aDondeLlama } from '@/lib/api'

/**
 * Con la asistente caída, la app dice qué pasa y desde cuándo.
 *
 * Un spinner eterno deja a Marcelo sin saber si su día está vacío o si el
 * problema es la laptop. Eso es peor que una mala noticia clara.
 *
 * Y dice **a dónde llamó**, que es lo que resuelve el caso que más cuesta:
 * Vercel sólo lee las variables al desplegar, así que cambiar API_BASE y
 * no redesplegar deja la app llamando a la dirección de antes — en el
 * panel la variable se ve correcta, y aun así no funciona. Con la
 * dirección a la vista eso se ve de un vistazo en vez de deducirse.
 */
export function SinConexion({ error, que }: { error: string; que: string }) {
  const { base, hayToken } = aDondeLlama()

  return (
    <section className="vista">
      <div className="cabecera" data-anim>
        <p className="ojal">sin conexión</p>
        <h1 className="titular titular--corto">No alcanzo {que}</h1>
        <p className="subtitular">{error}.</p>
      </div>

      <div className="tarjeta vacio" data-anim>
        <strong>Lo que hay guardado no se pierde</strong>
        Puede estar apagada la laptop, dormida, o el túnel puede haber estrenado
        dirección. Todo lo que ella haya hecho sigue ahí: cuando vuelva, aparece
        aquí completo.
      </div>

      <div className="tarjeta diag" data-anim>
        <h3 className="diag__titulo">Qué está intentando esta app</h3>

        <dl className="diag__lista">
          <div>
            <dt>Dirección</dt>
            <dd className="mono">{base || <em>vacía — Vercel no tiene API_BASE</em>}</dd>
          </div>
          <div>
            <dt>Token</dt>
            <dd>{hayToken ? 'puesto' : 'falta API_TOKEN en Vercel'}</dd>
          </div>
        </dl>

        {base && (
          <p className="diag__pista">
            Si ésa <b>no</b> es la dirección que te da <span className="mono">/enlace</span> por
            Telegram, es que Vercel está sirviendo un despliegue viejo. Cambiar la
            variable no basta: <b>Vercel sólo las lee al desplegar</b>. Entra a
            Deployments y dale a <b>Redeploy</b>.
          </p>
        )}
        {!base && (
          <p className="diag__pista">
            Ponla en Vercel → Settings → Environment Variables, en los tres
            entornos, y después <b>Redeploy</b>. La dirección te la da{' '}
            <span className="mono">/enlace</span> por Telegram.
          </p>
        )}
      </div>
    </section>
  )
}
