import Fastify from 'fastify'
import type { BaseDatos } from '../db/base-datos.ts'

export interface DepsServidor {
  db: BaseDatos
  /** Se dispara cuando cualquier proveedor avisa que hay correo nuevo. */
  alRecibirAviso: () => Promise<void>
  modoSombra: boolean
}

export function crearServidor(d: DepsServidor) {
  const app = Fastify({ logger: false })

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

  return app
}
