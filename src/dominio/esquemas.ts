import { z } from 'zod'

/**
 * El referente se captura tal como lo dijo el correo. Convertirlo a una
 * fecha concreta es trabajo de resolverReferente() con Luxon: el modelo no
 * calcula fechas porque es justo lo que peor hace.
 *
 * Nótese que no existe ningún campo donde el modelo pueda meter una fecha
 * ya calculada. Si lo intenta, el esquema lo rechaza.
 */
export const EsquemaReferente = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('hoy') }),
  z.object({ tipo: z.literal('manana') }),
  z.object({ tipo: z.literal('fecha'), iso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  z.object({
    tipo: z.literal('dia_semana'),
    dia: z.number().int().min(1).max(7),
    modificador: z.enum(['este', 'proximo']),
  }),
  z.object({ tipo: z.literal('desconocido') }),
])

export const EsquemaClasificacion = z.object({
  clasificacion: z.enum(['agenda', 'finanzas', 'ruido']),
  confianza: z.enum(['alta', 'media', 'baja']),
})

export const EsquemaHechoAgenda = z.object({
  intencion: z.enum(['cancelar', 'mover', 'crear', 'ninguna']),
  referente: EsquemaReferente,
  nuevoInicio: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  nuevoFin: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  menciones: z.array(z.string()),
  confianza: z.enum(['alta', 'media', 'baja']),
})

export const EsquemaEleccion = z.object({
  compromisoId: z.number().int().nullable(),
  justificacion: z.string(),
})

export type HechoAgenda = z.infer<typeof EsquemaHechoAgenda>
export type ResultadoClasificacion = z.infer<typeof EsquemaClasificacion>
