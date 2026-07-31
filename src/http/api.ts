import { timingSafeEqual } from 'node:crypto'
import { DateTime } from 'luxon'
import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import type { BaseDatos } from '../db/base-datos.ts'
import type { Reloj } from '../puertos/reloj.ts'
import type { RepoCompromisos } from '../repos/compromisos.ts'
import type { RepoIntenciones } from '../repos/intenciones.ts'
import type { ServicioJornada } from '../servicios/jornada.ts'
import type { ServicioCronica } from '../servicios/cronica.ts'
import type { ServicioAgenda } from '../servicios/agendar.ts'
import type { ServicioDeshacer } from '../servicios/deshacer.ts'
import { DURACIONES, calcularPrioridad, redondearDuracion } from '../dominio/intenciones.ts'

export interface DepsApi {
  /** Sin token no se abre nada: la app enseña movimientos bancarios. */
  token: string
  db: BaseDatos
  reloj: Reloj
  modoSombra: boolean
  jornada: ServicioJornada
  cronica: ServicioCronica
  agenda: ServicioAgenda
  deshacer: ServicioDeshacer
  repoIntenciones: RepoIntenciones
  repoCompromisos: RepoCompromisos
}

const Fecha = z.object({ fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() })
const Dias = z.object({ dias: z.coerce.number().int().min(1).max(90).default(14) })
const Id = z.object({ id: z.coerce.number().int().positive() })

const NuevaIntencion = z.object({
  titulo: z.string().min(1).max(200),
  detalle: z.string().max(2000).nullish(),
  prioridad: z.enum(['urgente', 'alta', 'normal', 'baja']).default('normal'),
  duracionMin: z.coerce.number().int().positive().default(30),
  venceEl: z.string().datetime({ offset: true }).nullish(),
  origen: z.enum(['voz', 'texto']).default('texto'),
})

const Agendar = z.object({
  inicio: z.string().min(1),
  origen: z.enum(['voz', 'texto']).default('texto'),
})

const Cerrar = z.object({ estado: z.enum(['hecha', 'descartada']) })

/** Comparación en tiempo constante: un token no se adivina midiendo respuestas. */
function tokenValido(recibido: string, esperado: string): boolean {
  const a = Buffer.from(recibido)
  const b = Buffer.from(esperado)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function registrarApi(app: FastifyInstance, d: DepsApi): void {
  app.register(async (api) => {
    api.addHook('onRequest', async (req, res) => {
      if (!d.token) {
        return res.code(503).send({ error: 'La API está sin token configurado' })
      }
      const cabecera = req.headers.authorization ?? ''
      const recibido = cabecera.startsWith('Bearer ') ? cabecera.slice(7) : ''
      if (!tokenValido(recibido, d.token)) {
        return res.code(401).send({ error: 'Token inválido' })
      }
    })

    api.get('/estado', async () => {
      const { rows } = await d.db.query<{ ultimo_latido: Date | null }>(
        'SELECT max(ultimo_latido) AS ultimo_latido FROM sync_cuenta')
      const ahora = d.reloj.ahora()
      return {
        ok: true,
        modoSombra: d.modoSombra,
        zonaHoraria: ahora.zoneName,
        ahora: ahora.toISO(),
        ultimoLatido: rows[0]?.ultimo_latido ?? null,
      }
    })

    api.get('/jornada', async (req) => {
      const { fecha } = Fecha.parse(req.query)
      return d.jornada.del(fecha)
    })

    api.get('/cronica', async (req) => {
      const { dias } = Dias.parse(req.query)
      const ahora = d.reloj.ahora()
      const desde = ahora.minus({ days: dias }).startOf('day')
      return {
        // El "hoy" de la crónica es el de Bogotá, no el del teléfono.
        ahora: ahora.toISO({ suppressMilliseconds: true }),
        desde: desde.toISO({ suppressMilliseconds: true }),
        entradas: await d.cronica.desde(desde.toISO()!),
      }
    })

    api.post('/acciones/:id/deshacer', async (req, res) => {
      const { id } = Id.parse(req.params)
      const r = await d.deshacer.deshacer(id)
      return r.ok ? r : res.code(409).send(r)
    })

    api.get('/bandeja', async () => {
      const jornada = await d.jornada.del()
      return {
        fecha: jornada.fecha,
        huecos: jornada.huecos,
        intenciones: await d.repoIntenciones.bandeja(),
      }
    })

    api.post('/intenciones', async (req) => {
      const cuerpo = NuevaIntencion.parse(req.body)
      const ahora = d.reloj.ahora()
      const vence = cuerpo.venceEl
        ? DateTime.fromISO(cuerpo.venceEl, { zone: ahora.zoneName ?? undefined })
        : null

      // La prioridad la decide el código: una fecha límite cercana manda
      // sobre lo que diga el texto, y sólo puede subirla, nunca bajarla.
      const prioridad = calcularPrioridad(
        cuerpo.prioridad, vence?.isValid ? vence : null, ahora)

      return d.repoIntenciones.crear({
        titulo: cuerpo.titulo,
        detalle: cuerpo.detalle ?? null,
        prioridad,
        duracionMin: DURACIONES.includes(cuerpo.duracionMin as never)
          ? (cuerpo.duracionMin as (typeof DURACIONES)[number])
          : redondearDuracion(cuerpo.duracionMin),
        venceEl: vence?.isValid ? vence.toJSDate() : null,
        origen: cuerpo.origen,
      })
    })

    api.post('/intenciones/:id/agendar', async (req, res) => {
      const { id } = Id.parse(req.params)
      const { inicio, origen } = Agendar.parse(req.body)
      const r = await d.agenda.agendar(id, inicio, origen)
      return r.ok ? r : res.code(409).send(r)
    })

    api.post('/intenciones/:id/cerrar', async (req) => {
      const { id } = Id.parse(req.params)
      const { estado } = Cerrar.parse(req.body)
      await d.repoIntenciones.cerrar(id, estado)
      return { ok: true }
    })

    api.get('/pactos', async () => ({
      compromisos: await d.repoCompromisos.listarActivos(),
    }))
  }, { prefix: '/api' })
}
