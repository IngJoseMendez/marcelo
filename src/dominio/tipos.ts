export type Confianza = 'alta' | 'media' | 'baja'
export type Origen = 'correo' | 'voz' | 'texto'
export type Clasificacion = 'agenda' | 'finanzas' | 'ruido'
export type Proveedor = 'gmail' | 'outlook'

export interface CuentaCorreo {
  id: number
  proveedor: Proveedor
  direccion: string
  activa: boolean
}

export interface Compromiso {
  id: number
  titulo: string
  alias: string[]
  rrule: string | null
  horaInicio: string
  horaFin: string
  tz: string
  googleCalendarId: string
  googleEventId: string | null
  remitentesVinculados: string[]
  activo: boolean
}

export type NuevoCompromiso = Omit<Compromiso, 'id' | 'activo'>

/**
 * Un correo ya normalizado. Gmail y Outlook producen esto mismo; de aquí
 * en adelante el pipeline no sabe ni le importa de dónde vino.
 */
export interface CorreoCrudo {
  cuentaId: number
  messageId: string
  threadId: string | null
  remitente: string
  asunto: string | null
  cuerpo: string
  recibidoEn: string
  /** Etiquetas o carpetas del proveedor, para el prefiltro sin costo. */
  etiquetas: string[]
}

/**
 * Ese correo ya no se puede traer, y no va a poder mañana tampoco.
 *
 * Pasa cuando el mensaje se borró de verdad, o cuando la cola guarda ids
 * de una cuenta y se reconectó con otra: para la cuenta de ahora, aquellos
 * ids nunca existieron. Es distinto de «falló la red» y hay que tratarlo
 * distinto — reintentar algo que no existe es gastar llamadas y llenar el
 * log de rojo hasta que la cola se rinde sola tres intentos después.
 *
 * Los adaptadores la lanzan; el pipeline la reconoce sin saber nada de
 * Gmail ni de Graph, que es justo para lo que está el puerto.
 */
export class CorreoInalcanzable extends Error {
  override readonly name = 'CorreoInalcanzable'
  constructor(readonly messageId: string, readonly proveedor: string) {
    super(`El correo ${messageId} ya no está en ${proveedor}`)
  }
}
