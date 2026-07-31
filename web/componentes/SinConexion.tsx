/**
 * Con la asistente caída, la app dice qué pasa y desde cuándo.
 *
 * Un spinner eterno deja a Marcelo sin saber si su día está vacío o si el
 * problema es la laptop. Eso es peor que una mala noticia clara.
 */
export function SinConexion({ error, que }: { error: string; que: string }) {
  return (
    <section className="vista">
      <div className="cabecera" data-anim>
        <p className="ojal">sin conexión</p>
        <h1 className="titular titular--corto">No alcanzo {que}</h1>
        <p className="subtitular">{error}.</p>
      </div>

      <div className="tarjeta vacio" data-anim>
        <strong>La asistente no contesta</strong>
        Puede estar apagada la laptop o caído el túnel. Lo que haya hecho sigue
        guardado: cuando vuelva, aparece aquí completo.
      </div>
    </section>
  )
}
