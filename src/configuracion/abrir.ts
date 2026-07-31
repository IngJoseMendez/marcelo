import 'dotenv/config'
import pino from 'pino'
import { arrancarConfigurador } from './servidor.ts'
import { revisar } from './estado.ts'

/**
 * `npm run configurar` — abrir el asistente aunque ya esté todo puesto.
 *
 * Sirve para cambiar algo después: renovar la clave de Groq, reconectar
 * Google cuando caduque el permiso, o volver a publicar la dirección del
 * túnel en Vercel tras un reinicio.
 */

const log = pino({ level: process.env.NIVEL_LOG || 'info' })
const asistente = await arrancarConfigurador({ registro: log })
const revision = revisar(process.env)

process.stdout.write(
  `\n  Asistente de configuración: ${asistente.url}\n`
  + `  ${revision.listo ? 'Ya está todo listo; esto es para cambiar algo.' : `Faltan ${revision.faltantes} piezas.`}\n\n`)
