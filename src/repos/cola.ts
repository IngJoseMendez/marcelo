import type { BaseDatos } from '../db/base-datos.ts'

const MAX_INTENTOS = 3

export interface ItemCola {
  id: number
  cuentaId: number
  messageId: string
  intentos: number
}

/**
 * La cola vive en la base y no en memoria: si el proceso muere a media
 * tanda —o la laptop se apaga— al reiniciar retoma donde iba.
 */
export function crearRepoCola(db: BaseDatos) {
  return {
    async encolar(cuentaId: number, messageId: string): Promise<void> {
      await db.query(
        `INSERT INTO cola (cuenta_id, message_id) VALUES ($1,$2)
         ON CONFLICT (cuenta_id, message_id) DO NOTHING`,
        [cuentaId, messageId])
    },

    /**
     * SKIP LOCKED deja que varios trabajadores tomen lotes distintos sin
     * pisarse, y el estado 'procesando' evita que el mismo correo se tome
     * dos veces.
     */
    async tomarPendientes(limite: number): Promise<ItemCola[]> {
      const { rows } = await db.query<{
        id: string | number; cuenta_id: string | number
        message_id: string; intentos: number
      }>(
        `UPDATE cola SET estado = 'procesando'
          WHERE id IN (
            SELECT id FROM cola WHERE estado = 'pendiente'
             ORDER BY encolado_en LIMIT $1
             FOR UPDATE SKIP LOCKED)
        RETURNING id, cuenta_id, message_id, intentos`, [limite])

      return rows.map((r) => ({
        id: Number(r.id),
        cuentaId: Number(r.cuenta_id),
        messageId: r.message_id,
        intentos: r.intentos,
      }))
    },

    async marcarListo(id: number): Promise<void> {
      await db.query(`UPDATE cola SET estado = 'listo' WHERE id = $1`, [id])
    },

    /**
     * Tras MAX_INTENTOS el item queda muerto y deja de reintentarse.
     *
     * Con `definitivo`, muere a la primera. Hay fallos que no son «ahora
     * no» sino «esto no existe» —un correo borrado, o de una cuenta que ya
     * no es ésta— y contra ésos reintentar es gastar llamadas para obtener
     * exactamente el mismo error, tres veces, llenando el log de rojo.
     */
    async marcarError(id: number, error: string, definitivo = false): Promise<void> {
      await db.query(
        `UPDATE cola
            SET intentos = intentos + 1,
                ultimo_error = $2,
                estado = CASE WHEN $4 OR intentos + 1 >= $3
                              THEN 'muerto' ELSE 'pendiente' END
          WHERE id = $1`,
        [id, error.slice(0, 2000), MAX_INTENTOS, definitivo])
    },

    async muertos(): Promise<ItemCola[]> {
      const { rows } = await db.query<{
        id: string | number; cuenta_id: string | number
        message_id: string; intentos: number
      }>(`SELECT id, cuenta_id, message_id, intentos FROM cola
           WHERE estado = 'muerto' ORDER BY encolado_en`)
      return rows.map((r) => ({
        id: Number(r.id), cuentaId: Number(r.cuenta_id),
        messageId: r.message_id, intentos: r.intentos,
      }))
    },
  }
}

export type RepoCola = ReturnType<typeof crearRepoCola>
