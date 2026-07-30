import type { BaseDatos } from '../db/base-datos.ts'
import type { RepoCola } from '../repos/cola.ts'
import type { CorreoCrudo, Proveedor } from '../dominio/tipos.ts'

/** Lo que toda fuente de correo debe saber hacer, venga de donde venga. */
export interface FuenteCorreo {
  idsDesde(cursor: string): Promise<
    { caduco: false; ids: string[]; nuevoCursor: string } | { caduco: true }>
  mensajeCompleto(messageId: string): Promise<CorreoCrudo>
}

export interface FuenteConArranque extends FuenteCorreo {
  /** Primer arranque o cursor caducado. */
  arrancarDesdeCero(): Promise<{ ids: string[]; cursor: string }>
}

export interface CuentaConectada {
  cuentaId: number
  proveedor: Proveedor
  fuente: FuenteConArranque
}

export function crearSincronizacion(db: BaseDatos, cola: RepoCola) {
  async function cursorDe(cuentaId: number): Promise<string | null> {
    const { rows } = await db.query<{ cursor: string | null }>(
      'SELECT cursor FROM sync_cuenta WHERE cuenta_id = $1', [cuentaId])
    return rows[0]?.cursor ?? null
  }

  async function guardarCursor(cuentaId: number, cursor: string): Promise<void> {
    await db.query(
      `INSERT INTO sync_cuenta (cuenta_id, cursor) VALUES ($1,$2)
       ON CONFLICT (cuenta_id) DO UPDATE SET cursor = EXCLUDED.cursor`,
      [cuentaId, cursor])
  }

  return {
    cursorDe,
    guardarCursor,

    async latido(cuentaId: number): Promise<void> {
      await db.query(
        `INSERT INTO sync_cuenta (cuenta_id, ultimo_latido) VALUES ($1, now())
         ON CONFLICT (cuenta_id) DO UPDATE SET ultimo_latido = now()`, [cuentaId])
    },

    /**
     * Encola todo lo que llegó desde la última vez.
     *
     * Se llama al arrancar y en cada webhook. Si la laptop estuvo apagada,
     * esto recupera lo perdido; si el cursor caducó, arranca de cero con
     * los últimos días en vez de quedarse callado para siempre.
     */
    async ponerseAlDia(cuenta: CuentaConectada): Promise<number> {
      const guardado = await cursorDe(cuenta.cuentaId)

      if (guardado) {
        const r = await cuenta.fuente.idsDesde(guardado)
        if (!r.caduco) {
          for (const id of r.ids) await cola.encolar(cuenta.cuentaId, id)
          await guardarCursor(cuenta.cuentaId, r.nuevoCursor)
          return r.ids.length
        }
      }

      const inicio = await cuenta.fuente.arrancarDesdeCero()
      for (const id of inicio.ids) await cola.encolar(cuenta.cuentaId, id)
      if (inicio.cursor) await guardarCursor(cuenta.cuentaId, inicio.cursor)
      return inicio.ids.length
    },
  }
}

export type Sincronizacion = ReturnType<typeof crearSincronizacion>
