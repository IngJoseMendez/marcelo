import 'dotenv/config'
import pino from 'pino'
import { cargarConfig } from './config.ts'
import { resumirFaltantes, revisar } from './configuracion/estado.ts'
import { arrancarConfigurador } from './configuracion/servidor.ts'
import { arrancarAsistente } from './arrancar-asistente.ts'

/**
 * El arranque tiene dos caminos.
 *
 * Si falta configuración no se cae con un error en el log —donde no lo ve
 * nadie que no sea programador— sino que abre el asistente y dice a qué
 * dirección ir. La misma función decide las dos cosas, así que es
 * imposible que la pantalla diga «todo listo» y el servicio no arranque.
 */

const log = pino({ level: process.env.NIVEL_LOG || 'info' })
const revision = revisar(process.env)

if (revision.listo) {
  await arrancarAsistente(cargarConfig(process.env))
} else {
  const asistente = await arrancarConfigurador({ registro: log })

  // A pantalla completa y sin formato de log: esto lo lee alguien que
  // acaba de clonar el proyecto, no alguien que está depurando.
  const linea = '─'.repeat(58)
  process.stdout.write(
    `\n┌${linea}┐\n`
    + `  Todavía no estoy configurada.\n\n`
    + `  Falta:  ${resumirFaltantes(revision) || 'poca cosa'}\n\n`
    + `  Abre esta dirección y te guío paso a paso:\n\n`
    + `      ${asistente.url}\n\n`
    + `  No hace falta que sepas de esto. Yo pruebo cada cosa\n`
    + `  contra su servicio y me guardo lo que salga bien.\n`
    + `└${linea}┘\n\n`)
}
