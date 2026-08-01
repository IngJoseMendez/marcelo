import type { BaseDatos } from '../db/base-datos.ts'
import type { CorreoCrudo, CuentaCorreo, Proveedor } from '../dominio/tipos.ts'

export function crearRepoCorreos(db: BaseDatos) {
  return {
    /**
     * Registra el correo si su (cuenta, message_id) no existe todavía.
     *
     * La unicidad la garantiza el constraint, no una consulta previa: eso
     * lo hace seguro ante los reintentos concurrentes del webhook, donde dos
     * avisos del mismo mensaje pueden llegar a la vez.
     *
     * Devuelve además si YA SE TERMINÓ de procesar, que no es lo mismo que
     * si la fila existe. La fila se crea antes de llamar al modelo, así que
     * un fallo pasajero —el proveedor sin cuota, la red— deja una fila
     * «pendiente». Tratar eso como «ya está hecho» descartaba el correo
     * para siempre: el peor fallo posible aquí, porque es silencioso y
     * ningún correo se puede recuperar después.
     */
    async registrarSiEsNuevo(
      c: CorreoCrudo
    ): Promise<{ id: number; nuevo: boolean; terminado: boolean }> {
      const insertado = await db.query<{ id: string | number }>(
        `INSERT INTO correos_procesados
           (cuenta_id, message_id, thread_id, remitente, asunto, recibido_en)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (cuenta_id, message_id) DO NOTHING
         RETURNING id`,
        [c.cuentaId, c.messageId, c.threadId, c.remitente, c.asunto, c.recibidoEn])

      if (insertado.rows[0]) {
        return { id: Number(insertado.rows[0].id), nuevo: true, terminado: false }
      }

      const existente = await db.query<{ id: string | number; estado: string }>(
        'SELECT id, estado FROM correos_procesados WHERE cuenta_id = $1 AND message_id = $2',
        [c.cuentaId, c.messageId])
      const fila = existente.rows[0]!
      return {
        id: Number(fila.id),
        nuevo: false,
        terminado: fila.estado === 'procesado',
      }
    },

    async marcarProcesado(id: number, clasificacion: string): Promise<void> {
      await db.query(
        `UPDATE correos_procesados
            SET clasificacion = $2, estado = 'procesado', procesado_en = now()
          WHERE id = $1`, [id, clasificacion])
    },

    /** El compromiso que ya se resolvió antes para este hilo, si lo hubo. */
    async compromisoDelHilo(cuentaId: number, threadId: string | null): Promise<number | null> {
      if (!threadId) return null
      const { rows } = await db.query<{ compromiso_id: string | number | null }>(
        `SELECT a.compromiso_id
           FROM acciones a
           JOIN correos_procesados c ON c.id = a.correo_id
          WHERE c.cuenta_id = $1 AND c.thread_id = $2 AND a.compromiso_id IS NOT NULL
          ORDER BY a.creada_en DESC
          LIMIT 1`, [cuentaId, threadId])
      const v = rows[0]?.compromiso_id
      return v === null || v === undefined ? null : Number(v)
    },
  }
}

export function crearRepoCuentas(db: BaseDatos) {
  return {
    async listarActivas(): Promise<CuentaCorreo[]> {
      const { rows } = await db.query<{
        id: string | number; proveedor: Proveedor; direccion: string; activa: boolean
      }>(`SELECT id, proveedor, direccion, activa FROM cuentas_correo
           WHERE activa ORDER BY id`)
      return rows.map((r) => ({ ...r, id: Number(r.id) }))
    },

    /** Idempotente: registrar la misma cuenta dos veces la reactiva. */
    async registrar(proveedor: Proveedor, direccion: string): Promise<CuentaCorreo> {
      const { rows } = await db.query<{
        id: string | number; proveedor: Proveedor; direccion: string; activa: boolean
      }>(`INSERT INTO cuentas_correo (proveedor, direccion) VALUES ($1,$2)
          ON CONFLICT (proveedor, direccion) DO UPDATE SET activa = TRUE
          RETURNING id, proveedor, direccion, activa`, [proveedor, direccion])
      const f = rows[0]!
      return { ...f, id: Number(f.id) }
    },
  }
}

export type RepoCorreos = ReturnType<typeof crearRepoCorreos>
export type RepoCuentas = ReturnType<typeof crearRepoCuentas>
