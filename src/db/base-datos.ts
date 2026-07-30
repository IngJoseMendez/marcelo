import pg from 'pg'

/**
 * La superficie mínima de base de datos que usa todo el sistema.
 *
 * Existe para que las pruebas corran contra Postgres embebido (PGlite, el
 * mismo motor compilado a WASM) sin levantar un servidor, y producción
 * contra Postgres de verdad, con el mismo código encima.
 */
export interface BaseDatos {
  query<T = Record<string, unknown>>(
    texto: string,
    params?: readonly unknown[]
  ): Promise<{ rows: T[] }>

  /** Varias sentencias de una, sin parámetros. Para migraciones. */
  ejecutar(sql: string): Promise<void>

  transaccion<T>(fn: (db: BaseDatos) => Promise<T>): Promise<T>

  cerrar(): Promise<void>
}

export function desdePostgres(pool: pg.Pool): BaseDatos {
  const envolver = (cliente: pg.Pool | pg.PoolClient): Omit<BaseDatos, 'cerrar' | 'transaccion'> => ({
    async query(texto, params) {
      const r = await cliente.query(texto, params as unknown[])
      return { rows: r.rows }
    },
    async ejecutar(sql) {
      await cliente.query(sql)
    },
  })

  return {
    ...envolver(pool),

    async transaccion(fn) {
      const cliente = await pool.connect()
      // Dentro de una transacción, anidar otra reutiliza la misma: Postgres
      // no soporta transacciones anidadas reales y un BEGIN de más falla.
      const dentro: BaseDatos = {
        ...envolver(cliente),
        transaccion: (f) => f(dentro),
        cerrar: async () => {},
      }
      try {
        await cliente.query('BEGIN')
        const resultado = await fn(dentro)
        await cliente.query('COMMIT')
        return resultado
      } catch (e) {
        await cliente.query('ROLLBACK')
        throw e
      } finally {
        cliente.release()
      }
    },

    async cerrar() {
      await pool.end()
    },
  }
}

export function crearPoolPostgres(url: string): pg.Pool {
  return new pg.Pool({ connectionString: url, max: 10 })
}
