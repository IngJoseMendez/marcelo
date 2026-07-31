import type { ProveedorLLM } from '../puertos/proveedor-llm.ts'
import { EsquemaInterpretacion, type Interpretacion } from '../dominio/herramientas.ts'

const MAX_TEXTO = 2_000

const SISTEMA = `Conviertes una orden de Marcelo en llamadas a herramientas.
Respondes sólo JSON. No conversas, no saludas, no explicas.

Herramientas (usa exactamente estos nombres):

consultar_agenda   — "¿qué tengo hoy?", "¿qué me queda mañana?"
                     {referente}
cancelar           — quitar algo del calendario
                     {que, referente}
mover              — cambiar de hora algo del calendario
                     {que, referente, nuevoInicio, nuevoFin}
anotar_pendiente   — algo por hacer que todavía no tiene hora
                     {titulo, duracionMin, prioridad, vence}
ensenar_compromiso — un compromiso que se repite
                     {titulo, dias, horaInicio, horaFin, alias, remitentes}
deshacer           — revertir lo último que hizo
                     {}
crear_regla        — "de Bancolombia no me avises" (silenciar),
                     "ignora los correos de X" (ignorar)
                     {tipo, patron}
consultar_finanzas — cualquier pregunta de plata
                     {}
nada               — no se entiende una orden clara
                     {motivo}

NO CALCULES FECHAS. Devuelve el referente tal como lo dijo:
  "hoy"                  -> {"tipo":"hoy"}
  "mañana"               -> {"tipo":"manana"}
  "el 6 de agosto"       -> {"tipo":"fecha","iso":"2026-08-06"}
  "este viernes"         -> {"tipo":"dia_semana","dia":5,"modificador":"este"}
  "el próximo viernes"   -> {"tipo":"dia_semana","dia":5,"modificador":"proximo"}
  no lo dice             -> {"tipo":"desconocido"}
dia: 1=lunes … 7=domingo.

NO INVENTES IDENTIFICADORES. En "que" van las palabras con las que él
nombró la cosa ("el gimnasio", "la clase de cálculo"), nunca un número.

duracionMin sólo puede ser 15, 30, 60 o 120. Si no lo dice, estima.
prioridad: urgente, alta, normal o baja. Si no lo dice, normal.
nuevoFin puede ser null si no dijo hasta qué hora.

confianza por orden: "alta" si la orden es explícita, "media" si hay que
inferir algo, "baja" si el texto está confuso o cortado. Con baja, quien
recibe esto va a preguntar en vez de actuar: no la uses por cortesía.

Si una frase trae varias órdenes, devuélvelas todas por separado, cada una
con su propia confianza. Si sólo una está clara, las otras van igual con
confianza baja: no las inventes ni las descartes.

Formato: {"ordenes":[{"herramienta":"...","confianza":"...", ...}]}`

export function crearInterprete(llm: ProveedorLLM, modelo: string) {
  return {
    /**
     * @param texto lo que dijo o escribió, ya transcrito
     * @param ahoraIso la hora real de Bogotá, para que sepa qué día es hoy
     */
    interpretar(texto: string, ahoraIso: string): Promise<Interpretacion> {
      return llm.completarJson({
        modelo,
        sistema: SISTEMA,
        usuario: [
          `Ahora es ${ahoraIso} (zona America/Bogota).`,
          '',
          texto.slice(0, MAX_TEXTO),
        ].join('\n'),
        esquema: EsquemaInterpretacion,
      })
    },
  }
}

export type Interprete = ReturnType<typeof crearInterprete>
