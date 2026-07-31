import Fastify from 'fastify'
import { ZodError } from 'zod'
import type { BaseDatos } from '../db/base-datos.ts'
import { registrarApi, type DepsApi } from './api.ts'

export interface DepsServidor {
  db: BaseDatos
  /** Se dispara cuando cualquier proveedor avisa que hay correo nuevo. */
  alRecibirAviso: () => Promise<void>
  modoSombra: boolean
  /** Lo que consume la app. Si falta, el servicio sigue siendo sólo el pipeline. */
  api?: DepsApi
}

export function crearServidor(d: DepsServidor) {
  const app = Fastify({ logger: false })

  // Un cuerpo mal formado es culpa de quien llama, no un fallo del servicio.
  app.setErrorHandler((error: Error & { statusCode?: number }, _req, res) => {
    if (error instanceof ZodError) {
      return res.code(400).send({
        error: 'Petición inválida',
        detalles: error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      })
    }
    return res.code(error.statusCode ?? 500).send({ error: error.message })
  })

  app.get('/salud', async () => {
    const { rows } = await d.db.query<{ ultimo_latido: Date | null }>(
      'SELECT max(ultimo_latido) AS ultimo_latido FROM sync_cuenta')
    return {
      ok: true,
      modoSombra: d.modoSombra,
      ultimoLatido: rows[0]?.ultimo_latido ?? null,
    }
  })

  // Pub/Sub reintenta si no recibe 2xx, así que se responde de inmediato y
  // el trabajo se hace aparte. La idempotencia por (cuenta, message_id)
  // cubre los reintentos, así que contestar rápido no pierde nada.
  app.post('/webhook/gmail', async (_req, res) => {
    void d.alRecibirAviso().catch(() => {})
    return res.code(204).send()
  })

  // Microsoft Graph valida la suscripción devolviendo el validationToken
  // en texto plano. Sin esto la suscripción nunca queda activa.
  app.post('/webhook/outlook', async (req, res) => {
    const token = (req.query as { validationToken?: string }).validationToken
    if (token) return res.type('text/plain').code(200).send(token)
    void d.alRecibirAviso().catch(() => {})
    return res.code(202).send()
  })

  if (d.api) registrarApi(app, d.api)

  return app
}
