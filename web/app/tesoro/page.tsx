import { exigirSesion } from '@/lib/sesion'

export const dynamic = 'force-dynamic'

/**
 * El libro contable todavía no existe en la asistente.
 *
 * La pantalla se queda —el sitio ya está decidido— pero no inventa cifras.
 * Un tesoro con datos de mentira es peor que uno vacío: en cuentas, mentir en
 * silencio es la peor forma de fallar.
 */
export default async function Pagina() {
  await exigirSesion()

  return (
    <section className="vista">
      <div className="cabecera" data-anim>
        <p className="ojal">tesoro</p>
        <h1 className="titular titular--corto">Aún no lleva tus cuentas</h1>
        <p className="subtitular">
          El libro contable entra con el módulo financiero, después de la agenda.
        </p>
      </div>

      <div className="bloque">
        <div className="tarjeta vacio" data-anim>
          <strong>Sin movimientos todavía</strong>
          Cuando lea los correos del banco, aquí van a estar el balance del mes,
          lo que entró y salió, las cuentas por pagar y los vencimientos.
        </div>

        <div className="aviso" data-anim style={{ marginTop: 18 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 3 4 6.5v5c0 4.5 3.2 8.4 8 9.5 4.8-1.1 8-5 8-9.5v-5z" /></svg>
          <span>
            Cuando llegue, sólo va a leer y anotar. Nunca mueve plata ni paga
            nada por su cuenta: riesgo cero por diseño.
          </span>
        </div>

        <p className="pie" data-anim>
          Mientras tanto, lo que sí funciona es la agenda: lo que ella cambió
          queda en la Crónica, con el correo que lo causó.
        </p>
      </div>
    </section>
  )
}
