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
