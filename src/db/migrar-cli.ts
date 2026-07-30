import 'dotenv/config'
import { cargarConfig } from '../config.ts'
import { crearPoolPostgres, desdePostgres } from './base-datos.ts'
import { migrar } from './migrar.ts'

const config = cargarConfig(process.env)
const db = desdePostgres(crearPoolPostgres(config.urlBaseDatos))

try {
  const nuevas = await migrar(db)
  console.log(nuevas.length ? `Aplicadas: ${nuevas.join(', ')}` : 'Sin migraciones pendientes.')
} finally {
  await db.cerrar()
}
