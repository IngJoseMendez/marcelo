import type { BaseDatos } from '../db/base-datos.ts'
import type { Origen } from '../dominio/tipos.ts'
import type { Duracion, EstadoIntencion, Prioridad } from '../dominio/intenciones.ts'

export interface Intencion {
  id: number
  titulo: string
  detalle: string | null
  prioridad: Prioridad
  duracionMin: Duracion
  venceEl: Date | null
  estado: EstadoIntencion
  origen: Origen
  googleEventId: string | null
}

export type NuevaIntencion = Omit<Intencion, 'id' | 'estado' | 'googleEventId'> & {
  correoId?: number | null
}

interface Fila {
  id: string | number
  titulo: string
  detalle: string | null
  prioridad: Prioridad
  duracion_min: number
  vence_el: Date | string | null
  estado: EstadoIntencion
  origen: Origen
  google_event_id: string | null
}

const COLUMNAS = `id, titulo, detalle, prioridad, duracion_min, vence_el,
  estado, origen, google_event_id`

const aDominio = (f: Fila): Intencion => ({
  id: Number(f.id),
  titulo: f.titulo,
  detalle: f.detalle,
  prioridad: f.prioridad,
  duracionMin: Number(f.duracion_min) as Duracion,
  venceEl: f.vence_el === null ? null : new Date(f.vence_el),
  estado: f.estado,
  origen: f.origen,
  googleEventId: f.google_event_id,
})

export function crearRepoIntenciones(db: BaseDatos) {
  return {
    async crear(i: NuevaIntencion): Promise<Intencion> {
      const { rows } = await db.query<Fila>(
        `INSERT INTO intenciones
           (titulo, detalle, prioridad, duracion_min, vence_el, origen, correo_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING ${COLUMNAS}`,
        [i.titulo, i.detalle, i.prioridad, i.duracionMin,
         i.venceEl?.toISOString() ?? null, i.origen, i.correoId ?? null])
      return aDominio(rows[0]!)
    },

    /** La bandeja: lo urgente arriba, y a igual prioridad lo que vence antes. */
    async bandeja(): Promise<Intencion[]> {
      const { rows } = await db.query<Fila>(
        `SELECT ${COLUMNAS} FROM intenciones
          WHERE estado = 'pendiente'
          ORDER BY CASE prioridad
                     WHEN 'urgente' THEN 0 WHEN 'alta' THEN 1
                     WHEN 'normal'  THEN 2 ELSE 3 END,
                   vence_el ASC NULLS LAST,
                   creada_en ASC`)
      return rows.map(aDominio)
    },

    async porId(id: number): Promise<Intencion | null> {
      const { rows } = await db.query<Fila>(
        `SELECT ${COLUMNAS} FROM intenciones WHERE id = $1`, [id])
      return rows[0] ? aDominio(rows[0]) : null
    },

    /** Agendar deja el vínculo con la acción para poder deshacerlo. */
    async marcarAgendada(
      id: number, accionId: number, googleEventId: string
    ): Promise<void> {
      await db.query(
        `UPDATE intenciones
            SET estado = 'agendada', accion_id = $2, google_event_id = $3,
                agendada_en = now()
          WHERE id = $1 AND estado = 'pendiente'`,
        [id, accionId, googleEventId])
    },

    /**
     * Al deshacer la acción que la agendó, la intención vuelve a la bandeja.
     * Se busca por la acción y no por el id de la intención porque quien
     * deshace sólo conoce la acción: la auditoría es el hilo del que se tira.
     */
    async devolverPorAccion(accionId: number): Promise<void> {
      await db.query(
        `UPDATE intenciones
            SET estado = 'pendiente', accion_id = NULL, google_event_id = NULL,
                agendada_en = NULL
          WHERE accion_id = $1 AND estado = 'agendada'`, [accionId])
    },

    /** Al deshacer el agendamiento, la intención vuelve a la bandeja. */
    async devolverABandeja(id: number): Promise<void> {
      await db.query(
        `UPDATE intenciones
            SET estado = 'pendiente', accion_id = NULL, google_event_id = NULL,
                agendada_en = NULL
          WHERE id = $1 AND estado = 'agendada'`, [id])
    },

    async cerrar(id: number, estado: 'hecha' | 'descartada'): Promise<void> {
      await db.query(
        `UPDATE intenciones SET estado = $2, cerrada_en = now() WHERE id = $1`,
        [id, estado])
    },

    async reprioritizar(id: number, prioridad: Prioridad): Promise<void> {
      await db.query('UPDATE intenciones SET prioridad = $2 WHERE id = $1', [id, prioridad])
    },
  }
}

export type RepoIntenciones = ReturnType<typeof crearRepoIntenciones>
