import type { BaseDatos } from '../db/base-datos.ts'
import type { Confianza, Origen } from '../dominio/tipos.ts'
import type { Inversa } from '../puertos/sumidero-calendario.ts'

export type EstadoAccion =
  | 'aplicada'
  | 'deshecha'
  | 'sombra'
  | 'pendiente'
  | 'descartada'

export interface NuevaAccion {
  tipo: string
  origen: Origen
  correoId: number | null
  compromisoId: number | null
  confianza: Confianza
  payloadAplicado: unknown
  payloadInverso: Inversa
  /** 'pendiente' = entendida y a la espera de que él confirme. */
  estado: 'aplicada' | 'sombra' | 'pendiente'
  /** Lo que entendió, en palabras, para poder enseñárselo al confirmar. */
  resumen?: string | null
}

export interface AccionGuardada {
  id: number
  tipo: string
  origen: Origen
  confianza: Confianza
  compromisoId: number | null
  payloadAplicado: unknown
  payloadInverso: Inversa
  estado: EstadoAccion
  resumen: string | null
  creadaEn: Date
  deshechaEn: Date | null
}

interface Fila {
  id: string | number
  tipo: string
  origen: Origen
  confianza: Confianza
  compromiso_id: string | number | null
  payload_aplicado: unknown
  payload_inverso: Inversa
  estado: EstadoAccion
  resumen: string | null
  creada_en: Date
  deshecha_en: Date | null
}

const COLUMNAS = `id, tipo, origen, confianza, compromiso_id,
  payload_aplicado, payload_inverso, estado, resumen, creada_en, deshecha_en`

const aDominio = (f: Fila): AccionGuardada => ({
  id: Number(f.id),
  tipo: f.tipo,
  origen: f.origen,
  confianza: f.confianza,
  compromisoId: f.compromiso_id === null ? null : Number(f.compromiso_id),
  payloadAplicado: f.payload_aplicado,
  payloadInverso:
    typeof f.payload_inverso === 'string'
      ? (JSON.parse(f.payload_inverso) as Inversa)
      : f.payload_inverso,
  estado: f.estado,
  resumen: f.resumen,
  creadaEn: f.creada_en,
  deshechaEn: f.deshecha_en,
})

export function crearRepoAcciones(db: BaseDatos) {
  return {
    async registrar(a: NuevaAccion): Promise<number> {
      const { rows } = await db.query<{ id: string | number }>(
        `INSERT INTO acciones
           (tipo, origen, correo_id, compromiso_id, confianza,
            payload_aplicado, payload_inverso, estado, resumen)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [a.tipo, a.origen, a.correoId, a.compromisoId, a.confianza,
         JSON.stringify(a.payloadAplicado), JSON.stringify(a.payloadInverso),
         a.estado, a.resumen ?? null])
      return Number(rows[0]!.id)
    },

    /**
     * Al confirmar se vuelve a guardar la inversa: entre que él dijo la
     * orden y que la confirmó, el evento pudo cambiar. La inversa que vale
     * es la del estado que de verdad se está a punto de tocar.
     */
    async aplicarPendiente(
      id: number, payloadInverso: Inversa, estado: 'aplicada' | 'sombra'
    ): Promise<boolean> {
      const { rows } = await db.query<{ id: string | number }>(
        `UPDATE acciones SET estado = $2, payload_inverso = $3
          WHERE id = $1 AND estado = 'pendiente' RETURNING id`,
        [id, estado, JSON.stringify(payloadInverso)])
      return rows.length > 0
    },

    /** Rechazar también es historia: mide cuántas veces entendió mal. */
    async descartarPendiente(id: number): Promise<boolean> {
      const { rows } = await db.query<{ id: string | number }>(
        `UPDATE acciones SET estado = 'descartada'
          WHERE id = $1 AND estado = 'pendiente' RETURNING id`, [id])
      return rows.length > 0
    },

    async pendientes(): Promise<AccionGuardada[]> {
      const { rows } = await db.query<Fila>(
        `SELECT ${COLUMNAS} FROM acciones
          WHERE estado = 'pendiente' ORDER BY creada_en DESC, id DESC`)
      return rows.map(aDominio)
    },

    async porId(id: number): Promise<AccionGuardada | null> {
      const { rows } = await db.query<Fila>(
        `SELECT ${COLUMNAS} FROM acciones WHERE id = $1`, [id])
      return rows[0] ? aDominio(rows[0]) : null
    },

    /** La última que de verdad se aplicó: ignora sombra y ya deshechas. */
    async ultimaDeshacible(): Promise<AccionGuardada | null> {
      const { rows } = await db.query<Fila>(
        `SELECT ${COLUMNAS} FROM acciones
          WHERE estado = 'aplicada'
          ORDER BY creada_en DESC, id DESC LIMIT 1`)
      return rows[0] ? aDominio(rows[0]) : null
    },

    async marcarDeshecha(id: number): Promise<void> {
      await db.query(
        `UPDATE acciones SET estado = 'deshecha', deshecha_en = now() WHERE id = $1`,
        [id])
    },

    async enRango(desdeIso: string, hastaIso: string): Promise<AccionGuardada[]> {
      const { rows } = await db.query<Fila>(
        `SELECT ${COLUMNAS} FROM acciones
          WHERE creada_en >= $1 AND creada_en <= $2
          ORDER BY creada_en`, [desdeIso, hastaIso])
      return rows.map(aDominio)
    },
  }
}

export type RepoAcciones = ReturnType<typeof crearRepoAcciones>
