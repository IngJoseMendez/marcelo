import type { BaseDatos } from '../db/base-datos.ts'
import type { Origen } from '../dominio/tipos.ts'

/** El vocabulario de la tabla desde la primera migración. */
export type TipoRegla = 'ignorar_remitente' | 'silenciar_remitente'

export interface Regla {
  id: number
  tipo: TipoRegla
  patron: string
  creadaPor: Origen
  activa: boolean
}

interface Fila {
  id: string | number
  tipo: TipoRegla
  patron: string
  creada_por: Origen
  activa: boolean
}

const aDominio = (f: Fila): Regla => ({
  id: Number(f.id),
  tipo: f.tipo,
  patron: f.patron,
  creadaPor: f.creada_por,
  activa: f.activa,
})

/**
 * Las reglas que dictó Marcelo.
 *
 * `ignorar` mata el correo en el prefiltro, antes de gastar un token.
 * `silenciar` deja que actúe pero sin avisar — y nunca puede convertir un
 * "preguntar" en una acción: eso lo garantiza la política, no esta tabla.
 */
export function crearRepoReglas(db: BaseDatos) {
  return {
    async crear(tipo: TipoRegla, patron: string, creadaPor: Origen): Promise<Regla> {
      const { rows } = await db.query<Fila>(
        `INSERT INTO reglas (tipo, patron, creada_por)
         VALUES ($1, $2, $3)
         ON CONFLICT (tipo, patron) DO UPDATE SET activa = TRUE
         RETURNING id, tipo, patron, creada_por, activa`,
        [tipo, patron.trim().toLowerCase(), creadaPor])
      return aDominio(rows[0]!)
    },

    async activas(): Promise<Regla[]> {
      const { rows } = await db.query<Fila>(
        `SELECT id, tipo, patron, creada_por, activa FROM reglas
          WHERE activa ORDER BY id`)
      return rows.map(aDominio)
    },

    async porTipo(tipo: TipoRegla): Promise<string[]> {
      const { rows } = await db.query<{ patron: string }>(
        'SELECT patron FROM reglas WHERE activa AND tipo = $1', [tipo])
      return rows.map((r) => r.patron)
    },

    async desactivar(id: number): Promise<void> {
      await db.query('UPDATE reglas SET activa = FALSE WHERE id = $1', [id])
    },
  }
}

export type RepoReglas = ReturnType<typeof crearRepoReglas>
