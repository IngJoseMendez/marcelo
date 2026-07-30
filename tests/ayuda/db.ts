import { PGlite } from '@electric-sql/pglite'
import type { BaseDatos } from '../../src/db/base-datos.ts'

/**
 * Postgres embebido para las pruebas: el mismo motor compilado a WASM,
 * corriendo dentro de Node. Semánticas reales (JSONB, TEXT[], SKIP LOCKED)
 * sin levantar un servidor ni depender de Docker.
 */
type Ejecutor = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>
  exec: (sql: string) => Promise<unknown>
}

function envolver(e: Ejecutor): Omit<BaseDatos, 'cerrar' | 'transaccion'> {
  return {
    async query(texto, params) {
      const r = await e.query(texto, params ? [...params] : undefined)
      return { rows: r.rows as never[] }
    },
    async ejecutar(sql) {
      await e.exec(sql)
    },
  }
}

export async function crearBaseDePrueba(): Promise<BaseDatos> {
  const pglite = new PGlite()
  await pglite.waitReady

  return {
    ...envolver(pglite as unknown as Ejecutor),

    async transaccion(fn) {
      const resultado = await pglite.transaction(async (tx) => {
        const dentro: BaseDatos = {
          ...envolver(tx as unknown as Ejecutor),
          transaccion: (f) => f(dentro),
          cerrar: async () => {},
        }
        return fn(dentro)
      })
      return resultado as never
    },

    async cerrar() {
      await pglite.close()
    },
  }
}
