import type { Reloj } from '../puertos/reloj.ts'
import type { Boton, Mensaje, Notificador } from '../puertos/notificador.ts'
import type { ServicioCronica } from './cronica.ts'
import {
  armarResumen, avisoDeAccion, botonDeshacer, type Deshacible, type Resumen,
} from '../dominio/resumen.ts'

export interface DepsResumen {
  reloj: Reloj
  cronica: ServicioCronica
  notificador: Notificador
  /** Para el botón «Ver detalle». Sin ella, no se ofrece el botón. */
  urlApp?: string
}

export interface Envio {
  enviado: boolean
  texto: string | null
}

/**
 * Rendir cuentas: el resumen de las 21:00 y los avisos del momento.
 *
 * La ventana del resumen es de 24 horas hacia atrás y no «desde
 * medianoche». Suena a detalle y no lo es: el caso que el spec pone como
 * obligatorio —un correo que llega a las 11 de la noche diciendo que la
 * clase de mañana se cancela— cae fuera de todas las ventanas si cada
 * resumen empieza en su propia medianoche, y esa cancelación no se le
 * contaría nunca a nadie. Con 24 horas los tramos se tocan sin solaparse:
 * lo que hace de noche entra en el resumen de la noche siguiente.
 */
export function crearServicioResumen(d: DepsResumen) {
  const botonesDe = (r: Resumen): Boton[] => {
    const botones: Boton[] = []
    if (d.urlApp) {
      botones.push({ texto: 'Ver detalle', url: `${d.urlApp.replace(/\/+$/, '')}/cronica` })
    }
    // En sombra no se aplicó nada, así que no hay nada que deshacer y el
    // botón sólo podría mentir.
    if (r.deshacibles.length > 0) botones.push({ texto: 'Deshacer algo', dato: 'deshacer-algo' })
    return botones
  }

  async function delTramo(desdeIso: string, hastaIso: string): Promise<Resumen | null> {
    const ahora = d.reloj.ahora()
    return armarResumen(await d.cronica.entre(desdeIso, hastaIso), ahora)
  }

  return {
    /**
     * El de las 21:00. Si no hizo nada, no manda nada — una asistente que
     * escribe a diario «no pasó nada» se vuelve ruido en una semana.
     */
    async enviar(): Promise<Envio> {
      const ahora = d.reloj.ahora()
      const resumen = await delTramo(
        ahora.minus({ hours: 24 }).toISO()!, ahora.toISO()!)

      if (!resumen) return { enviado: false, texto: null }

      await d.notificador.enviar({ texto: resumen.texto, botones: botonesDe(resumen) })
      return { enviado: true, texto: resumen.texto }
    },

    /**
     * Lo de hoy, cuando él lo pregunta. Aquí sí se contesta siempre: no
     * responderle a alguien que acaba de preguntar es otra cosa distinta a
     * no interrumpirlo.
     */
    async delDia(): Promise<Mensaje> {
      const ahora = d.reloj.ahora()
      const resumen = await delTramo(ahora.startOf('day').toISO()!, ahora.toISO()!)

      if (!resumen) {
        return { texto: '🌙  Hoy no he tocado nada tuyo por mi cuenta.' }
      }
      return { texto: resumen.texto, botones: botonesDe(resumen) }
    },

    /** Lo que se puede deshacer de lo que hizo hoy, para el botón. */
    async deshacibles(): Promise<Deshacible[]> {
      const ahora = d.reloj.ahora()
      const resumen = await delTramo(
        ahora.minus({ hours: 24 }).toISO()!, ahora.toISO()!)
      return resumen?.deshacibles ?? []
    },

    /**
     * El aviso del momento: lo que la política mandó «actuar y avisar».
     *
     * Lo que decide «actuar callada» no pasa por aquí y espera al resumen;
     * ésa es toda la diferencia entre las dos ramas de la tabla.
     */
    async avisar(accionId: number): Promise<boolean> {
      const entrada = await d.cronica.porId(accionId)
      if (!entrada) return false

      const aviso = avisoDeAccion(entrada, d.reloj.ahora())
      await d.notificador.enviar({
        texto: aviso.texto,
        botones: aviso.deshacible ? [botonDeshacer(entrada.id)] : undefined,
      })
      return true
    },
  }
}

export type ServicioResumen = ReturnType<typeof crearServicioResumen>
