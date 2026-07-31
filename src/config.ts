import { z } from 'zod'

const Esquema = z.object({
  DATABASE_URL: z.string().min(1),
  ZONA_HORARIA: z.string().default('America/Bogota'),

  GROQ_API_KEY: z.string().min(1),
  GROQ_BASE_URL: z.string().default('https://api.groq.com/openai/v1'),
  GROQ_MODELO_CLASIFICADOR: z.string().default(''),
  GROQ_MODELO_EXTRACTOR: z.string().default(''),

  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  GOOGLE_REFRESH_TOKEN: z.string().default(''),
  GOOGLE_CALENDAR_ID: z.string().default('primary'),
  GMAIL_TOPICO_PUBSUB: z.string().default(''),

  MS_CLIENT_ID: z.string().default(''),
  MS_CLIENT_SECRET: z.string().default(''),
  MS_TENANT_ID: z.string().default('common'),
  MS_REFRESH_TOKEN: z.string().default(''),

  // Lo que consume la app. Sin token, la API no abre.
  API_TOKEN: z.string().default(''),
  JORNADA_DESDE: z.string().regex(/^\d{2}:\d{2}$/).default('07:00'),
  JORNADA_HASTA: z.string().regex(/^\d{2}:\d{2}$/).default('22:00'),

  MODO_SOMBRA: z.string().default('true'),
  PUERTO: z.coerce.number().int().positive().default(3000),
  NIVEL_LOG: z.string().default('info'),
})

export function cargarConfig(env: Record<string, string | undefined>) {
  const r = Esquema.safeParse(env)
  if (!r.success) {
    const faltantes = r.error.issues.map((i) => i.path.join('.')).join(', ')
    throw new Error(`Configuración inválida: ${faltantes}`)
  }
  const v = r.data

  return Object.freeze({
    urlBaseDatos: v.DATABASE_URL,
    zonaHoraria: v.ZONA_HORARIA,

    groq: {
      apiKey: v.GROQ_API_KEY,
      baseUrl: v.GROQ_BASE_URL,
      modeloClasificador: v.GROQ_MODELO_CLASIFICADOR,
      modeloExtractor: v.GROQ_MODELO_EXTRACTOR,
    },

    google: {
      clientId: v.GOOGLE_CLIENT_ID,
      clientSecret: v.GOOGLE_CLIENT_SECRET,
      refreshToken: v.GOOGLE_REFRESH_TOKEN,
      calendarId: v.GOOGLE_CALENDAR_ID,
      topicoPubsub: v.GMAIL_TOPICO_PUBSUB,
    },

    microsoft: {
      clientId: v.MS_CLIENT_ID,
      clientSecret: v.MS_CLIENT_SECRET,
      tenantId: v.MS_TENANT_ID,
      refreshToken: v.MS_REFRESH_TOKEN,
    },

    api: { token: v.API_TOKEN },

    // Ventana de trabajo: fuera de ella el tiempo libre no cuenta como hueco.
    // Sin esto, «tienes 9 horas libres» incluiría la madrugada.
    jornada: { desde: v.JORNADA_DESDE, hasta: v.JORNADA_HASTA },

    // Sólo un "false" explícito apaga la sombra. Cualquier otra cosa
    // —vacío, error de tipeo, variable ausente— la deja encendida.
    modoSombra: v.MODO_SOMBRA !== 'false',
    puerto: v.PUERTO,
    nivelLog: v.NIVEL_LOG,
  })
}

export type Config = ReturnType<typeof cargarConfig>

/** ¿Hay credenciales suficientes para leer esta fuente? */
export function fuentesConfiguradas(config: Config): Array<'gmail' | 'outlook'> {
  const fuentes: Array<'gmail' | 'outlook'> = []
  if (config.google.clientId && config.google.refreshToken) fuentes.push('gmail')
  if (config.microsoft.clientId && config.microsoft.refreshToken) fuentes.push('outlook')
  return fuentes
}
