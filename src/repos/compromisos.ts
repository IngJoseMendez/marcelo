import type { BaseDatos } from '../db/base-datos.ts'
import type { Compromiso, NuevoCompromiso } from '../dominio/tipos.ts'

interface Fila {
  id: string | number
  titulo: string
  alias: string[]
  rrule: string | null
  hora_inicio: string
  hora_fin: string
  tz: string
  google_calendar_id: string
  google_event_id: string | null
  remitentes_vinculados: string[]
  activo: boolean
}

const COLUMNAS = `id, titulo, alias, rrule, hora_inicio, hora_fin, tz,
  google_calendar_id, google_event_id, remitentes_vinculados, activo`

const aDominio = (f: Fila): Compromiso => ({
  id: Number(f.id),
  titulo: f.titulo,
  alias: f.alias ?? [],
  rrule: f.rrule,
  // Postgres devuelve TIME como "16:00:00"; el dominio trabaja en "16:00".
  horaInicio: String(f.hora_inicio).slice(0, 5),
  horaFin: String(f.hora_fin).slice(0, 5),
  tz: f.tz,
  googleCalendarId: f.google_calendar_id,
  googleEventId: f.google_event_id,
  remitentesVinculados: f.remitentes_vinculados ?? [],
  activo: f.activo,
})

export function crearRepoCompromisos(db: BaseDatos) {
  return {
    async listarActivos(): Promise<Compromiso[]> {
      const { rows } = await db.query<Fila>(
        `SELECT ${COLUMNAS} FROM compromisos WHERE activo ORDER BY id`)
      return rows.map(aDominio)
    },

    async porId(id: number): Promise<Compromiso | null> {
      const { rows } = await db.query<Fila>(
        `SELECT ${COLUMNAS} FROM compromisos WHERE id = $1`, [id])
      return rows[0] ? aDominio(rows[0]) : null
    },

    async crear(c: NuevoCompromiso): Promise<Compromiso> {
      const { rows } = await db.query<Fila>(
        `INSERT INTO compromisos
           (titulo, alias, rrule, hora_inicio, hora_fin, tz,
            google_calendar_id, google_event_id, remitentes_vinculados)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING ${COLUMNAS}`,
        [c.titulo, c.alias, c.rrule, c.horaInicio, c.horaFin, c.tz,
         c.googleCalendarId, c.googleEventId, c.remitentesVinculados])
      return aDominio(rows[0]!)
    },

    async desactivar(id: number): Promise<void> {
      await db.query('UPDATE compromisos SET activo = FALSE WHERE id = $1', [id])
    },
  }
}

export type RepoCompromisos = ReturnType<typeof crearRepoCompromisos>
