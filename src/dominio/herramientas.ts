import { z } from 'zod'
import { EsquemaReferente } from './esquemas.ts'

/**
 * Las herramientas acotadas del intérprete.
 *
 * El modelo no devuelve acciones: devuelve UNA de estas llamadas, validada
 * contra este esquema. Todo lo que no cabe aquí no existe para él. Dos
 * consecuencias que no dependen de que el modelo sea bueno:
 *
 * - **No calcula fechas.** Devuelve el referente en crudo y Luxon lo
 *   resuelve contra la hora real de Bogotá.
 * - **No genera identificadores.** Dice a qué se refiere con palabras
 *   («el gimnasio»); qué evento es eso lo decide el resolutor con sus
 *   señales, y si hay empate elige entre candidatos concretos.
 *
 * Una alucinación se convierte en una pregunta, nunca en un borrado.
 */

const HHMM = z.string().regex(/^\d{2}:\d{2}$/)
const Confianza = z.enum(['alta', 'media', 'baja'])

export const EsquemaOrden = z.discriminatedUnion('herramienta', [
  z.object({
    herramienta: z.literal('consultar_agenda'),
    referente: EsquemaReferente,
    confianza: Confianza,
  }),

  z.object({
    herramienta: z.literal('cancelar'),
    /** Con qué palabras nombró el compromiso. No un id. */
    que: z.string().min(1),
    referente: EsquemaReferente,
    confianza: Confianza,
  }),

  z.object({
    herramienta: z.literal('mover'),
    que: z.string().min(1),
    referente: EsquemaReferente,
    nuevoInicio: HHMM,
    nuevoFin: HHMM.nullable(),
    confianza: Confianza,
  }),

  z.object({
    herramienta: z.literal('anotar_pendiente'),
    titulo: z.string().min(1).max(200),
    duracionMin: z.union([
      z.literal(15), z.literal(30), z.literal(60), z.literal(120),
    ]),
    prioridad: z.enum(['urgente', 'alta', 'normal', 'baja']),
    vence: EsquemaReferente.nullable(),
    confianza: Confianza,
  }),

  z.object({
    herramienta: z.literal('ensenar_compromiso'),
    titulo: z.string().min(1).max(120),
    /** 1 = lunes … 7 = domingo. */
    dias: z.array(z.number().int().min(1).max(7)).min(1).max(7),
    horaInicio: HHMM,
    horaFin: HHMM,
    alias: z.array(z.string()).max(6),
    remitentes: z.array(z.string()).max(6),
    confianza: Confianza,
  }),

  z.object({
    // Sin id: siempre la última que de verdad se aplicó. Pedirle al modelo
    // "cuál" sería pedirle un identificador, y eso no lo hace nunca.
    herramienta: z.literal('deshacer'),
    confianza: Confianza,
  }),

  z.object({
    herramienta: z.literal('crear_regla'),
    tipo: z.enum(['ignorar', 'silenciar']),
    /** Un remitente o un trozo de dirección: "bancolombia", "promos@x.com". */
    patron: z.string().min(2).max(120),
    confianza: Confianza,
  }),

  z.object({
    herramienta: z.literal('consultar_finanzas'),
    confianza: Confianza,
  }),

  z.object({
    herramienta: z.literal('nada'),
    motivo: z.string(),
    confianza: Confianza,
  }),
])

/**
 * Una nota de voz puede traer tres cosas. El esquema las admite por
 * separado para poder ejecutar la clara y repreguntar sólo por las vagas,
 * en vez de descartar el audio entero.
 */
export const EsquemaInterpretacion = z.object({
  ordenes: z.array(EsquemaOrden).min(1).max(4),
})

export type Orden = z.infer<typeof EsquemaOrden>
export type Interpretacion = z.infer<typeof EsquemaInterpretacion>
export type NombreHerramienta = Orden['herramienta']
