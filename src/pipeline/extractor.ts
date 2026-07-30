import type { ProveedorLLM } from '../puertos/proveedor-llm.ts'
import type { CorreoCrudo } from '../dominio/tipos.ts'
import { EsquemaHechoAgenda, type HechoAgenda } from '../dominio/esquemas.ts'

const MAX_CUERPO = 4_000

const SISTEMA = `Extraes hechos de agenda de un correo. Respondes sólo JSON.

NO CALCULES FECHAS. Devuelve el referente tal como lo dice el correo:
  "hoy"                   -> {"tipo":"hoy"}
  "mañana"                -> {"tipo":"manana"}
  "el 6 de agosto"        -> {"tipo":"fecha","iso":"2026-08-06"}
  "este miércoles"        -> {"tipo":"dia_semana","dia":3,"modificador":"este"}
  "el próximo miércoles"  -> {"tipo":"dia_semana","dia":3,"modificador":"proximo"}
  no se puede determinar  -> {"tipo":"desconocido"}

dia: 1=lunes … 7=domingo. Usa "fecha" sólo cuando el correo diga día y mes
explícitos; completa el año con el del contexto que recibes.

intencion:
  cancelar — se suspende o se cancela
  mover    — cambia de hora o de día
  crear    — se agrega algo nuevo
  ninguna  — el correo no cambia la agenda

nuevoInicio y nuevoFin sólo para "mover", en formato "HH:MM" de 24 horas.
null en cualquier otro caso.

menciones: las palabras del correo que nombran el compromiso ("clase",
"cálculo", "taller"). Lista vacía si no hay ninguna.

confianza: "alta" si el correo es explícito, "media" si hay que inferir,
"baja" si es dudoso.

Formato: {"intencion":"...","referente":{...},"nuevoInicio":null,
"nuevoFin":null,"menciones":[],"confianza":"..."}`

export function crearExtractor(llm: ProveedorLLM, modelo: string) {
  return {
    extraer(correo: CorreoCrudo, fechaRecepcionIso: string): Promise<HechoAgenda> {
      return llm.completarJson({
        modelo,
        sistema: SISTEMA,
        usuario: [
          `Fecha y hora de recepción: ${fechaRecepcionIso} (zona America/Bogota)`,
          `De: ${correo.remitente}`,
          `Asunto: ${correo.asunto ?? '(sin asunto)'}`,
          '',
          correo.cuerpo.slice(0, MAX_CUERPO),
        ].join('\n'),
        esquema: EsquemaHechoAgenda,
      })
    },
  }
}

export type Extractor = ReturnType<typeof crearExtractor>
