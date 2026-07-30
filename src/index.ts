import 'dotenv/config'
import cron from 'node-cron'
import pino from 'pino'
import { cargarConfig, fuentesConfiguradas } from './config.ts'
import { crearPoolPostgres, desdePostgres } from './db/base-datos.ts'
import { migrar } from './db/migrar.ts'
import { RelojReal } from './puertos/reloj.ts'
import { crearClienteGoogle } from './adaptadores/google-auth.ts'
import { FuenteGmail } from './adaptadores/gmail.ts'
import { FuenteOutlook } from './adaptadores/outlook.ts'
import { CalendarioGoogle } from './adaptadores/google-calendar.ts'
import { CalendarioSombra } from './adaptadores/calendario-sombra.ts'
import { ProveedorGroq } from './adaptadores/groq.ts'
import { crearRepoCompromisos } from './repos/compromisos.ts'
import { crearRepoCorreos, crearRepoCuentas } from './repos/correos.ts'
import { crearRepoAcciones } from './repos/acciones.ts'
import { crearRepoCola } from './repos/cola.ts'
import { crearClasificador } from './pipeline/clasificador.ts'
import { crearExtractor } from './pipeline/extractor.ts'
import { crearDesempate } from './pipeline/desempate.ts'
import { crearProcesador } from './pipeline/procesar-correo.ts'
import { crearSincronizacion, type CuentaConectada } from './servicios/sincronizacion.ts'
import { crearServidor } from './http/servidor.ts'
import type { SumideroCalendario } from './puertos/sumidero-calendario.ts'

const config = cargarConfig(process.env)
const log = pino({ level: config.nivelLog })

const db = desdePostgres(crearPoolPostgres(config.urlBaseDatos))
await migrar(db)

const fuentes = fuentesConfiguradas(config)
if (fuentes.length === 0) {
  log.error('No hay ninguna fuente de correo configurada. Revisa el .env.')
  process.exit(1)
}

// ── Calendario ────────────────────────────────────────────────
// El modo sombra se activa envolviendo el sumidero, no con una bandera
// aparte: así es imposible que el pipeline crea que ensaya mientras
// escribe de verdad.
const auth = crearClienteGoogle(
  config.google.clientId, config.google.clientSecret, config.google.refreshToken)

const calendarioReal = new CalendarioGoogle(auth, config.zonaHoraria)
const calendario: SumideroCalendario = config.modoSombra
  ? new CalendarioSombra(calendarioReal)
  : calendarioReal

// ── Cuentas de correo ─────────────────────────────────────────
const repoCuentas = crearRepoCuentas(db)
const conectadas: CuentaConectada[] = []

if (fuentes.includes('gmail')) {
  const cuenta = await repoCuentas.registrar('gmail', 'gmail')
  const gmail = new FuenteGmail(auth, cuenta.id)
  conectadas.push({
    cuentaId: cuenta.id, proveedor: 'gmail',
    fuente: {
      idsDesde: (c) => gmail.idsDesde(c),
      mensajeCompleto: (id) => gmail.mensajeCompleto(id),
      arrancarDesdeCero: () => gmail.idsRecientes(),
    },
  })
}

if (fuentes.includes('outlook')) {
  const cuenta = await repoCuentas.registrar('outlook', 'outlook')
  const outlook = new FuenteOutlook(config.microsoft, cuenta.id)
  conectadas.push({
    cuentaId: cuenta.id, proveedor: 'outlook',
    fuente: {
      idsDesde: (c) => outlook.idsDesde(c),
      mensajeCompleto: (id) => outlook.mensajeCompleto(id),
      arrancarDesdeCero: () => outlook.iniciarDelta(),
    },
  })
}

// ── Pipeline ──────────────────────────────────────────────────
const llm = new ProveedorGroq(config.groq.apiKey, config.groq.baseUrl)
const cola = crearRepoCola(db)

const procesador = crearProcesador({
  reloj: new RelojReal(config.zonaHoraria),
  repoCompromisos: crearRepoCompromisos(db),
  repoCorreos: crearRepoCorreos(db),
  repoAcciones: crearRepoAcciones(db),
  clasificador: crearClasificador(llm, config.groq.modeloClasificador),
  extractor: crearExtractor(llm, config.groq.modeloExtractor),
  desempate: crearDesempate(llm, config.groq.modeloExtractor),
  calendario,
  remitentesIgnorados: [],
  remitentesSilenciados: [],
})

const sync = crearSincronizacion(db, cola)
const porCuenta = new Map(conectadas.map((c) => [c.cuentaId, c]))

async function drenarCola(): Promise<void> {
  for (const item of await cola.tomarPendientes(10)) {
    const cuenta = porCuenta.get(item.cuentaId)
    if (!cuenta) {
      await cola.marcarError(item.id, 'La cuenta ya no está conectada')
      continue
    }
    try {
      const correo = await cuenta.fuente.mensajeCompleto(item.messageId)
      const r = await procesador.procesar(correo, cuenta.proveedor)
      log.info({ messageId: item.messageId, proveedor: cuenta.proveedor, ...r },
        'correo procesado')
      await cola.marcarListo(item.id)
    } catch (e) {
      log.error({ err: e, messageId: item.messageId }, 'fallo procesando')
      await cola.marcarError(item.id, String(e))
    }
  }
}

async function ponerseAlDiaTodas(): Promise<void> {
  for (const cuenta of conectadas) {
    try {
      const n = await sync.ponerseAlDia(cuenta)
      if (n > 0) log.info({ proveedor: cuenta.proveedor, encolados: n }, 'puesta al día')
      await sync.latido(cuenta.cuentaId)
    } catch (e) {
      log.error({ err: e, proveedor: cuenta.proveedor }, 'fallo sincronizando')
    }
  }
}

// Recuperación al arrancar: la laptop pudo estar apagada.
await ponerseAlDiaTodas()
await drenarCola()

const app = crearServidor({
  db,
  modoSombra: config.modoSombra,
  alRecibirAviso: async () => { await ponerseAlDiaTodas(); await drenarCola() },
})

cron.schedule('* * * * *', () => { void drenarCola() })
// Red de seguridad: si el push falla en silencio, esto lo recoge igual.
cron.schedule('*/5 * * * *', () => { void ponerseAlDiaTodas() })

// El watch de Gmail caduca a los 7 días y la suscripción de Graph a los 3.
// Si esto falla, el sistema deja de recibir avisos SIN dar ningún error.
cron.schedule('0 3 * * *', () => {
  if (!config.google.topicoPubsub) return
  const gmail = conectadas.find((c) => c.proveedor === 'gmail')
  if (!gmail) return
  void new FuenteGmail(auth, gmail.cuentaId)
    .renovarWatch(config.google.topicoPubsub)
    .then((r) => sync.guardarCursor(gmail.cuentaId, r.cursor))
    .then(() => log.info('watch de Gmail renovado'))
    .catch((e) => log.error({ err: e }, 'NO SE PUDO RENOVAR EL WATCH DE GMAIL'))
}, { timezone: config.zonaHoraria })

await app.listen({ port: config.puerto, host: '0.0.0.0' })
log.info(
  { puerto: config.puerto, modoSombra: config.modoSombra, fuentes },
  config.modoSombra
    ? 'Asistente arriba EN MODO SOMBRA: observa y registra, no toca el calendario'
    : 'Asistente arriba EN MODO REAL: va a modificar el calendario')
