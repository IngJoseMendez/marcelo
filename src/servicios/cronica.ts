import { DateTime } from 'luxon'
import type { BaseDatos } from '../db/base-datos.ts'
import { objetivoDe } from '../dominio/objetivo-accion.ts'
import type { Confianza, Origen } from '../dominio/tipos.ts'
import type { Inversa } from '../puertos/sumidero-calendario.ts'

export interface EntradaCronica {
  id: number
  tipo: string
  origen: Origen
  confianza: Confianza
  estado: 'aplicada' | 'deshecha' | 'sombra' | 'pendiente' | 'descartada'
  creadaEn: string
  deshechaEn: string | null
  /** Lo que entendió, tal como se lo enseñó a él. Sólo en órdenes suyas. */
  resumen: string | null
  /** El ✓ o el ✗ que le puso Marcelo. Sólo en lo que hizo sola. */
  veredicto: 'acierto' | 'error' | null
  /** Lo hizo sola, sin que nadie se lo pidiera. */
  porElla: boolean
  /** Modo sombra: lo habría hecho, pero no tocó nada. */
  ensayo: boolean
  titulo: string
  objetivo: { inicio: string; fin: string; desdeInicio: string | null } | null
  compromiso: { id: number; titulo: string } | null
  correo: { remitente: string; asunto: string | null; recibidoEn: string } | null
}

interface Fila {
  id: string | number
  tipo: string
  origen: Origen
  confianza: Confianza
  estado: EntradaCronica['estado']
  resumen: string | null
  veredicto: 'acierto' | 'error' | null
  creada_en: Date
  deshecha_en: Date | null
  payload_aplicado: unknown
  payload_inverso: Inversa | string | null
  compromiso_id: string | number | null
  compromiso_titulo: string | null
  remitente: string | null
  asunto: string | null
  recibido_en: Date | null
}

const comoInversa = (v: Fila['payload_inverso']): Inversa | null =>
  typeof v === 'string' ? (JSON.parse(v) as Inversa) : v

const SELECCION = `SELECT a.id, a.tipo, a.origen, a.confianza, a.estado, a.resumen,
                a.creada_en, a.deshecha_en, a.veredicto, a.payload_aplicado, a.payload_inverso,
                a.compromiso_id, c.titulo AS compromiso_titulo,
                co.remitente, co.asunto, co.recibido_en
           FROM acciones a
           LEFT JOIN compromisos c ON c.id = a.compromiso_id
           LEFT JOIN correos_procesados co ON co.id = a.correo_id`

/**
 * La contraparte visible de la autonomía.
 *
 * Cada acción con el correo que la causó y con qué certeza la tomó. Es lo
 * que convierte «me da miedo darle permisos» en «ya veo qué hizo y por qué».
 */
export function crearServicioCronica(db: BaseDatos, zona = 'America/Bogota') {
  // Todo sale en hora de Bogotá: la app formatea cortando la cadena ISO, y en
  // UTC diría que hizo las cosas cinco horas antes de lo que las hizo.
  const enZona = (f: Date | null): string | null =>
    f === null ? null : DateTime.fromJSDate(f, { zone: zona }).toISO({ suppressMilliseconds: true })

  const aEntrada = (f: Fila): EntradaCronica => {
    const objetivo = objetivoDe({
      tipo: f.tipo,
      estado: f.estado,
      payloadAplicado: f.payload_aplicado,
      payloadInverso: comoInversa(f.payload_inverso),
    })
    return {
      id: Number(f.id),
      tipo: f.tipo,
      origen: f.origen,
      confianza: f.confianza,
      estado: f.estado,
      creadaEn: enZona(f.creada_en)!,
      deshechaEn: enZona(f.deshecha_en),
      resumen: f.resumen,
      veredicto: f.veredicto,
      porElla: f.origen === 'correo',
      ensayo: f.estado === 'sombra',
      // El título del evento vive en la inversa cuando ella lo canceló;
      // al mover no está, y ahí manda el nombre del compromiso.
      titulo: objetivo?.titulo || f.compromiso_titulo || 'un evento',
      objetivo: objetivo
        ? { inicio: objetivo.inicio, fin: objetivo.fin, desdeInicio: objetivo.desdeInicio }
        : null,
      compromiso: f.compromiso_id !== null && f.compromiso_titulo
        ? { id: Number(f.compromiso_id), titulo: f.compromiso_titulo }
        : null,
      correo: f.remitente
        ? {
            remitente: f.remitente,
            asunto: f.asunto,
            recibidoEn: enZona(f.recibido_en) ?? '',
          }
        : null,
    }
  }

  return {
    async desde(desdeIso: string, limite = 200): Promise<EntradaCronica[]> {
      const { rows } = await db.query<Fila>(
        `${SELECCION}
          WHERE a.creada_en >= $1
          ORDER BY a.creada_en DESC, a.id DESC
          LIMIT $2`,
        [desdeIso, limite])
      return rows.map(aEntrada)
    },

    /** Un tramo cerrado. El resumen de las 21:00 reporta desde el anterior. */
    async entre(desdeIso: string, hastaIso: string, limite = 200): Promise<EntradaCronica[]> {
      const { rows } = await db.query<Fila>(
        `${SELECCION}
          WHERE a.creada_en >= $1 AND a.creada_en <= $2
          ORDER BY a.creada_en DESC, a.id DESC
          LIMIT $3`,
        [desdeIso, hastaIso, limite])
      return rows.map(aEntrada)
    },

    /** Una sola, para el aviso inmediato de lo que acaba de hacer. */
    async porId(id: number): Promise<EntradaCronica | null> {
      const { rows } = await db.query<Fila>(`${SELECCION} WHERE a.id = $1`, [id])
      return rows[0] ? aEntrada(rows[0]) : null
    },
  }
}

export type ServicioCronica = ReturnType<typeof crearServicioCronica>
