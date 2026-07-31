import 'dotenv/config'
import { readFile, writeFile } from 'node:fs/promises'
import { abrirRespaldo } from '../servicios/respaldo.ts'

/**
 * `npm run respaldo:abrir -- <archivo> [salida.sql]`
 *
 * Existe porque un respaldo que nadie sabe abrir no es un respaldo. Esto
 * se prueba **el día que se configura**, no el día que se necesita.
 *
 * Para meterlo de vuelta:
 *   docker compose exec -T db psql -U asistente -d asistente < salida.sql
 */

const [archivo, salida = 'respaldo.sql'] = process.argv.slice(2)

if (!archivo) {
  process.stderr.write(
    '\n  Uso: npm run respaldo:abrir -- <archivo.sql.gz.enc> [salida.sql]\n\n')
  process.exit(1)
}

const clave = process.env.RESPALDO_CLAVE ?? ''
if (!clave) {
  process.stderr.write(
    '\n  Falta RESPALDO_CLAVE.\n'
    + '  Es la que se generó al configurar y que había que guardar FUERA\n'
    + '  de la laptop. Sin ella este archivo no se abre: para eso está.\n\n')
  process.exit(1)
}

try {
  const sql = abrirRespaldo(await readFile(archivo), clave)
  await writeFile(salida, sql)
  process.stdout.write(
    `\n  Listo: ${salida} (${(sql.length / 1024).toFixed(0)} KB)\n\n`
    + '  Para meterlo de vuelta:\n'
    + `    docker compose exec -T db psql -U asistente -d asistente < ${salida}\n\n`)
} catch (e) {
  process.stderr.write(`\n  ${e instanceof Error ? e.message : String(e)}\n\n`)
  process.exit(1)
}
