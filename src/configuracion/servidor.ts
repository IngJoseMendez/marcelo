import { randomBytes } from 'node:crypto'
import { readFile, writeFile, copyFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import Fastify from 'fastify'
import { Client } from 'pg'
import { escribirEnv, leerEnv } from './archivo-env.ts'
import { revisar, valoresRecordados, type Revision } from './estado.ts'
import { paginaConfiguracion } from './pagina.ts'
import { esperarChat, probarBase, probarGroq, probarTelegram } from './verificaciones.ts'
import { CLAVES, canjearCodigo, urlDeConsentimiento, type Proveedor } from './oauth.ts'
import { abrirTunel, type Tunel } from './tunel.ts'
import { publicarVariables, redesplegar, variablesDeLaApp } from './vercel.ts'

/**
 * El asistente de configuración.
 *
 * **Sólo escucha en 127.0.0.1.** Eso no es un detalle de despliegue: es la
 * autenticación entera. Esta página recoge el secreto de cliente de
 * Google, la clave de Groq y el token del bot; expuesta a internet sería
 * una cosechadora de credenciales, y por eso no puede vivir en Vercel ni
 * colgar del túnel. Quien puede abrirla es quien ya está sentado frente a
 * la laptop, y a ése no hay nada que preguntarle.
 *
 * Va en su propio proceso y su propio puerto, aparte del Fastify que sí
 * sale por el túnel, para que no exista ni la posibilidad de un despiste.
 */

export interface OpcionesConfigurador {
  /** Dónde vive el .env que se va a escribir. */
  rutaEnv?: string
  puerto?: number
  /** El puerto del servicio de verdad, para el túnel. */
  puertoServicio?: number
  registro?: { info(o: object, m?: string): void; error(o: object, m?: string): void }
}

const PUERTO_POR_DEFECTO = 3210

interface EsperaOauth {
  proveedor: Proveedor
  clientId: string
  clientSecret: string
  redirectUri: string
  tenant: string
}

export async function arrancarConfigurador(o: OpcionesConfigurador = {}) {
  const rutaEnv = resolve(o.rutaEnv ?? process.env.RUTA_ENV ?? '.env')
  const puerto = o.puerto ?? Number(process.env.PUERTO_CONFIG || PUERTO_POR_DEFECTO)
  const puertoServicio = o.puertoServicio ?? Number(process.env.PUERTO || 3000)
  const raiz = `http://localhost:${puerto}`

  // El .env manda sobre lo que ya estuviera en el entorno: es el archivo
  // que esta pantalla edita y el que se va a leer al reiniciar.
  const enArchivo = existsSync(rutaEnv) ? leerEnv(await readFile(rutaEnv, 'utf8')) : {}
  const env: Record<string, string> = { ...process.env as Record<string, string>, ...enArchivo }

  const esperas = new Map<string, EsperaOauth>()
  let tunel: Tunel | null = null

  async function guardar(cambios: Record<string, string>): Promise<void> {
    await escribirEnv(rutaEnv, cambios, {
      existe: existsSync,
      leer: (r) => readFile(r, 'utf8'),
      escribir: (r, t) => writeFile(r, t, 'utf8'),
      respaldar: (r, destino) => copyFile(r, destino),
    })
    Object.assign(env, cambios)
    Object.assign(process.env, cambios)
  }

  const estado = (): Revision => revisar(env)

  const app = Fastify({ logger: false })

  app.get('/', async (_req, res) => {
    res.type('text/html; charset=utf-8')
    return paginaConfiguracion({
      redirecciones: {
        google: `${raiz}/oauth/google`,
        microsoft: `${raiz}/oauth/microsoft`,
      },
      puertoServicio,
      urlPropuestaBase: env.DATABASE_URL
        || 'postgres://asistente:cambiame@localhost:5433/asistente',
    })
  })

  app.get('/api/estado', async () => ({
    ...estado(),
    ...valoresRecordados(env),
    // Lo que él necesita para abrirla en el celular cuando todo esté listo.
    app: { url: env.APP_URL ?? '', codigo: env.CODIGO_ACCESO ?? '' },
  }))

  // ── probar cada pieza ───────────────────────────────────────

  app.post('/api/probar/base', async (req) => {
    const { DATABASE_URL = '' } = (req.body ?? {}) as Record<string, string>
    const r = await probarBase(DATABASE_URL, async (url) => {
      const cliente = new Client({ connectionString: url, connectionTimeoutMillis: 6000 })
      await cliente.connect()
      try {
        await cliente.query('SELECT 1')
      } finally {
        await cliente.end()
      }
    })
    if (r.ok && r.guardar) await guardar(r.guardar)
    return r
  })

  // Un campo que llega vacío no borra lo que ya estaba: la página no
  // devuelve los secretos, así que vacío significa «déjalo como está».
  const oLoGuardado = (cuerpo: Record<string, string>, clave: string): string =>
    (cuerpo[clave] ?? '').trim() || (env[clave] ?? '')

  app.post('/api/probar/groq', async (req) => {
    const cuerpo = (req.body ?? {}) as Record<string, string>
    const r = await probarGroq(
      oLoGuardado(cuerpo, 'GROQ_API_KEY'),
      env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1')
    if (r.ok && r.guardar) await guardar(r.guardar)
    return r
  })

  app.post('/api/probar/telegram', async (req) => {
    const cuerpo = (req.body ?? {}) as Record<string, string>
    const r = await probarTelegram(oLoGuardado(cuerpo, 'TELEGRAM_BOT_TOKEN'))
    if (r.ok && r.guardar) await guardar(r.guardar)
    return r
  })

  app.post('/api/telegram/emparejar', async (req) => {
    const cuerpo = (req.body ?? {}) as Record<string, string>
    const token = cuerpo.TELEGRAM_BOT_TOKEN || env.TELEGRAM_BOT_TOKEN || ''
    if (!token) return { ok: false, mensaje: 'Primero prueba el token del bot.' }
    const r = await esperarChat(token)
    if (r.ok && r.guardar) await guardar(r.guardar)
    return r
  })

  // ── OAuth: el permiso vuelve a esta misma máquina ───────────

  const arrancarOauth = (proveedor: Proveedor) => async (req: { body?: unknown }) => {
    const cuerpo = (req.body ?? {}) as Record<string, string>
    const clientId = oLoGuardado(
      cuerpo, proveedor === 'google' ? 'GOOGLE_CLIENT_ID' : 'MS_CLIENT_ID')
    const clientSecret = oLoGuardado(
      cuerpo, proveedor === 'google' ? 'GOOGLE_CLIENT_SECRET' : 'MS_CLIENT_SECRET')

    if (!clientId.trim() || !clientSecret.trim()) {
      return { ok: false, mensaje: 'Faltan el ID de cliente o el secreto.' }
    }

    await guardar(proveedor === 'google'
      ? { GOOGLE_CLIENT_ID: clientId.trim(), GOOGLE_CLIENT_SECRET: clientSecret.trim() }
      : { MS_CLIENT_ID: clientId.trim(), MS_CLIENT_SECRET: clientSecret.trim() })

    const estadoOauth = randomBytes(16).toString('hex')
    const redirectUri = `${raiz}/oauth/${proveedor}`
    const tenant = env.MS_TENANT_ID || 'common'
    esperas.set(estadoOauth, {
      proveedor, clientId: clientId.trim(), clientSecret: clientSecret.trim(),
      redirectUri, tenant,
    })

    return {
      ok: true,
      mensaje: 'Te llevo a dar el permiso…',
      ir: urlDeConsentimiento({
        proveedor, clientId: clientId.trim(), redirectUri, estado: estadoOauth, tenant,
      }),
    }
  }

  app.post('/api/oauth/google', arrancarOauth('google'))
  app.post('/api/oauth/microsoft', arrancarOauth('microsoft'))

  const volver = (titulo: string, cuerpo: string) =>
    `<!doctype html><meta charset="utf-8">
     <title>${titulo}</title>
     <body style="font:16px system-ui;padding:48px;max-width:44ch;margin:auto">
     <h2>${titulo}</h2><p>${cuerpo}</p>
     <p><a href="/">Volver al asistente</a></p>
     <script>setTimeout(function(){location.href='/'},2200)</script>`

  app.get('/oauth/:proveedor', async (req, res) => {
    const { state = '', code = '', error = '' } =
      (req.query ?? {}) as Record<string, string>
    res.type('text/html; charset=utf-8')

    if (error) return volver('No se dio el permiso', `Google o Microsoft dijo: ${error}`)

    const espera = esperas.get(state)
    // El `state` es lo que impide que una pestaña cualquiera complete un
    // permiso que este asistente no pidió.
    if (!espera) return volver('Ese permiso no era mío', 'Vuelve a darle a Conectar.')
    esperas.delete(state)

    try {
      const tokens = await canjearCodigo({
        proveedor: espera.proveedor,
        clientId: espera.clientId,
        clientSecret: espera.clientSecret,
        redirectUri: espera.redirectUri,
        tenant: espera.tenant,
        estado: state,
        codigo: code,
      })
      const claves = CLAVES[espera.proveedor]
      await guardar({ [claves.refresh]: tokens.refreshToken, [claves.cuenta]: tokens.cuenta })
      return volver('Conectado', `Ya puedo entrar como ${tokens.cuenta || 'esa cuenta'}.`)
    } catch (e) {
      return volver('No se pudo conectar', e instanceof Error ? e.message : 'sin detalle')
    }
  })

  // ── túnel ───────────────────────────────────────────────────

  app.post('/api/tunel', async (req) => {
    const cuerpo = (req.body ?? {}) as Record<string, string>
    try {
      tunel?.detener()
      tunel = await abrirTunel({
        puertoLocal: puertoServicio,
        nombre: cuerpo.TUNEL_NOMBRE,
        urlFija: cuerpo.URL_PUBLICA,
        ejecutable: env.CLOUDFLARED_RUTA,
      })
      await guardar({
        URL_PUBLICA: tunel.url,
        ...(cuerpo.TUNEL_NOMBRE?.trim() ? { TUNEL_NOMBRE: cuerpo.TUNEL_NOMBRE.trim() } : {}),
      })
      return {
        ok: true,
        mensaje: `La app te alcanza en ${tunel.url}`,
        rellenar: { URL_PUBLICA: tunel.url },
        avisos: tunel.efimera
          ? ['Esta dirección cambia al reiniciar el túnel. Conecta Vercel abajo y yo la vuelvo a publicar sola.']
          : [],
      }
    } catch (e) {
      return { ok: false, mensaje: e instanceof Error ? e.message : 'no se pudo abrir el túnel' }
    }
  })

  // ── secretos y Vercel ───────────────────────────────────────

  app.post('/api/generar', async () => {
    const nuevos = {
      API_TOKEN: env.API_TOKEN || randomBytes(32).toString('hex'),
      SECRETO_SESION: env.SECRETO_SESION || randomBytes(32).toString('hex'),
      // Corto y legible: lo va a teclear en un teléfono.
      CODIGO_ACCESO: env.CODIGO_ACCESO || randomBytes(4).toString('hex').toUpperCase(),
    }
    await guardar(nuevos)
    return { ok: true, mensaje: 'Generados y guardados.', rellenar: nuevos }
  })

  app.post('/api/vercel', async (req) => {
    const cuerpo = (req.body ?? {}) as Record<string, string>
    // Con `oLoGuardado` y no con `?? ''`: si él vuelve a esta pantalla y
    // guarda con el token de Vercel en blanco, lo de antes tiene que
    // seguir ahí. Blanquearlo dejaría la app sin poder actualizarse sola.
    await guardar(Object.fromEntries([
      'API_TOKEN', 'CODIGO_ACCESO', 'SECRETO_SESION', 'APP_URL',
      'VERCEL_TOKEN', 'VERCEL_PROYECTO', 'VERCEL_GANCHO',
    ].map((clave) => [clave, oLoGuardado(cuerpo, clave)])))

    const variables = variablesDeLaApp(env)
    if (!variables.API_BASE) {
      return { ok: false, mensaje: 'Abre primero el túnel: sin dirección pública la app no sabe a dónde llamar.' }
    }

    const puesta = await publicarVariables(
      { token: env.VERCEL_TOKEN ?? '', proyecto: env.VERCEL_PROYECTO ?? '' }, variables)
    if (!puesta.ok) return puesta

    const gancho = env.VERCEL_GANCHO ?? ''
    if (!gancho) {
      return {
        ok: true,
        mensaje: `${puesta.mensaje} Falta el gancho: redesplega a mano desde Vercel para que se apliquen.`,
      }
    }
    const despliegue = await redesplegar(gancho)
    return { ok: despliegue.ok, mensaje: `${puesta.mensaje} ${despliegue.mensaje}` }
  })

  app.post('/api/reiniciar', async (_req, res) => {
    res.type('text/html; charset=utf-8')
    // Bajo Docker Compose (`restart: unless-stopped`) esto vuelve solo. Fuera
    // de Docker hay que correr `npm start` otra vez, y por eso se dice.
    setTimeout(() => process.exit(0), 400)
    return volver('Arrancando', 'Si corres con Docker vuelvo sola. Si no, lanza `npm start`.')
  })

  await app.listen({ port: puerto, host: '127.0.0.1' })

  const r = estado()
  o.registro?.info({ puerto, faltan: r.faltantes }, 'asistente de configuración escuchando')

  return {
    url: raiz,
    estado,
    async cerrar() {
      tunel?.detener()
      await app.close()
    },
  }
}
