import { z } from 'zod'

const Esquema = z.object({
  DATABASE_URL: z.string().min(1),
  ZONA_HORARIA: z.string().default('America/Bogota'),

  GROQ_API_KEY: z.string().min(1),
  GROQ_BASE_URL: z.string().default('https://api.groq.com/openai/v1'),
  GROQ_MODELO_CLASIFICADOR: z.string().default(''),
  GROQ_MODELO_EXTRACTOR: z.string().default(''),
  GROQ_MODELO_TRANSCRIPTOR: z.string().default(''),
  // Opcional: sube el volumen de las notas de voz antes de transcribirlas.
  // Sin esto el audio va como llegó, y llega bajo.
  FFMPEG_RUTA: z.string().default(''),

  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  GOOGLE_REFRESH_TOKEN: z.string().default(''),
  GOOGLE_CALENDAR_ID: z.string().default('primary'),
  GMAIL_TOPICO_PUBSUB: z.string().default(''),

  MS_CLIENT_ID: z.string().default(''),
  MS_CLIENT_SECRET: z.string().default(''),
  MS_TENANT_ID: z.string().default('common'),
  MS_REFRESH_TOKEN: z.string().default(''),

  // El canal de control. Sin token no hay bot, y sin bot no hay resumen.
  TELEGRAM_BOT_TOKEN: z.string().default(''),
  // El único chat que puede darle órdenes. Si está vacío, el bot contesta
  // a quien le escriba con el número de su chat y no hace nada más.
  TELEGRAM_CHAT_ID: z.string().default(''),

  // Lo que consume la app. Sin token, la API no abre.
  API_TOKEN: z.string().default(''),
  // Para el botón «Ver detalle» del resumen. Sin ella, no se ofrece.
  APP_URL: z.string().default(''),

  // El enlace público: por dónde la app en Vercel alcanza esta laptop.
  // Con TUNEL_AUTO el servicio lo rehace solo al arrancar, que es lo que
  // hace falta para que un apagón no obligue a que venga alguien.
  TUNEL_AUTO: z.string().default('false'),
  URL_PUBLICA: z.string().default(''),
  TUNEL_NOMBRE: z.string().default(''),
  CLOUDFLARED_RUTA: z.string().default(''),
  VERCEL_TOKEN: z.string().default(''),
  VERCEL_PROYECTO: z.string().default(''),
  VERCEL_GANCHO: z.string().default(''),
  RUTA_ENV: z.string().default(''),
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
      modeloTranscriptor: v.GROQ_MODELO_TRANSCRIPTOR,
    },

    ffmpeg: v.FFMPEG_RUTA,

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

    telegram: {
      token: v.TELEGRAM_BOT_TOKEN.trim(),
      chatId: v.TELEGRAM_CHAT_ID.trim(),
    },

    api: { token: v.API_TOKEN },
    urlApp: v.APP_URL.trim(),

    tunel: {
      // Sólo un "true" explícito lo enciende: levantar procesos por su
      // cuenta no es algo que deba pasarle a nadie por sorpresa.
      auto: v.TUNEL_AUTO === 'true',
      url: v.URL_PUBLICA.trim(),
      nombre: v.TUNEL_NOMBRE.trim(),
      ejecutable: v.CLOUDFLARED_RUTA.trim(),
    },
    vercel: {
      token: v.VERCEL_TOKEN.trim(),
      proyecto: v.VERCEL_PROYECTO.trim(),
      gancho: v.VERCEL_GANCHO.trim(),
    },
    rutaEnv: v.RUTA_ENV.trim() || '.env',

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
