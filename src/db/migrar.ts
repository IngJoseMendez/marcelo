import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { BaseDatos } from './base-datos.ts'

const CARPETA = join(dirname(fileURLToPath(import.meta.url)), 'migraciones')

/**
 * Aplica las migraciones pendientes en orden de nombre de archivo.
 * Es idempotente: llamarla dos veces no vuelve a aplicar nada.
 */
export async function migrar(db: BaseDatos): Promise<string[]> {
  await db.ejecutar(`
    CREATE TABLE IF NOT EXISTS migraciones (
      nombre      TEXT PRIMARY KEY,
      aplicada_en TIMESTAMPTZ NOT NULL DEFAULT now()
    )`)

  const archivos = (await readdir(CARPETA)).filter((a) => a.endsWith('.sql')).sort()
  const { rows } = await db.query<{ nombre: string }>('SELECT nombre FROM migraciones')
  const aplicadas = new Set(rows.map((r) => r.nombre))

  const nuevas: string[] = []
  for (const archivo of archivos) {
    if (aplicadas.has(archivo)) continue
    const sql = await readFile(join(CARPETA, archivo), 'utf8')
    // Cada migración va en su propia transacción: si una falla, no deja
    // el esquema a medias ni marca como aplicado algo que no lo está.
    await db.transaccion(async (tx) => {
      await tx.ejecutar(sql)
      await tx.query('INSERT INTO migraciones (nombre) VALUES ($1)', [archivo])
    })
    nuevas.push(archivo)
  }
  return nuevas
}
